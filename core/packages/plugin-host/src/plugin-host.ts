/**
 * PluginHost (§9, §11, §12.3) — the install-time gate backing the channel
 * server's gate ② (`declaredCapabilities`), plus the activate/deactivate
 * lifecycle with LIFO effect teardown (§11.3). It tracks each plugin's state and
 * the capabilities its manifest declares. The one load-time policy it enforces
 * is §12.3's two red lines: a third-party plugin that declares the
 * `shell.elevate` capability, or `fsScope: "unrestricted"`, is rejected into the
 * terminal `failed` state — recorded with a diagnostic, never prompted, and
 * crucially without crashing the host (§11.1). A failed plugin declares no
 * capabilities, so any plugin-origin call it makes dies at gate ② (FORBIDDEN).
 *
 * `activate(ctx)` hands the plugin a `PluginContext` (§11.2) whose every side-
 * effecting surface (registerChannel, contributes, effect) funnels through an
 * `EffectLedger`; `deactivate` replays it LIFO, so the six side-effect surfaces
 * return to zero (§11.4) by construction, not by the plugin remembering to tidy
 * up. Capabilities are gated on state: only `installed`/`active` plugins declare
 * them, so a disabled plugin's capability surface zeroes too.
 */

import { EffectLedger } from "./effect-ledger"
import type {
  ChannelContribution,
  ContributionSink,
  PluginActivator,
  PluginContext,
  PluginHostServices,
} from "./plugin-context"

export type PluginState = "discovered" | "installed" | "active" | "disabled" | "failed"

/** The capability that runs privileged actions as root — builtin-only (§6.5). */
export const ELEVATE_CAPABILITY = "shell.elevate"

/** Host-facing manifest subset — only what install-time gating reads (§12). */
export interface PluginManifest {
  readonly id: string
  /**
   * Builtin plugins share no special code path but have a higher privilege
   * ceiling: only they may cross the §12.3 red lines.
   */
  readonly builtin: boolean
  /** Capability ids the plugin declares; the source of gate ②'s allow-set. */
  readonly capabilities: readonly string[]
  /**
   * Only `"unrestricted"` matters to the host gate; scoped-path fs lives in the
   * path-guard (§6.5), built later. ponytail: widen when path-guard lands.
   */
  readonly fsScope?: "unrestricted"
}

export interface PluginRecord {
  readonly manifest: PluginManifest
  readonly state: PluginState
  readonly capabilities: ReadonlySet<string>
  /** Why it landed in `failed`; absent otherwise. */
  readonly diagnostic?: string
}

const NO_CAPS: ReadonlySet<string> = new Set()

export class PluginHost {
  readonly #records = new Map<string, PluginRecord>()
  readonly #ledgers = new Map<string, EffectLedger>()
  readonly #services: PluginHostServices | undefined

  /**
   * `services` back the `PluginContext` built at activate. Omit them for an
   * install-only host (gate-② wiring, tests): `activate` then throws rather than
   * handing a plugin a half-built context.
   */
  constructor(services?: PluginHostServices) {
    this.#services = services
  }

  /**
   * Install a plugin, enforcing the §12.3 red lines. Never throws: a rejected
   * plugin is isolated in `failed` and the host keeps running (§11.1). Returns
   * the record so callers can surface the diagnostic.
   */
  install(manifest: PluginManifest): PluginRecord {
    const breach = redLineBreach(manifest)
    const record: PluginRecord =
      breach !== undefined
        ? { manifest, state: "failed", capabilities: NO_CAPS, diagnostic: breach }
        : { manifest, state: "installed", capabilities: new Set(manifest.capabilities) }
    this.#records.set(manifest.id, record)
    return record
  }

  /**
   * Run the plugin's activator against a fresh `PluginContext` and transition it
   * to `active` (§11.1). Allowed from `installed` or `disabled` (enable+activate
   * collapsed) so the §11.4 cycle test can loop. If the activator throws, every
   * effect it already acquired is released LIFO and the error re-thrown — no
   * half-active plugin survives (§11.5 atomicity).
   */
  async activate(pluginId: string, activator: PluginActivator): Promise<PluginRecord> {
    const record = this.#records.get(pluginId)
    if (record === undefined) throw new Error(`cannot activate unknown plugin ${pluginId}`)
    if (record.state !== "installed" && record.state !== "disabled") {
      throw new Error(`cannot activate plugin ${pluginId} from state ${record.state}`)
    }
    if (this.#services === undefined) {
      throw new Error(`cannot activate plugin ${pluginId}: host built without services`)
    }

    const ledger = new EffectLedger()
    const ctx = buildContext(pluginId, ledger, this.#services)
    try {
      await activator(ctx)
    } catch (error: unknown) {
      ledger.disposeAll()
      throw error
    }

    const active: PluginRecord = { ...record, state: "active" }
    this.#records.set(pluginId, active)
    this.#ledgers.set(pluginId, ledger)
    return active
  }

  /**
   * Tear a plugin down to `disabled`: release its effect ledger LIFO so the six
   * side-effect surfaces zero (§11.4). No-op for a non-`active` plugin. Builtin
   * plugins disable identically — "内置" is not a back door (§9.2).
   */
  deactivate(pluginId: string): PluginRecord {
    const record = this.#records.get(pluginId)
    if (record === undefined) throw new Error(`cannot deactivate unknown plugin ${pluginId}`)
    if (record.state !== "active") return record

    this.#ledgers.get(pluginId)?.disposeAll()
    this.#ledgers.delete(pluginId)
    const disabled: PluginRecord = { ...record, state: "disabled" }
    this.#records.set(pluginId, disabled)
    return disabled
  }

  /**
   * Gate ②'s backing data: the declared capabilities of a live plugin. State-
   * gated — only `installed`/`active` plugins declare caps, so `disabled`/
   * `failed` ones zero their capability surface (§11.4).
   */
  declaredCapabilities(pluginId: string | undefined): ReadonlySet<string> {
    if (pluginId === undefined) return NO_CAPS
    const record = this.#records.get(pluginId)
    if (record === undefined) return NO_CAPS
    if (record.state !== "installed" && record.state !== "active") return NO_CAPS
    return record.capabilities
  }

  get(pluginId: string): PluginRecord | undefined {
    return this.#records.get(pluginId)
  }
}

/**
 * Assemble the §11.2 `PluginContext`. Every side-effecting surface routes
 * through `ledger.run(acquire, release)` so deactivate's LIFO replay reverses it
 * — the plugin writes no teardown. `contributes.*` and `registerChannel` wrap
 * the injected sinks' `Disposable` return as the release.
 */
function buildContext(
  pluginId: string,
  ledger: EffectLedger,
  services: PluginHostServices,
): PluginContext {
  const contributes: ContributionSink = {
    addViewContainer: (container) =>
      ledger.run(() => services.contributions.addViewContainer(container), (d) => { d.dispose() }),
    addView: (view) =>
      ledger.run(() => services.contributions.addView(view), (d) => { d.dispose() }),
    addCommand: (command) =>
      ledger.run(() => services.contributions.addCommand(command), (d) => { d.dispose() }),
  }

  return {
    pluginId,
    registerChannel: (channel: ChannelContribution) => {
      ledger.run(() => services.channels.register(channel), (d) => { d.dispose() })
    },
    contributes,
    effect: (acquire, release) => ledger.run(acquire, release),
    call: services.call,
    settings: services.settings(pluginId),
  }
}

/** The §12.3 verdict: a diagnostic string if a red line is crossed, else undefined. */
function redLineBreach(manifest: PluginManifest): string | undefined {
  if (manifest.builtin) return undefined
  if (manifest.capabilities.includes(ELEVATE_CAPABILITY)) {
    return `third-party plugin may not declare capability ${ELEVATE_CAPABILITY}`
  }
  if (manifest.fsScope === "unrestricted") {
    return "third-party plugin may not declare fsScope: unrestricted"
  }
  return undefined
}

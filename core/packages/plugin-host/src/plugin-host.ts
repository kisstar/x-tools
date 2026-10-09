/**
 * PluginHost (§9, §11, §12.3) — the install-time gate backing the channel
 * server's gate ② (`declaredCapabilities`). It tracks each plugin's lifecycle
 * state and the capabilities its manifest declares. The one load-time policy it
 * enforces is §12.3's two red lines: a third-party plugin that declares the
 * `shell.elevate` capability, or `fsScope: "unrestricted"`, is rejected into the
 * terminal `failed` state — recorded with a diagnostic, never prompted, and
 * crucially without crashing the host (§11.1). A failed plugin declares no
 * capabilities, so any plugin-origin call it makes dies at gate ② (FORBIDDEN).
 *
 * Lifecycle vocabulary is §11.1 verbatim; Step 5 only reaches `installed` and
 * `failed`. activate / effect-teardown / registerChannel / §13 schema
 * registration are later steps.
 */

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

  /** Gate ②'s backing data: the declared capabilities of an installed plugin. */
  declaredCapabilities(pluginId: string | undefined): ReadonlySet<string> {
    if (pluginId === undefined) return NO_CAPS
    return this.#records.get(pluginId)?.capabilities ?? NO_CAPS
  }

  get(pluginId: string): PluginRecord | undefined {
    return this.#records.get(pluginId)
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

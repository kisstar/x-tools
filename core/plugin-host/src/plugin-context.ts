/**
 * The plugin↔kernel contact surface (§11.2) and the backings the host injects
 * to build it. `activate(ctx)` hands a plugin exactly this `PluginContext` and
 * nothing else — plugins never import kernel internals.
 *
 * The deliberate omission is `publish`: a plugin cannot broadcast an
 * invalidation event. Broadcasting rides a `defineCommand`'s `emits`, sent by
 * the channel wrapper only after the handler resolves (§8.4, invariant 8) —
 * that mechanical gap is why "事件不得先于提交" holds by construction.
 */

import type { Disposable, IChannel } from "@x-tools/protocol"

/**
 * A channel the plugin registers at activate; it must carry a zod schema or the
 * host rejects it (§13.3). ponytail: opaque until the §13 `defineCommand`
 * wiring lands — today the host only reads `channel` (the mandatory
 * `plugin.<id>` namespace, §12.2).
 */
export interface ChannelContribution {
  readonly channel: string
}

/** Plugin-namespaced settings (§12.2). ponytail: schema-default deep-merge is §11.6. */
export interface SettingsAccessor {
  readonly get: <T>() => T | undefined
}

/**
 * Nav / view / command contributions (§14). Each `add*` returns a `Disposable`
 * the host auto-registers as an effect, so the plugin never writes teardown
 * (§11.3). ponytail: payloads stay `unknown` until §14 nav derivation types them.
 */
export interface ContributionSink {
  readonly addViewContainer: (container: unknown) => Disposable
  readonly addView: (view: unknown) => Disposable
  readonly addCommand: (command: unknown) => Disposable
}

/** Where a plugin's channels land; `register` returns a `Disposable` for LIFO teardown. */
export interface ChannelSink {
  readonly register: (channel: ChannelContribution) => Disposable
}

/**
 * Backings the host injects to assemble a `PluginContext`. The composition root
 * supplies the real ones as later slices land; a host built without them can
 * still install plugins, only `activate` requires them.
 */
export interface PluginHostServices {
  readonly channels: ChannelSink
  readonly contributions: ContributionSink
  readonly call: IChannel["call"]
  readonly settings: (pluginId: string) => SettingsAccessor
}

export interface PluginContext {
  readonly pluginId: string
  /** Register a channel; backed by zod or rejected (§13.3). Auto-torn-down. */
  readonly registerChannel: (channel: ChannelContribution) => void
  /** viewContainers / views / commands (§14). Auto-torn-down. */
  readonly contributes: ContributionSink
  /** Register a reversible side effect; released LIFO on deactivate (§11.3). */
  readonly effect: <T>(acquire: () => T, release: (resource: T) => void) => T
  /** Call another channel — still routed through the three gates (§12). */
  readonly call: IChannel["call"]
  /** This plugin's settings namespace (§12.2). */
  readonly settings: SettingsAccessor
}

/** What a plugin's entry runs at activate. May be async (§11.5 atomic update). */
export type PluginActivator = (ctx: PluginContext) => void | Promise<void>

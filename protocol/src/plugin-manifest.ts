/**
 * Plugin manifest + contribution contract (§10.1, §11, §14.2) — the common-layer
 * shapes shared by both consumers: core's plugin-host reads the install-gate
 * subset (§12.3 red lines), and the renderer derives two-level navigation from
 * `contributes.viewContainers` / `contributes.views` (§14.3 — subnav existence
 * is derived from a `slot: "subnav"` view, never an enumerated field).
 *
 * This is a type-only module: zod stays the schema source of truth for channel
 * args (§5.7), but a manifest is a static authoring artifact, not a runtime
 * boundary input, so it carries no zod schema here. ponytail: add a manifest
 * zod validator when dynamic (non-builtin) plugins land and manifests arrive
 * untrusted from disk; builtin manifests are compiled in and trusted.
 */

/** Where a plugin's parts run (§10.1). `node` is available to both frontends. */
export type PluginRuntime = "ui" | "node"

/** A first-level nav cell (§14.2). */
export interface ViewContainerContribution {
  readonly id: string
  readonly location: "primary" | "secondary"
  readonly order: number
  readonly emphasis?: "normal" | "strong"
  readonly title: string
  readonly icon: string
}

/**
 * A view mounted on a container (§14.2). `slot: "subnav"` is what makes a
 * container grow a second-level nav bar — derived, per §14.3. `tags` is passed
 * through by the kernel uninterpreted (§14.4); only `tool-catalog` groups by it.
 */
export interface ViewContribution {
  readonly containerId: string
  readonly slot: "content" | "subnav"
  readonly id: string
  readonly title: string
  readonly tags?: readonly string[]
}

/** The `contributes` block (§14.2). ponytail: commands/settings join with §13/§11.6. */
export interface ContributionManifest {
  readonly viewContainers?: readonly ViewContainerContribution[]
  readonly views?: readonly ViewContribution[]
}

/**
 * The full plugin manifest. `builtin` gates the two §12.3 red lines
 * (`shell.elevate`, `fsScope: "unrestricted"`); `capabilities` is the gate-②
 * allow-set. Structurally a superset of plugin-host's install-gate subset, so a
 * value typed here is directly passable to `PluginHost.install`.
 */
export interface PluginManifest {
  readonly id: string
  readonly builtin: boolean
  readonly runtimes: readonly PluginRuntime[]
  readonly capabilities: readonly string[]
  readonly fsScope?: "unrestricted"
  readonly contributes?: ContributionManifest
}

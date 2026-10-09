/**
 * switch-host plugin channel commands (§13.1, §13.2). A builtin plugin, so its
 * schema is compiled into `protocol/` at build time (§13.1 table, row 1) rather
 * than loaded from disk at runtime like a dynamic plugin's zod. Both kinds land
 * in the same channel-server validation table (invariant 2/4); the difference is
 * only *when* the schema is known, not *which* table it joins.
 *
 * Kept deliberately SEPARATE from `ALL_COMMANDS`: that array is the kernel's
 * primitive registry (fs/shell/storage/notification), and its contract test
 * asserts every emitted topic lives in the kernel's `EVENT_TOPICS` union.
 * A plugin's topic is plugin-namespaced and must not pollute that union, so
 * switch-host exports its own `SWITCH_HOST_COMMANDS` and its own topic const.
 *
 * `channel: 'plugin.switch-host'` is the forced namespace prefix (§12.2) — the
 * physical isolation that stops two plugins' channels from colliding. The
 * `capability` string must match a capability the plugin's manifest declares
 * (§13.2); that match is locked by the plugin's own contract test, not here,
 * because the manifest (which owns the capability names) sits a layer up.
 */

import { z } from "zod"

import { defineCommand } from "../define-command"

/** Plugin-namespaced invalidation topic the wrapper broadcasts after a write (§8.4). */
export const SWITCH_HOST_PROFILES_CHANGED = "switch-host.profiles.changed"

/**
 * Activate a selection of host groups. Primitive-only args (ids, not whole
 * group shapes) so this contract carries no copy of the plugin's domain model
 * (that lives in the plugin's `model/` layer, §14.1). The write re-renders the
 * /etc/hosts block via the elevate path; the UI re-queries on the emitted
 * invalidation rather than reading a return value, so the result is void.
 */
export const SetActiveArgs = z.object({
  activeGroupIds: z.array(z.string().min(1)),
})
export type SetActiveArgs = z.infer<typeof SetActiveArgs>

export const SWITCH_HOST_SET_ACTIVE = defineCommand({
  channel: "plugin.switch-host",
  command: "setActive",
  args: SetActiveArgs,
  result: z.void(),
  capability: "switch-host.write",
  emits: [SWITCH_HOST_PROFILES_CHANGED],
})

export const SWITCH_HOST_COMMANDS = [SWITCH_HOST_SET_ACTIVE] as const

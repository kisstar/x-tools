/**
 * switch-host ui pure helpers (plugin-ui layer, §14.1) — the view's only
 * non-React logic, split out so it runs under vitest's node env with no DOM
 * (the React view + hook are typechecked but their DOM behaviour is deferred
 * until the renderer grows a jsdom test env). Imports its own model/ only;
 * no React, no channel client (ui routes writes through data/, never direct).
 */

import type { HostGroup } from "../model/host-model"

/** The ids of the groups currently enabled — the selection `setActive` expects. */
export function activeIdsOf(groups: readonly HostGroup[]): string[] {
  return groups.filter((group) => group.enabled).map((group) => group.id)
}

/** Toggle `id` in the active-id selection, returning a NEW array (immutable). */
export function toggleActive(active: readonly string[], id: string): string[] {
  return active.includes(id) ? active.filter((other) => other !== id) : [...active, id]
}

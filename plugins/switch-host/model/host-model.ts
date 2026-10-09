/**
 * switch-host domain model (plugin-model layer, §14.1) — pure data, imports
 * nothing. The vocabulary is ported from docs/prd/switch-host.md §3.1; the PRD's
 * old DDD / Module-Federation structure is dropped, only the domain shapes
 * survive. No `node:*`, no React, no channel client here — writing /etc/hosts
 * and talking to the kernel are the node/ and data/ layers' jobs.
 */

/** One `ip → domain` mapping line in a group. */
export interface HostEntry {
  readonly id: string
  readonly ip: string
  readonly domain: string
  readonly enabled: boolean
  readonly comment?: string
}

/**
 * A named, independently-toggleable set of host entries. `enabled` gates the
 * whole group in the rendered /etc/hosts block; per-entry `enabled` gates lines
 * within it. `readOnly` marks groups the user may not edit (e.g. imported
 * system defaults). Timestamps are epoch milliseconds.
 */
export interface HostGroup {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly entries: readonly HostEntry[]
  readonly enabled: boolean
  readonly pinned: boolean
  readonly autoEnable: boolean
  readonly readOnly: boolean
  readonly color?: string
  readonly createdAt: number
  readonly updatedAt: number
}

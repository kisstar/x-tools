/**
 * Render the managed /etc/hosts section (plugin-model layer) — pure
 * `groups → string`. The node/ layer (later, behind shell.elevate) splices this
 * block between the markers in the real file; keeping it a pure function means
 * the risky part (what text lands in /etc/hosts) is testable with zero I/O.
 *
 * Only enabled groups contribute, and within them only enabled entries; a group
 * whose enabled entries are all off emits nothing (no empty header noise).
 * Order follows input order — the caller owns ordering (pinned/sort live above).
 */

import type { HostGroup } from "./host-model"

export const BLOCK_START = "# === xTools Switch-Host START ==="
export const BLOCK_END = "# === xTools Switch-Host END ==="

function renderEntry(ip: string, domain: string, comment?: string): string {
  const line = `${ip}\t${domain}`
  return comment !== undefined && comment !== "" ? `${line}  # ${comment}` : line
}

export function renderHostsBlock(groups: readonly HostGroup[]): string {
  const lines: string[] = [BLOCK_START]

  for (const group of groups) {
    if (!group.enabled) continue
    const active = group.entries.filter((e) => e.enabled)
    if (active.length === 0) continue

    lines.push(`# [Group: ${group.name}]`)
    for (const entry of active) {
      lines.push(renderEntry(entry.ip, entry.domain, entry.comment))
    }
  }

  lines.push(BLOCK_END)
  return `${lines.join("\n")}\n`
}

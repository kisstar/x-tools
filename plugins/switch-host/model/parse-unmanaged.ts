/**
 * Parse the UNMANAGED half of /etc/hosts (plugin-model layer) — pure
 * `text → HostGroup | null`. The read flow (PRD §3.3) surfaces entries that live
 * OUTSIDE the xTools markers as a read-only "系统（未管理）" group so the user can
 * see what else is in their hosts file; the managed block is NOT re-parsed here
 * (those entries are derived from stored JSON, not read back).
 *
 * ponytail: this group is DISPLAY-ONLY and must never be fed to
 * `renderHostsBlock` — doing so would copy the system's own entries into our
 * managed block and double them in the file. It is marked `readOnly: true` and
 * the data/ layer owns keeping it out of the write path; no type-level guard
 * for a single caller yet.
 */

import type { HostEntry, HostGroup } from "./host-model"
import { BLOCK_END, BLOCK_START } from "./render-hosts-block"
import { isValidIp } from "./validate-entry"

export const UNMANAGED_GROUP_ID = "system-unmanaged"
export const UNMANAGED_GROUP_NAME = "系统（未管理）"

/** Strip the managed block so only unmanaged lines remain for scanning. */
function unmanagedText(text: string): string {
  const startIdx = text.indexOf(BLOCK_START)
  const endIdx = startIdx === -1 ? -1 : text.indexOf(BLOCK_END, startIdx)
  if (startIdx === -1 || endIdx === -1) return text
  return text.slice(0, startIdx) + text.slice(endIdx + BLOCK_END.length)
}

function parseLine(line: string, startIndex: number): readonly HostEntry[] {
  const hashIdx = line.indexOf("#")
  const comment = hashIdx === -1 ? undefined : line.slice(hashIdx + 1).trim()
  const body = (hashIdx === -1 ? line : line.slice(0, hashIdx)).trim()
  if (body === "") return []

  const [ip, ...hostnames] = body.split(/\s+/)
  // Require a well-formed IP so stray prose lines aren't mistaken for entries;
  // hostnames are mirrored as-is (this is a read-only view of what already
  // exists in the file, not something we validate before rendering).
  if (ip === undefined || hostnames.length === 0 || !isValidIp(ip)) return []

  return hostnames.map((domain, i) => ({
    id: `unmanaged-${startIndex + i}`,
    ip,
    domain,
    enabled: true,
    ...(comment !== undefined && comment !== "" ? { comment } : {}),
  }))
}

export function parseUnmanagedGroup(currentText: string): HostGroup | null {
  const entries: HostEntry[] = []
  for (const line of unmanagedText(currentText).split("\n")) {
    entries.push(...parseLine(line, entries.length))
  }
  if (entries.length === 0) return null

  return {
    id: UNMANAGED_GROUP_ID,
    name: UNMANAGED_GROUP_NAME,
    entries,
    enabled: true,
    pinned: false,
    autoEnable: false,
    readOnly: true,
    createdAt: 0,
    updatedAt: 0,
  }
}

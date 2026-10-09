/**
 * Conflict detection (plugin-model layer) — pure `groups → HostConflict[]`,
 * ported from PRD §3.4. A conflict is one domain appearing in two or more
 * entries; severity depends only on whether those entries are *active* (both
 * the group and the entry enabled) and whether their IPs agree:
 *
 *  - error   : domain active in ≥2 places with DIFFERENT ips (真的会打架)
 *  - warning : domain active in ≥2 places, all the SAME ip (重复但无害)
 *  - info    : domain active in exactly one place but also present in an
 *              inactive one (disabled group/entry — 不活跃，无需操作)
 *
 * An entry whose group or self is disabled is "inactive"; a domain with <2
 * total occurrences is never a conflict. Domains compare case-insensitively
 * (hostnames are). Each ref carries `active` so the ui/ layer can highlight the
 * entries that actually clash (error) and dim the rest.
 */

import type { HostGroup } from "./host-model"

export type ConflictSeverity = "error" | "warning" | "info"

export interface ConflictEntryRef {
  readonly groupId: string
  readonly groupName: string
  readonly entryId: string
  readonly ip: string
  readonly active: boolean
}

export interface HostConflict {
  readonly domain: string
  readonly severity: ConflictSeverity
  readonly refs: readonly ConflictEntryRef[]
}

export function detectConflicts(groups: readonly HostGroup[]): readonly HostConflict[] {
  const byDomain = new Map<string, ConflictEntryRef[]>()

  for (const group of groups) {
    for (const entry of group.entries) {
      const key = entry.domain.toLowerCase()
      const refs = byDomain.get(key) ?? []
      refs.push({
        groupId: group.id,
        groupName: group.name,
        entryId: entry.id,
        ip: entry.ip,
        active: group.enabled && entry.enabled,
      })
      byDomain.set(key, refs)
    }
  }

  const conflicts: HostConflict[] = []
  for (const [domain, refs] of byDomain) {
    if (refs.length < 2) continue
    const severity = classify(refs)
    if (severity === null) continue
    conflicts.push({ domain, severity, refs })
  }

  return conflicts.sort((a, b) => a.domain.localeCompare(b.domain))
}

function classify(refs: readonly ConflictEntryRef[]): ConflictSeverity | null {
  const active = refs.filter((r) => r.active)
  if (active.length >= 2) {
    const ips = new Set(active.map((r) => r.ip))
    return ips.size > 1 ? "error" : "warning"
  }
  // exactly one active entry while an inactive sibling exists → informational only
  if (active.length === 1) return "info"
  // nothing active: a conflict only between disabled entries isn't live
  return null
}

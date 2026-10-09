/**
 * detect-conflicts contract — PRD §3.4 severity table. Only *active* entries
 * (group enabled AND entry enabled) can clash; the rules distinguish same-IP
 * duplication (warning) from a real IP fight (error), and treat an active entry
 * shadowed only by a disabled one as informational (no action).
 */

import { describe, expect, it } from "vitest"

import { detectConflicts } from "../detect-conflicts"
import type { HostEntry, HostGroup } from "../host-model"

function group(id: string, enabled: boolean, entries: readonly HostEntry[]): HostGroup {
  return { id, name: id, entries, enabled, pinned: false, autoEnable: false, readOnly: false, createdAt: 0, updatedAt: 0 }
}

function entry(id: string, ip: string, domain: string, enabled = true): HostEntry {
  return { id, ip, domain, enabled }
}

describe("detectConflicts", () => {
  it("reports nothing when every domain is unique", () => {
    const groups = [group("g1", true, [entry("a", "1.1.1.1", "a.local"), entry("b", "2.2.2.2", "b.local")])]
    expect(detectConflicts(groups)).toEqual([])
  })

  it("flags a warning when two active entries share a domain AND the same ip", () => {
    const groups = [
      group("g1", true, [entry("a", "1.1.1.1", "api.local")]),
      group("g2", true, [entry("b", "1.1.1.1", "api.local")]),
    ]
    const [conflict] = detectConflicts(groups)
    expect(conflict?.severity).toBe("warning")
    expect(conflict?.domain).toBe("api.local")
    expect(conflict?.refs.map((r) => r.groupId)).toEqual(["g1", "g2"])
    expect(conflict?.refs.every((r) => r.active)).toBe(true)
  })

  it("flags an error when two active entries map one domain to different ips", () => {
    const groups = [
      group("g1", true, [entry("a", "1.1.1.1", "api.local")]),
      group("g2", true, [entry("b", "9.9.9.9", "api.local")]),
    ]
    expect(detectConflicts(groups)[0]?.severity).toBe("error")
  })

  it("sees a within-group duplicate too (组内冲突)", () => {
    const groups = [
      group("g1", true, [entry("a", "1.1.1.1", "dup.local"), entry("b", "2.2.2.2", "dup.local")]),
    ]
    expect(detectConflicts(groups)[0]?.severity).toBe("error")
  })

  it("downgrades to info when only one side is active (disabled group shadows it)", () => {
    const groups = [
      group("g1", true, [entry("a", "1.1.1.1", "api.local")]),
      group("g2", false, [entry("b", "9.9.9.9", "api.local")]),
    ]
    const [conflict] = detectConflicts(groups)
    expect(conflict?.severity).toBe("info")
    expect(conflict?.refs.find((r) => r.groupId === "g2")?.active).toBe(false)
  })

  it("ignores a clash that lives entirely in disabled entries", () => {
    const groups = [
      group("g1", true, [entry("a", "1.1.1.1", "api.local", false)]),
      group("g2", false, [entry("b", "9.9.9.9", "api.local")]),
    ]
    expect(detectConflicts(groups)).toEqual([])
  })

  it("matches domains case-insensitively", () => {
    const groups = [
      group("g1", true, [entry("a", "1.1.1.1", "API.local")]),
      group("g2", true, [entry("b", "9.9.9.9", "api.local")]),
    ]
    expect(detectConflicts(groups)[0]?.severity).toBe("error")
  })
})

/**
 * parse-unmanaged contract — the read flow (PRD §3.3 step 2): entries outside
 * the xTools markers surface as a read-only "系统（未管理）" group, and the managed
 * block is never re-read. Pure, no I/O.
 */

import { describe, expect, it } from "vitest"

import { parseUnmanagedGroup, UNMANAGED_GROUP_ID, UNMANAGED_GROUP_NAME } from "../parse-unmanaged"
import { BLOCK_END, BLOCK_START } from "../render-hosts-block"

describe("parseUnmanagedGroup", () => {
  it("collects unmanaged entries and ignores everything inside the markers", () => {
    const text = [
      "127.0.0.1 localhost",
      BLOCK_START,
      "# [Group: dev]",
      "10.0.0.1\tapi.local",
      BLOCK_END,
      "255.255.255.255 broadcasthost",
    ].join("\n")

    const g = parseUnmanagedGroup(text)
    expect(g).not.toBeNull()
    expect(g?.id).toBe(UNMANAGED_GROUP_ID)
    expect(g?.name).toBe(UNMANAGED_GROUP_NAME)
    expect(g?.readOnly).toBe(true)
    expect(g?.entries.map((e) => e.domain)).toEqual(["localhost", "broadcasthost"])
    // the managed entry must not leak into the unmanaged group
    expect(g?.entries.some((e) => e.domain === "api.local")).toBe(false)
  })

  it("emits one entry per hostname on a multi-name line and captures inline comments", () => {
    const g = parseUnmanagedGroup("127.0.0.1 localhost broadcasthost  # loopback")
    expect(g?.entries).toHaveLength(2)
    expect(g?.entries.every((e) => e.ip === "127.0.0.1" && e.comment === "loopback")).toBe(true)
    expect(g?.entries.map((e) => e.id)).toEqual(["unmanaged-0", "unmanaged-1"])
  })

  it("skips blank lines, full-line comments, and lines without a valid ip", () => {
    const g = parseUnmanagedGroup(["", "# just a comment", "not an ip line", "192.168.0.1 db.local"].join("\n"))
    expect(g?.entries).toHaveLength(1)
    expect(g?.entries[0]?.domain).toBe("db.local")
    expect(g?.entries[0]?.comment).toBeUndefined()
  })

  it("returns null when there are no unmanaged entries", () => {
    expect(parseUnmanagedGroup("")).toBeNull()
    expect(parseUnmanagedGroup(`${BLOCK_START}\n10.0.0.1\tapi.local\n${BLOCK_END}\n`)).toBeNull()
  })
})

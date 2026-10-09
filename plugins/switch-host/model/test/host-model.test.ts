/**
 * switch-host model contract test — locks the two bits of non-trivial domain
 * logic: entry validation (what counts as a well-formed ip/domain) and the
 * /etc/hosts block rendering (what text would land in the file). Pure, no I/O.
 */

import { describe, expect, it } from "vitest"

import type { HostEntry, HostGroup } from "../host-model"
import { renderHostsBlock, BLOCK_START, BLOCK_END } from "../render-hosts-block"
import { isValidDomain, isValidIp, validateEntry } from "../validate-entry"

function entry(over: Partial<HostEntry> & Pick<HostEntry, "ip" | "domain">): HostEntry {
  return { id: "e", enabled: true, ...over }
}

function group(over: Partial<HostGroup> & Pick<HostGroup, "name" | "entries">): HostGroup {
  return {
    id: "g",
    enabled: true,
    pinned: false,
    autoEnable: false,
    readOnly: false,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

describe("validate-entry", () => {
  it("accepts valid IPv4 / IPv6 and hostnames", () => {
    expect(isValidIp("127.0.0.1")).toBe(true)
    expect(isValidIp("::1")).toBe(true)
    expect(isValidDomain("example.com")).toBe(true)
    expect(isValidDomain("localhost")).toBe(true)
  })

  it("rejects malformed ip and domain", () => {
    expect(isValidIp("999.1.1.1")).toBe(false)
    expect(isValidIp("nope")).toBe(false)
    expect(isValidDomain("-bad.com")).toBe(false)
    expect(validateEntry({ ip: "127.0.0.1", domain: "example.com" })).toEqual([])
    expect(validateEntry({ ip: "bad", domain: "also bad" })).toHaveLength(2)
  })
})

describe("renderHostsBlock", () => {
  it("emits only enabled groups and enabled entries, wrapped in markers", () => {
    const text = renderHostsBlock([
      group({
        name: "dev",
        entries: [
          entry({ ip: "127.0.0.1", domain: "api.local", comment: "backend" }),
          entry({ ip: "127.0.0.1", domain: "off.local", enabled: false }),
        ],
      }),
      group({ name: "disabled-group", enabled: false, entries: [entry({ ip: "10.0.0.1", domain: "x.local" })] }),
    ])

    expect(text.startsWith(`${BLOCK_START}\n`)).toBe(true)
    expect(text.endsWith(`${BLOCK_END}\n`)).toBe(true)
    expect(text).toContain("# [Group: dev]")
    expect(text).toContain("127.0.0.1\tapi.local  # backend")
    expect(text).not.toContain("off.local")
    expect(text).not.toContain("disabled-group")
  })

  it("skips a group whose entries are all disabled", () => {
    const text = renderHostsBlock([
      group({ name: "all-off", entries: [entry({ ip: "127.0.0.1", domain: "x.local", enabled: false })] }),
    ])
    expect(text).toBe(`${BLOCK_START}\n${BLOCK_END}\n`)
  })
})

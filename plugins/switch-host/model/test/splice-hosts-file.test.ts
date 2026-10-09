/**
 * splice-hosts-file contract — the data-integrity red line (PRD §6.2): the
 * splice replaces only the managed block and leaves every byte outside the
 * markers untouched. These cases are the ones that would silently corrupt a
 * user's real /etc/hosts if the string math were wrong.
 */

import { describe, expect, it } from "vitest"

import { BLOCK_END, BLOCK_START } from "../render-hosts-block"
import { spliceHostsFile } from "../splice-hosts-file"

const block = `${BLOCK_START}\n# [Group: dev]\n127.0.0.1\tapi.local\n${BLOCK_END}\n`

describe("spliceHostsFile", () => {
  it("replaces an existing block, preserving content before and after verbatim", () => {
    const current = `127.0.0.1 localhost\n${BLOCK_START}\n1.1.1.1\told.local\n${BLOCK_END}\n255.255.255.255 broadcasthost\n`
    const result = spliceHostsFile(current, block)

    expect(result).toBe(`127.0.0.1 localhost\n${block}255.255.255.255 broadcasthost\n`)
    expect(result).not.toContain("old.local")
    expect(result.startsWith("127.0.0.1 localhost\n")).toBe(true)
    expect(result.endsWith("255.255.255.255 broadcasthost\n")).toBe(true)
  })

  it("appends the block when no markers are present, keeping a newline boundary", () => {
    expect(spliceHostsFile("127.0.0.1 localhost\n", block)).toBe(`127.0.0.1 localhost\n${block}`)
    // missing trailing newline on the original gets one before the block
    expect(spliceHostsFile("127.0.0.1 localhost", block)).toBe(`127.0.0.1 localhost\n${block}`)
    // empty file → just the block, no leading blank line
    expect(spliceHostsFile("", block)).toBe(block)
  })

  it("appends (does not surgically repair) when only one marker survives", () => {
    const corrupted = `127.0.0.1 localhost\n${BLOCK_START}\n1.1.1.1\torphan.local\n`
    const result = spliceHostsFile(corrupted, block)
    expect(result).toBe(`${corrupted}${block}`)
    // the orphaned half-block is left exactly as found, not rewritten
    expect(result).toContain("orphan.local")
  })

  it("does not accumulate blank lines across repeated writes", () => {
    const current = `head\n${BLOCK_START}\nold\n${BLOCK_END}\ntail\n`
    const once = spliceHostsFile(current, block)
    const twice = spliceHostsFile(once, block)
    expect(twice).toBe(once)
  })
})

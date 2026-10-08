/**
 * Contract test suite (§15). These lock core's observable contract behaviour
 * so it's enforced by CI, not code review (invariant 5). Step 1 covers the
 * static shape of the command registry; transport-level conformance arrives
 * with the channel server in Step 2.
 */

import { z } from "zod"
import { describe, expect, it } from "vitest"

import { ALL_COMMANDS } from "../src/commands/all-commands"
import { commandId } from "../src/define-command"
import { EVENT_TOPICS } from "../src/events"
import { FsReadFileArgs } from "../src/commands/fs"

describe("command registry", () => {
  it("has a unique id per command", () => {
    const ids = ALL_COMMANDS.map(commandId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("declares non-empty channel, command, and capability on every entry", () => {
    for (const def of ALL_COMMANDS) {
      expect(def.channel.length).toBeGreaterThan(0)
      expect(def.command.length).toBeGreaterThan(0)
      expect(def.capability.length).toBeGreaterThan(0)
    }
  })

  it("carries zod schemas for args and result (§5.7)", () => {
    for (const def of ALL_COMMANDS) {
      expect(def.args).toBeInstanceOf(z.ZodType)
      expect(def.result).toBeInstanceOf(z.ZodType)
    }
  })

  it("only emits topics that exist in the event registry (§8)", () => {
    for (const def of ALL_COMMANDS) {
      for (const topic of def.emits ?? []) {
        expect(EVENT_TOPICS).toContain(topic)
      }
    }
  })
})

describe("FsReadFileArgs", () => {
  it("defaults encoding to utf8", () => {
    const parsed = FsReadFileArgs.parse({ path: "/tmp/x" })
    expect(parsed.encoding).toBe("utf8")
  })

  it("rejects an empty path", () => {
    expect(() => FsReadFileArgs.parse({ path: "" })).toThrow()
  })
})

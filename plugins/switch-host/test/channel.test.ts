/**
 * switch-host plugin channel contract (§12.2, §13.2, §13.3). Locks the facts the
 * channel server and plugin host rely on, so a careless edit to the command def
 * or the manifest trips here instead of failing silently at install/call time:
 *
 *  - channel sits under the forced `plugin.switch-host` namespace (§12.2) — the
 *    prefix the plugin host binds and the whitelist lands on.
 *  - the command CARRIES a zod args schema (§13.3 red line: a plugin channel
 *    with no schema must be rejected at registration; here we assert the schema
 *    exists so that rejection path is never reachable for this builtin).
 *  - its `capability` is exactly the manifest's `switch-host.write` AND is one
 *    the manifest actually declares (§13.2) — the two sources can't drift.
 *  - it emits the plugin-namespaced invalidation topic (§8.4).
 *
 * Pure contract check: protocol command def + manifest, no kernel import
 * (§11.2). Kept out of the kernel's contracts.test.ts on purpose — a plugin's
 * topic must not be forced into the kernel's EVENT_TOPICS union.
 */

import { describe, expect, it } from "vitest"

import { SWITCH_HOST_PROFILES_CHANGED, SWITCH_HOST_SET_ACTIVE, commandId } from "@x-tools/protocol"

import { SWITCH_HOST_WRITE, switchHostManifest } from "../manifest"

describe("switch-host channel contract (§12.2, §13.2, §13.3)", () => {
  it("lives under the plugin.switch-host namespace (§12.2)", () => {
    expect(SWITCH_HOST_SET_ACTIVE.channel).toBe("plugin.switch-host")
    expect(commandId(SWITCH_HOST_SET_ACTIVE)).toBe("plugin.switch-host:setActive")
  })

  it("carries a zod args schema (§13.3 red line)", () => {
    // No zod import here (the plugin doesn't depend on zod); a callable
    // `safeParse` is enough to prove a runtime schema rides with the command.
    expect(typeof SWITCH_HOST_SET_ACTIVE.args.safeParse).toBe("function")
  })

  it("declares a capability the manifest actually grants (§13.2)", () => {
    expect(SWITCH_HOST_SET_ACTIVE.capability).toBe(SWITCH_HOST_WRITE)
    expect(switchHostManifest.capabilities).toContain(SWITCH_HOST_SET_ACTIVE.capability)
  })

  it("emits the plugin-namespaced invalidation topic (§8.4)", () => {
    expect(SWITCH_HOST_SET_ACTIVE.emits).toContain(SWITCH_HOST_PROFILES_CHANGED)
    expect(SWITCH_HOST_PROFILES_CHANGED.startsWith("switch-host.")).toBe(true)
  })

  it("accepts a valid selection and rejects malformed ids", () => {
    expect(SWITCH_HOST_SET_ACTIVE.args.safeParse({ activeGroupIds: ["g1", "g2"] }).success).toBe(true)
    expect(SWITCH_HOST_SET_ACTIVE.args.safeParse({ activeGroupIds: [] }).success).toBe(true)
    // empty-string id and non-array both fail — the write never gets a blank key.
    expect(SWITCH_HOST_SET_ACTIVE.args.safeParse({ activeGroupIds: [""] }).success).toBe(false)
    expect(SWITCH_HOST_SET_ACTIVE.args.safeParse({ activeGroupIds: "g1" }).success).toBe(false)
  })
})

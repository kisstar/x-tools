/**
 * switch-host manifest shape contract. Locks the decisions that matter for the
 * kernel's gates and the renderer's nav derivation, so a careless edit to the
 * manifest trips here instead of silently changing behavior downstream:
 *
 *  - builtin:true + declares `shell.elevate` — the §12.3 red line only a builtin
 *    may cross; if this flips to third-party, plugin-host must reject it.
 *  - declares its own `switch-host.read` / `switch-host.write` (§13.2).
 *  - NOT `fsScope: unrestricted` — the hosts write rides elevate, not a broad
 *    fs grant (§17 least privilege).
 *  - exactly one `primary` viewContainer, with a `content` view AND a `subnav`
 *    view on it — so §14.3 subnav derivation has something to derive.
 *
 * Pure: protocol types only, no kernel import (§11.2 — plugins never import
 * kernel internals; install-compatibility is guaranteed structurally by
 * PluginManifest being a superset of plugin-host's install-gate subset).
 */

import { describe, expect, it } from "vitest"

import { SWITCH_HOST_READ, SWITCH_HOST_WRITE, switchHostManifest } from "../manifest"

describe("switch-host manifest (§9.2, §12.3, §14.2)", () => {
  it("is a builtin declaring the elevate red line but not unrestricted fs", () => {
    expect(switchHostManifest.builtin).toBe(true)
    expect(switchHostManifest.capabilities).toContain("shell.elevate")
    expect(switchHostManifest.fsScope).toBeUndefined()
  })

  it("declares its own read/write capabilities (§13.2)", () => {
    expect(switchHostManifest.capabilities).toContain(SWITCH_HOST_READ)
    expect(switchHostManifest.capabilities).toContain(SWITCH_HOST_WRITE)
  })

  it("runs on both ui and node (§10.1)", () => {
    expect([...switchHostManifest.runtimes].sort()).toEqual(["node", "ui"])
  })

  it("contributes one primary container with content + subnav views (§14.2/§14.3)", () => {
    const containers = switchHostManifest.contributes?.viewContainers ?? []
    const primary = containers.filter((c) => c.location === "primary")
    expect(primary).toHaveLength(1)

    const containerId = primary[0]?.id
    const views = switchHostManifest.contributes?.views ?? []
    const mine = views.filter((v) => v.containerId === containerId)
    // Subnav existence is derived from a slot:"subnav" view (§14.3), not a flag.
    expect(mine.some((v) => v.slot === "content")).toBe(true)
    expect(mine.some((v) => v.slot === "subnav")).toBe(true)
  })
})

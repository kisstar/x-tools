/**
 * switch-host-node contract — the server-side read/write flows against fully
 * faked I/O (no fs, no elevate, no channel). Locks: (1) listGroups = stored
 * managed groups + the derived read-only unmanaged view appended last, mapped to
 * wire with optionals dropped when absent; (2) listGroups with no unmanaged lines
 * returns only the stored groups; (3) setActive toggles `enabled` by id set,
 * persists via saveGroups, and writes `splice(current, render(next))` — enabled
 * group's lines land in the managed block, disabled group's don't, and text
 * outside the markers is preserved verbatim (PRD §6.2); (4) unknown / unmanaged
 * ids never match a stored group, so they neither throw nor leak into the write.
 */

import { describe, expect, it } from "vitest"

import type { HostGroup } from "../../model/host-model"
import { BLOCK_END, BLOCK_START } from "../../model/render-hosts-block"
import type { SwitchHostNodeDeps } from "../switch-host-node"
import { createSwitchHostNode } from "../switch-host-node"

function group(over: Partial<HostGroup> = {}): HostGroup {
  return {
    id: "g1",
    name: "dev",
    entries: [{ id: "e1", ip: "1.1.1.1", domain: "api.local", enabled: true }],
    enabled: false,
    pinned: false,
    autoEnable: false,
    readOnly: false,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

/** Mutable fakes so a write can be read back and persisted groups inspected. */
function fakeDeps(initial: { groups?: readonly HostGroup[]; hosts?: string } = {}): {
  readonly deps: SwitchHostNodeDeps
  saved: readonly HostGroup[] | undefined
  written: string | undefined
} {
  const state = {
    groups: initial.groups ?? [],
    hosts: initial.hosts ?? "",
    saved: undefined as readonly HostGroup[] | undefined,
    written: undefined as string | undefined,
  }
  return {
    get saved() {
      return state.saved
    },
    get written() {
      return state.written
    },
    deps: {
      loadGroups: async () => state.groups,
      saveGroups: async (groups) => {
        state.saved = groups
        state.groups = groups
      },
      readHostsFile: async () => state.hosts,
      writeHostsFile: async (text) => {
        state.written = text
        state.hosts = text
      },
    },
  }
}

describe("createSwitchHostNode", () => {
  it("listGroups appends the derived read-only unmanaged group last and maps to wire", async () => {
    const stored = group({ id: "g1", description: "d", color: "#fff" })
    const fake = fakeDeps({ groups: [stored], hosts: "10.0.0.1 extra.local\n" })

    const wire = await createSwitchHostNode(fake.deps).listGroups()

    expect(wire.map((g) => g.id)).toEqual(["g1", "system-unmanaged"])
    expect(wire[0]?.description).toBe("d")
    expect(wire[0]?.color).toBe("#fff")
    expect(wire[1]?.readOnly).toBe(true)
    expect(wire[1]?.entries[0]?.domain).toBe("extra.local")
    // Absent optionals stay absent across the model→wire hop.
    expect(wire[1] && "description" in wire[1]).toBe(false)
  })

  it("listGroups returns only stored groups when hosts has no unmanaged lines", async () => {
    const fake = fakeDeps({ groups: [group()], hosts: "" })

    const wire = await createSwitchHostNode(fake.deps).listGroups()

    expect(wire.map((g) => g.id)).toEqual(["g1"])
  })

  it("setActive toggles enabled per id, persists, and splices the rendered block", async () => {
    const fake = fakeDeps({
      groups: [
        group({ id: "on", name: "On", entries: [{ id: "a", ip: "1.1.1.1", domain: "on.local", enabled: true }] }),
        group({ id: "off", name: "Off", entries: [{ id: "b", ip: "2.2.2.2", domain: "off.local", enabled: true }] }),
      ],
      hosts: "127.0.0.1 localhost\n",
    })

    await createSwitchHostNode(fake.deps).setActive(["on"])

    expect(fake.saved?.find((g) => g.id === "on")?.enabled).toBe(true)
    expect(fake.saved?.find((g) => g.id === "off")?.enabled).toBe(false)

    const written = fake.written ?? ""
    expect(written).toContain("127.0.0.1 localhost") // outside the markers, preserved
    expect(written).toContain(BLOCK_START)
    expect(written).toContain(BLOCK_END)
    expect(written).toContain("on.local") // enabled group rendered
    expect(written).not.toContain("off.local") // disabled group absent
  })

  it("setActive ignores unknown and unmanaged ids without throwing or leaking them", async () => {
    const fake = fakeDeps({
      groups: [group({ id: "g1", entries: [{ id: "a", ip: "1.1.1.1", domain: "api.local", enabled: true }] })],
      hosts: "10.0.0.1 extra.local\n",
    })

    await createSwitchHostNode(fake.deps).setActive(["nope", "system-unmanaged"])

    // No stored id matched → every group ends disabled, managed block is empty.
    expect(fake.saved?.every((g) => !g.enabled)).toBe(true)
    const written = fake.written ?? ""
    expect(written).not.toContain("api.local")
    expect(written).toContain("extra.local") // unmanaged line preserved, never managed
    expect(written).toContain(BLOCK_START)
  })
})

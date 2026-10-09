/**
 * switch-host-data contract — the facade's three jobs, against a fake
 * ChannelClient (no transport, no server). Locks: (1) listGroups speaks the
 * read command id with `{}` and maps wire→model, dropping absent optionals;
 * (2) setActive speaks the write command id with the ids wrapped in
 * `{ activeGroupIds }`; (3) onProfilesChanged fires only for this plugin's topic
 * and its unsubscribe actually detaches.
 */

import type { ChannelClient, EventHandler } from "@x-tools/channel-client"
import type { HostGroupWire, InvalidationEvent } from "@x-tools/protocol"
import { SWITCH_HOST_PROFILES_CHANGED } from "@x-tools/protocol"
import { describe, expect, it, vi } from "vitest"

import { createSwitchHostData } from "../switch-host-data"

interface Call {
  readonly command: string
  readonly arg: unknown
}

function fakeChannel(result: unknown): {
  readonly client: ChannelClient
  readonly calls: Call[]
  emit: (event: InvalidationEvent) => void
} {
  const calls: Call[] = []
  const handlers = new Set<EventHandler>()
  return {
    calls,
    emit: (event) => handlers.forEach((h) => h(event)),
    client: {
      call: async <TResult>(command: string, arg?: unknown) => {
        calls.push({ command, arg })
        return result as TResult
      },
      subscribe: (handler) => {
        handlers.add(handler)
        return () => void handlers.delete(handler)
      },
      dispose: () => void handlers.clear(),
    },
  }
}

function wireGroup(over: Partial<HostGroupWire> = {}): HostGroupWire {
  return {
    id: "g1",
    name: "dev",
    entries: [{ id: "e1", ip: "1.1.1.1", domain: "api.local", enabled: true }],
    enabled: true,
    pinned: false,
    autoEnable: false,
    readOnly: false,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

describe("createSwitchHostData", () => {
  it("listGroups calls the read command id with {} and maps wire→model", async () => {
    const ch = fakeChannel([wireGroup({ description: "d", color: "#fff" })])
    const data = createSwitchHostData(ch.client)

    const groups = await data.listGroups()

    expect(ch.calls[0]?.command).toBe("plugin.switch-host:listGroups")
    expect(ch.calls[0]?.arg).toEqual({})
    expect(groups[0]?.description).toBe("d")
    expect(groups[0]?.color).toBe("#fff")
    expect(groups[0]?.entries[0]?.domain).toBe("api.local")
  })

  it("drops absent optionals rather than mapping them to undefined", async () => {
    const ch = fakeChannel([wireGroup()])
    const [group] = await createSwitchHostData(ch.client).listGroups()

    expect(group && "description" in group).toBe(false)
    expect(group && "color" in group).toBe(false)
    expect(group?.entries[0] && "comment" in group.entries[0]).toBe(false)
  })

  it("setActive wraps the ids under the write command id", async () => {
    const ch = fakeChannel(undefined)
    await createSwitchHostData(ch.client).setActive(["g1", "g2"])

    expect(ch.calls[0]?.command).toBe("plugin.switch-host:setActive")
    expect(ch.calls[0]?.arg).toEqual({ activeGroupIds: ["g1", "g2"] })
  })

  it("onProfilesChanged fires only for this plugin's topic", async () => {
    const ch = fakeChannel(undefined)
    const cb = vi.fn()
    const off = createSwitchHostData(ch.client).onProfilesChanged(cb)

    ch.emit({ topic: "storage.changed", revision: 1 })
    expect(cb).not.toHaveBeenCalled()

    ch.emit({ topic: SWITCH_HOST_PROFILES_CHANGED, revision: 2 })
    expect(cb).toHaveBeenCalledTimes(1)

    off()
    ch.emit({ topic: SWITCH_HOST_PROFILES_CHANGED, revision: 3 })
    expect(cb).toHaveBeenCalledTimes(1)
  })
})

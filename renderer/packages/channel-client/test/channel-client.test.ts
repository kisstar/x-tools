/**
 * Contract test (§15) — the channel-client codec, exercised against a fake
 * byte transport. Self-contained: no core, no socket, so it stays inside the
 * browser layer. The real ipc/ws codec agreement is covered server-side by
 * ws-transport.test.ts (a live socket); here we pin the client half alone:
 * req framing, id correlation (incl. out-of-order), error reconstruction,
 * event fan-out.
 */

import { describe, expect, it } from "vitest"

import type { ChannelError, ServerFrame } from "@x-tools/protocol"

import { createChannelClient } from "../src/create-channel-client"
import type { ChannelTransport } from "../src/channel-transport"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

interface FakeTransport extends ChannelTransport {
  readonly sent: unknown[]
  readonly push: (frame: ServerFrame) => void
}

function createFakeTransport(): FakeTransport {
  const sent: unknown[] = []
  let handler: ((bytes: Uint8Array) => void) | undefined
  return {
    sent,
    post: (bytes) => sent.push(JSON.parse(decoder.decode(bytes))),
    on: (fn) => {
      handler = fn
      return () => {
        handler = undefined
      }
    },
    push: (frame) => handler?.(encoder.encode(JSON.stringify(frame))),
  }
}

describe("channel client codec", () => {
  it("encodes requests with incrementing ids and omits absent arg", () => {
    const transport = createFakeTransport()
    const client = createChannelClient(transport)

    void client.call("storage:get", { key: "k" })
    void client.call("fs.list") // no arg

    expect(transport.sent).toEqual([
      { t: "req", id: 1, command: "storage:get", arg: { key: "k" } },
      { t: "req", id: 2, command: "fs.list" },
    ])
  })

  it("resolves a call when its ok response arrives", async () => {
    const transport = createFakeTransport()
    const client = createChannelClient(transport)

    const pending = client.call<string>("storage:get")
    transport.push({ t: "res", id: 1, ok: true, result: "value" })

    await expect(pending).resolves.toBe("value")
  })

  it("rejects with a ChannelException carrying the error code", async () => {
    const transport = createFakeTransport()
    const client = createChannelClient(transport)
    const error: ChannelError = { code: "INVALID_ARGS", message: "bad", command: "storage:set" }

    const pending = client.call("storage:set")
    transport.push({ t: "res", id: 1, ok: false, error })

    await expect(pending).rejects.toMatchObject({ code: "INVALID_ARGS", command: "storage:set" })
  })

  it("fans events out to every subscriber", () => {
    const transport = createFakeTransport()
    const client = createChannelClient(transport)
    const seen: string[] = []
    client.subscribe((event) => seen.push(event.topic))
    client.subscribe((event) => seen.push(`${event.topic}:again`))

    transport.push({ t: "evt", event: { topic: "fs.changed", revision: 3 } })

    expect(seen).toEqual(["fs.changed", "fs.changed:again"])
  })

  it("correlates out-of-order responses by id", async () => {
    const transport = createFakeTransport()
    const client = createChannelClient(transport)

    const first = client.call<string>("a")
    const second = client.call<string>("b")
    transport.push({ t: "res", id: 2, ok: true, result: "second" })
    transport.push({ t: "res", id: 1, ok: true, result: "first" })

    await expect(Promise.all([first, second])).resolves.toEqual(["first", "second"])
  })

  it("rejects in-flight calls on dispose", async () => {
    const transport = createFakeTransport()
    const client = createChannelClient(transport)

    const pending = client.call("slow")
    client.dispose()

    await expect(pending).rejects.toMatchObject({ code: "INTERNAL" })
  })
})

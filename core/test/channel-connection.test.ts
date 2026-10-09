/**
 * Connection contract tests (§15) — prove the channel layer above a byte
 * transport: a client speaking raw frames over an in-memory pipe gets exactly
 * the response and event frames the contract promises. The test client stands
 * in for channel-client (Step 4) with hand-rolled JSON, so this exercises the
 * server codec + attachConnection without any ipc/ws dependency. Same server
 * backs both transports, so proving it here proves it for both (invariant 5).
 */

import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { Disposable, IMessagePassingProtocol, ServerFrame } from "@x-tools/protocol"
import { commandId, STORAGE_CHANGED, STORAGE_GET, STORAGE_SET } from "@x-tools/protocol"
import { beforeEach, describe, expect, it } from "vitest"

import type { InvalidationEvent, SessionInfo } from "../src/create-channel-server"
import { attachConnection, createChannelServer } from "../src/create-channel-server"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** Two linked protocol ends; each `send` delivers to the other's handlers. */
function createPipe(): { client: IMessagePassingProtocol; server: IMessagePassingProtocol } {
  const clientHandlers = new Set<(b: Uint8Array) => void>()
  const serverHandlers = new Set<(b: Uint8Array) => void>()
  const deliver = (handlers: Set<(b: Uint8Array) => void>, buffer: Uint8Array): void => {
    queueMicrotask(() => {
      for (const handler of handlers) handler(buffer)
    })
  }
  const end = (own: Set<(b: Uint8Array) => void>, peer: Set<(b: Uint8Array) => void>) => ({
    send: (buffer: Uint8Array) => deliver(peer, buffer),
    onMessage: (handler: (b: Uint8Array) => void): Disposable => {
      own.add(handler)
      return { dispose: () => own.delete(handler) }
    },
  })
  return { client: end(clientHandlers, serverHandlers), server: end(serverHandlers, clientHandlers) }
}

interface ResponseShape {
  readonly ok: boolean
  readonly result?: unknown
  readonly code?: string
}

/** A raw-JSON client: correlates responses by id, collects pushed events. */
function makeTestClient(protocol: IMessagePassingProtocol) {
  const pending = new Map<number, (res: ResponseShape) => void>()
  const events: InvalidationEvent[] = []
  let nextId = 1
  protocol.onMessage((buffer) => {
    const frame = JSON.parse(decoder.decode(buffer)) as ServerFrame
    if (frame.t === "evt") {
      events.push(frame.event)
      return
    }
    const resolve = pending.get(frame.id)
    if (!resolve) return
    pending.delete(frame.id)
    resolve(frame.ok ? { ok: true, result: frame.result } : { ok: false, code: frame.error.code })
  })
  function call(command: string, arg?: unknown): Promise<ResponseShape> {
    const id = nextId++
    return new Promise((resolve) => {
      pending.set(id, resolve)
      protocol.send(encoder.encode(JSON.stringify({ t: "req", id, command, arg })))
    })
  }
  return { call, events }
}

describe("attachConnection", () => {
  let baseDir: string

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "xtools-conn-test-"))
  })

  function connect() {
    const server = createChannelServer({ storageBaseDir: baseDir })
    const pipe = createPipe()
    const session: SessionInfo = { client: "browser", sessionId: "sx" }
    attachConnection({ server, protocol: pipe.server, session, transport: "in-process" })
    return makeTestClient(pipe.client)
  }

  it("answers a valid request with an ok result frame", async () => {
    const client = connect()
    await client.call(commandId(STORAGE_SET), { key: "theme", value: "dark" })
    const res = await client.call(commandId(STORAGE_GET), { key: "theme" })
    expect(res).toEqual({ ok: true, result: "dark" })
  })

  it("answers an unknown command with CHANNEL_NOT_ALLOWED", async () => {
    const client = connect()
    const res = await client.call("nope:doesNotExist")
    expect(res).toEqual({ ok: false, code: "CHANNEL_NOT_ALLOWED" })
  })

  it("answers invalid args with INVALID_ARGS", async () => {
    const client = connect()
    const res = await client.call(commandId(STORAGE_GET), { key: "" })
    expect(res).toEqual({ ok: false, code: "INVALID_ARGS" })
  })

  it("pushes a storage.changed event frame after a successful write", async () => {
    const client = connect()
    await client.call(commandId(STORAGE_SET), { key: "theme", value: "dark" })
    expect(client.events).toHaveLength(1)
    expect(client.events[0]?.topic).toBe(STORAGE_CHANGED)
    expect(client.events[0]?.revision).toBeGreaterThanOrEqual(1)
  })

  it("drops a malformed frame instead of answering", async () => {
    const server = createChannelServer({ storageBaseDir: baseDir })
    const pipe = createPipe()
    attachConnection({
      server,
      protocol: pipe.server,
      session: { client: "browser", sessionId: "sy" },
      transport: "in-process",
    })
    let replied = false
    pipe.client.onMessage(() => {
      replied = true
    })
    pipe.client.send(encoder.encode("not json at all"))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(replied).toBe(false)
  })
})

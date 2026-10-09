/**
 * WS 传输契约测试（§6.3、§15）—— 用真实 ws 客户端，证明两件 ipc 内存管道测不到
 * 的事：① 鉴权发生在升级握手之前（无 token / 错 Origin 连不上）；② 真实 socket
 * 的字节经 attachConnection 打到 handler 再原路返回。channel 层本身的往返由 core
 * 的连接测试锁定，这里只钉 ws 这条线。
 */

import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { WebSocket } from "ws"
import { createChannelServer, type ChannelServer } from "@x-tools/core"
import { commandId, STORAGE_GET, STORAGE_SET, type ServerFrame } from "@x-tools/protocol"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createWsHost, type WsHostHandle } from "../src/transports/ws-transport"

const ORIGIN = "http://localhost:5173"
const encoder = new TextEncoder()
const decoder = new TextDecoder()

let server: ChannelServer
let host: WsHostHandle

beforeEach(async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "xtools-ws-test-"))
  const tokenFile = join(baseDir, "session")
  server = createChannelServer({ storageBaseDir: baseDir })
  host = await createWsHost({ server, allowedOrigins: [ORIGIN], tokenFile })
})

afterEach(() => {
  host.dispose()
})

/** Open a ws connection with the given token/origin; resolve on open, reject on handshake failure. */
function connect(token: string | undefined, origin: string | undefined): Promise<WebSocket> {
  const query = token === undefined ? "" : `?token=${token}`
  const ws = new WebSocket(`ws://127.0.0.1:${host.port}/${query}`, {
    ...(origin !== undefined ? { headers: { origin } } : {}),
  })
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve(ws))
    ws.once("error", reject)
  })
}

/** One request/response round-trip over an open ws, correlated by frame id. */
function call(ws: WebSocket, id: number, command: string, arg: unknown): Promise<ServerFrame> {
  return new Promise((resolve) => {
    const onMessage = (data: Buffer) => {
      const frame = JSON.parse(decoder.decode(data)) as ServerFrame
      if (frame.t === "evt" || frame.id !== id) return
      ws.off("message", onMessage)
      resolve(frame)
    }
    ws.on("message", onMessage)
    ws.send(encoder.encode(JSON.stringify({ t: "req", id, command, arg })))
  })
}

describe("createWsHost auth-before-upgrade", () => {
  it("rejects a connection with no token", async () => {
    await expect(connect(undefined, ORIGIN)).rejects.toThrow()
  })

  it("rejects a connection with a wrong token", async () => {
    await expect(connect("deadbeef", ORIGIN)).rejects.toThrow()
  })

  it("rejects a connection from a non-whitelisted origin", async () => {
    await expect(connect(host.token, "https://evil.example")).rejects.toThrow()
  })

  it("rejects a connection with no origin header", async () => {
    await expect(connect(host.token, undefined)).rejects.toThrow()
  })
})

describe("createWsHost round-trip", () => {
  it("carries a storage set→get round-trip over a real socket", async () => {
    const ws = await connect(host.token, ORIGIN)

    const setFrame = await call(ws, 1, commandId(STORAGE_SET), { key: "greeting", value: "你好" })
    expect(setFrame.t === "res" && setFrame.ok).toBe(true)

    const getFrame = await call(ws, 2, commandId(STORAGE_GET), { key: "greeting" })
    expect(getFrame.t === "res" && getFrame.ok && getFrame.result).toBe("你好")

    ws.close()
  })
})

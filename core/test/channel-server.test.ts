/**
 * In-process contract tests (§15). These lock core's observable behaviour at
 * the channel boundary — the three gates, zod validation, and emit-after-resolve
 * — independent of any transport. The same server backs ipc and ws, so proving
 * it here proves it for both (invariant 5).
 */

import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { CallContext } from "@x-tools/protocol"
import {
  ChannelException,
  commandId,
  FS_CHANGED,
  FS_READ_FILE,
  FS_WRITE_FILE,
  NOTIFICATION_SHOW,
  STORAGE_GET,
  STORAGE_SET,
} from "@x-tools/protocol"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { InvalidationEvent, SessionInfo } from "../src/create-channel-server"
import { createChannelServer } from "../src/create-channel-server"

const kernelCtx: CallContext = {
  origin: "kernel",
  transport: "in-process",
  client: "electron-renderer",
  sessionId: "s1",
}

async function makeBaseDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "xtools-core-test-"))
}

describe("ChannelServer gates", () => {
  let baseDir: string

  beforeEach(async () => {
    baseDir = await makeBaseDir()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("rejects an unknown command with CHANNEL_NOT_ALLOWED", async () => {
    const server = createChannelServer({ storageBaseDir: baseDir })
    await expect(server.call(kernelCtx, "nope:doesNotExist")).rejects.toMatchObject({
      code: "CHANNEL_NOT_ALLOWED",
    })
  })

  it("rejects invalid args with INVALID_ARGS", async () => {
    const server = createChannelServer({ storageBaseDir: baseDir })
    // path has min(1) — empty string fails zod.
    await expect(
      server.call(kernelCtx, commandId(FS_READ_FILE), { path: "" }),
    ).rejects.toMatchObject({ code: "INVALID_ARGS" })
  })

  it("rejects a plugin that did not declare the capability with FORBIDDEN", async () => {
    const server = createChannelServer({ storageBaseDir: baseDir })
    const pluginCtx: CallContext = {
      origin: "plugin",
      pluginId: "p1",
      transport: "ws",
      client: "browser",
      sessionId: "s2",
    }
    await expect(
      server.call(pluginCtx, commandId(STORAGE_GET), { key: "theme" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  it("reports notification.show as CAPABILITY_UNAVAILABLE when no notify sink is injected", async () => {
    const server = createChannelServer({ storageBaseDir: baseDir })
    await expect(
      server.call(kernelCtx, commandId(NOTIFICATION_SHOW), { title: "hi" }),
    ).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" })
  })
})

describe("ChannelServer handlers + events", () => {
  let baseDir: string

  beforeEach(async () => {
    baseDir = await makeBaseDir()
  })

  it("writes a file and broadcasts fs.changed after the handler resolves", async () => {
    const server = createChannelServer({ storageBaseDir: baseDir })
    const session: SessionInfo = { client: "browser", sessionId: "s9" }
    const events: InvalidationEvent[] = []
    server.registerSession(session, (event) => events.push(event))

    const target = join(baseDir, "note.txt")
    await server.call(kernelCtx, commandId(FS_WRITE_FILE), {
      path: target,
      data: "hello",
      encoding: "utf8",
    })

    expect(await readFile(target, "utf8")).toBe("hello")
    expect(events).toHaveLength(1)
    expect(events[0]?.topic).toBe(FS_CHANGED)
    expect(events[0]?.revision).toBe(1)
  })

  it("round-trips storage set then get", async () => {
    const server = createChannelServer({ storageBaseDir: baseDir })
    await server.call(kernelCtx, commandId(STORAGE_SET), { key: "theme", value: "dark" })
    const value = await server.call(kernelCtx, commandId(STORAGE_GET), { key: "theme" })
    expect(value).toBe("dark")
  })

  it("increments the invalidation revision monotonically across writes", async () => {
    const server = createChannelServer({ storageBaseDir: baseDir })
    const events: InvalidationEvent[] = []
    server.registerSession({ client: "electron-renderer", sessionId: "s10" }, (e) => events.push(e))

    await server.call(kernelCtx, commandId(STORAGE_SET), { key: "a", value: 1 })
    await server.call(kernelCtx, commandId(STORAGE_SET), { key: "b", value: 2 })

    expect(events.map((e) => e.revision)).toEqual([1, 2])
  })

  it("runs the injected notify sink and reports success", async () => {
    const notify = vi.fn()
    const server = createChannelServer({ storageBaseDir: baseDir, notify })
    await server.call(kernelCtx, commandId(NOTIFICATION_SHOW), { title: "hi", body: "there" })
    expect(notify).toHaveBeenCalledWith({ title: "hi", body: "there" })
  })

  it("maps a handler that throws raw to INTERNAL without leaking detail", async () => {
    const server = createChannelServer({ storageBaseDir: baseDir })
    // Reading a path that does not exist makes fsp.readFile reject raw.
    const missing = join(baseDir, "nope", "missing.txt")
    const error = await server
      .call(kernelCtx, commandId(FS_READ_FILE), { path: missing, encoding: "utf8" })
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ChannelException)
    expect((error as ChannelException).code).toBe("INTERNAL")
    expect((error as ChannelException).message).toBe("internal error")
  })
})

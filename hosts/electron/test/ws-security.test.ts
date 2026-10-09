/**
 * WS 安全基线契约测试（§6.3）—— 锁住 token 铸造 / 落盘权限 / 常量时间比对 /
 * Origin 白名单这几条安全判定。纯函数，无 electron、无网络。
 */

import { mkdtemp, readFile, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  isOriginAllowed,
  isSessionTokenValid,
  mintSessionToken,
  persistSessionToken,
} from "../src/transports/ws-security"

describe("mintSessionToken", () => {
  it("mints a 64-char hex token", () => {
    expect(mintSessionToken()).toMatch(/^[0-9a-f]{64}$/)
  })

  it("mints a distinct token each call", () => {
    expect(mintSessionToken()).not.toBe(mintSessionToken())
  })
})

describe("isSessionTokenValid", () => {
  const expected = mintSessionToken()

  it("accepts the exact token", () => {
    expect(isSessionTokenValid(expected, expected)).toBe(true)
  })

  it("rejects a wrong token of equal length", () => {
    expect(isSessionTokenValid(mintSessionToken(), expected)).toBe(false)
  })

  it("rejects a token of different length", () => {
    expect(isSessionTokenValid("short", expected)).toBe(false)
  })

  it("rejects a missing token", () => {
    expect(isSessionTokenValid(undefined, expected)).toBe(false)
  })
})

describe("isOriginAllowed", () => {
  const allowed = ["http://localhost:5173"]

  it("accepts an exact whitelist hit", () => {
    expect(isOriginAllowed("http://localhost:5173", allowed)).toBe(true)
  })

  it("rejects a non-whitelisted origin", () => {
    expect(isOriginAllowed("https://evil.example", allowed)).toBe(false)
  })

  it("rejects a prefix-only match (no wildcard)", () => {
    expect(isOriginAllowed("http://localhost:5173.evil.example", allowed)).toBe(false)
  })

  it("rejects a missing origin", () => {
    expect(isOriginAllowed(undefined, allowed)).toBe(false)
  })
})

describe("persistSessionToken", () => {
  let dir: string

  afterEach(() => {
    dir = ""
  })

  it("writes the token with 0600 perms under a 0700 dir", async () => {
    dir = await mkdtemp(join(tmpdir(), "xtools-ws-sec-"))
    const file = join(dir, "nested", "session")
    const token = mintSessionToken()

    persistSessionToken(token, file)

    expect(await readFile(file, "utf8")).toBe(token)
    expect((await stat(file)).mode & 0o777).toBe(0o600)
    expect((await stat(join(dir, "nested"))).mode & 0o777).toBe(0o700)
  })
})

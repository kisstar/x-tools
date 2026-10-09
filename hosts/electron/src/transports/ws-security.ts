/**
 * WS 安全基线（§6.3）的纯函数实现 —— 一次性 token 的铸造 / 落盘 / 比对，加
 * Origin 校验。单拎出来：这些是安全敏感、值得被契约测试锁定的判定逻辑，与 ws
 * 接线（ws-transport）解耦。鉴权在升级握手之前完成，这些函数就是那一步的判据。
 */

import { chmodSync, mkdirSync, writeFileSync } from "node:fs"
import { randomBytes, timingSafeEqual } from "node:crypto"
import { homedir } from "node:os"
import path from "node:path"

/** 一次性 token 的落盘位置：仅本机当前用户可读（§6.3）。 */
export const SESSION_TOKEN_FILE = path.join(homedir(), ".xtools", "session")

/** 铸造一次性 token：32 字节随机 → hex（64 字符）。 */
export function mintSessionToken(): string {
  return randomBytes(32).toString("hex")
}

/**
 * 持久化 token，目录 `0700`、文件 `0600`。token 只经这个仅本用户可读的文件流转，
 * 既是「本机进程才能取到 token」的机制，也让 token 不出现在命令行 / 网络上。
 * 文件若已存在，`writeFile` 的 mode 会被忽略，故显式 `chmod` 兜底。
 */
export function persistSessionToken(token: string, file: string = SESSION_TOKEN_FILE): void {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  writeFileSync(file, token, { mode: 0o600 })
  chmodSync(file, 0o600)
}

/**
 * 常量时间比对，避免计时侧信道。长度不等直接 false —— `timingSafeEqual` 要求两
 * 侧等长，提前返回泄露的只是「长度不符」，token 长度本就是公开的。
 */
export function isSessionTokenValid(provided: string | undefined, expected: string): boolean {
  if (provided === undefined) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Origin 必须精确命中白名单（§6.3），不做前缀 / 通配匹配，不设 CORS 通配。 */
export function isOriginAllowed(origin: string | undefined, allowed: readonly string[]): boolean {
  if (origin === undefined) return false
  return allowed.includes(origin)
}

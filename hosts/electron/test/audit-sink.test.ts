/**
 * Audit sink contract test (§6.4). Locks the one bit of logic the sink owns:
 * each gate-passing entry becomes exactly one JSONL line with the fixed fields
 * and no arg content. Uses close() to flush deterministically — the sink is
 * fire-and-forget in production, close is the test/shutdown flush seam.
 */

import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { AuditEntry } from "@x-tools/bootstrap"
import { describe, expect, it } from "vitest"

import { createAuditSink } from "../src/audit-sink"

function entry(over: Partial<AuditEntry>): AuditEntry {
  return {
    ts: 1_760_000_000_000,
    sessionId: "ipc-1",
    client: "electron-renderer",
    command: "storage:get",
    capability: "storage.read",
    resultCode: "OK",
    durationMs: 2,
    ...over,
  }
}

describe("createAuditSink (§6.4)", () => {
  it("writes one JSONL line per entry with the fixed fields and no args", async () => {
    const dir = await mkdtemp(join(tmpdir(), "xtools-audit-test-"))
    const logPath = join(dir, "audit.log")
    const sink = createAuditSink(logPath)

    sink.record(entry({ resultCode: "OK" }))
    sink.record(entry({ pluginId: "evil", resultCode: "FORBIDDEN", command: "shell:exec" }))
    await sink.close()

    const lines = (await readFile(logPath, "utf8")).trim().split("\n")
    expect(lines).toHaveLength(2)

    const first = JSON.parse(lines[0] as string) as Record<string, unknown>
    expect(first).toMatchObject({ command: "storage:get", resultCode: "OK", capability: "storage.read" })
    expect(first).not.toHaveProperty("args")
    expect(first).not.toHaveProperty("arg")

    const second = JSON.parse(lines[1] as string) as AuditEntry
    expect(second.pluginId).toBe("evil")
    expect(second.resultCode).toBe("FORBIDDEN")
  })
})

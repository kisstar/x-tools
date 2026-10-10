/**
 * Audit sink (§6.4) — the host-provided destination for the channel server's
 * per-call audit entries. Core computes the fixed-field entry
 * (`{ ts, sessionId, client, pluginId, command, capability, resultCode,
 * durationMs }`) and hands it here via `onAudit`; where it lands is a host
 * concern (invariant 3: core has no file path beyond the injected base dir).
 *
 * One append-mode WriteStream per log file: `record` queues one JSONL line and
 * returns immediately, so an audit write never blocks or breaks the RPC call it
 * describes. The entry carries no arg content by construction (§6.4) — the
 * AuditEntry type has no args field, so sensitive input cannot leak here.
 */

import { createWriteStream, type WriteStream } from "node:fs"

import type { AuditEntry } from "@x-tools/bootstrap"

export interface AuditSink {
  /** Append one audit entry as a JSONL line; fire-and-forget, never throws. */
  readonly record: (entry: AuditEntry) => void
  /** Flush and close the stream (host shutdown / tests). */
  readonly close: () => Promise<void>
}

export function createAuditSink(logPath: string): AuditSink {
  const stream: WriteStream = createWriteStream(logPath, { flags: "a" })
  stream.on("error", (error) => {
    // Audit write failure must never break an RPC call, but is not swallowed:
    // surface it. ponytail: console in main until a real logger lands.
    console.error("[audit] write failed:", error)
  })
  return {
    record(entry) {
      stream.write(`${JSON.stringify(entry)}\n`)
    },
    close() {
      return new Promise((resolve) => stream.end(() => resolve()))
    },
  }
}

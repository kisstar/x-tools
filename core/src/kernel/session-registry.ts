/**
 * SessionRegistry (§8.2) — the kernel's directory of connected sessions and
 * where to push invalidation events. Each transport (ipc / ws) registers a
 * session when a client connects and disposes it on disconnect; the EventBus
 * broadcasts through here. `SessionInfo` is the per-session identity the
 * capability layer evaluates against (§7.3).
 */

import type { Disposable } from "@x-tools/protocol"

import type { InvalidationEvent } from "./event-bus"

export interface SessionInfo {
  readonly client: "electron-renderer" | "browser"
  readonly sessionId: string
}

/** Push one invalidation event to a single session (ipc: webContents.send, ws: socket.send). */
export type EventSink = (event: InvalidationEvent) => void

export class SessionRegistry {
  readonly #sinks = new Map<string, EventSink>()

  register(session: SessionInfo, sink: EventSink): Disposable {
    this.#sinks.set(session.sessionId, sink)
    return { dispose: () => void this.#sinks.delete(session.sessionId) }
  }

  broadcast(event: InvalidationEvent): void {
    for (const sink of this.#sinks.values()) sink(event)
  }

  get size(): number {
    return this.#sinks.size
  }
}

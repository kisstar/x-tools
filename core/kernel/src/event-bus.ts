/**
 * EventBus (§8) — in-process pub/sub for cross-session invalidation. Events are
 * pure invalidation notifications: no payload, just `{ topic, revision, scope? }`.
 * The channel server's wrapper is the ONLY publisher (invariant 8) — it calls
 * `publish` after a handler's `emits` resolve, never a plugin. `revision` is a
 * monotonic global counter so a reconnecting session can tell with a single
 * compare whether it missed an invalidation and must refetch (§8.3).
 */

import type { InvalidationEvent } from "@x-tools/protocol"
import type { SessionRegistry } from "./session-registry"

// Wire shape lives in protocol (both server and client reconstruct it); the bus
// is the sole producer. Re-exported so existing `./event-bus` importers hold.
export type { InvalidationEvent }

export interface PublishInput {
  readonly topic: string
  readonly scope?: string
}

export class EventBus {
  #revision = 0
  readonly #registry: SessionRegistry

  constructor(registry: SessionRegistry) {
    this.#registry = registry
  }

  publish(input: PublishInput): InvalidationEvent {
    this.#revision += 1
    const event: InvalidationEvent = {
      topic: input.topic,
      revision: this.#revision,
      ...(input.scope !== undefined ? { scope: input.scope } : {}),
    }
    this.#registry.broadcast(event)
    return event
  }

  get revision(): number {
    return this.#revision
  }
}

/**
 * Channel client (§5.2) — the renderer's one typed facade over channel RPC and
 * the client half of the frame codec (channel-frames). It encodes a
 * RequestFrame to bytes, correlates each ResponseFrame back to its caller by
 * `id`, reconstructs a ChannelException from an error frame, and fans an
 * EventFrame out to subscribers. Transport-agnostic: it drives any
 * ChannelTransport, so ipc and ws are identical above this line (invariant 4).
 *
 * This is the ONLY place the renderer touches the wire. Feature code calls
 * `client.call(commandId(DEF), arg)` and never learns which transport — or
 * host — backs it (invariant 1).
 */

import { ChannelException } from "@x-tools/protocol"
import type { InvalidationEvent, RequestFrame, ServerFrame } from "@x-tools/protocol"

import type { ChannelTransport } from "./channel-transport"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export type EventHandler = (event: InvalidationEvent) => void

export interface ChannelClient {
  /** Fire one command and await its result; rejects with ChannelException. */
  readonly call: <TResult>(command: string, arg?: unknown) => Promise<TResult>
  /** Subscribe to invalidation events (§8); returns an unsubscribe. */
  readonly subscribe: (handler: EventHandler) => () => void
  /** Drop the transport, reject every in-flight call, clear subscribers. */
  readonly dispose: () => void
}

interface Pending {
  readonly resolve: (value: unknown) => void
  readonly reject: (reason: unknown) => void
}

export function createChannelClient(transport: ChannelTransport): ChannelClient {
  const pending = new Map<number, Pending>()
  const subscribers = new Set<EventHandler>()
  let nextId = 1

  const dispatch = (frame: ServerFrame): void => {
    if (frame.t === "evt") {
      for (const handler of subscribers) handler(frame.event)
      return
    }
    const waiter = pending.get(frame.id)
    if (waiter === undefined) return
    pending.delete(frame.id)
    if (frame.ok) waiter.resolve(frame.result)
    else waiter.reject(new ChannelException(frame.error))
  }

  const offMessage = transport.on((bytes) => {
    dispatch(JSON.parse(decoder.decode(bytes)) as ServerFrame)
  })

  return {
    call<TResult>(command: string, arg?: unknown) {
      const id = nextId++
      const frame: RequestFrame =
        arg === undefined ? { t: "req", id, command } : { t: "req", id, command, arg }
      return new Promise<TResult>((resolve, reject) => {
        pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
        transport.post(encoder.encode(JSON.stringify(frame)))
      })
    },

    subscribe(handler) {
      subscribers.add(handler)
      return () => void subscribers.delete(handler)
    },

    dispose() {
      offMessage()
      const disposed = new ChannelException({
        code: "INTERNAL",
        message: "channel client disposed",
        command: "*",
      })
      for (const waiter of pending.values()) waiter.reject(disposed)
      pending.clear()
      subscribers.clear()
      transport.dispose?.()
    },
  }
}

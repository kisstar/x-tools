/**
 * Wire frames (§5.3) — how channel calls and events cross a byte transport.
 * The channel layer is identical above `IMessagePassingProtocol`; these frames
 * are the one serialized shape both ipc and ws carry. Pure types, zero runtime,
 * renderer-side `import type`-safe. Each side owns its own JSON↔bytes codec
 * (server: channel-server; client: channel-client) — this file is only the
 * shared vocabulary they agree on.
 *
 * `id` correlates a response to its request; the client picks it. Events carry
 * no id — they are unsolicited server pushes.
 */

import type { ChannelError } from "./channel"
import type { InvalidationEvent } from "./events"

/** client → server: invoke one command. */
export interface RequestFrame {
  readonly t: "req"
  readonly id: number
  readonly command: string
  readonly arg?: unknown
}

export interface ResponseOkFrame {
  readonly t: "res"
  readonly id: number
  readonly ok: true
  readonly result: unknown
}

export interface ResponseErrorFrame {
  readonly t: "res"
  readonly id: number
  readonly ok: false
  readonly error: ChannelError
}

export type ResponseFrame = ResponseOkFrame | ResponseErrorFrame

/** server → client: a cross-session invalidation push. */
export interface EventFrame {
  readonly t: "evt"
  readonly event: InvalidationEvent
}

/** The only thing a client sends. */
export type ClientFrame = RequestFrame
/** Everything a server sends. */
export type ServerFrame = ResponseFrame | EventFrame

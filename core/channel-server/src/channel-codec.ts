/**
 * Frame codec (§5.3) — the server side's JSON↔UTF-8 bytes translation. The
 * client (channel-client, Step 4) owns a mirror of this; the wire shape they
 * agree on lives in `@x-tools/protocol` (channel-frames). Kept internal to
 * channel-server — the renderer never imports core runtime, only `import type`
 * the frames from protocol.
 *
 * ponytail: JSON over UTF-8 is the correct-and-boring default. Ceiling: swap to
 * a binary codec here (and in the client mirror) if frame throughput ever bites.
 */

import type { ClientFrame, ServerFrame } from "@x-tools/protocol"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** A client frame we received but can't trust enough to route. */
export class FrameDecodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FrameDecodeError"
  }
}

export function encodeServerFrame(frame: ServerFrame): Uint8Array {
  return encoder.encode(JSON.stringify(frame))
}

/**
 * Decode + shape-check a client frame. Validates only the envelope (`t`/`id`/
 * `command`) — `arg` stays `unknown` and is validated downstream by the
 * command's zod schema (gate ④), the one trust boundary (§5). Anything that
 * isn't a well-formed request throws `FrameDecodeError`; the connection drops
 * frames it can't correlate to a response id.
 */
export function decodeClientFrame(buffer: Uint8Array): ClientFrame {
  let parsed: unknown
  try {
    parsed = JSON.parse(decoder.decode(buffer))
  } catch {
    throw new FrameDecodeError("frame is not valid JSON")
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new FrameDecodeError("frame is not an object")
  }
  const frame = parsed as Record<string, unknown>
  if (frame["t"] !== "req") {
    throw new FrameDecodeError(`unknown frame type: ${String(frame["t"])}`)
  }
  if (typeof frame["id"] !== "number") {
    throw new FrameDecodeError("request frame missing numeric id")
  }
  if (typeof frame["command"] !== "string") {
    throw new FrameDecodeError("request frame missing command")
  }
  return {
    t: "req",
    id: frame["id"],
    command: frame["command"],
    arg: frame["arg"],
  }
}

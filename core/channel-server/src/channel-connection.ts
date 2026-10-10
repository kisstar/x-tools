/**
 * attachConnection (§5.3, §8.2) — binds one byte transport to the channel
 * server. This is the whole channel layer above `IMessagePassingProtocol`:
 * both ipc and ws reduce to "give me a protocol + who's connecting", and are
 * identical from here up. The only modeled divergence is per-session capability
 * eval (via `session.client`) and event addressing (via the registered sink).
 *
 * Frontends are not plugins, so `origin` is `"kernel"` — gate ② (declared
 * capability) is skipped; gates ①③④ still run inside `server.call`.
 */

import type {
  CallContext,
  ClientFrame,
  Disposable,
  IMessagePassingProtocol,
} from "@x-tools/protocol"
import { ChannelException } from "@x-tools/protocol"

import type { SessionInfo } from "@x-tools/kernel/session-registry"

import { decodeClientFrame, encodeServerFrame, FrameDecodeError } from "./channel-codec"
import type { ChannelServer } from "./channel-server"

export interface ConnectionOptions {
  readonly server: ChannelServer
  readonly protocol: IMessagePassingProtocol
  readonly session: SessionInfo
  readonly transport: CallContext["transport"]
}

export function attachConnection(options: ConnectionOptions): Disposable {
  const { server, protocol, session, transport } = options
  const ctx: CallContext = {
    origin: "kernel",
    transport,
    client: session.client,
    sessionId: session.sessionId,
  }

  // Event sink: every cross-session invalidation this session should see,
  // pushed as an `evt` frame. Disposed on disconnect so the registry forgets it.
  const sessionDisposable = server.registerSession(session, (event) => {
    protocol.send(encodeServerFrame({ t: "evt", event }))
  })

  const messageDisposable = protocol.onMessage((buffer) => {
    let frame: ClientFrame
    try {
      frame = decodeClientFrame(buffer)
    } catch (error) {
      // A malformed frame has no recoverable id — there's nothing to answer, so
      // drop it rather than inventing a response the client can't correlate.
      if (error instanceof FrameDecodeError) return
      throw error
    }
    void respond(frame)
  })

  async function respond(frame: ClientFrame): Promise<void> {
    try {
      const result = await server.call(ctx, frame.command, frame.arg)
      protocol.send(encodeServerFrame({ t: "res", id: frame.id, ok: true, result }))
    } catch (error) {
      // `server.call` only ever throws ChannelException; coerce anything else to
      // INTERNAL so no raw detail reaches the client (§6.2).
      const channelError =
        error instanceof ChannelException
          ? error.toError()
          : { code: "INTERNAL" as const, message: "internal error", command: frame.command }
      protocol.send(encodeServerFrame({ t: "res", id: frame.id, ok: false, error: channelError }))
    }
  }

  return {
    dispose() {
      messageDisposable.dispose()
      sessionDisposable.dispose()
    },
  }
}

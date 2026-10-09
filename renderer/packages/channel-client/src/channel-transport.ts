/**
 * Client-side byte transport (§5.3) — the renderer mirror of the server's
 * `IMessagePassingProtocol`. Two implementations: ipc (the preload's
 * `window.xtools.channel`) and ws (a WebSocket to the local host). The channel
 * client drives both identically; the only divergence the contract models is
 * per-session capability, evaluated server-side (§7.3) — never here.
 */

export interface ChannelTransport {
  /** client → server: hand one encoded frame to the wire. */
  readonly post: (bytes: Uint8Array) => void
  /** server → client: subscribe to inbound frames; returns an unsubscribe. */
  readonly on: (handler: (bytes: Uint8Array) => void) => () => void
  /** tear down the underlying socket / listener, if any. */
  readonly dispose?: () => void
}

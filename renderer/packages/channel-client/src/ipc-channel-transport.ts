/**
 * ipc transport — the client-side view of the byte bridge the Electron preload
 * exposes as `window.xtools.channel` (post/on). The preload owns context
 * isolation; this just adapts it to ChannelTransport. Returns null off Electron
 * so `connectChannel` can fall back to ws.
 */

import type { ChannelTransport } from "./channel-transport"

export function createIpcChannelTransport(): ChannelTransport | null {
  const bridge = window.xtools?.channel
  if (bridge === undefined) return null
  return {
    post: (bytes) => bridge.post(bytes),
    on: (handler) => bridge.on(handler),
  }
}

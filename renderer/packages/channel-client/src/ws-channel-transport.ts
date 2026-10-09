/**
 * ws transport — a WebSocket to the local Electron host (§6.1). The host mints
 * a one-time token, binds 127.0.0.1, and checks token + Origin BEFORE the
 * upgrade (§6.3), so a missing/forged token never reaches this socket; here we
 * only carry bytes. The token rides as `?token=`, matching the host's
 * `readToken` query lookup.
 *
 * ponytail: bootstrap (url + token) comes from an injected global that
 * switch-host fills when it spawns the page. No bootstrap → the caller throws;
 * we never guess a url. Wire the real injection with switch-host (§14, later).
 */

import type { ChannelTransport } from "./channel-transport"
import type { WsBootstrap } from "./window-globals"

export function createWsChannelTransport(bootstrap: WsBootstrap): Promise<ChannelTransport> {
  const base = bootstrap.url.endsWith("/") ? bootstrap.url : `${bootstrap.url}/`
  const socket = new WebSocket(`${base}?token=${encodeURIComponent(bootstrap.token)}`)
  socket.binaryType = "arraybuffer"

  return new Promise<ChannelTransport>((resolve, reject) => {
    socket.addEventListener("error", () => reject(new Error("ws channel failed to connect")), {
      once: true,
    })
    socket.addEventListener(
      "open",
      () =>
        resolve({
          post: (bytes) => socket.send(bytes),
          on: (handler) => {
            const listener = (event: MessageEvent) =>
              handler(new Uint8Array(event.data as ArrayBuffer))
            socket.addEventListener("message", listener)
            return () => socket.removeEventListener("message", listener)
          },
          dispose: () => socket.close(),
        }),
      { once: true },
    )
  })
}

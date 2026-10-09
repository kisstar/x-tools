/**
 * connectChannel (§5.2, §6.1) — pick the transport the runtime actually has and
 * wrap it in one ChannelClient. ipc wins when the Electron preload is present;
 * otherwise we need the ws bootstrap switch-host injects. No bootstrap means no
 * host spawned this page — we throw rather than guess a url (there is no
 * backend-less web fallback, §19).
 *
 * Above this call the two transports are indistinguishable (invariant 4):
 * feature code gets a ChannelClient and never learns which one it got.
 */

import { createChannelClient } from "./create-channel-client"
import type { ChannelClient } from "./create-channel-client"
import { createIpcChannelTransport } from "./ipc-channel-transport"
import { createWsChannelTransport } from "./ws-channel-transport"

export async function connectChannel(): Promise<ChannelClient> {
  const ipc = createIpcChannelTransport()
  if (ipc !== null) return createChannelClient(ipc)

  const bootstrap = window.__XTOOLS_WS__
  if (bootstrap === undefined) {
    throw new Error("no channel host: neither window.xtools (ipc) nor window.__XTOOLS_WS__ (ws)")
  }
  return createChannelClient(await createWsChannelTransport(bootstrap))
}

/**
 * Package entry (§5.2) — the renderer's one import surface for channel RPC.
 * Feature code imports `connectChannel` + the `ChannelClient` type and nothing
 * below the channel layer; transports stay internal.
 */

export { connectChannel } from "./connect-channel"
export { createChannelClient } from "./create-channel-client"
export type { ChannelClient, EventHandler } from "./create-channel-client"
export type { ChannelTransport } from "./channel-transport"
export type { WsBootstrap } from "./window-globals"

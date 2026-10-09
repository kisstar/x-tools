/**
 * ipc transport (§6) — adapts Electron's ipcMain / webContents pair to the one
 * shape core's channel layer speaks: `IMessagePassingProtocol` (raw Uint8Array
 * frames). A single global `ipcMain.on` listener routes each inbound frame to
 * the protocol registered for its sender (`webContents.id`); outbound frames go
 * via `webContents.send`. The whole ipc↔ws divergence lives below this line —
 * above it `attachConnection` is identical for both (invariant 4).
 */

import { ipcMain, type WebContents } from "electron"

import type { Disposable, IMessagePassingProtocol } from "@x-tools/protocol"

import { IPC_CHANNEL_NAME } from "./ipc-channel-name"

type FrameHandler = (buffer: Uint8Array) => void

// Routing table: webContents.id → that connection's inbound frame handlers.
const inbound = new Map<number, Set<FrameHandler>>()
let listening = false

function ensureListener(): void {
  if (listening) return
  listening = true
  ipcMain.on(IPC_CHANNEL_NAME, (event, buffer: Uint8Array) => {
    const handlers = inbound.get(event.sender.id)
    if (!handlers) return
    for (const handler of handlers) handler(buffer)
  })
}

export interface IpcProtocol {
  readonly protocol: IMessagePassingProtocol
  readonly dispose: () => void
}

export function createIpcProtocol(webContents: WebContents): IpcProtocol {
  ensureListener()
  const id = webContents.id
  const handlers = new Set<FrameHandler>()
  inbound.set(id, handlers)

  const protocol: IMessagePassingProtocol = {
    send(buffer) {
      // The window may close between a resolve and its send; dropping the frame
      // is correct — a gone renderer has nothing to correlate it to.
      if (!webContents.isDestroyed()) webContents.send(IPC_CHANNEL_NAME, buffer)
    },
    onMessage(handler): Disposable {
      handlers.add(handler)
      return { dispose: () => void handlers.delete(handler) }
    },
  }

  return { protocol, dispose: () => void inbound.delete(id) }
}

/**
 * Preload script — runs in an isolated context with Node + Electron APIs but
 * shares the renderer's `window`. Exposes ONLY the channel-RPC byte transport
 * (`window.xtools.channel`); the renderer's channel-client (Step 4) owns the
 * frame codec, preload just carries `Uint8Array` both ways. No per-command
 * surface and no raw `ipcRenderer` — the renderer never learns it is on ipc
 * (invariant 1).
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron"

import { IPC_CHANNEL_NAME } from "./transports/ipc-channel-name"

const channel = {
  post(buffer: Uint8Array): void {
    ipcRenderer.send(IPC_CHANNEL_NAME, buffer)
  },
  on(listener: (buffer: Uint8Array) => void): () => void {
    const wrapped = (_event: IpcRendererEvent, buffer: Uint8Array) => listener(buffer)
    ipcRenderer.on(IPC_CHANNEL_NAME, wrapped)
    return () => void ipcRenderer.off(IPC_CHANNEL_NAME, wrapped)
  },
}

contextBridge.exposeInMainWorld("xtools", { channel })

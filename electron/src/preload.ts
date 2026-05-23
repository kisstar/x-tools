/**
 * Preload script — runs in an isolated context that has Node + Electron APIs
 * but shares the renderer's `window`. Use `contextBridge` to expose ONLY a
 * narrow, typed surface (`window.electronAPI`); never inject `ipcRenderer`
 * itself.
 */

import { contextBridge, ipcRenderer } from "electron"

type Listener = (...args: unknown[]) => void

const wrappedListeners = new WeakMap<Listener, (...args: unknown[]) => void>()

const electronAPI = {
  invoke(channel: string, ...args: unknown[]) {
    return ipcRenderer.invoke(channel, ...args)
  },
  on(channel: string, listener: Listener) {
    const wrapped = (_e: unknown, ...args: unknown[]) => listener(...args)
    wrappedListeners.set(listener, wrapped)
    ipcRenderer.on(channel, wrapped)
    return () => {
      const w = wrappedListeners.get(listener)
      if (w) ipcRenderer.off(channel, w)
    }
  },
  off(channel: string, listener: Listener) {
    const w = wrappedListeners.get(listener)
    if (w) ipcRenderer.off(channel, w)
  },
  platform: process.platform,
  versions: {
    electron: process.versions.electron ?? "",
    chrome: process.versions.chrome ?? "",
    node: process.versions.node ?? "",
  },
}

contextBridge.exposeInMainWorld("electronAPI", electronAPI)

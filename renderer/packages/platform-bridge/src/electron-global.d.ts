/**
 * Bridge for the host-process IPC contract that the Electron preload script
 * exposes on `window.electronAPI` via `contextBridge`.
 */
export interface ElectronAPI {
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>
  on(channel: string, listener: (...args: unknown[]) => void): () => void
  off(channel: string, listener: (...args: unknown[]) => void): void
  platform: NodeJS.Platform | string
  versions: { electron: string; chrome: string; node: string }
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}

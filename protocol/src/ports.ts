/**
 * Port interfaces — the typed surface that any host process (Electron main,
 * Tauri Rust backend, or local Web fallback) must implement so that the
 * renderer remains framework-agnostic.
 */

import type {
  DirEntry,
  MkdirOptions,
  NotificationOptions,
  RemoveOptions,
  ShellExecOptions,
  ShellExecResult,
  UpdateInfo,
  Unsubscribe,
  WatchCallback,
} from "./types"

export interface FileSystemPort {
  readFile(path: string, encoding?: "utf8"): Promise<string>
  readFileBytes(path: string): Promise<Uint8Array>
  writeFile(path: string, data: Uint8Array | string): Promise<void>
  readDir(path: string): Promise<readonly DirEntry[]>
  exists(path: string): Promise<boolean>
  mkdir(path: string, options?: MkdirOptions): Promise<void>
  remove(path: string, options?: RemoveOptions): Promise<void>
  watch(path: string, callback: WatchCallback): Promise<Unsubscribe>
}

export interface WindowPort {
  minimize(): Promise<void>
  maximize(): Promise<void>
  close(): Promise<void>
  setTitle(title: string): Promise<void>
  setSize(width: number, height: number): Promise<void>
  onClose(callback: () => void): Unsubscribe
}

export interface StoragePort {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
  clear(): Promise<void>
}

export interface UpdatePort {
  checkForUpdate(): Promise<UpdateInfo | null>
  downloadUpdate(): Promise<void>
  installUpdate(): Promise<void>
  onUpdateAvailable(callback: (info: UpdateInfo) => void): Unsubscribe
}

export interface NotificationPort {
  show(options: NotificationOptions): Promise<void>
  requestPermission(): Promise<boolean>
}

export interface ShellPort {
  exec(options: ShellExecOptions): Promise<ShellExecResult>
  env(name: string): Promise<string | null>
}

/**
 * Bridge: aggregate of every port plus runtime metadata.
 *
 * The renderer obtains a Bridge once at boot via `createBridge()` and
 * passes it down through React context so feature code never imports
 * Tauri/Electron APIs directly.
 */
export interface Bridge {
  readonly platform: import("./types").PlatformType
  readonly fs: FileSystemPort
  readonly window: WindowPort
  readonly storage: StoragePort
  readonly update: UpdatePort
  readonly notification: NotificationPort
  readonly shell: ShellPort
}

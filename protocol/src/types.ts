/** Shared data types used in port payloads. */

export interface DirEntry {
  readonly name: string
  readonly path: string
  readonly isDirectory: boolean
  readonly isFile: boolean
  readonly isSymlink: boolean
}

export interface MkdirOptions {
  readonly recursive?: boolean
}

export interface RemoveOptions {
  readonly recursive?: boolean
}

export interface FileChangeEvent {
  readonly path: string
  readonly kind: "create" | "modify" | "delete"
}

export interface UpdateInfo {
  readonly version: string
  readonly notes?: string
  readonly pubDate?: string
  readonly downloadUrl?: string
}

export interface NotificationOptions {
  readonly title: string
  readonly body?: string
  readonly icon?: string
  readonly silent?: boolean
}

export interface ShellExecOptions {
  readonly command: string
  readonly args?: readonly string[]
  readonly cwd?: string
  readonly elevated?: boolean
}

export interface ShellExecResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

export type Unsubscribe = () => void
export type WatchCallback = (event: FileChangeEvent) => void

export type PlatformType = "web" | "tauri" | "electron"

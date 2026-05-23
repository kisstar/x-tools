import {
  Channels,
  Events,
  type Bridge,
  type DirEntry,
  type FileSystemPort,
  type NotificationOptions,
  type NotificationPort,
  type ShellExecOptions,
  type ShellExecResult,
  type ShellPort,
  type StoragePort,
  type UpdateInfo,
  type UpdatePort,
  type WindowPort,
  type Unsubscribe,
  type WatchCallback,
} from "@x-tools/protocol"

/**
 * Tauri 2 adapter — converts the renderer's port calls into `invoke()` /
 * `listen()` round-trips. `@tauri-apps/api` is dynamically imported so the
 * web/electron bundles do not pull it in.
 */

type TauriApi = typeof import("@tauri-apps/api/core")
type TauriEventApi = typeof import("@tauri-apps/api/event")
type TauriWindowApi = typeof import("@tauri-apps/api/window")

let tauriCore: TauriApi | null = null
let tauriEvent: TauriEventApi | null = null
let tauriWindow: TauriWindowApi | null = null

async function loadTauri(): Promise<{ core: TauriApi; event: TauriEventApi; window: TauriWindowApi }> {
  if (!tauriCore) tauriCore = await import("@tauri-apps/api/core")
  if (!tauriEvent) tauriEvent = await import("@tauri-apps/api/event")
  if (!tauriWindow) tauriWindow = await import("@tauri-apps/api/window")
  return { core: tauriCore, event: tauriEvent, window: tauriWindow }
}

async function invoke<T>(cmd: string, payload?: Record<string, unknown>): Promise<T> {
  const { core } = await loadTauri()
  return core.invoke<T>(cmd, payload)
}

const fs: FileSystemPort = {
  readFile: (path) => invoke<string>("fs_read_file", { path, binary: false }),
  readFileBytes: async (path) => {
    const arr = await invoke<number[]>("fs_read_file", { path, binary: true })
    return new Uint8Array(arr)
  },
  writeFile: (path, data) =>
    invoke("fs_write_file", {
      path,
      data: typeof data === "string" ? data : Array.from(data),
    }),
  readDir: (path) => invoke<readonly DirEntry[]>("fs_read_dir", { path }),
  exists: (path) => invoke<boolean>("fs_exists", { path }),
  mkdir: (path, options) => invoke("fs_mkdir", { path, recursive: options?.recursive ?? false }),
  remove: (path, options) => invoke("fs_remove", { path, recursive: options?.recursive ?? false }),
  watch: async (path, callback: WatchCallback): Promise<Unsubscribe> => {
    const { event } = await loadTauri()
    const id = await invoke<string>("fs_watch", { path })
    const unlisten = await event.listen<Parameters<WatchCallback>[0]>(
      `${Events.fileChange}:${id}`,
      (e) => callback(e.payload),
    )
    return () => {
      unlisten()
      void invoke("fs_unwatch", { id })
    }
  },
}

const win: WindowPort = {
  minimize: async () => {
    const { window: w } = await loadTauri()
    await w.getCurrentWindow().minimize()
  },
  maximize: async () => {
    const { window: w } = await loadTauri()
    await w.getCurrentWindow().toggleMaximize()
  },
  close: async () => {
    const { window: w } = await loadTauri()
    await w.getCurrentWindow().close()
  },
  setTitle: async (title) => {
    const { window: w } = await loadTauri()
    await w.getCurrentWindow().setTitle(title)
  },
  setSize: async (width, height) => {
    const { window: w } = await loadTauri()
    const { LogicalSize } = await import("@tauri-apps/api/dpi")
    await w.getCurrentWindow().setSize(new LogicalSize(width, height))
  },
  onClose: (callback) => {
    let unlisten: (() => void) | undefined
    void loadTauri().then(async ({ event }) => {
      unlisten = await event.listen(Events.windowClosed, () => callback())
    })
    return () => unlisten?.()
  },
}

const storage: StoragePort = {
  get: <T>(key: string) => invoke<T | null>(Channels.storageGet, { key }),
  set: (key, value) => invoke(Channels.storageSet, { key, value: JSON.stringify(value) }),
  remove: (key) => invoke(Channels.storageRemove, { key }),
  clear: () => invoke(Channels.storageClear),
}

const update: UpdatePort = {
  checkForUpdate: () => invoke<UpdateInfo | null>(Channels.updateCheck),
  downloadUpdate: () => invoke(Channels.updateDownload),
  installUpdate: () => invoke(Channels.updateInstall),
  onUpdateAvailable: (callback) => {
    let unlisten: (() => void) | undefined
    void loadTauri().then(async ({ event }) => {
      unlisten = await event.listen<UpdateInfo>(Events.updateAvailable, (e) => callback(e.payload))
    })
    return () => unlisten?.()
  },
}

const notification: NotificationPort = {
  show: (options: NotificationOptions) => invoke(Channels.notifShow, { ...options }),
  requestPermission: () => invoke<boolean>(Channels.notifPermission),
}

const shell: ShellPort = {
  exec: (options: ShellExecOptions) => invoke<ShellExecResult>(Channels.shellExec, { ...options }),
  env: (name) => invoke<string | null>(Channels.shellEnv, { name }),
}

export function createTauriBridge(): Bridge {
  return { platform: "tauri", fs, window: win, storage, update, notification, shell }
}

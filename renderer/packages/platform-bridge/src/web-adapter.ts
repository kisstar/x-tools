import type {
  Bridge,
  DirEntry,
  FileSystemPort,
  NotificationOptions,
  NotificationPort,
  ShellExecOptions,
  ShellExecResult,
  ShellPort,
  StoragePort,
  UpdateInfo,
  UpdatePort,
  WindowPort,
  Unsubscribe,
} from "@x-tools/protocol"

/**
 * Web fallback adapter.
 *
 * Filesystem / shell are not available in the browser, so those calls reject.
 * Storage maps to localStorage; window controls map to no-ops; notifications
 * use the standard Web Notifications API.
 */

const notImpl = (api: string) =>
  Promise.reject(new Error(`${api} is unavailable in the web runtime`))

const fs: FileSystemPort = {
  readFile: () => notImpl("fs.readFile") as Promise<string>,
  readFileBytes: () => notImpl("fs.readFileBytes") as Promise<Uint8Array>,
  writeFile: () => notImpl("fs.writeFile") as Promise<void>,
  readDir: () => notImpl("fs.readDir") as Promise<readonly DirEntry[]>,
  exists: () => Promise.resolve(false),
  mkdir: () => notImpl("fs.mkdir") as Promise<void>,
  remove: () => notImpl("fs.remove") as Promise<void>,
  watch: () => notImpl("fs.watch") as Promise<Unsubscribe>,
}

const win: WindowPort = {
  minimize: () => Promise.resolve(),
  maximize: () => Promise.resolve(),
  close: () => Promise.resolve(window.close()),
  setTitle: (title) => {
    document.title = title
    return Promise.resolve()
  },
  setSize: () => Promise.resolve(),
  onClose: (callback) => {
    const handler = () => callback()
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  },
}

const STORAGE_PREFIX = "xtools:"
const storage: StoragePort = {
  get: async <T>(key: string) => {
    const raw = localStorage.getItem(STORAGE_PREFIX + key)
    if (raw == null) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  },
  set: async (key, value) => {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value))
  },
  remove: async (key) => {
    localStorage.removeItem(STORAGE_PREFIX + key)
  },
  clear: async () => {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(STORAGE_PREFIX))
      .forEach((k) => localStorage.removeItem(k))
  },
}

const update: UpdatePort = {
  checkForUpdate: async (): Promise<UpdateInfo | null> => null,
  downloadUpdate: () => Promise.resolve(),
  installUpdate: () => Promise.resolve(),
  onUpdateAvailable: () => () => undefined,
}

const notification: NotificationPort = {
  show: async (options: NotificationOptions) => {
    if (typeof Notification === "undefined") return
    if (Notification.permission !== "granted") return
    const init: NotificationOptions & { body?: string; icon?: string; silent?: boolean } = {
      title: options.title,
    }
    if (options.body !== undefined) init.body = options.body
    if (options.icon !== undefined) init.icon = options.icon
    if (options.silent !== undefined) init.silent = options.silent
    new Notification(options.title, init)
  },
  requestPermission: async () => {
    if (typeof Notification === "undefined") return false
    const result = await Notification.requestPermission()
    return result === "granted"
  },
}

const shell: ShellPort = {
  exec: () => notImpl("shell.exec") as Promise<ShellExecResult>,
  env: (name) => Promise.resolve((import.meta.env?.[`VITE_${name}`] as string | undefined) ?? null),
}

export function createWebBridge(): Bridge {
  return { platform: "web", fs, window: win, storage, update, notification, shell }
}

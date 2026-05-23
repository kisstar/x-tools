import {
  Channels,
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
  Events,
} from "@x-tools/protocol"

/** Throws if the renderer somehow loaded the Electron adapter without a preload bridge. */
function getApi(): NonNullable<typeof window.electronAPI> {
  const api = window.electronAPI
  if (!api) throw new Error("electronAPI is not available — preload bridge missing.")
  return api
}

const fs: FileSystemPort = {
  readFile: (path, encoding = "utf8") => getApi().invoke<string>(Channels.fsReadFile, { path, encoding }),
  readFileBytes: async (path) => {
    const result = await getApi().invoke<ArrayBuffer | Uint8Array>(Channels.fsReadFile, { path, encoding: "binary" })
    return result instanceof Uint8Array ? result : new Uint8Array(result)
  },
  writeFile: (path, data) => getApi().invoke(Channels.fsWriteFile, { path, data }),
  readDir: (path) => getApi().invoke<readonly DirEntry[]>(Channels.fsReadDir, { path }),
  exists: (path) => getApi().invoke<boolean>(Channels.fsExists, { path }),
  mkdir: (path, options) => getApi().invoke(Channels.fsMkdir, { path, options }),
  remove: (path, options) => getApi().invoke(Channels.fsRemove, { path, options }),
  watch: async (path, callback: WatchCallback): Promise<Unsubscribe> => {
    const id = await getApi().invoke<string>(Channels.fsWatch, { path })
    const channel = `${Events.fileChange}:${id}`
    const off = getApi().on(channel, (...args) => callback(args[0] as never))
    return () => {
      off()
      void getApi().invoke(Channels.fsUnwatch, { id })
    }
  },
}

const win: WindowPort = {
  minimize: () => getApi().invoke(Channels.winMinimize),
  maximize: () => getApi().invoke(Channels.winMaximize),
  close: () => getApi().invoke(Channels.winClose),
  setTitle: (title) => getApi().invoke(Channels.winSetTitle, { title }),
  setSize: (width, height) => getApi().invoke(Channels.winSetSize, { width, height }),
  onClose: (callback) => getApi().on(Events.windowClosed, () => callback()),
}

const storage: StoragePort = {
  get: <T>(key: string) => getApi().invoke<T | null>(Channels.storageGet, { key }),
  set: (key, value) => getApi().invoke(Channels.storageSet, { key, value }),
  remove: (key) => getApi().invoke(Channels.storageRemove, { key }),
  clear: () => getApi().invoke(Channels.storageClear),
}

const update: UpdatePort = {
  checkForUpdate: () => getApi().invoke<UpdateInfo | null>(Channels.updateCheck),
  downloadUpdate: () => getApi().invoke(Channels.updateDownload),
  installUpdate: () => getApi().invoke(Channels.updateInstall),
  onUpdateAvailable: (callback) =>
    getApi().on(Events.updateAvailable, (...args) => callback(args[0] as UpdateInfo)),
}

const notification: NotificationPort = {
  show: (options: NotificationOptions) => getApi().invoke(Channels.notifShow, options),
  requestPermission: () => getApi().invoke<boolean>(Channels.notifPermission),
}

const shell: ShellPort = {
  exec: (options: ShellExecOptions) => getApi().invoke<ShellExecResult>(Channels.shellExec, options),
  env: (name) => getApi().invoke<string | null>(Channels.shellEnv, { name }),
}

export function createElectronBridge(): Bridge {
  return { platform: "electron", fs, window: win, storage, update, notification, shell }
}

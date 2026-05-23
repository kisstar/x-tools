/**
 * Communication channel identifiers shared between renderer and host process.
 *
 * Renderer code MUST import these constants instead of hard-coding strings,
 * so the Electron / Tauri adapters stay in sync.
 */

export const Channels = {
  // FileSystemPort
  fsReadFile: "fs:read-file",
  fsWriteFile: "fs:write-file",
  fsReadDir: "fs:read-dir",
  fsExists: "fs:exists",
  fsMkdir: "fs:mkdir",
  fsRemove: "fs:remove",
  fsWatch: "fs:watch",
  fsUnwatch: "fs:unwatch",

  // WindowPort
  winMinimize: "window:minimize",
  winMaximize: "window:maximize",
  winClose: "window:close",
  winSetTitle: "window:set-title",
  winSetSize: "window:set-size",

  // StoragePort
  storageGet: "storage:get",
  storageSet: "storage:set",
  storageRemove: "storage:remove",
  storageClear: "storage:clear",

  // UpdatePort
  updateCheck: "update:check",
  updateDownload: "update:download",
  updateInstall: "update:install",

  // NotificationPort
  notifShow: "notification:show",
  notifPermission: "notification:permission",

  // ShellPort (used by switch-host module)
  shellExec: "shell:exec",
  shellEnv: "shell:env",

  // App lifecycle
  appReady: "app:ready",
  appPlatform: "app:platform",
} as const

export const Events = {
  fileChange: "event:file-change",
  updateAvailable: "event:update-available",
  windowClosed: "event:window-closed",
} as const

export type Channel = (typeof Channels)[keyof typeof Channels]
export type EventChannel = (typeof Events)[keyof typeof Events]

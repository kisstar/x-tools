import { ipcMain, BrowserWindow, Notification } from "electron"
import { Channels, Events } from "@x-tools/protocol"
import { fileSystem } from "../services/file-system"
import { storage } from "../services/storage"
import { shellService } from "../services/shell"

/**
 * Map @x-tools/protocol channels onto the corresponding native services.
 * Keep this file thin: behaviour belongs in `services/*` so it stays unit
 * testable and is easy to swap (e.g. a mock storage in CI).
 */
export function registerIpcHandlers(): void {
  // FileSystem
  ipcMain.handle(Channels.fsReadFile, (_e, { path, encoding }) => fileSystem.readFile(path, encoding))
  ipcMain.handle(Channels.fsWriteFile, (_e, { path, data }) => fileSystem.writeFile(path, data))
  ipcMain.handle(Channels.fsReadDir, (_e, { path }) => fileSystem.readDir(path))
  ipcMain.handle(Channels.fsExists, (_e, { path }) => fileSystem.exists(path))
  ipcMain.handle(Channels.fsMkdir, (_e, { path, options }) => fileSystem.mkdir(path, options))
  ipcMain.handle(Channels.fsRemove, (_e, { path, options }) => fileSystem.remove(path, options))
  ipcMain.handle(Channels.fsWatch, (event, { path }) =>
    fileSystem.watch(path, (e) => {
      const sender = event.sender
      sender.send(`${Events.fileChange}:${e.id}`, e.payload)
    }),
  )
  ipcMain.handle(Channels.fsUnwatch, (_e, { id }) => fileSystem.unwatch(id))

  // Window
  ipcMain.handle(Channels.winMinimize, (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.handle(Channels.winMaximize, (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  ipcMain.handle(Channels.winClose, (e) => BrowserWindow.fromWebContents(e.sender)?.close())
  ipcMain.handle(Channels.winSetTitle, (e, { title }) =>
    BrowserWindow.fromWebContents(e.sender)?.setTitle(title),
  )
  ipcMain.handle(Channels.winSetSize, (e, { width, height }) =>
    BrowserWindow.fromWebContents(e.sender)?.setSize(width, height),
  )

  // Storage
  ipcMain.handle(Channels.storageGet, (_e, { key }) => storage.get(key))
  ipcMain.handle(Channels.storageSet, (_e, { key, value }) => storage.set(key, value))
  ipcMain.handle(Channels.storageRemove, (_e, { key }) => storage.remove(key))
  ipcMain.handle(Channels.storageClear, () => storage.clear())

  // Update — placeholder until electron-updater is wired in. Returning null
  // tells the renderer "no update available" so the UI degrades gracefully.
  ipcMain.handle(Channels.updateCheck, () => null)
  ipcMain.handle(Channels.updateDownload, () => undefined)
  ipcMain.handle(Channels.updateInstall, () => undefined)

  // Notifications
  ipcMain.handle(Channels.notifShow, (_e, options) => {
    if (!Notification.isSupported()) return
    new Notification({
      title: options.title,
      body: options.body,
      icon: options.icon,
      silent: options.silent,
    }).show()
  })
  ipcMain.handle(Channels.notifPermission, () => Notification.isSupported())

  // Shell
  ipcMain.handle(Channels.shellExec, (_e, options) => shellService.exec(options))
  ipcMain.handle(Channels.shellEnv, (_e, { name }) => process.env[name] ?? null)
}

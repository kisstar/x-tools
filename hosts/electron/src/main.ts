/**
 * Electron main process entry.
 *
 * Responsibilities:
 *  1. Create the BrowserWindow and load the renderer (Vite dev server in
 *     development; bundled `dist/index.html` in production).
 *  2. Register IPC handlers that implement the @x-tools/protocol port
 *     contract so the renderer can talk to native services through the
 *     `window.electronAPI` preload bridge.
 */

import { app, BrowserWindow } from "electron"
import path from "node:path"
import { registerIpcHandlers } from "./ipc/register"
import { createMainWindow } from "./window/main-window"

let mainWindow: BrowserWindow | null = null

function bootstrap() {
  registerIpcHandlers()
  mainWindow = createMainWindow()
}

app.whenReady().then(bootstrap)

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createMainWindow()
  }
})

// Hard-fail any unexpected navigation so a hijacked renderer cannot
// escape the app shell (defence-in-depth alongside contextIsolation).
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-navigate", (event, url) => {
    const allow =
      url.startsWith("http://localhost:") ||
      url.startsWith("file://") ||
      url.startsWith(`file://${path.resolve()}`)
    if (!allow) event.preventDefault()
  })
  contents.setWindowOpenHandler(() => ({ action: "deny" }))
})

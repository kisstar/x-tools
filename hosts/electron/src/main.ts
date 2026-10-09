/**
 * Electron main process entry.
 *
 * Responsibilities:
 *  1. Build the one channel server (the sole backend) and load the renderer
 *     (Vite dev server in development; bundled `dist/index.html` in production).
 *  2. Attach a per-window ipc connection so the renderer talks to core over
 *     channel-RPC frames via the `window.xtools.channel` preload transport.
 */

import { app, BrowserWindow } from "electron"
import path from "node:path"
import { createChannelHost, type ChannelHost } from "./channel-host"
import { createMainWindow } from "./window/main-window"

let mainWindow: BrowserWindow | null = null
let host: ChannelHost | null = null

function openWindow(): BrowserWindow {
  const win = createMainWindow()
  host?.attachWindow(win)
  return win
}

function bootstrap() {
  host = createChannelHost(app.getPath("userData"))
  mainWindow = openWindow()
}

app.whenReady().then(bootstrap)

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = openWindow()
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

import { app, BrowserWindow, shell } from "electron"
import path from "node:path"

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173"
const isDev = !app.isPackaged

/**
 * The single root window. Per architecture: 64px header, no native toolbar,
 * sensible default size, traffic-lights kept on macOS but with hidden inset
 * style so the custom header still owns the chrome.
 */
export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#fafafa",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  })

  win.once("ready-to-show", () => win.show())

  // External links open in the user's default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: "deny" }
  })

  if (isDev) {
    void win.loadURL(DEV_SERVER_URL)
    win.webContents.openDevTools({ mode: "detach" })
  } else {
    const indexHtml = path.resolve(
      __dirname,
      "../../renderer/apps/main/dist/index.html",
    )
    void win.loadFile(indexHtml)
  }

  return win
}

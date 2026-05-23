import type { Bridge, PlatformType } from "@x-tools/protocol"
import { detectPlatform } from "./detect"

/**
 * Build a Bridge instance for the current runtime.
 *
 * Adapter modules are loaded lazily so each desktop bundle and the web
 * bundle only ship the code they actually need.
 */
export async function createBridge(platform?: PlatformType): Promise<Bridge> {
  const detected = platform ?? detectPlatform()
  switch (detected) {
    case "tauri": {
      const { createTauriBridge } = await import("./tauri-adapter")
      return createTauriBridge()
    }
    case "electron": {
      const { createElectronBridge } = await import("./electron-adapter")
      return createElectronBridge()
    }
    case "web":
    default: {
      const { createWebBridge } = await import("./web-adapter")
      return createWebBridge()
    }
  }
}

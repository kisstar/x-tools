import type { PlatformType } from "@x-tools/protocol"

/**
 * Detect which runtime the renderer is hosted by.
 *
 * Electron injects whatever the preload script exposes (we standardise on
 * `electronAPI`). Anything else is a plain web browser, which uses local
 * fallbacks (localStorage, Notifications API, …).
 */
export function detectPlatform(): PlatformType {
  if (typeof window === "undefined") return "web"
  if ((window as unknown as { electronAPI?: unknown }).electronAPI) {
    return "electron"
  }
  return "web"
}

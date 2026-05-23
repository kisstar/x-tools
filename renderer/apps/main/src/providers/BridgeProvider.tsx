import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { createBridge } from "@x-tools/platform-bridge"
import type { Bridge, PlatformType } from "@x-tools/protocol"

interface BridgeContextValue {
  readonly bridge: Bridge | null
  readonly platform: PlatformType | null
  readonly ready: boolean
}

const BridgeContext = createContext<BridgeContextValue>({
  bridge: null,
  platform: null,
  ready: false,
})

interface BridgeProviderProps {
  readonly children: ReactNode
}

/**
 * Initialises the platform bridge once at boot and exposes it to the React
 * tree. Feature code calls `useBridge()` instead of importing Tauri/Electron
 * APIs directly so the same components work across runtimes.
 */
function BridgeProvider({ children }: BridgeProviderProps) {
  const [value, setValue] = useState<BridgeContextValue>({
    bridge: null,
    platform: null,
    ready: false,
  })

  useEffect(() => {
    let cancelled = false
    void createBridge().then((bridge) => {
      if (cancelled) return
      setValue({ bridge, platform: bridge.platform, ready: true })
      // Sync window title with the localised app name on desktop runtimes.
      if (bridge.platform !== "web") {
        void bridge.window.setTitle("xTools")
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  return <BridgeContext.Provider value={value}>{children}</BridgeContext.Provider>
}

function useBridge(): Bridge {
  const { bridge } = useContext(BridgeContext)
  if (!bridge) {
    throw new Error("useBridge() called before BridgeProvider initialised")
  }
  return bridge
}

function useBridgeState(): BridgeContextValue {
  return useContext(BridgeContext)
}

export { BridgeProvider, useBridge, useBridgeState }

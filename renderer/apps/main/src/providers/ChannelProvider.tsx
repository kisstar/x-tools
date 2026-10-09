import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { connectChannel, type ChannelClient } from "@x-tools/channel-client"

interface ChannelContextValue {
  readonly client: ChannelClient | null
  readonly ready: boolean
  readonly error: Error | null
}

const ChannelContext = createContext<ChannelContextValue>({
  client: null,
  ready: false,
  error: null,
})

interface ChannelProviderProps {
  readonly children: ReactNode
}

/**
 * Connects the channel client once at boot and exposes it to the React tree.
 * Feature code calls `useChannel()` and never learns which transport (ipc or
 * ws) backs it — invariant 1 (UI only knows the channel client). With no host
 * (plain browser, no switch-host) connect throws; we hold `ready:false` with
 * the error rather than faking a backend (§19 forbids a backend-less fallback).
 */
function ChannelProvider({ children }: ChannelProviderProps) {
  const [value, setValue] = useState<ChannelContextValue>({
    client: null,
    ready: false,
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    let connected: ChannelClient | null = null
    void connectChannel().then(
      (client) => {
        if (cancelled) {
          client.dispose()
          return
        }
        connected = client
        setValue({ client, ready: true, error: null })
      },
      (reason: unknown) => {
        if (cancelled) return
        setValue({
          client: null,
          ready: false,
          error: reason instanceof Error ? reason : new Error("channel connect failed"),
        })
      },
    )
    return () => {
      cancelled = true
      connected?.dispose()
    }
  }, [])

  return <ChannelContext.Provider value={value}>{children}</ChannelContext.Provider>
}

function useChannel(): ChannelClient {
  const { client } = useContext(ChannelContext)
  if (!client) {
    throw new Error("useChannel() called before ChannelProvider connected")
  }
  return client
}

function useChannelState(): ChannelContextValue {
  return useContext(ChannelContext)
}

export { ChannelProvider, useChannel, useChannelState }

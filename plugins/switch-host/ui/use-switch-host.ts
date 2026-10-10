/**
 * useSwitchHost (plugin-ui layer, §14.1) — the editor view's state. Loads groups
 * through the injected data facade, reloads on each successful write (the
 * channel re-emits `profiles.changed` AFTER the handler commits — invariant 8,
 * so a write-then-reload is race-free), and toggles a group's active membership.
 *
 * The data facade is INJECTED, not constructed here: ui must not touch the
 * channel client directly (it routes through data/), and the renderer host owns
 * the single ChannelClient. toggleGroup writes the new selection and lets the
 * profiles.changed reload refresh state — no optimistic local mutation to drift.
 */

import { useCallback, useEffect, useState } from "react"

import type { HostGroup } from "../model/host-model"
import type { SwitchHostData } from "../data/switch-host-data"
import { activeIdsOf, toggleActive } from "./toggle-active"

export interface SwitchHostState {
  readonly groups: readonly HostGroup[]
  readonly loading: boolean
  readonly error: Error | null
  readonly toggleGroup: (id: string) => void
}

export function useSwitchHost(data: SwitchHostData): SwitchHostState {
  const [groups, setGroups] = useState<readonly HostGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    data.listGroups().then(
      (next) => {
        setGroups(next)
        setError(null)
        setLoading(false)
      },
      (reason: unknown) => {
        setError(reason instanceof Error ? reason : new Error("listGroups failed"))
        setLoading(false)
      },
    )
  }, [data])

  useEffect(() => {
    load()
    // The write path re-emits profiles.changed; reload keeps every session in sync.
    return data.onProfilesChanged(load)
  }, [data, load])

  const toggleGroup = useCallback(
    (id: string) => {
      const next = toggleActive(activeIdsOf(groups), id)
      data.setActive(next).catch((reason: unknown) => {
        setError(reason instanceof Error ? reason : new Error("setActive failed"))
      })
    },
    [data, groups],
  )

  return { groups, loading, error, toggleGroup }
}

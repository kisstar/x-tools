import type { NavigationContribution, NavigationPreference, NavigationSnapshot } from '@xtools/ui-contracts'
import { buildNavigationTree } from '@xtools/ui-contracts'

export function buildNavigationSnapshot(
  entries: readonly NavigationContribution[],
  preference: NavigationPreference,
): NavigationSnapshot {
  const hidden = new Set(preference.hidden ?? [])
  const explicit = new Map((preference.order ?? []).map((id, index) => [id, index]))
  const pinned = new Set(preference.pinned ?? [])
  const ordered = entries.filter(entry => !hidden.has(entry.id)).map(entry => ({ ...entry })).sort((a, b) => {
    const pin = Number(pinned.has(b.id)) - Number(pinned.has(a.id))
    if (pin !== 0)
      return pin
    const ai = explicit.get(a.id)
    const bi = explicit.get(b.id)
    if (ai !== undefined || bi !== undefined)
      return (ai ?? Number.MAX_SAFE_INTEGER) - (bi ?? Number.MAX_SAFE_INTEGER)
    return a.order - b.order || a.id.localeCompare(b.id)
  }).map((entry, order) => ({ ...entry, order }))
  return buildNavigationTree(ordered)
}

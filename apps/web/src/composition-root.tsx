import type { ReactElement } from 'react'
import { useSyncExternalStore } from 'react'

export interface CompositionStore {
  getSnapshot: () => ReactElement
  subscribe: (listener: () => void) => () => void
}

export function CompositionRoot({ store }: { readonly store: CompositionStore }): ReactElement {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

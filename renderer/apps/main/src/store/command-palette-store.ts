import { create } from "zustand"

interface CommandPaletteState {
  readonly isOpen: boolean
  readonly query: string
  readonly open: () => void
  readonly close: () => void
  readonly toggle: () => void
  readonly setQuery: (query: string) => void
}

const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  isOpen: false,
  query: "",
  open: () => set({ isOpen: true, query: "" }),
  close: () => set({ isOpen: false, query: "" }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen, query: "" })),
  setQuery: (query) => set({ query }),
}))

export { useCommandPaletteStore }

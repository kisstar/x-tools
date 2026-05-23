import { create } from "zustand"

interface NavState {
  readonly activeNavId: string
  readonly activeCategoryId: string
  readonly isSubNavCollapsed: boolean
  readonly setActiveNavId: (id: string) => void
  readonly setActiveCategoryId: (id: string) => void
  readonly toggleSubNav: () => void
}

const useNavStore = create<NavState>((set) => ({
  activeNavId: "home",
  activeCategoryId: "all",
  isSubNavCollapsed: false,
  setActiveNavId: (id) => set({ activeNavId: id }),
  setActiveCategoryId: (id) => set({ activeCategoryId: id }),
  toggleSubNav: () => set((state) => ({ isSubNavCollapsed: !state.isSubNavCollapsed })),
}))

export { useNavStore }

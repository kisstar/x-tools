import { create } from "zustand"
import type { ThemeMode } from "@x-tools/types"

interface ThemeState {
  readonly mode: ThemeMode
  readonly setMode: (mode: ThemeMode) => void
}

const STORAGE_KEY = "x-tools-theme"

function getInitialMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored
  }
  return "system"
}

const useThemeStore = create<ThemeState>((set) => ({
  mode: getInitialMode(),
  setMode: (mode) => {
    localStorage.setItem(STORAGE_KEY, mode)
    set({ mode })
  },
}))

export { useThemeStore }

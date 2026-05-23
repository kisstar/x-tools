import { useThemeStore } from "../store/theme-store"
import type { ThemeMode } from "@x-tools/types"

function useTheme() {
  const mode = useThemeStore((s) => s.mode)
  const setMode = useThemeStore((s) => s.setMode)

  const cycle = () => {
    const order: readonly ThemeMode[] = ["light", "dark", "system"]
    const currentIndex = order.indexOf(mode)
    const nextIndex = (currentIndex + 1) % order.length
    setMode(order[nextIndex]!)
  }

  return { mode, setMode, cycle } as const
}

export { useTheme }

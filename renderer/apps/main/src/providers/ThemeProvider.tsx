import { useEffect, type ReactNode } from "react"
import { useThemeStore } from "../store/theme-store"

interface ThemeProviderProps {
  readonly children: ReactNode
}

function ThemeProvider({ children }: ThemeProviderProps) {
  const mode = useThemeStore((s) => s.mode)

  useEffect(() => {
    const root = document.documentElement

    if (mode === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
      root.setAttribute("data-theme", prefersDark ? "dark" : "light")

      const handler = (e: MediaQueryListEvent) => {
        root.setAttribute("data-theme", e.matches ? "dark" : "light")
      }
      const mq = window.matchMedia("(prefers-color-scheme: dark)")
      mq.addEventListener("change", handler)
      return () => mq.removeEventListener("change", handler)
    }

    root.setAttribute("data-theme", mode)
  }, [mode])

  return <>{children}</>
}

export { ThemeProvider }

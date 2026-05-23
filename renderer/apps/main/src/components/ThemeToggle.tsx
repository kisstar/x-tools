import { Sun, Moon } from "@x-tools/icons"
import { useTheme } from "../hooks/use-theme"

function ThemeToggle() {
  const { mode, cycle } = useTheme()
  const resolvedDark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)

  return (
    <button
      className="flex items-center justify-center w-7 h-7 rounded-md border border-hairline hover:border-hairline-strong transition-colors cursor-pointer"
      onClick={cycle}
      title={`Theme: ${mode}`}
    >
      {resolvedDark ? (
        <Moon size={14} className="text-body" />
      ) : (
        <Sun size={14} className="text-body" />
      )}
    </button>
  )
}

export { ThemeToggle }

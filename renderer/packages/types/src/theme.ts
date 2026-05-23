type ThemeMode = "light" | "dark" | "system"

interface ThemeConfig {
  readonly mode: ThemeMode
}

export type { ThemeMode, ThemeConfig }

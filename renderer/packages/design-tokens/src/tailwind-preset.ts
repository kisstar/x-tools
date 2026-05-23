import type { Config } from "tailwindcss"

const xToolsPreset = {
  theme: {
    extend: {
      colors: {
        primary: "var(--color-primary)",
        "on-primary": "var(--color-on-primary)",
        ink: "var(--color-ink)",
        body: "var(--color-body)",
        mute: "var(--color-mute)",
        hairline: "var(--color-hairline)",
        "hairline-strong": "var(--color-hairline-strong)",
        canvas: "var(--color-canvas)",
        "canvas-soft": "var(--color-canvas-soft)",
        "canvas-soft-2": "var(--color-canvas-soft-2)",
        link: "var(--color-link)",
        "link-deep": "var(--color-link-deep)",
        success: "var(--color-success)",
        error: "var(--color-error)",
        "error-soft": "var(--color-error-soft)",
        warning: "var(--color-warning)",
        "warning-soft": "var(--color-warning-soft)",
      },
      fontFamily: {
        sans: "var(--dt-font-sans)",
        mono: "var(--dt-font-mono)",
      },
      borderRadius: {
        xs: "var(--dt-radius-xs)",
        sm: "var(--dt-radius-sm)",
        md: "var(--dt-radius-md)",
        lg: "var(--dt-radius-lg)",
        xl: "var(--dt-radius-xl)",
        "pill-sm": "var(--dt-radius-pill-sm)",
        pill: "var(--dt-radius-pill)",
      },
      spacing: {
        xxs: "var(--dt-space-xxs)",
        xs: "var(--dt-space-xs)",
        sm: "var(--dt-space-sm)",
        md: "var(--dt-space-md)",
        lg: "var(--dt-space-lg)",
        xl: "var(--dt-space-xl)",
        "2xl": "var(--dt-space-2xl)",
        "3xl": "var(--dt-space-3xl)",
        "4xl": "var(--dt-space-4xl)",
        "5xl": "var(--dt-space-5xl)",
        "6xl": "var(--dt-space-6xl)",
      },
      boxShadow: {
        "level-1": "var(--dt-shadow-level-1)",
        "level-2": "var(--dt-shadow-level-2)",
        "level-3": "var(--dt-shadow-level-3)",
        "level-4": "var(--dt-shadow-level-4)",
        "level-5": "var(--dt-shadow-level-5)",
      },
    },
  },
} satisfies Partial<Config>

export { xToolsPreset }

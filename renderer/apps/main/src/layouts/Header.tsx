import { Bell } from "@x-tools/icons"
import { useTranslation } from "react-i18next"
import { SearchTrigger } from "../components/SearchTrigger"
import { ThemeToggle } from "../components/ThemeToggle"
import { LocaleToggle } from "../components/LocaleToggle"

function Header() {
  const { t } = useTranslation()

  return (
    <header className="flex items-center justify-between h-12 px-4 bg-canvas border-b border-hairline shrink-0">
      <div className="flex items-center gap-3 h-full">
        <span className="text-base font-semibold text-ink tracking-tight">
          {t("app.name")}
        </span>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-canvas-soft-2 text-[10px] font-medium text-mute">
          {t("app.beta")}
        </span>
      </div>

      <SearchTrigger />

      <div className="flex items-center gap-2 h-full">
        <ThemeToggle />
        <LocaleToggle />
        <button className="flex items-center justify-center w-7 h-7 rounded-md border border-hairline hover:border-hairline-strong transition-colors cursor-pointer">
          <Bell size={14} className="text-body" />
        </button>
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--dt-gradient-preview-start)] to-[var(--dt-gradient-preview-end)]" />
      </div>
    </header>
  )
}

export { Header }

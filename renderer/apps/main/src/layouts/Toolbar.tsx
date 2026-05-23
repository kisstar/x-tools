import { House, ChevronRight, Grid3X3, List, ArrowUpDown } from "@x-tools/icons"
import { useTranslation } from "react-i18next"
import { useNavStore } from "../store/nav-store"

function Toolbar() {
  const { t } = useTranslation()
  const activeCategoryId = useNavStore((s) => s.activeCategoryId)

  const categoryLabels: Record<string, string> = {
    all: t("subnav.all"),
    developer: t("subnav.developer"),
    formatters: t("subnav.formatters"),
    converters: t("subnav.converters"),
    encoders: t("subnav.encoders"),
    generators: t("subnav.generators"),
    network: t("subnav.network"),
  }

  return (
    <div className="flex items-center justify-between h-11 px-5 bg-canvas-soft border-b border-hairline shrink-0">
      <div className="flex items-center gap-2">
        <House size={14} className="text-body" />
        <ChevronRight size={12} className="text-mute" />
        <span className="text-[13px] font-medium text-ink">
          {categoryLabels[activeCategoryId] ?? t("subnav.all")}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button className="flex items-center justify-center w-7 h-7 rounded-md bg-canvas border border-hairline cursor-pointer">
          <Grid3X3 size={14} className="text-ink" />
        </button>
        <button className="flex items-center justify-center w-7 h-7 rounded-md cursor-pointer hover:bg-canvas-soft-2">
          <List size={14} className="text-mute" />
        </button>
        <button className="flex items-center justify-center gap-1 h-7 px-2 rounded-md border border-hairline cursor-pointer hover:border-hairline-strong transition-colors">
          <ArrowUpDown size={12} className="text-body" />
          <span className="text-xs text-body">{t("toolbar.sort")}</span>
        </button>
      </div>
    </div>
  )
}

export { Toolbar }

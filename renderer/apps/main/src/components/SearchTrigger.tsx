import { Search } from "@x-tools/icons"
import { useTranslation } from "react-i18next"
import { useCommandPaletteStore } from "../store/command-palette-store"

function SearchTrigger() {
  const { t } = useTranslation()
  const open = useCommandPaletteStore((s) => s.open)

  return (
    <button
      className="flex items-center gap-2 w-[360px] h-8 px-3 rounded-md bg-canvas-soft border border-hairline cursor-pointer hover:border-hairline-strong transition-colors"
      onClick={open}
    >
      <Search size={14} className="text-mute" />
      <span className="text-[13px] text-mute flex-1 text-left">{t("search.placeholder")}</span>
      <kbd className="px-1.5 py-0.5 rounded bg-canvas text-[11px] text-mute font-mono">
        ⌘K
      </kbd>
    </button>
  )
}

export { SearchTrigger }

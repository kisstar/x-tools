import { Layers, Code, FileText, Repeat, Lock, Wand, Wifi, PanelLeftClose } from "@x-tools/icons"
import { useTranslation } from "react-i18next"
import { SubNavItem } from "../components/SubNavItem"
import { useNavStore } from "../store/nav-store"

function SubNav() {
  const { t } = useTranslation()
  const activeCategoryId = useNavStore((s) => s.activeCategoryId)
  const setActiveCategoryId = useNavStore((s) => s.setActiveCategoryId)
  const toggleSubNav = useNavStore((s) => s.toggleSubNav)

  const categories = [
    { id: "all", icon: Layers, label: t("subnav.all") },
    { id: "developer", icon: Code, label: t("subnav.developer") },
    { id: "formatters", icon: FileText, label: t("subnav.formatters") },
    { id: "converters", icon: Repeat, label: t("subnav.converters") },
    { id: "encoders", icon: Lock, label: t("subnav.encoders") },
    { id: "generators", icon: Wand, label: t("subnav.generators") },
    { id: "network", icon: Wifi, label: t("subnav.network") },
  ] as const

  return (
    <aside className="flex flex-col gap-4 w-[200px] h-full py-4 px-3 bg-canvas border-r border-hairline shrink-0">
      <div className="flex items-center justify-between w-full">
        <span className="text-xs font-medium text-mute tracking-wide">
          {t("subnav.title")}
        </span>
        <button
          className="text-mute hover:text-body cursor-pointer transition-colors"
          onClick={toggleSubNav}
        >
          <PanelLeftClose size={14} />
        </button>
      </div>
      <div className="flex flex-col gap-0.5 w-full">
        {categories.map((cat) => (
          <SubNavItem
            key={cat.id}
            icon={cat.icon}
            label={cat.label}
            isActive={activeCategoryId === cat.id}
            onClick={() => setActiveCategoryId(cat.id)}
          />
        ))}
      </div>
    </aside>
  )
}

export { SubNav }

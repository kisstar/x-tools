import { House, Sparkles, Folder, Code, Image, Settings, Grid3X3 } from "@x-tools/icons"
import { NavItem } from "../components/NavItem"
import { useNavStore } from "../store/nav-store"

function NavBar() {
  const activeNavId = useNavStore((s) => s.activeNavId)
  const setActiveNavId = useNavStore((s) => s.setActiveNavId)

  const topItems = [
    { id: "home", icon: House },
    { id: "ai", icon: Sparkles },
    { id: "files", icon: Folder },
    { id: "code", icon: Code },
    { id: "image", icon: Image },
  ] as const

  const bottomItems = [
    { id: "settings", icon: Settings },
  ] as const

  return (
    <nav className="flex flex-col justify-between items-center w-14 h-full py-3 px-2 bg-canvas border-r border-hairline shrink-0">
      <div className="flex flex-col items-center gap-1 w-full">
        {topItems.map((item) => (
          <NavItem
            key={item.id}
            icon={item.icon}
            isActive={activeNavId === item.id}
            onClick={() => setActiveNavId(item.id)}
          />
        ))}
      </div>
      <div className="flex flex-col items-center gap-1 w-full">
        {bottomItems.map((item) => (
          <NavItem
            key={item.id}
            icon={item.icon}
            isActive={activeNavId === item.id}
            onClick={() => setActiveNavId(item.id)}
          />
        ))}
        <NavItem icon={Grid3X3} isPrimary onClick={() => setActiveNavId("apps")} />
      </div>
    </nav>
  )
}

export { NavBar }

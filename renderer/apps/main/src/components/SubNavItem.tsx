import type { LucideIcon } from "lucide-react"

interface SubNavItemProps {
  readonly icon: LucideIcon
  readonly label: string
  readonly isActive?: boolean
  readonly onClick?: () => void
}

function SubNavItem({ icon: Icon, label, isActive = false, onClick }: SubNavItemProps) {
  return (
    <button
      className={`flex items-center gap-2 w-full h-8 px-2 rounded-md text-[13px] cursor-pointer transition-colors ${
        isActive
          ? "bg-canvas-soft-2 text-ink font-medium"
          : "text-body hover:bg-canvas-soft-2"
      }`}
      onClick={onClick}
    >
      <Icon size={14} className={isActive ? "text-ink" : "text-body"} />
      <span>{label}</span>
    </button>
  )
}

export { SubNavItem }

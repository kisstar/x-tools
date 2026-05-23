import type { LucideIcon } from "lucide-react"

interface NavItemProps {
  readonly icon: LucideIcon
  readonly isActive?: boolean
  readonly isPrimary?: boolean
  readonly onClick?: () => void
}

function NavItem({ icon: Icon, isActive = false, isPrimary = false, onClick }: NavItemProps) {
  const baseClasses = "flex items-center justify-center w-10 h-10 rounded-lg cursor-pointer transition-colors"

  if (isPrimary) {
    return (
      <button className={`${baseClasses} bg-primary`} onClick={onClick}>
        <Icon size={18} className="text-on-primary" />
      </button>
    )
  }

  return (
    <button
      className={`${baseClasses} ${isActive ? "bg-canvas-soft-2" : "hover:bg-canvas-soft-2"}`}
      onClick={onClick}
    >
      <Icon size={18} className={isActive ? "text-ink" : "text-body"} />
    </button>
  )
}

export { NavItem }

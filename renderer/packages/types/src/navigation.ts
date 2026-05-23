interface NavItem {
  readonly id: string
  readonly icon: string
  readonly label: string
  readonly route?: string
}

interface SubNavItem {
  readonly id: string
  readonly icon: string
  readonly label: string
  readonly category: string
}

interface BreadcrumbItem {
  readonly label: string
  readonly icon?: string
  readonly href?: string
}

export type { NavItem, SubNavItem, BreadcrumbItem }

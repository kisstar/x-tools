type CommandGroup = "suggestion" | "recent" | "ai"

interface CommandItem {
  readonly id: string
  readonly icon: string
  readonly label: string
  readonly category?: string
  readonly group: CommandGroup
}

export type { CommandGroup, CommandItem }

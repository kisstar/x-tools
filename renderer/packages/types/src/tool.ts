type ToolCategory =
  | "developer"
  | "formatters"
  | "converters"
  | "encoders"
  | "generators"
  | "network"

interface ToolManifest {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly icon: string
  readonly category: ToolCategory
  readonly tags?: readonly string[]
}

export type { ToolCategory, ToolManifest }

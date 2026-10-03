import type { ContainerId, RendererId } from './ids.ts'
import type { RegionId } from './renderers.ts'

export interface NavigationPreference {
  readonly hidden?: readonly string[]
  readonly pinned?: readonly string[]
  readonly order?: readonly string[]
}
export interface RegionPreference {
  readonly rendererId?: RendererId
  readonly width?: number
  readonly visible?: boolean
}
export interface ContainerPreference {
  readonly regions?: Partial<Record<RegionId, RegionPreference>>
  readonly navigation?: NavigationPreference
}
export interface PreferenceLayer { readonly containers?: Partial<Record<ContainerId, ContainerPreference>> }
export interface WorkbenchPreferences {
  readonly revision: string
  readonly global: PreferenceLayer
  readonly workspaces: Readonly<Record<string, PreferenceLayer>>
}
export interface RendererBindingLayers {
  readonly shell: RendererId
  readonly container?: RendererId
  readonly global?: RendererId
  readonly workspace?: RendererId
}

import type { ComponentType } from 'react'
import type { ContainerId, RendererId, ViewId } from './ids.ts'
import type { RegionId, RendererDescriptor } from './renderers.ts'

export type UiDiagnosticCode = 'renderer_unavailable' | 'container_unavailable' | 'duplicate_id' | 'view_unavailable' | 'invalid_contribution' | 'plugin_activation_failed'
export interface UiDiagnostic { readonly code: UiDiagnosticCode, readonly message: string, readonly sourceId?: string }
export interface RegionRenderPlan<P = unknown> {
  readonly regionId: RegionId
  readonly rendererId?: RendererId
  readonly props: P
  readonly visible?: boolean
  readonly width?: number
  readonly diagnostic?: UiDiagnostic
}
export interface RenderPlan {
  readonly activeContainerId: ContainerId
  readonly activeViewId: ViewId
  readonly regions: Readonly<Record<RegionId, RegionRenderPlan>>
  readonly overlays: readonly OverlayContribution[]
  readonly diagnostics: readonly UiDiagnostic[]
}

export interface RootContributionProps {
  readonly plan: RenderPlan
  readonly renderers: ReadonlyMap<string, RendererDescriptor>
}
export interface OverlayContribution { readonly id: string, readonly component: ComponentType }
export type RootContribution = ComponentType<RootContributionProps>

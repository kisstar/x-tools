import type { ContainerId, RendererId, ViewId } from './ids.ts'
import type { RegionId } from './renderers.ts'

export type UiDiagnosticCode = 'renderer_unavailable' | 'container_unavailable' | 'duplicate_id' | 'view_unavailable' | 'invalid_contribution'
export interface UiDiagnostic { readonly code: UiDiagnosticCode; readonly message: string; readonly sourceId?: string }
export interface RegionRenderPlan<P = unknown> { readonly regionId: RegionId; readonly rendererId?: RendererId; readonly props: P; readonly diagnostic?: UiDiagnostic }
export interface RenderPlan { readonly activeContainerId: ContainerId; readonly activeViewId: ViewId; readonly regions: Readonly<Record<RegionId, RegionRenderPlan>> }

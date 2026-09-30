import type { ContainerId, OverlayContribution, RegionId, RegionRenderPlan, RenderPlan, UiDiagnostic, ViewId } from '@xtools/ui-contracts'

export interface BuildRenderPlanInput { readonly activeContainerId: ContainerId; readonly activeViewId: ViewId; readonly regions: readonly RegionRenderPlan[]; readonly overlays?: readonly OverlayContribution[]; readonly diagnostics?: readonly UiDiagnostic[] }

export function buildRenderPlan(input: BuildRenderPlanInput): RenderPlan {
  const regions = Object.fromEntries(input.regions.map(region => [region.regionId, deepFreeze({ ...region })])) as Record<RegionId, RegionRenderPlan>
  return deepFreeze({ activeContainerId: input.activeContainerId, activeViewId: input.activeViewId, regions, overlays: [...(input.overlays ?? [])], diagnostics: [...(input.diagnostics ?? [])] })
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

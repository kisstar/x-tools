import type { ContainerId, RegionId, RegionRenderPlan, RenderPlan, ViewId } from '@xtools/ui-contracts'

export interface BuildRenderPlanInput { readonly activeContainerId: ContainerId; readonly activeViewId: ViewId; readonly regions: readonly RegionRenderPlan[] }

export function buildRenderPlan(input: BuildRenderPlanInput): RenderPlan {
  const regions = Object.fromEntries(input.regions.map(region => [region.regionId, deepFreeze({ ...region })])) as Record<RegionId, RegionRenderPlan>
  return deepFreeze({ activeContainerId: input.activeContainerId, activeViewId: input.activeViewId, regions })
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

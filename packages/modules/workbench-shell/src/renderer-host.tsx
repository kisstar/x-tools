import { createElement } from 'react'
import type { RegionRenderPlan, RendererDescriptor } from '@xtools/ui-contracts'

export function RendererHost({ renderer, plan }: { readonly renderer: RendererDescriptor; readonly plan: RegionRenderPlan }) {
  return createElement(renderer.component as (props: object) => React.ReactNode, plan.props as object)
}

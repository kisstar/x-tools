import type { RegionRenderPlan, RendererDescriptor } from '@xtools/ui-contracts'
import { createElement } from 'react'

interface RendererHostProps {
  readonly renderer: RendererDescriptor
  readonly plan: RegionRenderPlan
}

export function RendererHost({ renderer, plan }: RendererHostProps) {
  return createElement(renderer.component as (props: object) => React.ReactNode, plan.props as object)
}

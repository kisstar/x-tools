import type { ContainerId, RendererId, ViewId } from './ids.ts'
import type { ContentRendererProps, RegionId, RendererComponent } from './renderers.ts'

export interface ContainerContribution {
  readonly id: ContainerId
  readonly defaultViewId: ViewId
  readonly rendererIds?: Partial<Record<RegionId, RendererId>>
}

export interface ViewContribution {
  readonly id: ViewId
  readonly containerId: ContainerId
  readonly title: string
  readonly component: RendererComponent<ContentRendererProps>
  readonly availability?: { readonly available: boolean; readonly reason?: string }
}

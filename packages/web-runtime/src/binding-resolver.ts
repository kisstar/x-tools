import type { RegionId, RendererBindingLayers, RendererDescriptor, UiDiagnostic } from '@xtools/ui-contracts'

export interface ResolvedRendererBinding { readonly renderer?: RendererDescriptor, readonly diagnostic?: UiDiagnostic }

export function resolveRendererBinding(
  region: RegionId,
  layers: RendererBindingLayers,
  renderers: readonly RendererDescriptor[],
): ResolvedRendererBinding {
  const id = layers.workspace ?? layers.global ?? layers.container ?? layers.shell
  const renderer = renderers.find(candidate => candidate.id === id)
  if (renderer === undefined || renderer.region !== region || renderer.major !== 1) {
    return Object.freeze({ diagnostic: Object.freeze({ code: 'renderer_unavailable', message: `renderer ${id} is unavailable for ${region}`, sourceId: id }) })
  }
  return Object.freeze({ renderer })
}

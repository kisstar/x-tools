import type { RendererDescriptor, RenderPlan, RootContribution } from '@xtools/ui-contracts'

export function App({ root: Root, plan, renderers }: { readonly root: RootContribution; readonly plan: RenderPlan; readonly renderers: ReadonlyMap<string, RendererDescriptor> }) {
  return <Root plan={plan} renderers={renderers} />
}

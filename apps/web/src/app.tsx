import type { RendererDescriptor, RenderPlan, RootContribution } from '@xtools/ui-contracts'

interface AppProps {
  readonly root: RootContribution
  readonly plan: RenderPlan
  readonly renderers: ReadonlyMap<string, RendererDescriptor>
}

export function App({ root: Root, plan, renderers }: AppProps) {
  return <Root plan={plan} renderers={renderers} />
}

import { AppShell } from '@xtools/module-workbench-shell'
import type { RendererDescriptor, RenderPlan } from '@xtools/ui-contracts'

export function App({ plan, renderers }: { readonly plan: RenderPlan; readonly renderers: ReadonlyMap<string, RendererDescriptor> }) {
  return <AppShell plan={plan} renderers={renderers} />
}

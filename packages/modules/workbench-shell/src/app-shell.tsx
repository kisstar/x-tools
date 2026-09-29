import type { RendererDescriptor, RenderPlan } from '@xtools/ui-contracts'
import { RegionErrorBoundary } from './error-boundary.tsx'
import { RendererHost } from './renderer-host.tsx'
import './styles/tokens.css'
import './styles/shell.css'

const regions = ['top-navigation', 'primary-navigation', 'secondary-navigation', 'content', 'detail'] as const

export function AppShell({ plan, renderers }: { readonly plan: RenderPlan; readonly renderers: ReadonlyMap<string, RendererDescriptor> }) {
  return <main className="xt-shell">{regions.map(region => {
    const regionPlan = plan.regions[region]
    if (regionPlan === undefined) return null
    const renderer = regionPlan.rendererId === undefined ? undefined : renderers.get(regionPlan.rendererId)
    return <section key={region} className={`xt-region xt-${region}`} data-region={region}>
      <RegionErrorBoundary region={region}>
        {regionPlan.diagnostic !== undefined ? <div role="status">{regionPlan.diagnostic.message}</div>
          : renderer === undefined ? <div role="status">renderer unavailable: {regionPlan.rendererId}</div>
            : <RendererHost renderer={renderer} plan={regionPlan} />}
      </RegionErrorBoundary>
    </section>
  })}</main>
}

import type { RendererDescriptor, RenderPlan } from '@xtools/ui-contracts'
import type { CSSProperties } from 'react'
import { RegionErrorBoundary } from './error-boundary.tsx'
import { RendererHost } from './renderer-host.tsx'
import './styles/tokens.css'
import './styles/shell.css'

const regions = ['top-navigation', 'primary-navigation', 'secondary-navigation', 'content', 'detail'] as const

interface AppShellProps {
  readonly plan: RenderPlan
  readonly renderers: ReadonlyMap<string, RendererDescriptor>
}

export function AppShell({ plan, renderers }: AppShellProps) {
  const secondary = plan.regions['secondary-navigation']
  const detail = plan.regions.detail
  const style = { '--xt-secondary-nav-width': secondary?.visible === false ? '0px' : `${secondary?.width ?? 200}px`, '--xt-detail-width': detail?.visible === false ? '0px' : `${detail?.width ?? 320}px` } as CSSProperties
  return (
    <>
      <main className="xt-shell" style={style}>
        {regions.map((region) => {
          const regionPlan = plan.regions[region]
          if (regionPlan === undefined || regionPlan.visible === false)
            return null
          const renderer = regionPlan.rendererId === undefined ? undefined : renderers.get(regionPlan.rendererId)
          return (
            <section key={region} className={`xt-region xt-${region}`} data-region={region}>
              <RegionErrorBoundary region={region}>
                {regionPlan.diagnostic !== undefined
                  ? <div role="status">{regionPlan.diagnostic.message}</div>
                  : renderer === undefined
                    ? (
                        <div role="status">
                          renderer unavailable:
                          {regionPlan.rendererId}
                        </div>
                      )
                    : <RendererHost renderer={renderer} plan={regionPlan} />}
              </RegionErrorBoundary>
            </section>
          )
        })}
      </main>
      <div className="xt-overlay">{(plan.overlays ?? []).map(overlay => <overlay.component key={overlay.id} />)}</div>
      {(plan.diagnostics ?? []).length > 0 && (
        <aside aria-label="插件诊断" className="xt-plugin-diagnostics">
          {plan.diagnostics.map(diagnostic => (
            <div key={`${diagnostic.code}:${diagnostic.sourceId}`}>
              {diagnostic.sourceId}
              :
              {' '}
              {diagnostic.message}
            </div>
          ))}
        </aside>
      )}
    </>
  )
}

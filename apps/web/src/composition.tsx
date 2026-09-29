import { createElement, type ReactNode } from 'react'
import type { RouterHistory } from '@tanstack/react-router'
import { createModuleId, createRendererId, type NavigationContribution, type RegionId, type RegionRenderPlan, type RenderPlan } from '@xtools/ui-contracts'
import { buildNavigationSnapshot, buildRenderPlan, WebRuntime, type UiModule } from '@xtools/web-runtime'
import { App } from './app.tsx'
import { parseWorkbenchRoute } from './router.ts'
import type { ContainerContribution } from './test-plugins.tsx'

export interface Channel { call<TIn, TOut>(capabilityId: string, input: TIn): Promise<TOut>; subscribe<T>(eventId: string, handler: (payload: T) => void): () => void }
export interface ComposedWebApp { readonly element: ReactNode; refresh(): Promise<void>; dispose(): Promise<void> }

export async function composeWebApp({ modules, history }: { readonly channel: Channel; readonly modules: readonly UiModule[]; readonly history: Pick<RouterHistory, 'location'> }): Promise<ComposedWebApp> {
  const runtime = new WebRuntime()
  let element: ReactNode
  const rebuild = (): void => {
    const snapshot = runtime.registrySnapshot()
    const entry = (id: string) => snapshot.slots.find(slot => slot.definition.id === id)?.entries ?? []
    const route = parseWorkbenchRoute(history.location.href)
    const container = entry('workbench.containers').map(value => value.value as ContainerContribution).find(value => value.id === route.containerId)
    if (container === undefined) throw new Error(`container unavailable: ${route.containerId}`)
    const navigation = buildNavigationSnapshot(entry('workbench.navigation').map(value => value.value as NavigationContribution).filter(value => value.containerId === route.containerId), {})
    const actions = { navigate() {}, execute() {} }
    const ids: Record<RegionId, string> = {
      'top-navigation': 'workbench.default.top-navigation', 'primary-navigation': 'workbench.default.primary-navigation',
      'secondary-navigation': container.secondaryRendererId, content: 'workbench.default.content', detail: 'workbench.default.detail',
    }
    const regions = (Object.keys(ids) as RegionId[]).map(regionId => ({
      regionId,
      rendererId: createRendererId(ids[regionId]),
      props: regionId.includes('navigation')
        ? { containerId: route.containerId, navigation, collapsed: false, actions }
        : regionId === 'content'
          ? { containerId: route.containerId, viewId: route.viewId, actions }
          : { containerId: route.containerId, actions },
    }) satisfies RegionRenderPlan)
    const plan: RenderPlan = buildRenderPlan({ activeContainerId: route.containerId, activeViewId: route.viewId, regions })
    const renderers = new Map(runtime.rendererSnapshot().map(renderer => [renderer.id, renderer]))
    element = createElement(App, { plan, renderers })
  }
  try {
    await runtime.activate(modules, [createModuleId('workbench.shell')])
    runtime.freeze(); runtime.serve(); rebuild()
  } catch (error) {
    element = createElement('div', { role: 'alert' }, `workbench.shell: ${error instanceof Error ? error.message : String(error)}`)
  }
  return { get element() { return element }, async refresh() { rebuild() }, async dispose() { await runtime.stop() } }
}

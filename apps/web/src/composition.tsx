import { createElement, useSyncExternalStore, type ReactNode } from 'react'
import type { RouterHistory } from '@tanstack/react-router'
import {
  WORKBENCH_PREFERENCES_GET_ID,
  WORKBENCH_PREFERENCES_UPDATE_ID,
  type WorkbenchPreferencesGetInput,
  type WorkbenchPreferencesGetOutput,
  type WorkbenchPreferencesUpdateInput,
  type WorkbenchPreferencesUpdateOutput,
} from '@xtools/contracts'
import {
  createModuleId,
  createRendererId,
  type ContainerContribution,
  type NavigationContribution,
  type RegionActions,
  type RegionId,
  type RegionRenderPlan,
  type RenderPlan,
  type RootContribution,
  type ViewContribution,
  type OverlayContribution,
} from '@xtools/ui-contracts'
import { buildNavigationSnapshot, buildRenderPlan, resolveRendererBinding, WebRuntime, type UiModule } from '@xtools/web-runtime'
import { App } from './app.tsx'
import { createWorkbenchRouter, currentWorkbenchRoute } from './router.ts'

export interface Channel {
  call<TIn, TOut>(capabilityId: string, input: TIn): Promise<TOut>
  subscribe<T>(eventId: string, handler: (payload: T) => void): () => void
}

export interface ComposedWebApp {
  readonly element: ReactNode
  dispose(): Promise<void>
}

interface CompositionStore {
  getSnapshot(): ReactNode
  subscribe(listener: () => void): () => void
}

function CompositionRoot({ store }: { readonly store: CompositionStore }) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

const DEFAULT_RENDERERS: Readonly<Record<RegionId, ReturnType<typeof createRendererId>>> = {
  'top-navigation': createRendererId('workbench.default.top-navigation'),
  'primary-navigation': createRendererId('workbench.default.primary-navigation'),
  'secondary-navigation': createRendererId('workbench.default.secondary-navigation'),
  content: createRendererId('workbench.default.content'),
  detail: createRendererId('workbench.default.detail'),
}

export async function composeWebApp({ channel, modules, history, workspaceId = 'default' }: {
  readonly channel: Channel
  readonly modules: readonly UiModule[]
  readonly history: RouterHistory
  readonly workspaceId?: string
}): Promise<ComposedWebApp> {
  const runtime = new WebRuntime()
  const router = createWorkbenchRouter(history)
  const listeners = new Set<() => void>()
  let currentElement: ReactNode
  let unsubscribeRouter = () => {}
  const notify = (): void => { for (const listener of listeners) listener() }
  const store: CompositionStore = {
    getSnapshot: () => currentElement,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
  }

  try {
    await runtime.activate(modules, [createModuleId('workbench.shell')])
    runtime.freeze()
    runtime.serve()
    let { preferences } = await channel.call<WorkbenchPreferencesGetInput, WorkbenchPreferencesGetOutput>(WORKBENCH_PREFERENCES_GET_ID, {})
    if (isEmptyWorkbenchLocation(history.location.href)) history.replace('/home/home.overview')
    await router.load()

    const rebuild = (): void => {
      const snapshot = runtime.registrySnapshot()
      const entries = (id: string) => snapshot.slots.find(slot => slot.definition.id === id)?.entries ?? []
      const route = currentWorkbenchRoute(router)
      const container = entries('workbench.containers').map(entry => entry.value as ContainerContribution).find(value => value.id === route.containerId)
      const renderers = runtime.rendererSnapshot()
      const rendererMap = new Map(renderers.map(renderer => [renderer.id, renderer]))
      const navigation = entries('workbench.navigation').map(entry => entry.value as NavigationContribution)
      const view = entries('workbench.views').map(entry => entry.value as ViewContribution).find(value => value.id === route.viewId && value.containerId === route.containerId)
      const actions: RegionActions = {
        navigate(to) { void router.navigate({ to }) },
        execute() {},
        async updatePreferences(update) {
          const state = { global: preferences.global, workspaces: preferences.workspaces }
          const workspaceKey = update.workspaceId ?? workspaceId
          const layer = update.scope === 'global' ? state.global : (state.workspaces[workspaceKey] ?? {})
          const previousContainer = layer.containers?.[update.containerId]
          const nextLayer = {
            ...layer,
            containers: {
              ...layer.containers,
              [update.containerId]: {
                ...previousContainer,
                regions: {
                  ...previousContainer?.regions,
                  [update.regionId]: { rendererId: update.rendererId, visible: update.visible, width: update.width },
                },
              },
            },
          }
          const next = update.scope === 'global'
            ? { ...state, global: nextLayer }
            : { ...state, workspaces: { ...state.workspaces, [workspaceKey]: nextLayer } }
          const output = await channel.call<WorkbenchPreferencesUpdateInput, WorkbenchPreferencesUpdateOutput>(WORKBENCH_PREFERENCES_UPDATE_ID, { expectedRevision: preferences.revision, preferences: next })
          preferences = output.preferences
          rebuild()
          notify()
        },
      }
      const regions = (Object.keys(DEFAULT_RENDERERS) as RegionId[]).map(regionId => {
        if (container === undefined) {
          return { regionId, props: {}, diagnostic: { code: 'container_unavailable', message: `container unavailable: ${route.containerId}`, sourceId: route.containerId } } satisfies RegionRenderPlan
        }
        const resolved = resolveRendererBinding(regionId, {
          shell: DEFAULT_RENDERERS[regionId],
          container: container.rendererIds?.[regionId],
          global: optionalRendererId(preferences.global.containers?.[container.id]?.regions?.[regionId]?.rendererId),
          workspace: optionalRendererId(preferences.workspaces[workspaceId]?.containers?.[container.id]?.regions?.[regionId]?.rendererId),
        }, renderers)
        const globalContainer = preferences.global.containers?.[container.id]
        const workspaceContainer = preferences.workspaces[workspaceId]?.containers?.[container.id]
        const navigationPreference = { ...globalContainer?.navigation, ...workspaceContainer?.navigation }
        const regionPreference = { ...globalContainer?.regions?.[regionId], ...workspaceContainer?.regions?.[regionId] }
        const regionNavigation = buildNavigationSnapshot(navigation.filter(value => value.region === regionId && (regionId === 'primary-navigation' || value.containerId === route.containerId)), navigationPreference)
        const props = regionId.includes('navigation')
          ? { containerId: route.containerId, navigation: regionNavigation, collapsed: false, actions }
          : regionId === 'content'
            ? { containerId: route.containerId, viewId: route.viewId, view: view?.component, preferencesRevision: preferences.revision, actions }
            : { containerId: route.containerId, actions }
        const diagnostic = regionId === 'content' && view === undefined
          ? { code: 'view_unavailable' as const, message: `view unavailable: ${route.viewId}`, sourceId: route.viewId }
          : resolved.diagnostic
        return { regionId, rendererId: resolved.renderer?.id, props, visible: regionPreference.visible, width: regionPreference.width, diagnostic } satisfies RegionRenderPlan
      })
      const overlays = entries('workbench.overlay').map(entry => entry.value as OverlayContribution)
      const root = entries('root')[0]?.value as RootContribution | undefined
      if (root === undefined) throw new Error('root contribution unavailable')
      const plan: RenderPlan = buildRenderPlan({ activeContainerId: route.containerId, activeViewId: route.viewId, regions, overlays, diagnostics: runtime.diagnostics() })
      currentElement = createElement(App, { root, plan, renderers: rendererMap })
    }

    rebuild()
    unsubscribeRouter = router.subscribe('onResolved', () => { rebuild(); notify() })
  } catch (error) {
    currentElement = createElement('div', { role: 'alert' }, `workbench.shell: ${error instanceof Error ? error.message : String(error)}`)
  }

  return {
    element: createElement(CompositionRoot, { store }),
    async dispose() { unsubscribeRouter(); await runtime.stop() },
  }
}

function optionalRendererId(value: string | undefined): ReturnType<typeof createRendererId> | undefined {
  return value === undefined ? undefined : createRendererId(value)
}

function isEmptyWorkbenchLocation(href: string): boolean {
  const fragment = href.includes('#') ? href.slice(href.indexOf('#') + 1) : href
  return fragment === '' || fragment === '/'
}

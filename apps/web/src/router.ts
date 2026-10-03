import type { RouterHistory } from '@tanstack/react-router'
import type { ContainerId, ViewId } from '@xtools/ui-contracts'
import {
  createRootRoute,
  createRoute,
  createRouter,

} from '@tanstack/react-router'

export interface WorkbenchRoute { readonly containerId: ContainerId, readonly viewId: ViewId }

const rootRoute = createRootRoute()
const workbenchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '$containerId/$viewId',
})
const routeTree = rootRoute.addChildren([workbenchRoute])

export function createWorkbenchRouter(history: RouterHistory) {
  return createRouter({ routeTree, history, isServer: false })
}

export function currentWorkbenchRoute(router: ReturnType<typeof createWorkbenchRouter>): WorkbenchRoute {
  const match = router.state.matches.find(value => value.routeId === workbenchRoute.id)
  const params: unknown = match?.params
  if (!isWorkbenchParams(params))
    throw new Error(`invalid workbench route: ${router.state.location.href}`)
  const { containerId, viewId } = params
  return { containerId: containerId as ContainerId, viewId: viewId as ViewId }
}

function isWorkbenchParams(value: unknown): value is { containerId: string, viewId: string } {
  if (typeof value !== 'object' || value === null)
    return false
  return 'containerId' in value
    && typeof value.containerId === 'string'
    && 'viewId' in value
    && typeof value.viewId === 'string'
}

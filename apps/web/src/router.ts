import {
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from '@tanstack/react-router'
import type { ContainerId, ViewId } from '@xtools/ui-contracts'

export interface WorkbenchRoute { readonly containerId: ContainerId; readonly viewId: ViewId }

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
  const containerId = match?.params.containerId
  const viewId = match?.params.viewId
  if (typeof containerId !== 'string' || typeof viewId !== 'string') throw new Error(`invalid workbench route: ${router.state.location.href}`)
  return { containerId: containerId as ContainerId, viewId: viewId as ViewId }
}

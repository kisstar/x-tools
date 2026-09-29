import type { ContainerId, ViewId } from '@xtools/ui-contracts'

export interface WorkbenchRoute { readonly containerId: ContainerId; readonly viewId: ViewId }

export function parseWorkbenchRoute(href: string): WorkbenchRoute {
  const fragment = href.includes('#') ? href.slice(href.indexOf('#') + 1) : href
  const [containerId = '', viewId = ''] = fragment.replace(/^\//, '').split('/')
  if (containerId === '' || viewId === '') throw new Error(`invalid workbench route: ${href}`)
  return { containerId: containerId as ContainerId, viewId: viewId as ViewId }
}

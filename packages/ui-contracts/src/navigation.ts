import type { ContainerId, ViewId } from './ids.ts'
import type { NavigationRegionId } from './renderers.ts'

export interface Availability { readonly available: boolean; readonly reason?: string }

interface NavigationBase {
  readonly id: string
  readonly containerId: ContainerId | string
  readonly region: NavigationRegionId
  readonly title: string
  readonly icon?: string
  readonly order: number
  readonly parentId?: string
  readonly availability: Availability
}

export interface NavigationItem extends NavigationBase {
  readonly kind: 'item'
  readonly route?: string
  readonly commandId?: string
  readonly viewId?: ViewId
}

export interface NavigationGroup extends NavigationBase { readonly kind: 'group' }
export type NavigationContribution = NavigationItem | NavigationGroup
export type NavigationNode = NavigationContribution & { readonly children: readonly NavigationNode[] }
export interface NavigationSnapshot { readonly roots: readonly NavigationNode[] }

export function buildNavigationTree(entries: readonly NavigationContribution[]): NavigationSnapshot {
  const byId = new Map<string, NavigationNode>()
  for (const entry of entries) {
    if (byId.has(entry.id)) throw new Error(`duplicate navigation id: ${entry.id}`)
    byId.set(entry.id, { ...entry, children: [] })
  }
  const visit = (id: string, open = new Set<string>()): void => {
    if (open.has(id)) throw new Error(`navigation cycle: ${[...open, id].join(' -> ')}`)
    const parent = byId.get(id)?.parentId
    if (parent === undefined) return
    if (!byId.has(parent)) throw new Error(`missing navigation parent: ${parent}`)
    visit(parent, new Set([...open, id]))
  }
  for (const id of byId.keys()) visit(id)
  const roots: NavigationNode[] = []
  for (const node of byId.values()) {
    if (node.parentId === undefined) roots.push(node)
    else (byId.get(node.parentId)!.children as NavigationNode[]).push(node)
  }
  const sort = (nodes: NavigationNode[]): void => {
    nodes.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    for (const node of nodes) sort(node.children as NavigationNode[])
    Object.freeze(nodes)
  }
  sort(roots)
  return Object.freeze({ roots })
}

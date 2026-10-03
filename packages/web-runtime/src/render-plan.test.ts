import type { NavigationContribution } from '@xtools/ui-contracts'
import { createContainerId, createRendererId, createViewId } from '@xtools/ui-contracts'
import { expect, it } from 'vitest'
import { buildNavigationSnapshot } from './navigation-snapshot.ts'
import { buildRenderPlan } from './render-plan.ts'

it('导航显隐和排序不改变节点 ID 与 route', () => {
  const entries: NavigationContribution[] = ['a', 'b', 'c'].map((id, order) => ({ kind: 'item', id, title: id, order, containerId: 'files', region: 'secondary-navigation', route: `/${id}`, availability: { available: true } }))
  const snapshot = buildNavigationSnapshot(entries, { hidden: ['b'], pinned: ['c'], order: ['c', 'a'] })
  expect(snapshot.roots.map(node => [node.id, node.kind === 'item' ? node.route : undefined])).toEqual([['c', '/c'], ['a', '/a']])
})

it('用显式路由输入生成不可变 RenderPlan', () => {
  const plan = buildRenderPlan({
    activeContainerId: createContainerId('files'),
    activeViewId: createViewId('files.main'),
    regions: [{ regionId: 'content', rendererId: createRendererId('workbench.default.content'), props: {} }],
  })
  expect(plan.activeViewId).toBe('files.main')
  expect(() => {
    (plan.regions.content as { rendererId?: string }).rendererId = 'changed'
  }).toThrow()
})

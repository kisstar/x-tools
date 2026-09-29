import { describe, expect, it } from 'vitest'
import {
  buildNavigationTree, createContainerId, createModuleId, createRendererId, createSlotId, createViewId,
  type NavigationContribution, type UiDiagnostic,
} from './index.ts'

describe('品牌 ID', () => {
  it.each([createModuleId, createRendererId, createSlotId, createContainerId, createViewId])('拒绝不规范 ID', create => {
    expect(() => create('Bad ID')).toThrow(/invalid/)
  })

  it('接受小写点分 ID', () => {
    expect(createRendererId('workbench.default.secondary-navigation')).toBe('workbench.default.secondary-navigation')
  })
})

describe('导航树', () => {
  const item = (id: string, parentId?: string): NavigationContribution => ({
    kind: 'item', id, containerId: 'files', region: 'secondary-navigation', title: id, order: 0,
    ...(parentId === undefined ? {} : { parentId }), route: `/files/${id}`, availability: { available: true },
  })

  it('拒绝父节点环', () => {
    expect(() => buildNavigationTree([item('a', 'b'), item('b', 'a')])).toThrow(/cycle/)
  })

  it('拒绝相同父节点下的重复 ID', () => {
    expect(() => buildNavigationTree([item('a'), item('a')])).toThrow(/duplicate/)
  })
})

describe('诊断码', () => {
  it.each<UiDiagnostic['code']>(['renderer_unavailable', 'container_unavailable', 'duplicate_id'])('保留结构化诊断 %s', code => {
    const diagnostic: UiDiagnostic = { code, message: code, sourceId: 'test' }
    expect(diagnostic.code).toBe(code)
  })
})

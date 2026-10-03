import { createModuleId, createSlotId } from '@xtools/ui-contracts'
import { describe, expect, it } from 'vitest'
import { SlotRegistry } from './slot-registry.ts'

const root = createSlotId('root')
const shell = createModuleId('workbench.shell')
const plugin = createModuleId('feature.files')

describe('slotRegistry', () => {
  it('只允许声明一个 root', () => {
    const registry = new SlotRegistry()
    registry.declare({ id: root, ownerId: shell, kind: 'single', scope: 'root', major: 1 })
    expect(() => registry.declare({ id: root, ownerId: plugin, kind: 'single', scope: 'root', major: 1 })).toThrow(/duplicate/)
  })

  it('只有父贡献所有者可以声明子 Slot', () => {
    const registry = new SlotRegistry()
    registry.declare({ id: root, ownerId: shell, kind: 'single', scope: 'root', major: 1 })
    registry.contribute(root, { id: 'shell', ownerId: shell, value: {} })
    expect(() => registry.declare({ id: createSlotId('workbench.nav'), parentId: root, ownerId: plugin, kind: 'list', scope: 'root', major: 1 })).toThrow(/owner/)
  })

  it('执行 single/list/keyed 基数和确定性排序', () => {
    const registry = new SlotRegistry()
    const single = createSlotId('workbench.single')
    const list = createSlotId('workbench.list')
    const keyed = createSlotId('workbench.keyed')
    for (const [id, kind] of [[single, 'single'], [list, 'list'], [keyed, 'keyed']] as const) registry.declare({ id, ownerId: shell, kind, scope: 'root', major: 1 })
    registry.contribute(single, { id: 'one', ownerId: shell, value: 1 })
    expect(() => registry.contribute(single, { id: 'two', ownerId: plugin, value: 2 })).toThrow(/single/)
    registry.contribute(list, { id: 'z', ownerId: plugin, order: 0, value: 1 })
    registry.contribute(list, { id: 'a', ownerId: shell, order: 0, value: 2 })
    expect(registry.entries(list).map(entry => entry.id)).toEqual(['a', 'z'])
    registry.contribute(keyed, { id: 'first', key: 'files', ownerId: shell, value: 1 })
    expect(() => registry.contribute(keyed, { id: 'second', key: 'files', ownerId: plugin, value: 2 })).toThrow(/key/)
  })

  it('freeze 后拒绝写入', () => {
    const registry = new SlotRegistry()
    registry.freeze()
    expect(() => registry.declare({ id: root, ownerId: shell, kind: 'single', scope: 'root', major: 1 })).toThrow(/frozen/)
  })
})

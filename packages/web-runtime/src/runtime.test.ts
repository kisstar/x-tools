import { expect, it, vi } from 'vitest'
import { createModuleId, createSlotId } from '@xtools/ui-contracts'
import { WebRuntime } from './runtime.ts'

it('激活失败时逆序回滚当前模块贡献', async () => {
  const runtime = new WebRuntime()
  await expect(runtime.activate([{
    manifest: () => ({ id: createModuleId('feature.failed'), dependsOn: [] }),
    activate(ctx) {
      ctx.declareSlot({ id: createSlotId('feature.failed.slot'), ownerId: createModuleId('feature.failed'), kind: 'list', scope: 'root', major: 1 })
      throw new Error('activate failed')
    },
    deactivate: vi.fn(),
  }], [])).rejects.toThrow('activate failed')
  expect(runtime.registrySnapshot().slots).toHaveLength(0)
})

it('缺失宿主必需模块时失败', async () => {
  const runtime = new WebRuntime()
  await expect(runtime.activate([], [createModuleId('workbench.shell')])).rejects.toThrow(/required/)
})

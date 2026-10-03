import { createModuleId, createSlotId } from '@xtools/ui-contracts'
import { expect, it, vi } from 'vitest'
import { WebRuntime } from './runtime.ts'

it('必需模块激活失败时逆序回滚当前模块贡献', async () => {
  const runtime = new WebRuntime()
  const failedId = createModuleId('feature.failed')
  await expect(runtime.activate([{
    manifest: () => ({ id: failedId, dependsOn: [] }),
    activate(ctx) {
      ctx.declareSlot({ id: createSlotId('feature.failed.slot'), ownerId: failedId, kind: 'list', scope: 'root', major: 1 })
      throw new Error('activate failed')
    },
    deactivate: vi.fn(),
  }], [failedId])).rejects.toThrow('activate failed')
  expect(runtime.registrySnapshot().slots).toHaveLength(0)
})

it('缺失宿主必需模块时失败', async () => {
  const runtime = new WebRuntime()
  await expect(runtime.activate([], [createModuleId('workbench.shell')])).rejects.toThrow(/required/)
})

it('可选模块激活失败只回滚自身并保留诊断，后续模块继续激活', async () => {
  const runtime = new WebRuntime()
  const failedId = createModuleId('feature.optional-failed')
  const healthyId = createModuleId('feature.healthy')
  await runtime.activate([
    {
      manifest: () => ({ id: failedId, dependsOn: [] }),
      activate(ctx) {
        ctx.declareSlot({ id: createSlotId('feature.failed.slot'), ownerId: failedId, kind: 'list', scope: 'root', major: 1 })
        throw new Error('optional boom')
      },
      deactivate: vi.fn(),
    },
    {
      manifest: () => ({ id: healthyId, dependsOn: [] }),
      activate(ctx) {
        ctx.declareSlot({ id: createSlotId('feature.healthy.slot'), ownerId: healthyId, kind: 'list', scope: 'root', major: 1 })
      },
      deactivate: vi.fn(),
    },
  ], [])

  expect(runtime.registrySnapshot().slots.map(slot => slot.definition.id)).toEqual(['feature.healthy.slot'])
  expect(runtime.diagnostics()).toHaveLength(1)
  expect(runtime.diagnostics()[0]?.code).toBe('plugin_activation_failed')
  expect(runtime.diagnostics()[0]?.sourceId).toBe(failedId)
  expect(runtime.diagnostics()[0]?.message).toContain('optional boom')
})

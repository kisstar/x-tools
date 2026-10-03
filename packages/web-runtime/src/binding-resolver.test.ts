import type { RendererBindingLayers, RendererDescriptor, RendererId } from '@xtools/ui-contracts'
import { createRendererId } from '@xtools/ui-contracts'
import { describe, expect, it } from 'vitest'
import { resolveRendererBinding } from './binding-resolver.ts'

const component = () => null
const descriptor = (id: string, region: RendererDescriptor['region'] = 'secondary-navigation', major: 1 = 1): RendererDescriptor => ({ region, id: createRendererId(id), major, component })
const ids = { shell: createRendererId('shell.default'), container: createRendererId('container.default'), global: createRendererId('user.global'), workspace: createRendererId('workspace.override') }

describe('resolveRendererBinding', () => {
  it.each([
    [{ shell: ids.shell }, ids.shell],
    [{ shell: ids.shell, container: ids.container }, ids.container],
    [{ shell: ids.shell, container: ids.container, global: ids.global }, ids.global],
    [{ shell: ids.shell, container: ids.container, global: ids.global, workspace: ids.workspace }, ids.workspace],
  ] as [RendererBindingLayers, RendererId][])('按四层选择最高层显式绑定', (layers, expected) => {
    const renderers = Object.values(ids).map(id => descriptor(id))
    expect(resolveRendererBinding('secondary-navigation', layers, renderers).renderer?.id).toBe(expected)
  })

  it('显式引用缺失时不回退', () => {
    const result = resolveRendererBinding('secondary-navigation', { shell: ids.shell, workspace: ids.workspace }, [descriptor(ids.shell)])
    expect(result.renderer).toBeUndefined()
    expect(result.diagnostic?.code).toBe('renderer_unavailable')
  })

  it('区域或主版本不兼容时不回退', () => {
    expect(resolveRendererBinding('secondary-navigation', { shell: ids.shell, global: ids.global }, [descriptor(ids.shell), descriptor(ids.global, 'detail')]).diagnostic?.code).toBe('renderer_unavailable')
  })
})

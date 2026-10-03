import type { RendererDescriptor } from '@xtools/ui-contracts'
import { render, screen } from '@testing-library/react'
import { createContainerId, createRendererId, createViewId } from '@xtools/ui-contracts'
import { expect, it } from 'vitest'
import { RendererHost } from './renderer-host.tsx'

it('区域 renderer 可以返回任意 React 节点', () => {
  const renderer: RendererDescriptor = { region: 'content', id: createRendererId('feature.custom.content'), major: 1, component: () => <><section><strong>任意节点</strong></section></> }
  render(<RendererHost renderer={renderer} plan={{ regionId: 'content', rendererId: renderer.id, props: { containerId: createContainerId('files'), viewId: createViewId('files.main'), actions: { navigate() {}, execute() {} } } }} />)
  expect(screen.getByText('任意节点')).toBeInTheDocument()
})

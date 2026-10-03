import type { RegionId, RendererDescriptor, RenderPlan } from '@xtools/ui-contracts'
import { render, screen } from '@testing-library/react'
import { createRendererId } from '@xtools/ui-contracts'
import { expect, it, vi } from 'vitest'
import { AppShell } from './app-shell.tsx'

it('单个 renderer 异常只降级对应区域', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const ok = (label: string) => () => <div>{label}</div>
  const renderers = new Map<string, RendererDescriptor>([
    ['workbench.default.top-navigation', { region: 'top-navigation', id: createRendererId('workbench.default.top-navigation'), major: 1, component: ok('顶部') }],
    ['feature.failed.secondary-navigation', { region: 'secondary-navigation', id: createRendererId('feature.failed.secondary-navigation'), major: 1, component: () => { throw new Error('boom') } }],
    ['workbench.default.content', { region: 'content', id: createRendererId('workbench.default.content'), major: 1, component: ok('内容') }],
  ])
  const regions = Object.fromEntries((['top-navigation', 'secondary-navigation', 'content'] as RegionId[]).map(regionId => [regionId, { regionId, rendererId: createRendererId(regionId === 'secondary-navigation' ? 'feature.failed.secondary-navigation' : `workbench.default.${regionId}`), props: {} }]))
  render(<AppShell plan={{ activeContainerId: 'files', activeViewId: 'files.main', regions } as RenderPlan} renderers={renderers} />)
  expect(screen.getByText('顶部')).toBeInTheDocument()
  expect(screen.getByText('内容')).toBeInTheDocument()
  expect(screen.getByText(/secondary-navigation.*boom/)).toBeInTheDocument()
  consoleError.mockRestore()
})

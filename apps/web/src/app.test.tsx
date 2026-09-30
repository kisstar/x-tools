import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { createContainerId, createRendererId, createViewId, type RendererDescriptor, type RenderPlan } from '@xtools/ui-contracts'
import { App } from './app.tsx'
import { AppShell, CommandPaletteOverlay } from '@xtools/module-workbench-shell'

afterEach(cleanup)

it('Header 命令入口与快捷键打开命令面板', () => {
  const id = createRendererId('test.top')
  const renderers = new Map<string, RendererDescriptor>([[id, { region: 'top-navigation', id, major: 1, component: () => <button className="xt-command-trigger">搜索</button> }]])
  const plan = { activeContainerId: createContainerId('home'), activeViewId: createViewId('home.overview'), regions: { 'top-navigation': { regionId: 'top-navigation', rendererId: id, props: {} } }, overlays: [{ id: 'palette', component: CommandPaletteOverlay }], diagnostics: [] } as unknown as RenderPlan
  render(<App root={AppShell} plan={plan} renderers={renderers} />)
  fireEvent.click(screen.getByRole('button', { name: '搜索' }))
  expect(screen.getByRole('dialog', { name: '命令面板' })).toBeInTheDocument()
  fireEvent.keyDown(window, { key: 'Escape' })
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
  expect(screen.getByRole('dialog', { name: '命令面板' })).toBeInTheDocument()
})

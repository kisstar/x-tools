import type { Channel } from './composition.tsx'
import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createModuleId, createSlotId } from '@xtools/ui-contracts'
import { afterEach, expect, it, vi } from 'vitest'
import { composeWebApp } from './composition.tsx'
import { productionModules } from './production-modules.ts'

const preferences = { preferences: { revision: '0', global: {}, workspaces: {} } }
const channel = (value = preferences): Channel => ({ call: vi.fn(async () => value) as Channel['call'], subscribe: () => () => {} })
afterEach(cleanup)

it('默认模块形成合法路由，跨插件贡献通过稳定容器 ID 出现', async () => {
  const app = await composeWebApp({ channel: channel(), modules: productionModules, history: createMemoryHistory({ initialEntries: ['/home/home.overview'] }) })
  render(app.element)
  expect((await screen.findAllByText('最近使用')).length).toBeGreaterThan(0)
  expect(screen.getAllByText('最近工具').length).toBeGreaterThan(0)
  fireEvent.click(screen.getAllByText('最近工具')[0])
  expect(await screen.findByText('由独立模块贡献到首页容器的最近使用工具目录。')).toBeInTheDocument()
})

it('tanStack Router 从已解析 matches 读取路由参数而不把 search 拼进 View ID', async () => {
  const app = await composeWebApp({ channel: channel(), modules: productionModules, history: createMemoryHistory({ initialEntries: ['/home/home.overview?source=test'] }) })
  render(app.element)
  expect(await screen.findByText('你的本地工具工作台')).toBeInTheDocument()
  expect(screen.queryByText(/view unavailable/)).not.toBeInTheDocument()
})

it('空 Hash 入口规范化为合法默认工作台路由', async () => {
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const app = await composeWebApp({ channel: channel(), modules: productionModules, history })
  render(app.element)
  expect(history.location.href).toBe('/home/home.overview')
  expect((await screen.findAllByText('最近使用')).length).toBeGreaterThan(0)
})

it('tanStack Router 导航自动更新活动 View，无需手工 refresh', async () => {
  const app = await composeWebApp({ channel: channel(), modules: productionModules, history: createMemoryHistory({ initialEntries: ['/home/home.overview'] }) })
  render(app.element)
  fireEvent.click((await screen.findAllByRole('button', { name: '设置' }))[0])
  await waitFor(() => expect(screen.getByRole('article')).toHaveAttribute('data-view', 'settings.general'))
})

it('composition 读取偏好并拒绝回退显式不可用 renderer', async () => {
  const source = channel({ preferences: { revision: '7', global: { containers: { home: { regions: { content: { rendererId: 'missing.content' } } } } }, workspaces: {} } })
  const app = await composeWebApp({ channel: source, modules: productionModules, history: createMemoryHistory({ initialEntries: ['/home/home.overview'] }), workspaceId: 'default' })
  render(app.element)
  expect(await screen.findByText('renderer missing.content is unavailable for content')).toBeInTheDocument()
  expect(source.call).toHaveBeenCalledWith('workbench.preferences.get@1', {})
})

it('当前工作区 renderer 覆盖高于全局选择', async () => {
  const source = channel({ preferences: {
    revision: '8',
    global: { containers: { home: { regions: { content: { rendererId: 'missing.global' } } } } },
    workspaces: { project: { containers: { home: { regions: { content: { rendererId: 'missing.workspace' } } } } } },
  } })
  const app = await composeWebApp({ channel: source, modules: productionModules, history: createMemoryHistory({ initialEntries: ['/home/home.overview'] }), workspaceId: 'project' })
  render(app.element)
  expect(await screen.findByText('renderer missing.workspace is unavailable for content')).toBeInTheDocument()
})

it('设置页通过 IChannel 更新偏好并采用服务端新 revision', async () => {
  const source = channel()
  vi.mocked(source.call).mockImplementation(async id => id === 'workbench.preferences.update@1'
    ? { preferences: { revision: '1', global: { containers: { settings: { regions: { detail: { visible: false } } } } }, workspaces: {} } }
    : preferences)
  const app = await composeWebApp({ channel: source, modules: productionModules, history: createMemoryHistory({ initialEntries: ['/settings/settings.general'] }) })
  render(app.element)
  fireEvent.click(await screen.findByRole('checkbox', { name: '显示详情面板' }))
  await waitFor(() => expect(source.call).toHaveBeenCalledWith('workbench.preferences.update@1', expect.objectContaining({ expectedRevision: '0' })))
  expect(await screen.findByText('当前 revision：1')).toBeInTheDocument()
})

it('偏好冲突保留旧 revision 和旧 RenderPlan', async () => {
  const source = channel()
  vi.mocked(source.call).mockImplementation(async (id) => {
    if (id === 'workbench.preferences.update@1')
      throw new Error('preferences revision conflict')
    return preferences
  })
  const app = await composeWebApp({ channel: source, modules: productionModules, history: createMemoryHistory({ initialEntries: ['/settings/settings.general'] }) })
  render(app.element)
  fireEvent.click(await screen.findByRole('checkbox', { name: '显示详情面板' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('preferences revision conflict')
  expect(screen.getByText('当前 revision：0')).toBeInTheDocument()
})

it('不存在的 View 保留 URL 并显示可诊断状态', async () => {
  const history = createMemoryHistory({ initialEntries: ['/home/missing.view'] })
  const app = await composeWebApp({ channel: channel(), modules: productionModules, history })
  render(app.element)
  expect(await screen.findByText('view unavailable: missing.view')).toBeInTheDocument()
  expect(history.location.href).toBe('/home/missing.view')
})

it('必需 Shell 激活失败时返回启动诊断而不挂载应用', async () => {
  const failed = {
    manifest: () => ({ id: createModuleId('workbench.shell'), dependsOn: [] }),
    activate: () => {
      throw new Error('shell failed')
    },
    deactivate() {},
  }
  const app = await composeWebApp({ channel: channel(), modules: [failed], history: createMemoryHistory({ initialEntries: ['/home/home.overview'] }) })
  render(app.element)
  expect(screen.getByText(/workbench.shell.*shell failed/)).toBeInTheDocument()
})

it('root 槽贡献决定实际根组件，app 不硬编码默认 Shell', async () => {
  const shellId = createModuleId('workbench.shell')
  const customShell = {
    manifest: () => ({ id: shellId, dependsOn: [] }),
    activate(ctx: Parameters<(typeof productionModules)[number]['activate']>[0]) {
      ctx.declareSlot({ id: createSlotId('root'), ownerId: shellId, kind: 'single', scope: 'root', major: 1 })
      ctx.contribute(createSlotId('root'), { id: 'custom.shell.root', ownerId: shellId, value: () => <div>自定义根骨架</div> })
    },
    deactivate() {},
  }
  const app = await composeWebApp({ channel: channel(), modules: [customShell], history: createMemoryHistory({ initialEntries: ['/home/home.overview'] }) })
  render(app.element)
  expect(await screen.findByText('自定义根骨架')).toBeInTheDocument()
})

it('overlay 槽贡献会在 Shell 的叠层区域真实渲染', async () => {
  const overlayId = createModuleId('feature.overlay')
  const overlay = {
    manifest: () => ({ id: overlayId, dependsOn: [createModuleId('workbench.shell')] }),
    activate(ctx: Parameters<(typeof productionModules)[number]['activate']>[0]) {
      ctx.contribute(createSlotId('workbench.overlay'), { id: 'feature.overlay.status', ownerId: overlayId, value: { id: 'feature.overlay.status', component: () => <div>插件叠层内容</div> } })
    },
    deactivate() {},
  }
  const app = await composeWebApp({ channel: channel(), modules: [...productionModules, overlay], history: createMemoryHistory({ initialEntries: ['/home/home.overview'] }) })
  render(app.element)
  expect(await screen.findByText('插件叠层内容')).toBeInTheDocument()
})

it('可选插件失败不会阻止工作台挂载，并显示插件诊断', async () => {
  const optionalId = createModuleId('feature.optional')
  const failed = {
    manifest: () => ({ id: optionalId, dependsOn: [] }),
    activate: () => {
      throw new Error('optional failed')
    },
    deactivate() {},
  }
  const app = await composeWebApp({ channel: channel(), modules: [productionModules[0], failed, ...productionModules.slice(1)], history: createMemoryHistory({ initialEntries: ['/home/home.overview'] }) })
  render(app.element)
  expect(await screen.findByText('你的本地工具工作台')).toBeInTheDocument()
  expect(screen.getByText(/feature.optional.*optional failed/)).toBeInTheDocument()
})

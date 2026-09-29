import { expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryHistory } from '@tanstack/react-router'
import { createModuleId } from '@xtools/ui-contracts'
import { composeWebApp } from './composition.tsx'
import type { Channel } from './composition.tsx'
import { modules } from './test-plugins.tsx'

const channel: Channel = { call: async <TIn, TOut>(capabilityId: string, input: TIn) => { void capabilityId; void input; return { revision: '0', global: {}, workspaces: {} } as TOut }, subscribe: () => () => {} }

it('URL 在 A/B 容器间选择不同次侧栏，C 向 A 开放贡献', async () => {
  const history = createMemoryHistory({ initialEntries: ['/#/a/a.main'] })
  const app = await composeWebApp({ channel, modules, history })
  const view = render(app.element)
  expect(screen.getByText('A 图标导航')).toBeInTheDocument()
  expect(screen.getAllByText('C 最近文件')).not.toHaveLength(0)
  history.push('/#/b/b.main')
  await app.refresh()
  view.rerender(app.element)
  expect(screen.getByText('B 树形导航')).toBeInTheDocument()
})

it('必需 Shell 激活失败时返回启动诊断而不挂载应用', async () => {
  const failed = { manifest: () => ({ id: createModuleId('workbench.shell'), dependsOn: [] }), activate: () => { throw new Error('shell failed') }, deactivate() {} }
  const app = await composeWebApp({ channel, modules: [failed], history: createMemoryHistory({ initialEntries: ['/#/a/a.main'] }) })
  render(app.element)
  expect(screen.getByText(/workbench.shell.*shell failed/)).toBeInTheDocument()
})

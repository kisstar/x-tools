import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { WorkbenchPreferences } from '@xtools/ui-contracts'
import { SettingsPanel } from './settings-panel.tsx'

it('设置区分全局与工作区偏好并可清除工作区覆盖', async () => {
  const preferences: WorkbenchPreferences = { revision: '4', global: { containers: {} }, workspaces: { alpha: { containers: {} } } }
  const onUpdate = vi.fn().mockResolvedValue(undefined)
  render(<SettingsPanel preferences={preferences} workspaceId="alpha" unavailableRendererId="plugin.removed.tree" onUpdate={onUpdate} />)
  expect(screen.getByRole('heading', { name: '工作台设置' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: '全局布局' })).toHaveAttribute('aria-selected', 'true')
  fireEvent.click(screen.getByRole('tab', { name: '当前工作区' }))
  expect(screen.getByText('仅保存相对全局布局的差异')).toBeInTheDocument()
  expect(screen.getByText('plugin.removed.tree')).toBeInTheDocument()
  expect(screen.getByText('renderer 当前不可用')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '恢复跟随全局' }))
  await waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ scope: 'workspace', workspaceId: 'alpha', clear: true, revision: '4' }))
})

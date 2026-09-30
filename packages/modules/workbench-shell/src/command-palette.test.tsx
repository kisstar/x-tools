import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CommandPalette } from './command-palette.tsx'

afterEach(cleanup)

it('命令面板可搜索命令并通过键盘关闭', () => {
  const onClose = vi.fn()
  render(<CommandPalette open onClose={onClose} onExecute={vi.fn()} />)
  const dialog = screen.getByRole('dialog', { name: '命令面板' })
  expect(dialog).toBeInTheDocument()
  const search = screen.getByRole('combobox', { name: '搜索命令' })
  expect(search).toHaveFocus()
  fireEvent.change(search, { target: { value: 'JSON' } })
  expect(screen.getByRole('option', { name: /JSON 格式化/ })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: /UUID/ })).not.toBeInTheDocument()
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(onClose).toHaveBeenCalledOnce()
})

it('点击命令会执行并关闭面板', () => {
  const onClose = vi.fn()
  const onExecute = vi.fn()
  render(<CommandPalette open onClose={onClose} onExecute={onExecute} />)
  fireEvent.click(screen.getByRole('option', { name: /JSON 格式化/ }))
  expect(onExecute).toHaveBeenCalledWith('json')
  expect(onClose).toHaveBeenCalledOnce()
})

it('方向键移动选项并用 Enter 执行', () => {
  const onExecute = vi.fn()
  render(<CommandPalette open onClose={vi.fn()} onExecute={onExecute} />)
  const dialog = screen.getByRole('dialog', { name: '命令面板' })
  fireEvent.keyDown(dialog, { key: 'ArrowDown' })
  fireEvent.keyDown(dialog, { key: 'Enter' })
  expect(onExecute).toHaveBeenCalledWith('regex')
})

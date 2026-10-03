import type { KeyboardEvent } from 'react'
import { useEffect, useRef, useState } from 'react'

const commands = [
  { id: 'json', title: 'JSON 格式化', category: '格式化' },
  { id: 'regex', title: '正则测试器', category: '开发工具' },
  { id: 'uuid', title: 'UUID 生成器', category: '生成器' },
  { id: 'base64', title: 'Base64 编解码', category: '编码' },
]

interface CommandPaletteProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly onExecute: (id: string) => void
}

export function CommandPalette({ open, onClose, onExecute }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (open)
      inputRef.current?.focus()
  }, [open])
  if (!open)
    return null
  const results = commands.filter(command => command.title.toLowerCase().includes(query.toLowerCase()))
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      onClose()
    }
    else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex(index => Math.min(index + 1, results.length - 1))
    }
    else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex(index => Math.max(index - 1, 0))
    }
    else if (event.key === 'Enter' && results[activeIndex] !== undefined) {
      event.preventDefault()
      onExecute(results[activeIndex].id)
      onClose()
    }
  }
  return (
    <div
      className="xt-palette-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget)
          onClose()
      }}
    >
      <div className="xt-command-palette" role="dialog" aria-modal="true" aria-label="命令面板" onKeyDown={handleKeyDown}>
        <div className="xt-palette-search">
          <span className="xt-ai-mark">✦</span>
          <input ref={inputRef} role="combobox" aria-label="搜索命令" aria-controls="xt-command-results" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索工具、运行命令或询问 AI…" />
          <kbd>ESC</kbd>
        </div>
        <div id="xt-command-results" role="listbox" aria-label="命令结果">
          <span className="xt-palette-label">建议</span>
          {results.map((command, index) => (
            <button
              key={command.id}
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => {
                onExecute(command.id)
                onClose()
              }}
            >
              <span>◇</span>
              <strong>{command.title}</strong>
              <small>{command.category}</small>
            </button>
          ))}
        </div>
        <div className="xt-palette-ai">
          <span className="xt-ai-mark">✦</span>
          <span>让 AI 帮你找到合适的工具…</span>
        </div>
        <footer>
          <span>
            <kbd>↑↓</kbd>
            {' '}
            导航 ·
            {' '}
            <kbd>↵</kbd>
            {' '}
            打开
          </span>
          <span>xTools v0.1.0</span>
        </footer>
      </div>
    </div>
  )
}

export function CommandPaletteOverlay() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const keydown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === 'k' || event.code === 'KeyK')) {
        event.preventDefault()
        setOpen(true)
      }
    }
    const click = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest('.xt-command-trigger') !== null)
        setOpen(true)
    }
    window.addEventListener('keydown', keydown)
    document.addEventListener('click', click)
    return () => {
      window.removeEventListener('keydown', keydown)
      document.removeEventListener('click', click)
    }
  }, [])
  return <CommandPalette open={open} onClose={() => setOpen(false)} onExecute={() => setOpen(false)} />
}

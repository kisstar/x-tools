import { createHashHistory } from '@tanstack/react-router'
import { createBrowserWebSocketChannel, readSessionToken } from '@xtools/adapter-ws'
import { createRoot } from 'react-dom/client'
import { composeWebApp } from './composition.tsx'
import { productionModules } from './production-modules.ts'

async function main(): Promise<void> {
  const container = document.getElementById('root')
  if (container === null)
    throw new Error('缺少 #root 挂载点')
  const token = readSessionToken(document)
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const channel = createBrowserWebSocketChannel({ url: `${protocol}//${location.host}/ws`, token })
  const history = createHashHistory()
  const app = await composeWebApp({ channel, modules: productionModules, history })
  const root = createRoot(container)
  root.render(app.element)
}

void main()

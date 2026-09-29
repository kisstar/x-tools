import { createRoot } from 'react-dom/client'
import { createHashHistory } from '@tanstack/react-router'
import { composeWebApp, type Channel } from './composition.tsx'
import { modules } from './test-plugins.tsx'

const container = document.getElementById('root')
if (container === null) throw new Error('缺少 #root 挂载点')
const channel: Channel = { call: async <TIn, TOut>(capabilityId: string, input: TIn) => { void capabilityId; void input; return { revision: '0', global: {}, workspaces: {} } as TOut }, subscribe: () => () => {} }
const history = createHashHistory()
const app = await composeWebApp({ channel, modules, history })
createRoot(container).render(app.element)

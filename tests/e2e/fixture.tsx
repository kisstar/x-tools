import type { UiModule } from '@xtools/web-runtime'
import type { Channel } from '../../apps/web/src/composition.tsx'
import { createMemoryHistory } from '@tanstack/react-router'
import { createModuleId } from '@xtools/ui-contracts'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { composeWebApp } from '../../apps/web/src/composition.tsx'
import { productionModules } from '../../apps/web/src/production-modules.ts'

const preferences = { preferences: { revision: '0', global: {}, workspaces: {} } }
const channel: Channel = { call: async () => preferences as never, subscribe: () => () => {} }
const scenario = new URLSearchParams(location.search).get('scenario')
const failed: UiModule = scenario === 'shell-failure'
  ? { manifest: () => ({ id: createModuleId('workbench.shell'), dependsOn: [] }), activate: () => { throw new Error('shell failed') }, deactivate() {} }
  : { manifest: () => ({ id: createModuleId('fixture.optional'), dependsOn: [] }), activate: () => { throw new Error('optional failed') }, deactivate() {} }
const modules = scenario === 'shell-failure' ? [failed] : [productionModules[0], failed, ...productionModules.slice(1)]
async function main(): Promise<void> {
  const app = await composeWebApp({ channel, modules, history: createMemoryHistory({ initialEntries: ['/home/home.overview'] }) })
  const container = document.getElementById('fixture-root')
  if (container === null)
    throw new Error('missing fixture root')
  createRoot(container).render(createElement(() => app.element))
}

void main()

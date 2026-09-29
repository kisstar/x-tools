import { createModuleId, createRendererId, createSlotId, type RendererDescriptor } from '@xtools/ui-contracts'
import type { UiModule } from '@xtools/web-runtime'
import { AppShell } from './app-shell.tsx'
import { DefaultContent } from './renderers/content.tsx'
import { DefaultDetail } from './renderers/detail.tsx'
import { DefaultPrimaryNavigation } from './renderers/primary-navigation.tsx'
import { DefaultSecondaryNavigation } from './renderers/secondary-navigation.tsx'
import { DefaultTopNavigation } from './renderers/top-navigation.tsx'

const id = createModuleId('workbench.shell')
const root = createSlotId('root')
const regionSlots = ['top-navigation', 'primary-navigation', 'secondary-navigation', 'content', 'detail', 'overlay'] as const
const renderers: RendererDescriptor[] = [
  { region: 'top-navigation', id: createRendererId('workbench.default.top-navigation'), major: 1, component: DefaultTopNavigation },
  { region: 'primary-navigation', id: createRendererId('workbench.default.primary-navigation'), major: 1, component: DefaultPrimaryNavigation },
  { region: 'secondary-navigation', id: createRendererId('workbench.default.secondary-navigation'), major: 1, component: DefaultSecondaryNavigation },
  { region: 'content', id: createRendererId('workbench.default.content'), major: 1, component: DefaultContent },
  { region: 'detail', id: createRendererId('workbench.default.detail'), major: 1, component: DefaultDetail },
]

export const workbenchShell: UiModule = {
  manifest: () => ({ id, dependsOn: [] }),
  activate(ctx) {
    ctx.declareSlot({ id: root, ownerId: id, kind: 'single', scope: 'root', major: 1 })
    ctx.contribute(root, { id: 'workbench.shell.root', ownerId: id, value: AppShell })
    for (const name of regionSlots) ctx.declareSlot({ id: createSlotId(`workbench.${name}`), parentId: root, ownerId: id, kind: name === 'overlay' ? 'list' : 'keyed', scope: 'root', major: 1 })
    for (const renderer of renderers) ctx.registerRenderer(renderer)
  },
  deactivate() {},
}

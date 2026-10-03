import type { ContainerContribution, NavigationContribution, ViewContribution } from '@xtools/ui-contracts'
import type { UiModule } from '@xtools/web-runtime'
import {

  createContainerId,
  createModuleId,
  createRendererId,
  createSlotId,
  createViewId,

} from '@xtools/ui-contracts'
import { SettingsContent } from './settings-content.tsx'

const moduleId = createModuleId('workbench.settings')
const containerId = createContainerId('settings')
const viewId = createViewId('settings.general')
const rendererId = createRendererId('workbench.settings.content')

export const workbenchSettings: UiModule = {
  manifest: () => ({ id: moduleId, dependsOn: [createModuleId('workbench.shell')] }),
  activate(ctx) {
    ctx.contribute(createSlotId('workbench.containers'), {
      id: 'workbench.settings.container',
      ownerId: moduleId,
      value: {
        id: containerId,
        defaultViewId: viewId,
        rendererIds: { content: rendererId },
      } satisfies ContainerContribution,
    })
    ctx.contribute(createSlotId('workbench.views'), {
      id: 'workbench.settings.general',
      key: viewId,
      ownerId: moduleId,
      value: { id: viewId, containerId, title: '设置', component: SettingsContent } satisfies ViewContribution,
    })
    for (const contribution of [
      { kind: 'item', id: 'settings.container', title: '设置', icon: '⚙', order: 100, containerId, region: 'primary-navigation', route: '/settings/settings.general', viewId, availability: { available: true } },
      { kind: 'item', id: 'settings.general', title: '常规', order: 10, containerId, region: 'secondary-navigation', route: '/settings/settings.general', viewId, availability: { available: true } },
    ] satisfies NavigationContribution[]) {
      ctx.contribute(createSlotId('workbench.navigation'), { id: `workbench.settings.navigation.${contribution.id}`, ownerId: moduleId, value: contribution })
    }
    ctx.registerRenderer({ region: 'content', id: rendererId, major: 1, component: SettingsContent })
  },
  deactivate() {},
}

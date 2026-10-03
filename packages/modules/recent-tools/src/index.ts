import type { NavigationContribution, ViewContribution } from '@xtools/ui-contracts'
import type { UiModule } from '@xtools/web-runtime'
import { createContainerId, createModuleId, createSlotId, createViewId } from '@xtools/ui-contracts'
import { createElement } from 'react'

const moduleId = createModuleId('workbench.recent-tools')
const containerId = createContainerId('home')

export const recentTools: UiModule = {
  manifest: () => ({ id: moduleId, dependsOn: [createModuleId('workbench.shell')] }),
  activate(ctx) {
    const viewId = createViewId('recent-tools.catalog')
    ctx.contribute(createSlotId('workbench.views'), {
      id: 'workbench.recent-tools.view',
      key: viewId,
      ownerId: moduleId,
      value: { id: viewId, containerId, title: '最近工具', component: ({ viewId: activeViewId }) => createElement('article', { 'className': 'xt-content-view', 'data-view': activeViewId }, createElement('h1', null, '最近工具'), createElement('p', null, '由独立模块贡献到首页容器的最近使用工具目录。')) } satisfies ViewContribution,
    })
    ctx.contribute(createSlotId('workbench.navigation'), {
      id: 'workbench.recent-tools.navigation',
      ownerId: moduleId,
      value: { kind: 'item', id: 'recent-tools.catalog', title: '最近工具', order: 20, containerId, region: 'secondary-navigation', route: '/home/recent-tools.catalog', viewId, availability: { available: true } } satisfies NavigationContribution,
    })
  },
  deactivate() {},
}

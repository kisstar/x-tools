import type { ContainerContribution, NavigationContribution, ViewContribution } from '@xtools/ui-contracts'
import type { UiModule } from '@xtools/web-runtime'
import {

  createContainerId,
  createModuleId,
  createSlotId,
  createViewId,

} from '@xtools/ui-contracts'
import { createElement } from 'react'

const moduleId = createModuleId('workbench.home')
const containerId = createContainerId('home')
const viewId = createViewId('home.overview')

export const workbenchHome: UiModule = {
  manifest: () => ({ id: moduleId, dependsOn: [createModuleId('workbench.shell')] }),
  activate(ctx) {
    ctx.contribute(createSlotId('workbench.containers'), {
      id: 'workbench.home.container',
      ownerId: moduleId,
      value: { id: containerId, defaultViewId: viewId } satisfies ContainerContribution,
    })
    ctx.contribute(createSlotId('workbench.views'), {
      id: 'workbench.home.overview',
      key: viewId,
      ownerId: moduleId,
      value: { id: viewId, containerId, title: '最近使用', component: ({ viewId: activeViewId }) => createElement('article', { 'className': 'xt-content-view', 'data-view': activeViewId }, createElement('div', { className: 'xt-content-toolbar' }, createElement('div', null, createElement('span', { className: 'xt-eyebrow' }, 'WORKBENCH'), createElement('h1', null, '你的本地工具工作台'), createElement('p', null, '快速打开最近使用的工具，所有处理都在本机完成。'))), createElement('section', null, createElement('h2', null, '最近使用'), createElement('p', null, '通过左侧导航浏览工具，或按 ⌘K 搜索命令。'))) } satisfies ViewContribution,
    })
    for (const contribution of [
      { kind: 'item', id: 'home.container', title: '首页', icon: '⌂', order: 10, containerId, region: 'primary-navigation', route: '/home/home.overview', viewId, availability: { available: true } },
      { kind: 'item', id: 'home.overview', title: '最近使用', order: 10, containerId, region: 'secondary-navigation', route: '/home/home.overview', viewId, availability: { available: true } },
    ] satisfies NavigationContribution[]) {
      ctx.contribute(createSlotId('workbench.navigation'), { id: `workbench.home.navigation.${contribution.id}`, ownerId: moduleId, value: contribution })
    }
  },
  deactivate() {},
}

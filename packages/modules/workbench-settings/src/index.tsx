import {
  createContainerId,
  createModuleId,
  createRendererId,
  createSlotId,
  createViewId,
  type ContainerContribution,
  type NavigationContribution,
  type ViewContribution,
  type ContentRendererProps,
} from '@xtools/ui-contracts'
import type { UiModule } from '@xtools/web-runtime'
import { useState } from 'react'

const moduleId = createModuleId('workbench.settings')
const containerId = createContainerId('settings')
const viewId = createViewId('settings.general')
const rendererId = createRendererId('workbench.settings.content')

const SettingsContent = ({ viewId: activeViewId, preferencesRevision = '0', actions }: ContentRendererProps) => {
  const [scope, setScope] = useState<'global' | 'workspace'>('global')
  const [error, setError] = useState<string>()
  return <article className="xt-settings" data-view={activeViewId}>
    <header><span className="xt-eyebrow">PREFERENCES</span><h1>工作台设置</h1><p>管理主题、插件、renderer 绑定和面板布局。</p></header>
    <div className="xt-settings-tabs" role="tablist" aria-label="偏好范围"><button role="tab" aria-selected={scope === 'global'} onClick={() => setScope('global')}>全局布局</button><button role="tab" aria-selected={scope === 'workspace'} onClick={() => setScope('workspace')}>当前工作区</button></div>
    <section className="xt-settings-card"><h2>{scope === 'global' ? '全局默认' : '当前工作区'}</h2><p>{scope === 'global' ? '未设置工作区覆盖时继承这些选择。' : '仅保存相对全局配置的稀疏覆盖。'}</p><label>内容区 renderer<select aria-label="内容区 renderer" defaultValue="workbench.settings.content" onChange={event => { setError(undefined); void actions.updatePreferences?.({ scope, containerId, regionId: 'content', rendererId: event.target.value }).catch(reason => setError(reason instanceof Error ? reason.message : String(reason))) }}><option value="workbench.settings.content">设置专用</option><option value="workbench.default.content">工作台默认</option></select></label><label className="xt-setting-row"><span><strong>显示详情面板</strong><small>当前 revision：{preferencesRevision}</small></span><input aria-label="显示详情面板" type="checkbox" defaultChecked onChange={event => { setError(undefined); void actions.updatePreferences?.({ scope, containerId, regionId: 'detail', visible: event.target.checked }).catch(reason => setError(reason instanceof Error ? reason.message : String(reason))) }} /></label><label>详情面板宽度<input aria-label="详情面板宽度" type="number" min="240" max="480" defaultValue="320" onBlur={event => { setError(undefined); void actions.updatePreferences?.({ scope, containerId, regionId: 'detail', width: Number(event.target.value) }).catch(reason => setError(reason instanceof Error ? reason.message : String(reason))) }} /></label>{error !== undefined && <p role="alert">偏好保存失败：{error}</p>}</section>
  </article>
}

export const workbenchSettings: UiModule = {
  manifest: () => ({ id: moduleId, dependsOn: [createModuleId('workbench.shell')] }),
  activate(ctx) {
    ctx.contribute(createSlotId('workbench.containers'), {
      id: 'workbench.settings.container', ownerId: moduleId,
      value: { id: containerId, defaultViewId: viewId, rendererIds: { content: rendererId } } satisfies ContainerContribution,
    })
    ctx.contribute(createSlotId('workbench.views'), {
      id: 'workbench.settings.general', key: viewId, ownerId: moduleId,
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

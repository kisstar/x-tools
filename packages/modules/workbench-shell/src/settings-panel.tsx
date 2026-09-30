import { useState } from 'react'
import type { WorkbenchPreferences } from '@xtools/ui-contracts'

export interface SettingsUpdate { readonly scope: 'global' | 'workspace'; readonly workspaceId?: string; readonly clear?: boolean; readonly revision: string }

export function SettingsPanel({ preferences, workspaceId, unavailableRendererId, onUpdate }: { readonly preferences: WorkbenchPreferences; readonly workspaceId: string; readonly unavailableRendererId?: string; readonly onUpdate: (update: SettingsUpdate) => Promise<void> }) {
  const [scope, setScope] = useState<'global' | 'workspace'>('global')
  return <section className="xt-settings">
    <header><span className="xt-eyebrow">PREFERENCES</span><h1>工作台设置</h1><p>调整外观、面板和每个容器使用的渲染器。</p></header>
    <div className="xt-settings-tabs" role="tablist" aria-label="偏好范围"><button role="tab" aria-selected={scope === 'global'} onClick={() => setScope('global')}>全局布局</button><button role="tab" aria-selected={scope === 'workspace'} onClick={() => setScope('workspace')}>当前工作区</button></div>
    {scope === 'global' ? <div className="xt-settings-card"><h2>全局默认</h2><p>所有没有独立覆盖的工作区都会继承这些选择。</p><label>次级导航 renderer<select defaultValue="workbench.default.secondary-navigation"><option>workbench.default.secondary-navigation</option></select></label><label className="xt-setting-row"><span><strong>显示详细信息面板</strong><small>选择工具时在右侧显示辅助信息</small></span><input type="checkbox" defaultChecked /></label></div>
      : <div className="xt-settings-card"><h2>当前工作区</h2><p>仅保存相对全局布局的差异</p>{unavailableRendererId !== undefined && <div className="xt-unavailable-renderer" role="status"><strong>{unavailableRendererId}</strong><span>renderer 当前不可用</span></div>}<button className="xt-secondary-button" onClick={() => onUpdate({ scope: 'workspace', workspaceId, clear: true, revision: preferences.revision })}>恢复跟随全局</button></div>}
  </section>
}

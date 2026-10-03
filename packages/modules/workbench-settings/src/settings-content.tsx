import type { ContentRendererProps } from '@xtools/ui-contracts'
import { createContainerId } from '@xtools/ui-contracts'
import { useState } from 'react'

const containerId = createContainerId('settings')

export function SettingsContent({ viewId: activeViewId, preferencesRevision = '0', actions }: ContentRendererProps) {
  const [scope, setScope] = useState<'global' | 'workspace'>('global')
  const [error, setError] = useState<string>()
  const reportError = (reason: unknown): void => {
    setError(reason instanceof Error ? reason.message : String(reason))
  }
  return (
    <article className="xt-settings" data-view={activeViewId}>
      <header>
        <span className="xt-eyebrow">PREFERENCES</span>
        <h1>工作台设置</h1>
        <p>管理主题、插件、renderer 绑定和面板布局。</p>
      </header>
      <div className="xt-settings-tabs" role="tablist" aria-label="偏好范围">
        <button role="tab" aria-selected={scope === 'global'} onClick={() => setScope('global')}>全局布局</button>
        <button role="tab" aria-selected={scope === 'workspace'} onClick={() => setScope('workspace')}>当前工作区</button>
      </div>
      <section className="xt-settings-card">
        <h2>{scope === 'global' ? '全局默认' : '当前工作区'}</h2>
        <p>{scope === 'global' ? '未设置工作区覆盖时继承这些选择。' : '仅保存相对全局配置的稀疏覆盖。'}</p>
        <label>
          内容区 renderer
          <select
            aria-label="内容区 renderer"
            defaultValue="workbench.settings.content"
            onChange={(event) => {
              setError(undefined)
              void actions.updatePreferences?.({ scope, containerId, regionId: 'content', rendererId: event.target.value }).catch(reportError)
            }}
          >
            <option value="workbench.settings.content">设置专用</option>
            <option value="workbench.default.content">工作台默认</option>
          </select>
        </label>
        <label className="xt-setting-row">
          <span>
            <strong>显示详情面板</strong>
            <small>
              当前 revision：
              {preferencesRevision}
            </small>
          </span>
          <input
            aria-label="显示详情面板"
            type="checkbox"
            defaultChecked
            onChange={(event) => {
              setError(undefined)
              void actions.updatePreferences?.({ scope, containerId, regionId: 'detail', visible: event.target.checked }).catch(reportError)
            }}
          />
        </label>
        <label>
          详情面板宽度
          <input
            aria-label="详情面板宽度"
            type="number"
            min="240"
            max="480"
            defaultValue="320"
            onBlur={(event) => {
              setError(undefined)
              void actions.updatePreferences?.({ scope, containerId, regionId: 'detail', width: Number(event.target.value) }).catch(reportError)
            }}
          />
        </label>
        {error !== undefined && (
          <p role="alert">
            偏好保存失败：
            {error}
          </p>
        )}
      </section>
    </article>
  )
}

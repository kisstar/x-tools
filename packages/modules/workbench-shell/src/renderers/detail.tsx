import type { DetailRendererProps } from '@xtools/ui-contracts'

export function DefaultDetail({ selectionId, actions }: DetailRendererProps) {
  return selectionId === undefined
    ? null
    : (
        <aside className="xt-detail-panel" aria-label="详细信息" data-selection={selectionId}>
          <div className="xt-detail-heading">
            <span>详细信息</span>
            <button aria-label="关闭详细信息" onClick={() => actions.execute('workbench.detail.close')}>×</button>
          </div>
          <div className="xt-detail-icon">{'{}'}</div>
          <h2>{selectionId}</h2>
          <p>本地工具 · 无需上传数据</p>
          <dl>
            <div>
              <dt>运行方式</dt>
              <dd>本地</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>可用</dd>
            </div>
          </dl>
          <button className="xt-primary-button" onClick={() => actions.execute(`tool.open.${selectionId}`)}>打开工具</button>
        </aside>
      )
}

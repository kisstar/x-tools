import type { TopNavigationProps } from '@xtools/ui-contracts'

export const DefaultTopNavigation = (props: TopNavigationProps) => <header className="xt-header" data-container={props.containerId}>
  <div className="xt-brand"><strong>xTools</strong><span className="xt-badge">Beta</span><span className="xt-context">个人工作区</span></div>
  <button className="xt-command-trigger" aria-label="搜索工具或运行命令"><span>⌕</span><span>搜索工具或运行命令</span><kbd>⌘K</kbd></button>
  <div className="xt-header-actions">
    <button className="xt-icon-button" aria-label="切换主题">◐</button>
    <button className="xt-icon-button" aria-label="通知">○</button>
    <span className="xt-avatar" aria-label="当前用户">D</span>
  </div>
</header>

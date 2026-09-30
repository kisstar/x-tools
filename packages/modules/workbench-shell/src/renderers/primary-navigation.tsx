import type { PrimaryNavigationProps } from '@xtools/ui-contracts'
export const DefaultPrimaryNavigation = ({ navigation, actions }: PrimaryNavigationProps) => <nav className="xt-primary-nav" aria-label="主要导航">
  <div className="xt-primary-items">{navigation.roots.map(node => <button className="xt-nav-icon" key={node.id} aria-label={node.title} title={node.title} disabled={!node.availability.available} onClick={() => node.kind === 'item' && node.route && actions.navigate(node.route)}>{node.icon ?? node.title.slice(0, 1)}</button>)}</div>
  <div className="xt-primary-footer"><button className="xt-nav-icon xt-marketplace" aria-label="工具市场" onClick={() => actions.execute('workbench.marketplace.open')}>⊞<span className="xt-notification-dot" /></button></div>
</nav>

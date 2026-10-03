import type { NavigationNode, SecondaryNavigationProps } from '@xtools/ui-contracts'

function Entry({ node, onNavigate }: { node: NavigationNode, onNavigate: (route: string) => void }) {
  return (
    <li>
      <button
        className="xt-subnav-item"
        aria-label={node.title}
        disabled={!node.availability.available}
        title={node.availability.reason}
        onClick={() => node.kind === 'item' && node.route !== undefined && onNavigate(node.route)}
      >
        <span aria-hidden="true">{node.icon ?? '◇'}</span>
        {node.title}
      </button>
      {node.children.length > 0 && (
        <ul>{node.children.map(child => <Entry key={child.id} node={child} onNavigate={onNavigate} />)}</ul>
      )}
    </li>
  )
}
export function DefaultSecondaryNavigation({ navigation, actions }: SecondaryNavigationProps) {
  return (
    <nav className="xt-subnav" aria-label="工作台">
      <div className="xt-subnav-heading">
        <span>工作台</span>
        <button aria-label="收起次级导航">‹</button>
      </div>
      <ul>{navigation.roots.map(node => <Entry key={node.id} node={node} onNavigate={actions.navigate} />)}</ul>
    </nav>
  )
}

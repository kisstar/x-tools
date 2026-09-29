import type { PrimaryNavigationProps } from '@xtools/ui-contracts'
export const DefaultPrimaryNavigation = ({ navigation, actions }: PrimaryNavigationProps) => <nav>{navigation.roots.map(node => <button key={node.id} title={node.title} onClick={() => node.kind === 'item' && node.route && actions.navigate(node.route)}>{node.icon ?? node.title.slice(0, 1)}</button>)}</nav>

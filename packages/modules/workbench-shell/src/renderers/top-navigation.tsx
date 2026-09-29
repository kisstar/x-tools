import type { TopNavigationProps } from '@xtools/ui-contracts'
export const DefaultTopNavigation = ({ navigation, actions }: TopNavigationProps) => <header><strong>xTools</strong><nav>{navigation.roots.map(node => <button key={node.id} onClick={() => node.kind === 'item' && node.route && actions.navigate(node.route)}>{node.title}</button>)}</nav></header>

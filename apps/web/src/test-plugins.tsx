import { createContainerId, createModuleId, createRendererId, createSlotId, createViewId, type NavigationContribution, type SecondaryNavigationProps } from '@xtools/ui-contracts'
import type { UiModule } from '@xtools/web-runtime'
import { workbenchShell } from '@xtools/module-workbench-shell'

export interface ContainerContribution { readonly id: ReturnType<typeof createContainerId>; readonly defaultViewId: ReturnType<typeof createViewId>; readonly secondaryRendererId: ReturnType<typeof createRendererId> }
export interface ViewContribution { readonly id: ReturnType<typeof createViewId>; readonly containerId: ReturnType<typeof createContainerId>; readonly title: string }

const aId = createModuleId('feature.a')
const bId = createModuleId('feature.b')
const cId = createModuleId('feature.c')

const ARenderer = ({ navigation }: SecondaryNavigationProps) => <aside><h2>A 图标导航</h2>{navigation.roots.map(node => <span key={node.id}>{node.title}</span>)}</aside>
const BRenderer = ({ navigation }: SecondaryNavigationProps) => <aside><h2>B 树形导航</h2><ul>{navigation.roots.map(node => <li key={node.id}>{node.title}</li>)}</ul></aside>

const feature = (ownerId: typeof aId, name: 'a' | 'b', component: typeof ARenderer): UiModule => ({
  manifest: () => ({ id: ownerId, dependsOn: [createModuleId('workbench.shell')] }),
  activate(ctx) {
    const containerId = createContainerId(name)
    const viewId = createViewId(`${name}.main`)
    const rendererId = createRendererId(`feature.${name}.secondary-navigation`)
    ctx.registerRenderer({ region: 'secondary-navigation', id: rendererId, major: 1, component })
    ctx.contribute(createSlotId('workbench.containers'), { id: `feature.${name}.container`, ownerId, value: { id: containerId, defaultViewId: viewId, secondaryRendererId: rendererId } satisfies ContainerContribution })
    ctx.contribute(createSlotId('workbench.views'), { id: `feature.${name}.view`, key: viewId, ownerId, value: { id: viewId, containerId, title: `${name.toUpperCase()} 内容` } satisfies ViewContribution })
    ctx.contribute(createSlotId('workbench.navigation'), { id: `feature.${name}.navigation`, ownerId, value: { kind: 'item', id: `${name}.main`, title: `${name.toUpperCase()} 首页`, order: 0, containerId, region: 'secondary-navigation', route: `/${name}/${name}.main`, availability: { available: true } } satisfies NavigationContribution })
  },
  deactivate() {},
})

const featureC: UiModule = {
  manifest: () => ({ id: cId, dependsOn: [] }),
  activate(ctx) {
    ctx.contribute(createSlotId('workbench.navigation'), { id: 'feature.c.recent', ownerId: cId, value: { kind: 'item', id: 'c.recent', title: 'C 最近文件', order: 10, containerId: 'a', region: 'secondary-navigation', route: '/a/a.main', availability: { available: true } } satisfies NavigationContribution })
  },
  deactivate() {},
}

export const modules: readonly UiModule[] = [workbenchShell, feature(aId, 'a', ARenderer), feature(bId, 'b', BRenderer), featureC]

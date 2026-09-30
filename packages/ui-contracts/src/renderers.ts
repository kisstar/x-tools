import type { ReactNode } from 'react'
import type { ContainerId, RendererId, ViewId } from './ids.ts'
import type { NavigationSnapshot } from './navigation.ts'

export type RegionId = 'top-navigation' | 'primary-navigation' | 'secondary-navigation' | 'content' | 'detail'
export type NavigationRegionId = Extract<RegionId, 'top-navigation' | 'primary-navigation' | 'secondary-navigation'>
export interface RegionActions { readonly navigate: (route: string) => void; readonly execute: (commandId: string) => void; readonly updatePreferences?: (input: WorkbenchPreferenceUpdate) => Promise<void> }
export interface WorkbenchPreferenceUpdate { readonly scope: 'global' | 'workspace'; readonly workspaceId?: string; readonly containerId: ContainerId; readonly regionId: RegionId; readonly rendererId?: string; readonly visible?: boolean; readonly width?: number }
export interface NavigationRendererProps { readonly containerId: ContainerId; readonly navigation: NavigationSnapshot; readonly activeId?: string; readonly collapsed: boolean; readonly actions: RegionActions }
export type TopNavigationProps = NavigationRendererProps
export type PrimaryNavigationProps = NavigationRendererProps
export type SecondaryNavigationProps = NavigationRendererProps
export interface ContentRendererProps { readonly containerId: ContainerId; readonly viewId: ViewId; readonly view?: RendererComponent<ContentRendererProps>; readonly preferencesRevision?: string; readonly actions: RegionActions }
export interface DetailRendererProps { readonly containerId: ContainerId; readonly selectionId?: string; readonly actions: RegionActions }
export type RendererComponent<P> = (props: P) => ReactNode
export type RendererDescriptor =
  | { readonly region: 'top-navigation'; readonly id: RendererId; readonly major: 1; readonly component: RendererComponent<TopNavigationProps> }
  | { readonly region: 'primary-navigation'; readonly id: RendererId; readonly major: 1; readonly component: RendererComponent<PrimaryNavigationProps> }
  | { readonly region: 'secondary-navigation'; readonly id: RendererId; readonly major: 1; readonly component: RendererComponent<SecondaryNavigationProps> }
  | { readonly region: 'content'; readonly id: RendererId; readonly major: 1; readonly component: RendererComponent<ContentRendererProps> }
  | { readonly region: 'detail'; readonly id: RendererId; readonly major: 1; readonly component: RendererComponent<DetailRendererProps> }

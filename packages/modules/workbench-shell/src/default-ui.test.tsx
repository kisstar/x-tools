import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createContainerId, createViewId,
  type ContentRendererProps, type DetailRendererProps, type NavigationSnapshot, type PrimaryNavigationProps, type SecondaryNavigationProps, type TopNavigationProps,
} from '@xtools/ui-contracts'
import { DefaultContent } from './renderers/content.tsx'
import { DefaultDetail } from './renderers/detail.tsx'
import { DefaultPrimaryNavigation } from './renderers/primary-navigation.tsx'
import { DefaultSecondaryNavigation } from './renderers/secondary-navigation.tsx'
import { DefaultTopNavigation } from './renderers/top-navigation.tsx'

const navigate = vi.fn()
const actions = { navigate, execute: vi.fn() }
const containerId = createContainerId('home')
const navigation: NavigationSnapshot = {
  roots: [
    { kind: 'item', id: 'home.overview', containerId, region: 'primary-navigation', title: '首页', icon: '⌂', order: 0, route: '/home/home.overview', availability: { available: true }, children: [] },
    { kind: 'item', id: 'home.disabled', containerId, region: 'primary-navigation', title: '不可用', order: 1, route: '/home/home.disabled', availability: { available: false, reason: '模块未安装' }, children: [] },
  ],
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('默认工作台 renderer', () => {
  it('Header 提供品牌、工作区上下文、命令入口和全局动作', () => {
    render(<DefaultTopNavigation {...({ containerId, navigation, collapsed: false, actions } satisfies TopNavigationProps)} />)
    expect(screen.getByText('xTools')).toBeInTheDocument()
    expect(screen.getByText('个人工作区')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /搜索工具或运行命令/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '切换主题' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '通知' })).toBeInTheDocument()
  })

  it('NavBar 与 SubNav 使用结构化导航并执行真实 navigate action', () => {
    const props = { containerId, navigation, collapsed: false, actions }
    const { unmount } = render(<DefaultPrimaryNavigation {...(props satisfies PrimaryNavigationProps)} />)
    fireEvent.click(screen.getByRole('button', { name: '首页' }))
    expect(navigate).toHaveBeenCalledWith('/home/home.overview')
    expect(screen.getByRole('button', { name: /工具市场/ })).toBeInTheDocument()
    unmount()
    render(<DefaultSecondaryNavigation {...(props satisfies SecondaryNavigationProps)} />)
    expect(screen.getByText('工作台')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '不可用' })).toBeDisabled()
  })

  it('Content 与 Detail 呈现完整默认内容而不是空占位', () => {
    const view = ({ viewId }: ContentRendererProps) => <article data-view={viewId}><h1>你的本地工具工作台</h1><p>最近使用</p></article>
    const { unmount } = render(<DefaultContent {...({ containerId, viewId: createViewId('home.overview'), view, actions } satisfies ContentRendererProps)} />)
    expect(screen.getByRole('heading', { name: '你的本地工具工作台' })).toBeInTheDocument()
    expect(screen.getByText('最近使用')).toBeInTheDocument()
    unmount()
    render(<DefaultDetail {...({ containerId, selectionId: 'json-formatter', actions } satisfies DetailRendererProps)} />)
    expect(screen.getByRole('complementary', { name: '详细信息' })).toBeInTheDocument()
    expect(screen.getByText('json-formatter')).toBeInTheDocument()
  })
})

# xTools 架构设计文档

> 版本: 0.1.0-alpha | 最后更新: 2026-05-16

## 1. 项目概览

### 1.1 愿景

xTools 是一个跨平台智能工具平台，灵感来源于 [uTools](https://www.u-tools.cn/)，旨在打造一个模块化、AI优先、插件驱动的工作空间，可运行在 Web、Tauri 2 和 Electron 上。用户可以按需安装所需模块，自定义 UI 的方方面面，并通过插件系统扩展平台功能。

### 1.2 目标

- **跨平台**: 通过统一代码库在 Web（浏览器）、Tauri 2 和 Electron 上无缝运行
- **模块化**: 微内核架构 — 功能以独立模块形式存在，可按需安装/卸载
- **AI优先**: UI 和架构设计将 AI 集成作为核心关注点，而非事后考虑
- **可配置**: 千人千面个性化 — 布局、主题、语言、导航均可自定义
- **框架无关核心**: 业务逻辑通过清晰的架构边界与 UI 框架解耦
- **可扩展**: 插件系统 + Module Federation 支持第三方和内部扩展
- **高性能**: 桌面客户端离线包，Web 端按需加载，通过 Vite Task 实现构建缓存

### 1.3 目标平台

| 平台 | 运行时 | 打包方式 |
|------|--------|---------|
| Web | 现代浏览器 (Chrome 90+, Firefox 91+, Safari 15+) | SPA / PWA |
| Tauri 2 | WebView2 (Windows), WebKit (macOS/Linux) | 原生二进制 |
| Electron | Chromium | 安装包 |

---

## 2. 架构原则

### 2.1 整洁架构（六边形 / 端口与适配器）

```
┌─────────────────────────────────────────────────────────┐
│                      表现层                              │
│         (React 组件、Hooks、布局)                         │
├─────────────────────────────────────────────────────────┤
│                      应用层                              │
│      (用例、编排、命令/查询)                               │
├─────────────────────────────────────────────────────────┤
│                      领域层                              │
│    (实体、值对象、领域服务、端口)                           │
├─────────────────────────────────────────────────────────┤
│                    基础设施层                             │
│    (适配器: API、存储、平台桥接、插件)                      │
└─────────────────────────────────────────────────────────┘
```

**核心规则:**

- 依赖方向向内 — 外层依赖内层，绝不反向
- 领域层零框架依赖
- 所有外部关注点（存储、网络、平台 API）通过端口（接口）访问
- 具体实现（适配器）在组合根注入

### 2.2 核心设计原则

| 原则 | 应用 |
|------|------|
| **依赖倒置** | 所有模块依赖抽象接口，而非具体实现 |
| **接口隔离** | 小而聚焦的接口 — 没有全能接口 |
| **开闭原则** | 通过插件和适配器扩展，而非修改核心 |
| **单一职责** | 每个包/模块只负责一项能力 |
| **组合优于继承** | 优先使用函数组合、Hooks 和依赖注入，而非类继承 |

### 2.3 反耦合策略

为确保项目能适应技术演进:

```
┌────────────────────────────────────┐
│          业务逻辑                  │  ← 纯 TypeScript，无框架引入
├────────────────────────────────────┤
│       适配器 / 端口边界            │  ← 接口契约 (TypeScript 接口)
├────────────────────────────────────┤
│        框架实现                    │  ← React hooks, Zustand stores, TanStack Query
└────────────────────────────────────┘
```

- **状态管理**: 抽象 `StatePort<T>` 接口 → Zustand 适配器（可替换为 Jotai、Redux 等）
- **路由**: 抽象 `RouterPort` 接口 → TanStack Router 适配器
- **数据获取**: 抽象 `QueryPort` 接口 → TanStack Query 适配器
- **UI 组件**: 无头行为 (Radix/Ark) + Tailwind 样式（可独立替换）
- **平台 API**: `BridgePort` 接口 → Tauri/Electron/Web 适配器

---

## 3. 技术栈

### 3.1 核心技术栈

| 类别 | 选择 | 理由 | 退出策略 |
|------|------|------|---------|
| **工具链** | Vite+ (VoidZero) | 统一的 dev/build/test/lint/fmt + 带缓存的 monorepo 任务运行器；MIT 协议 | 回退到原始 Vite 8 + Vitest + Oxlint 分别使用 |
| **语言** | TypeScript (严格模式) | 类型安全、开发体验、生态系统 | 不适用（基础设施） |
| **UI 框架** | React 19+ | 生态系统、并发特性、Hooks 模型 | 领域/应用层与框架无关 |
| **样式** | Tailwind CSS 4 | 原子化、设计令牌集成、摇树优化 | 令牌是 CSS 自定义属性；Tailwind 是构建时关注点 |
| **组件基础** | Radix UI / Ark UI (无头) | 可访问、无样式、可组合 | 无头库是薄封装；替换是局部的 |
| **路由** | TanStack Router | 类型安全、基于文件、Loader 模式 | 位于 `RouterPort` 接口后 |
| **服务端状态** | TanStack Query | 缓存、去重、后台刷新 | 位于 `QueryPort` 接口后 |
| **客户端状态** | Zustand | 极简 API、零样板、中间件支持 | 位于 `StatePort` 接口后 |
| **国际化** | i18next + react-i18next | 命名空间拆分、懒加载、复数化 | 位于 `I18nPort` 接口后 |
| **桌面端（主要）** | Tauri 2 | 小体积、Rust 后端、安全模型 | 位于 `BridgePort` 接口后 |
| **桌面端（次要）** | Electron | 成熟生态、企业兼容 | 位于 `BridgePort` 接口后 |
| **模块加载** | Module Federation (Vite 插件) | 动态远程模块、共享依赖 | 插件注册表抽象了加载机制 |
| **包管理器** | pnpm (由 Vite+ 管理) | 高效磁盘利用、严格依赖解析 | Vite+ 可封装任何包管理器 |

### 3.2 辅助库（按需使用）

| 需求 | 库 | 备注 |
|------|-----|------|
| 表格 | TanStack Table | 无头、虚拟化 |
| 虚拟列表 | TanStack Virtual | 大列表渲染 |
| 表单 | TanStack Form / React Hook Form | 按模块评估 |
| 拖拽 | @dnd-kit | 布局自定义 |
| 可调面板 | react-resizable-panels | 分割器布局 |
| 图标 | Lucide React | 可摇树、风格一致 |
| 日期/时间 | date-fns | 函数式、可摇树 |
| 动画 | Framer Motion | 布局动画、手势 |

---

## 4. 项目结构

### 4.1 根目录

```
xTools/
├── .editorconfig                # 编辑器格式规则
├── .gitignore                   # Git 忽略规则
├── .nvmrc                       # Node.js 版本约束
├── .vscode/                     # VS Code 工作区设置
│   ├── extensions.json          # 推荐扩展
│   ├── settings.json            # 工作区设置（保存时格式化等）
│   └── ai.json                  # AI 助手配置
├── ARCHITECTURE.md              # 本文档
├── CLAUDE.md                    # AI Agent 指令
├── DESIGN.md                    # 设计系统规范
├── README.md                    # 项目概览、安装、贡献指南
├── renderer/                    # 前端 monorepo（所有 UI 代码）
├── electron/                    # Electron 主进程
├── tauri/                       # Tauri 2 后端 (Rust)
└── protocol/                    # 共享通信协议定义
```

### 4.2 前端 Monorepo (renderer/)

```
renderer/
├── vite.config.ts               # Vite+ 统一配置 (dev, build, test, lint, fmt, task)
├── package.json                 # 根 package 含 workspaces
├── pnpm-workspace.yaml          # pnpm 工作区定义
├── tsconfig.json                # 基础 TypeScript 配置
├── README.md                    # 前端开发指南
│
├── packages/                    # 共享库
│   ├── design-tokens/           # @x-tools/design-tokens — CSS 自定义属性、Tailwind 预设
│   ├── ui/                      # @x-tools/ui — 无头 + Tailwind 组件库
│   ├── icons/                   # @x-tools/icons — 图标集封装
│   ├── utils/                   # @x-tools/utils — 纯工具函数
│   ├── types/                   # @x-tools/types — 共享 TypeScript 接口和类型
│   ├── constants/               # @x-tools/constants — 共享常量和枚举
│   ├── hooks/                   # @x-tools/hooks — 可复用 React Hooks（非业务）
│   └── i18n/                    # @x-tools/i18n — i18n 核心 + 语言包加载工具
│
├── system/                      # 核心架构包
│   ├── kernel/                  # @x-tools/kernel — 微内核: 生命周期、DI 容器、事件总线
│   ├── plugin-core/             # @x-tools/plugin-core — 插件接口、注册表、加载器
│   ├── module-federation/       # @x-tools/module-federation — MF 运行时封装 + 清单
│   ├── bridge/                  # @x-tools/bridge — 平台抽象（端口 + 适配器选择）
│   ├── store/                   # @x-tools/store — 状态管理端口 + Zustand 适配器
│   ├── router/                  # @x-tools/router — 路由端口 + TanStack Router 适配器
│   ├── query/                   # @x-tools/query — 数据获取端口 + TanStack Query 适配器
│   ├── event-bus/               # @x-tools/event-bus — 跨模块发布/订阅通信
│   └── config/                  # @x-tools/config — 用户配置持久化 + 默认值
│
├── platform/                    # 平台特定适配器
│   ├── platform-web/            # @x-tools/platform-web — Web/浏览器桥接适配器
│   ├── platform-tauri/          # @x-tools/platform-tauri — Tauri 2 桥接适配器
│   └── platform-electron/       # @x-tools/platform-electron — Electron 桥接适配器
│
├── modules/                     # 业务功能模块（MF 远程模块）
│   ├── switch-host/             # @x-tools/module-switch-host — Host 文件切换模块
│   ├── tool-store/              # @x-tools/module-tool-store — 工具市场 / 应用商店
│   └── ...                      # 未来模块安装于此
│
├── plugins/                     # 扩展插件
│   ├── plugin-theme/            # @x-tools/plugin-theme — 主题切换插件
│   ├── plugin-locale/           # @x-tools/plugin-locale — 语言切换插件
│   └── ...                      # 社区 / 用户插件
│
├── apps/                        # 应用壳
│   └── main/                    # @x-tools/app-main — 主宿主应用
│       ├── components/          # 应用级组件
│       ├── layouts/             # Shell 布局 (Header, NavBar, SubNav, Content, Detail)
│       ├── pages/               # 路由页面
│       ├── assets/              # 静态资源（字体、图片）
│       ├── styles/              # 全局样式、Tailwind 入口
│       ├── locales/             # 应用级 i18n 命名空间
│       ├── store/               # 应用级状态切片
│       └── bootstrap.ts         # 组合根 — DI 装配
│
└── host/                        # 宿主环境适配器
    ├── host-browser/            # @x-tools/host-browser — 浏览器特定运行时设置
    ├── host-tauri/              # @x-tools/host-tauri — Tauri webview 运行时设置
    └── host-electron/           # @x-tools/host-electron — Electron 渲染进程运行时设置
```

### 4.3 协议包 (protocol/)

```
protocol/
├── package.json                 # @x-tools/protocol
├── tsconfig.json
└── src/
    ├── commands/                 # 命令定义（渲染进程 → 主进程）
    │   ├── file-system.ts       # 文件系统操作
    │   ├── window.ts            # 窗口管理
    │   ├── notification.ts      # 系统通知
    │   ├── storage.ts           # 持久化存储
    │   └── update.ts            # 版本检查与更新
    ├── events/                   # 事件定义（主进程 → 渲染进程）
    │   ├── lifecycle.ts         # 应用生命周期事件
    │   ├── file-change.ts       # 文件系统监听事件
    │   └── update-available.ts  # 版本更新通知
    ├── types/                    # 共享数据类型
    │   ├── file.ts
    │   ├── config.ts
    │   └── module.ts
    └── index.ts                 # 公共 API 导出
```

### 4.4 Electron 主进程 (electron/)

```
electron/
├── package.json
├── tsconfig.json
└── src/
    ├── main.ts                  # 入口文件
    ├── services/                # 后端服务（每个可独立打包）
    │   ├── file-service/        # 文件系统服务
    │   ├── storage-service/     # 本地存储服务
    │   ├── update-service/      # 自动更新服务
    │   └── server-service/      # 可选 HTTP/WS 服务器（供 Web 客户端使用）
    ├── ipc/                     # IPC 处理器注册
    └── window/                  # 窗口管理
```

### 4.5 Tauri 后端 (tauri/)

```
tauri/
├── Cargo.toml
├── tauri.conf.json
└── src/
    ├── main.rs                  # 入口文件
    ├── commands/                # Tauri 命令处理器
    ├── services/                # 后端服务 (Rust)
    │   ├── file_service.rs
    │   ├── storage_service.rs
    │   ├── update_service.rs
    │   └── server_service.rs   # 可选 HTTP/WS 服务器
    └── state.rs                 # 应用状态管理
```

---

## 5. 核心架构设计

### 5.1 微内核架构

```
┌──────────────────────────────────────────────────┐
│                   宿主应用                         │
│                  (apps/main)                       │
├──────────────────────────────────────────────────┤
│                     内核                           │
│  ┌────────────┬───────────┬────────────────────┐ │
│  │ DI 容器    │ 事件总线   │ 生命周期管理器      │ │
│  └────────────┴───────────┴────────────────────┘ │
├──────────────────────────────────────────────────┤
│                  插件注册表                        │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐           │
│  │插件  │ │插件  │ │插件  │ │插件  │  ...        │
│  │主题  │ │i18n  │ │布局  │ │商店  │            │
│  └──────┘ └──────┘ └──────┘ └──────┘           │
├──────────────────────────────────────────────────┤
│           Module Federation 宿主                  │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐  │
│  │   模块:    │ │   模块:    │ │   模块:    │  │
│  │Switch Host │ │  工具商店  │ │  (未来)    │  │
│  └────────────┘ └────────────┘ └────────────┘  │
└──────────────────────────────────────────────────┘
```

#### 内核职责

- **DI 容器**: 注册和解析依赖（接口 → 实现）
- **事件总线**: 模块间通信，无需直接耦合
- **生命周期管理器**: 模块/插件的挂载、卸载、错误边界
- **配置管理器**: 读写用户偏好设置，带默认值回退
- **权限管理器**: 模块能力声明和访问控制

#### 插件接口

```typescript
// system/plugin-core/src/types.ts

interface PluginManifest {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly description: string
  readonly dependencies?: readonly string[]
  readonly permissions?: readonly PluginPermission[]
  readonly requiresRestart?: boolean
}

interface PluginContext {
  readonly kernel: KernelAPI
  readonly config: ConfigAPI
  readonly eventBus: EventBusAPI
  readonly bridge: BridgeAPI
  readonly i18n: I18nAPI
}

interface Plugin {
  readonly manifest: PluginManifest
  activate(context: PluginContext): Promise<void> | void
  deactivate?(): Promise<void> | void
}
```

### 5.2 Module Federation + 插件注册（混合模式）

**Module Federation** 负责加载机制 — 在运行时获取远程模块包。

**插件注册表** 负责生命周期 — 激活、停用、依赖解析、权限检查。

```
用户从工具商店安装模块 "Switch Host"
    │
    ▼
插件注册表接收安装请求
    │
    ├─── 解析依赖
    ├─── 检查权限
    ├─── 下载模块清单
    │
    ▼
Module Federation 加载远程入口
    │
    ├─── 共享依赖已解析 (React, @x-tools/ui, 等)
    ├─── 模块代码加载到沙箱
    │
    ▼
插件注册表调用 module.activate(context)
    │
    ├─── 模块注册路由
    ├─── 模块注册导航项
    ├─── 模块注册事件处理器
    │
    ▼
模块已激活 — 用户可导航至此
```

#### 模块契约

```typescript
// system/module-federation/src/types.ts

interface ModuleManifest extends PluginManifest {
  readonly entry: string              // 远程入口 URL 或本地路径
  readonly exposedComponents: readonly ExposedComponent[]
  readonly navConfig?: NavConfig      // 此模块在导航中的呈现方式
  readonly subNavConfig?: SubNavConfig // 模块内的子导航
}

interface ExposedComponent {
  readonly name: string
  readonly path: string              // MF 配置中的暴露路径
  readonly lazy: boolean             // 是否懒加载
}

interface ModuleExports {
  readonly plugin: Plugin            // 插件生命周期钩子
  readonly routes?: RouteDefinition[]
  readonly navItems?: NavItemDefinition[]
}
```

### 5.3 平台桥接层

桥接层是实现跨平台运行的核心抽象:

```
┌─────────────────────────────────────────────┐
│              应用代码                        │
│    import { bridge } from '@x-tools/bridge'  │
│    bridge.fs.readFile(path)                  │
├─────────────────────────────────────────────┤
│           桥接端口（接口）                    │
│    FileSystemPort, WindowPort, 等            │
├─────────────────┬──────────┬────────────────┤
│  Web 适配器     │  Tauri   │   Electron     │
│  (fetch/WS 到  │  适配器  │   适配器       │
│   本地服务器)   │  (IPC)   │   (IPC)        │
└─────────────────┴──────────┴────────────────┘
```

#### 桥接端口定义

```typescript
// system/bridge/src/ports/file-system.port.ts

interface FileSystemPort {
  readFile(path: string, encoding?: string): Promise<Uint8Array | string>
  writeFile(path: string, data: Uint8Array | string): Promise<void>
  readDir(path: string): Promise<readonly DirEntry[]>
  exists(path: string): Promise<boolean>
  mkdir(path: string, options?: MkdirOptions): Promise<void>
  remove(path: string, options?: RemoveOptions): Promise<void>
  watch(path: string, callback: WatchCallback): Promise<Unsubscribe>
}

// system/bridge/src/ports/window.port.ts

interface WindowPort {
  minimize(): Promise<void>
  maximize(): Promise<void>
  close(): Promise<void>
  setTitle(title: string): Promise<void>
  setSize(width: number, height: number): Promise<void>
  onClose(callback: () => void): Unsubscribe
}

// system/bridge/src/ports/storage.port.ts

interface StoragePort {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
  clear(): Promise<void>
}

// system/bridge/src/ports/update.port.ts

interface UpdatePort {
  checkForUpdate(): Promise<UpdateInfo | null>
  downloadUpdate(): Promise<void>
  installUpdate(): Promise<void>
  onUpdateAvailable(callback: (info: UpdateInfo) => void): Unsubscribe
}

// system/bridge/src/ports/notification.port.ts

interface NotificationPort {
  show(options: NotificationOptions): Promise<void>
  requestPermission(): Promise<boolean>
}
```

#### 适配器选择（运行时）

```typescript
// system/bridge/src/create-bridge.ts

type PlatformType = 'web' | 'tauri' | 'electron'

function detectPlatform(): PlatformType {
  if (window.__TAURI_INTERNALS__) return 'tauri'
  if (window.electronAPI) return 'electron'
  return 'web'
}

function createBridge(platform?: PlatformType): Bridge {
  const detected = platform ?? detectPlatform()
  // 适配器懒加载以避免打包未使用的平台代码
  switch (detected) {
    case 'tauri': return import('@x-tools/platform-tauri').then(m => m.createAdapter())
    case 'electron': return import('@x-tools/platform-electron').then(m => m.createAdapter())
    case 'web': return import('@x-tools/platform-web').then(m => m.createAdapter())
  }
}
```

### 5.4 通信协议

`@x-tools/protocol` 包定义了渲染进程与主进程之间的类型化 RPC 风格协议:

```typescript
// protocol/src/types.ts

interface Command<TPayload, TResponse> {
  readonly channel: string
  readonly payload: TPayload
  // 响应的幻影类型
  readonly _response?: TResponse
}

interface Event<TPayload> {
  readonly channel: string
  readonly payload: TPayload
}

// protocol/src/commands/file-system.ts

type ReadFileCommand = Command<{ path: string; encoding?: string }, Uint8Array | string>
type WriteFileCommand = Command<{ path: string; data: string | Uint8Array }, void>
type ReadDirCommand = Command<{ path: string }, DirEntry[]>
```

**传输适配器:**

| 平台 | 传输方式 | 备注 |
|------|---------|------|
| Tauri 2 | `@tauri-apps/api` invoke/listen | 原生 IPC |
| Electron | `ipcRenderer` / `ipcMain` | 上下文桥接 |
| Web (本地) | WebSocket / HTTP 到本地服务器 | 桌面后端暴露 WS 服务器 |
| Web (远程) | HTTP/REST 到云端后端 | 未来的云部署 |

### 5.5 桌面后端解耦服务架构

```
┌───────────────────────────────────────────────────┐
│                 桌面后端                            │
│    (作为 Tauri/Electron 主进程运行，或                │
│     作为独立 Node.js 服务器供 Web 使用)              │
├───────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │   文件   │ │  存储    │ │      更新        │ │
│  │  服务    │ │  服务    │ │     服务         │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │  窗口    │ │  服务器  │ │      通知        │ │
│  │  服务    │ │  服务    │ │     服务         │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
└───────────────────────────────────────────────────┘
```

每个服务都是独立的包，不依赖 Tauri/Electron 特定 API。运行时包装器（Tauri 或 Electron）导入服务并通过相应的 IPC 机制暴露:

- **Tauri**: 通过 tauri::command 从 Rust 调用服务，或封装为 Tauri 插件
- **Electron**: 服务在 Node.js 主进程中运行，通过 ipcMain.handle 暴露
- **Web 服务器**: 服务在独立 Node.js 进程中运行，通过 HTTP/WS 暴露

---

## 6. 布局系统

### 6.1 整体布局结构

```
┌───────────────────────────────────────────────────────┐
│                   头部 (64px, 固定)                    │
├──────┬─────┬─────────────────────────────┬────────────┤
│      │     │                             │            │
│ 导航 │ 子  │       内容区域              │   详情     │
│ 栏   │ 导  │ ┌─────────────────────────┐ │   面板     │
│      │ 航  │ │     工具栏 / 路径       │ │            │
│ 64px │200px│ ├─────────────────────────┤ │  (可选)    │
│      │(可选)│ │                         │ │            │
│      │     │ │    主要内容             │ │  选中时    │
│      │     │ │    (模块视图)           │ │  显示      │
│      │     │ │                         │ │            │
│      │     │ │                         │ │            │
│      │     │ └─────────────────────────┘ │            │
├──────┴─────┴─────────────────────────────┴────────────┤
│                    底部 (可选)                         │
└───────────────────────────────────────────────────────┘
```

### 6.2 布局的设计令牌映射

严格遵循 DESIGN.md:

| 元素 | 令牌 | 值 |
|------|------|-----|
| 头部高度 | `{components.nav-bar.height}` | 64px |
| 头部背景 | `{colors.canvas}` | #ffffff |
| 头部文字 | `{colors.ink}` | #171717 |
| 头部内边距 | `{spacing.sm} {spacing.lg}` | 12px 24px |
| 导航栏宽度 | 自定义（不在 DESIGN.md 中） | 64px |
| 导航栏背景 | `{colors.canvas}` | #ffffff |
| 导航栏右边框 | `{colors.hairline}` | 1px solid #ebebeb |
| 子导航宽度 | 自定义 | 200px |
| 子导航背景 | `{colors.canvas-soft}` | #fafafa |
| 子导航右边框 | `{colors.hairline}` | 1px solid #ebebeb |
| 内容区背景 | `{colors.canvas-soft}` | #fafafa |
| 详情面板背景 | `{colors.canvas}` | #ffffff |
| 详情面板左边框 | `{colors.hairline}` | 1px solid #ebebeb |
| 面板分隔线 | `{colors.hairline}` | #ebebeb |
| 活跃导航指示器 | `{colors.primary}` | #171717 (左侧边条) |
| 导航图标文字 | `{typography.caption}` | 12px / 400 |
| 子导航项文字 | `{typography.body-sm}` | 14px / 400 |

### 6.3 可调整大小和可配置面板

灵感来源于 [LeetCode 编辑器布局](https://leetcode.cn/problems/two-sum/description/):

- 所有面板通过拖拽手柄调整大小（使用 `react-resizable-panels`）
- 面板可见性通过配置切换
- 面板大小持久化到用户偏好
- 布局预设（如 "宽内容"、"带详情"、"极简"）可在设置中选择
- 面板可通过键盘快捷键折叠/展开

### 6.4 布局配置模式

```typescript
// system/config/src/schemas/layout.ts

interface LayoutConfig {
  readonly header: PanelConfig
  readonly navBar: PanelConfig & { readonly width: number }
  readonly subNav: PanelConfig & { readonly width: number; readonly visible: boolean }
  readonly content: PanelConfig
  readonly detailPanel: PanelConfig & { readonly width: number; readonly visible: boolean }
  readonly footer: PanelConfig & { readonly visible: boolean }
  readonly preset?: LayoutPreset
}

interface PanelConfig {
  readonly minSize?: number
  readonly maxSize?: number
  readonly defaultSize?: number
  readonly collapsible?: boolean
  readonly collapsed?: boolean
}

type LayoutPreset = 'default' | 'wide' | 'compact' | 'focus'
```

### 6.5 导航系统

**导航栏（左侧，64px）:**
- 顶部区域: 用户置顶的常用工具（通过右键菜单配置）
- 底部区域: 固定的工具商店入口
- 图标下方带 `{typography.caption}` 标签
- 活跃状态使用 `{colors.primary}` 左侧边条指示（参考: DESIGN.md `ex-app-shell-row`）
- 背景: `{colors.canvas}`，右侧 `{colors.hairline}` 边框

**子导航（200px，可选）:**
- 根据当前模块的 `subNavConfig` 显示
- 在工具商店中: 显示工具分类
- 在模块中: 显示模块特定导航
- 可折叠为仅图标模式
- 文字: 项目使用 `{typography.body-sm}`，分组标题使用 `{typography.caption-mono}`
- 背景: `{colors.canvas-soft}`

**头部（64px）:**
- 左侧: 应用 Logo + 面包屑 / 当前路径
- 中部: 搜索 / 命令面板触发器（样式为 `{components.nav-cta-ask-ai}`）
- 右侧: 用户头像、设置图标（`{components.icon-button-circular}`）、通知铃铛
- 字体: 导航 CTA 使用 `{typography.body-sm-strong}`
- 层级: Level 1（内嵌 hairline 底部边框）

---

## 7. 设计令牌系统

### 7.1 令牌架构

严格遵循 DESIGN.md（Vercel 风格），令牌组织如下:

```
┌───────────────────────────────┐
│    语义令牌 (消费层)          │  ← 如 --color-text-primary, --color-bg-surface
├───────────────────────────────┤
│    引用令牌 (别名层)          │  ← 如 --color-ink, --color-canvas
├───────────────────────────────┤
│    原始令牌 (原始值)          │  ← 如 --gray-1000: #171717
└───────────────────────────────┘
```

### 7.2 CSS 自定义属性 (packages/design-tokens)

```css
/* 原始值 — 来自 DESIGN.md 调色板 */
:root {
  --dt-color-gray-1000: #171717;
  --dt-color-gray-900: #4d4d4d;
  --dt-color-gray-600: #888888;
  --dt-color-gray-200: #ebebeb;
  --dt-color-gray-150: #a1a1a1;
  --dt-color-gray-50: #fafafa;
  --dt-color-gray-25: #f5f5f5;
  --dt-color-white: #ffffff;

  --dt-color-blue-600: #0070f3;
  --dt-color-blue-700: #0761d1;
  --dt-color-blue-100: #d3e5ff;
  --dt-color-red-600: #ee0000;
  --dt-color-red-100: #f7d4d6;
  --dt-color-red-700: #c50000;
  --dt-color-amber-500: #f5a623;
  --dt-color-amber-100: #ffefcf;
  --dt-color-amber-700: #ab570a;
  --dt-color-violet-600: #7928ca;
  --dt-color-violet-100: #d8ccf1;
  --dt-color-violet-800: #4c2889;
  --dt-color-cyan-400: #50e3c2;
  --dt-color-cyan-200: #aaffec;
  --dt-color-cyan-600: #29bc9b;
  --dt-color-pink-500: #ff0080;
  --dt-color-pink-600: #eb367f;

  /* 渐变色阶 */
  --dt-gradient-develop-start: #007cf0;
  --dt-gradient-develop-end: #00dfd8;
  --dt-gradient-preview-start: #7928ca;
  --dt-gradient-preview-end: #ff0080;
  --dt-gradient-ship-start: #ff4d4d;
  --dt-gradient-ship-end: #f9cb28;

  /* 间距 (4px 基准) */
  --dt-space-xxs: 4px;
  --dt-space-xs: 8px;
  --dt-space-sm: 12px;
  --dt-space-md: 16px;
  --dt-space-lg: 24px;
  --dt-space-xl: 32px;
  --dt-space-2xl: 40px;
  --dt-space-3xl: 48px;
  --dt-space-4xl: 64px;
  --dt-space-5xl: 96px;
  --dt-space-6xl: 128px;
  --dt-space-section: 192px;

  /* 圆角 */
  --dt-radius-none: 0px;
  --dt-radius-xs: 4px;
  --dt-radius-sm: 6px;
  --dt-radius-md: 8px;
  --dt-radius-lg: 12px;
  --dt-radius-xl: 16px;
  --dt-radius-pill-sm: 64px;
  --dt-radius-pill: 100px;
  --dt-radius-full: 9999px;

  /* 字体 */
  --dt-font-sans: Geist, Inter, system-ui, -apple-system, sans-serif;
  --dt-font-mono: Geist Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;

  /* 层级阴影（叠加式） */
  --dt-shadow-level-1: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
  --dt-shadow-level-2: 0px 1px 1px rgba(0, 0, 0, 0.02), 0px 2px 2px rgba(0, 0, 0, 0.04), inset 0 0 0 1px rgba(0, 0, 0, 0.08);
  --dt-shadow-level-3: 0px 2px 2px rgba(0, 0, 0, 0.04), 0px 8px 8px -8px rgba(0, 0, 0, 0.04), inset 0 0 0 1px rgba(0, 0, 0, 0.08);
  --dt-shadow-level-4: 0px 2px 2px rgba(0, 0, 0, 0.04), 0px 8px 16px -4px rgba(0, 0, 0, 0.04), inset 0 0 0 1px rgba(0, 0, 0, 0.08);
  --dt-shadow-level-5: 0px 1px 1px rgba(0, 0, 0, 0.02), 0px 8px 16px -4px rgba(0, 0, 0, 0.04), 0px 24px 32px -8px rgba(0, 0, 0, 0.06), inset 0 0 0 1px rgba(0, 0, 0, 0.08);
}

/* 语义令牌（主题感知） */
:root,
[data-theme="light"] {
  --color-primary: var(--dt-color-gray-1000);
  --color-on-primary: var(--dt-color-white);
  --color-ink: var(--dt-color-gray-1000);
  --color-body: var(--dt-color-gray-900);
  --color-mute: var(--dt-color-gray-600);
  --color-hairline: var(--dt-color-gray-200);
  --color-hairline-strong: var(--dt-color-gray-150);
  --color-canvas: var(--dt-color-white);
  --color-canvas-soft: var(--dt-color-gray-50);
  --color-canvas-soft-2: var(--dt-color-gray-25);
  --color-link: var(--dt-color-blue-600);
  --color-link-deep: var(--dt-color-blue-700);
  --color-success: var(--dt-color-blue-600);
  --color-error: var(--dt-color-red-600);
  --color-error-soft: var(--dt-color-red-100);
  --color-warning: var(--dt-color-amber-500);
  --color-warning-soft: var(--dt-color-amber-100);
  --color-selection-bg: var(--dt-color-gray-1000);
  --color-selection-fg: #f2f2f2;
}

[data-theme="dark"] {
  --color-primary: var(--dt-color-white);
  --color-on-primary: var(--dt-color-gray-1000);
  --color-ink: #ededed;
  --color-body: #a1a1a1;
  --color-mute: #666666;
  --color-hairline: #2e2e2e;
  --color-hairline-strong: #454545;
  --color-canvas: #0a0a0a;
  --color-canvas-soft: #111111;
  --color-canvas-soft-2: #1a1a1a;
  --color-link: #3291ff;
  --color-link-deep: #5ba4f5;
  --color-success: #3291ff;
  --color-error: #f44;
  --color-error-soft: #3d1418;
  --color-warning: #f5a623;
  --color-warning-soft: #3d2e0a;
  --color-selection-bg: var(--dt-color-white);
  --color-selection-fg: #171717;
}
```

### 7.3 Tailwind CSS 集成

```typescript
// packages/design-tokens/tailwind-preset.ts

export const xToolsPreset = {
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        'on-primary': 'var(--color-on-primary)',
        ink: 'var(--color-ink)',
        body: 'var(--color-body)',
        mute: 'var(--color-mute)',
        hairline: 'var(--color-hairline)',
        'hairline-strong': 'var(--color-hairline-strong)',
        canvas: 'var(--color-canvas)',
        'canvas-soft': 'var(--color-canvas-soft)',
        'canvas-soft-2': 'var(--color-canvas-soft-2)',
        link: 'var(--color-link)',
        'link-deep': 'var(--color-link-deep)',
        success: 'var(--color-success)',
        error: 'var(--color-error)',
        'error-soft': 'var(--color-error-soft)',
        warning: 'var(--color-warning)',
        'warning-soft': 'var(--color-warning-soft)',
      },
      fontFamily: {
        sans: 'var(--dt-font-sans)',
        mono: 'var(--dt-font-mono)',
      },
      borderRadius: {
        xs: 'var(--dt-radius-xs)',
        sm: 'var(--dt-radius-sm)',
        md: 'var(--dt-radius-md)',
        lg: 'var(--dt-radius-lg)',
        xl: 'var(--dt-radius-xl)',
        'pill-sm': 'var(--dt-radius-pill-sm)',
        pill: 'var(--dt-radius-pill)',
      },
      spacing: {
        xxs: 'var(--dt-space-xxs)',
        xs: 'var(--dt-space-xs)',
        sm: 'var(--dt-space-sm)',
        md: 'var(--dt-space-md)',
        lg: 'var(--dt-space-lg)',
        xl: 'var(--dt-space-xl)',
        '2xl': 'var(--dt-space-2xl)',
        '3xl': 'var(--dt-space-3xl)',
        '4xl': 'var(--dt-space-4xl)',
        '5xl': 'var(--dt-space-5xl)',
        '6xl': 'var(--dt-space-6xl)',
      },
      boxShadow: {
        'level-1': 'var(--dt-shadow-level-1)',
        'level-2': 'var(--dt-shadow-level-2)',
        'level-3': 'var(--dt-shadow-level-3)',
        'level-4': 'var(--dt-shadow-level-4)',
        'level-5': 'var(--dt-shadow-level-5)',
      },
    },
  },
}
```

---

## 8. 国际化 (i18n)

### 8.1 策略

- **按模块命名空间**: 每个模块拥有自己的 i18n 命名空间，懒加载
- **共享命名空间**: 通用字符串（按钮、标签、错误）在 `@x-tools/i18n` 中
- **语言检测**: 浏览器语言 → 用户偏好 → 回退 (en)
- **持久化**: 用户语言选择通过 `StoragePort` 存储
- **类型安全键**: 从 JSON 语言文件自动生成类型

### 8.2 目录结构

```
packages/i18n/
├── src/
│   ├── create-i18n.ts           # 带端口抽象的工厂
│   ├── loaders/                 # 异步块加载器
│   └── types.ts                 # 语言键类型生成
└── locales/
    ├── en/
    │   ├── common.json          # 共享字符串
    │   └── errors.json          # 错误消息
    └── zh-CN/
        ├── common.json
        └── errors.json

modules/switch-host/
└── locales/
    ├── en/
    │   └── switch-host.json
    └── zh-CN/
        └── switch-host.json
```

### 8.3 模块注册

```typescript
// 每个模块在激活时注册其语言包
async activate(context: PluginContext) {
  await context.i18n.addResourceBundle('en', 'switch-host', await import('./locales/en/switch-host.json'))
  await context.i18n.addResourceBundle('zh-CN', 'switch-host', await import('./locales/zh-CN/switch-host.json'))
}
```

### 8.4 添加新语言

新语言可作为语言插件提供 — 它们扩展现有命名空间而不修改核心:

```typescript
// plugins/plugin-locale-ja/activate.ts
async activate(context: PluginContext) {
  await context.i18n.addResourceBundle('ja', 'common', await import('./locales/ja/common.json'))
}
```

---

## 9. 主题系统

### 9.1 主题结构

```typescript
// system/config/src/schemas/theme.ts

interface ThemeConfig {
  readonly mode: 'light' | 'dark' | 'system'
  readonly accentColor?: string      // 未来: 用户自定义强调色
  readonly fontSize?: 'sm' | 'md' | 'lg'
  readonly reducedMotion?: boolean
}
```

### 9.2 主题切换

- `<html>` 元素上的 `data-theme` 属性控制 CSS 自定义属性值
- 通过 `prefers-color-scheme` 媒体查询检测系统偏好
- 用户覆盖通过 `StoragePort` 持久化
- 模块可注册额外主题令牌（通过插件主题扩展点）
- 过渡: body 上 `transition: background-color 200ms, color 200ms` 实现平滑切换

### 9.3 AI 风格默认主题

在严格遵循 Vercel 设计语言 (DESIGN.md) 的同时，通过以下方式表达 AI 特性:

- 网格渐变（develop/preview/ship 色阶）用于主视觉区域和微妙背景
- 技术等宽标签（`{typography.caption-mono}`）用于 AI 相关功能
- 极性翻转暗色带（`{colors.primary}` 背景）用于 AI 交互区域
- 渐变元素的微妙动画以暗示"智能"（动态而非装饰）
- 命令面板使用 `{components.code-editor-mockup}` 暗色处理

---

## 10. 用户配置与持久化

### 10.1 配置层级

```
默认值 (代码)  →  远程配置  →  本地存储  →  会话覆盖
     ↑                ↑              ↑              ↑
  最低优先级                                  最高优先级
```

### 10.2 持久化用户偏好

```typescript
// system/config/src/schemas/user-config.ts

interface UserConfig {
  readonly theme: ThemeConfig
  readonly locale: string
  readonly layout: LayoutConfig
  readonly navigation: NavigationConfig
  readonly modules: ModulePreferences
}

interface NavigationConfig {
  readonly pinnedTools: readonly string[]    // 置顶到导航栏的工具 ID
  readonly recentTools: readonly string[]    // 最近使用的工具
  readonly subNavCollapsed: boolean
}

interface ModulePreferences {
  readonly installed: readonly string[]      // 已安装模块 ID
  readonly disabled: readonly string[]       // 已安装但已禁用
  readonly order: readonly string[]          // 工具商店中的显示顺序
}
```

### 10.3 存储策略

| 平台 | 存储后端 | 备注 |
|------|---------|------|
| Web | localStorage + IndexedDB | 小配置用 localStorage，大数据用 IDB |
| Tauri 2 | tauri-plugin-store (JSON 文件) | 持久化到应用数据目录 |
| Electron | electron-store (JSON 文件) | 持久化到 userData 目录 |

全部通过 `StoragePort` 访问 — 应用代码中不直接调用存储 API。

---

## 11. 版本检测与自动更新

### 11.1 Web 版本检查

```typescript
// 轮询机制 — 以可配置间隔检查 version.json 清单

interface VersionManifest {
  readonly version: string
  readonly buildHash: string
  readonly releaseNotes?: string
  readonly forceUpdate?: boolean
}
```

- 检测到新版本时: 显示非侵入式 toast（`{components.ex-toast}` 样式）
- 如果 `forceUpdate: true`: 显示需要刷新的模态框（`{components.ex-modal-card}` 样式）
- 用户可关闭并稍后刷新（存储在 sessionStorage 中防止重复提示）
- 轮询间隔: 5 分钟（可配置）

### 11.2 桌面自动更新

- **Tauri 2**: 内置更新器插件（`tauri-plugin-updater`）
- **Electron**: `electron-updater`（带差分下载的自动更新）
- 两者均通过 `UpdatePort` 暴露一致的渲染进程 API

---

## 12. 关键子系统

### 12.1 日志

```typescript
// packages/utils/src/logger.ts

interface Logger {
  debug(message: string, context?: Record<string, unknown>): void
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, error?: Error, context?: Record<string, unknown>): void
}
```

- **开发环境**: 带颜色和结构化上下文的控制台输出
- **生产环境**: 默认关闭，可通过调试开关启用（URL 参数 `?debug=true` 或存储标志）
- **远程日志**: 可选的错误上报插件（适配器模式）

### 12.2 请求管理

```typescript
// packages/utils/src/request/types.ts

interface RequestConfig {
  readonly maxConcurrency: number        // 最大并行请求数
  readonly retryCount: number            // 失败重试次数
  readonly retryDelay: number            // 重试间隔退避
  readonly timeout: number               // 请求超时 (ms)
  readonly deduplication: boolean        // 去重同一进行中请求
}

interface ApiResponse<T> {
  readonly success: boolean
  readonly data: T | null
  readonly error: ApiError | null
  readonly meta?: ResponseMeta
}

interface ResponseMeta {
  readonly total?: number
  readonly page?: number
  readonly limit?: number
  readonly timestamp: number
}

interface ApiError {
  readonly code: string
  readonly message: string
  readonly details?: Record<string, unknown>
}
```

### 12.3 数据通信

| 机制 | 用途 |
|------|------|
| 事件总线 | 渲染进程内模块间通信 |
| Bridge IPC | 渲染进程 ↔ 主进程 |
| postMessage | 基于 iframe 的子应用（如有） |
| BroadcastChannel | 多标签页同步 (Web) |

### 12.4 对话框 / 模态管理

集中式对话框队列，防止堆叠并确保正确的焦点管理:

```typescript
// system/kernel/src/dialog-manager.ts

interface DialogManager {
  show<T>(config: DialogConfig): Promise<T | null>
  confirm(message: string, options?: ConfirmOptions): Promise<boolean>
  alert(message: string, options?: AlertOptions): Promise<void>
  dismiss(id: string): void
  dismissAll(): void
}
```

对话框样式遵循 `{components.ex-modal-card}`:
- 背景: `{colors.canvas}`，圆角: `{rounded.lg}`，内边距: `{spacing.xl}`
- 层级: Level 5 阴影
- 遮罩: 半透明黑色背景

---

## 13. 构建与部署策略

### 13.1 Vite+ 工作流

```bash
# 开发
vp dev                    # 启动开发服务器，支持 HMR

# 质量检查
vp check                  # 格式化 (Oxfmt) + 代码检查 (Oxlint) + 类型检查 (tsgo)
vp test                   # 运行 Vitest

# 构建
vp build                  # 生产构建
vp run -r build           # 按依赖顺序构建所有包

# Monorepo 任务
vp run -t @x-tools/app-main#build    # 构建应用及其传递依赖
vp run --cache build                  # 带缓存构建
```

### 13.2 选择性模块打包

模块默认不打包进主应用。构建流程:

1. **核心壳**（`apps/main`）始终构建 — 包含内核、布局、导航
2. **内置模块**（在 `build.modules` 数组中配置）作为静态导入打包
3. **可选模块** 作为 Module Federation 远程模块构建 — 运行时加载
4. **构建配置** 指定哪些模块内联 vs. 远程:

```typescript
// vite.config.ts (简化)
export default defineConfig({
  plugins: [
    moduleFederation({
      name: 'xtools-host',
      remotes: {
        'switch-host': 'switch_host@/modules/switch-host/remoteEntry.js',
      },
      shared: ['react', 'react-dom', '@x-tools/ui', '@x-tools/design-tokens'],
    }),
  ],
})
```

### 13.3 离线包策略（桌面）

对于 Tauri/Electron，预安装模块可作为离线包打包:

- 模块包存储在应用资源目录
- 首次启动时，内核从本地文件系统加载离线模块
- 更新检查远程注册表获取更新版本
- 网络可选: 模块安装后可完全离线工作

### 13.4 构建目标

| 目标 | 命令 | 输出 |
|------|------|------|
| Web SPA | `vp build` | `dist/` — CDN 静态资源 |
| Tauri | `cargo tauri build` | 平台原生安装包 |
| Electron | `electron-builder` | dmg/exe/AppImage |
| 模块 (远程) | `vp build --lib` | 远程入口 + 代码块 |

---

## 14. 开发规范

### 14.1 命名约定

| 实体 | 约定 | 示例 |
|------|------|------|
| 文件夹 | kebab-case | `switch-host/`, `design-tokens/` |
| 文件（通用） | kebab-case | `create-bridge.ts`, `use-theme.ts` |
| 文件（组件） | PascalCase | `NavBar.tsx`, `ToolCard.tsx` |
| 变量 / 函数 | camelCase | `createBridge`, `userConfig` |
| 布尔值 | is/has/should/can 前缀 | `isLoading`, `hasPermission` |
| 接口 / 类型 | PascalCase | `PluginManifest`, `BridgePort` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT`, `DEFAULT_LOCALE` |
| 自定义 Hooks | use 前缀 | `useTheme`, `useBridge` |
| CSS 变量 | --dt-（令牌）/ --color-（语义） | `--dt-space-md`, `--color-ink` |
| 包名 | @x-tools/kebab-case | `@x-tools/design-tokens` |

### 14.2 文件组织规则

- **不使用 `index.ts` 作为入口文件** — 使用描述性名称（如 `create-bridge.ts`, `plugin-core.ts`）
- **导出在文件底部**（如果导出较少），仅命名导出（无默认导出）
- **导入路径必须为绝对路径** — 通过 TypeScript 路径别名配置（`@x-tools/*`）
- **文件大小限制**: 通常 200-400 行，最多 800 行 — 超过则拆分
- **一个文件一个关注点** — 组件文件只包含一个组件

### 14.3 导入顺序

```typescript
// 1. Node 内置模块
import { resolve } from 'node:path'

// 2. 外部包
import { useQuery } from '@tanstack/react-query'

// 3. 内部包（monorepo）
import { Button } from '@x-tools/ui'
import { useTheme } from '@x-tools/hooks'

// 4. 相对导入（同一包内）
import { formatDate } from '../utils/format-date'
import { UserCard } from './UserCard'

// 5. 纯类型导入（最后）
import type { UserConfig } from '@x-tools/types'
```

### 14.4 TypeScript 规则

- `strict: true`（无例外）
- 禁止 `any` — 类型真正未知时使用 `unknown` + 类型收窄
- 对象形状优先使用 `interface`，联合/交叉/工具类型使用 `type`
- 所有公共 API 必须有显式返回类型
- 所有接口属性和函数参数使用 `readonly`
- 字面量值使用 `as const`

### 14.5 注释

- **默认**: 不写注释。代码应当自文档化
- **仅英文**，首字母大写，末尾无句号
- **只注释为什么**，绝不注释是什么
- 可接受: 隐含约束、变通方案、非显而易见的不变量

### 14.6 组件约定

```typescript
// 组件使用命名导出，无默认导出
// Props 接口定义在同一文件中，组件上方
// 文件以 PascalCase 命名，匹配组件名

interface ToolCardProps {
  readonly tool: ToolManifest
  readonly onPin: (toolId: string) => void
  readonly isPinned: boolean
}

function ToolCard({ tool, onPin, isPinned }: ToolCardProps) {
  // ...
}

export { ToolCard }
export type { ToolCardProps }
```

---

## 15. AI 集成点

### 15.1 命令面板（AI 驱动）

- 全局搜索 + 命令执行 (Cmd/Ctrl + K)
- 自然语言查询由 AI 后端处理
- 基于用户意图的工具建议
- 快捷操作: "打开 switch host"、"切换到暗色模式"、"安装 JSON 格式化器"
- 使用 `{components.code-editor-mockup}` 暗色处理的 AI 交互区域
- 输入使用 `{typography.body-md}`，命令建议使用 `{typography.code}`

### 15.2 CLI 友好架构

- 所有模块操作都可表达为命令（而非仅 UI 点击）
- 命令注册表支持编程控制
- 未来: AI Agent 可通过命令 API 编排工具工作流

### 15.3 AI 就绪的数据契约

- 所有数据流经类型化、可序列化的结构
- 模块能力在机器可读的清单中声明
- 事件总线消息是结构化和可检查的

---

## 16. 安全考虑

### 16.1 模块沙箱

- 模块在清单中声明所需权限
- 内核执行权限边界
- Bridge 调用按模块权限集过滤
- 文件系统访问限定在声明的路径内

### 16.2 内容安全

- 桌面: Tauri 的原生 CSP 执行
- Web: 严格的 CSP 头
- 模块代码仅从受信任的注册表加载（可配置）

### 16.3 数据隐私

- 用户偏好本地存储（未经同意不发送到服务器）
- 模块分析仅在用户选择加入时启用
- 默认无遥测

---

## 17. 测试策略

### 17.1 测试金字塔

| 层级 | 目标 | 工具 | 覆盖率 |
|------|------|------|--------|
| 单元 | 工具函数、领域逻辑、端口 | Vitest | 80%+ |
| 集成 | 适配器、模块交互 | Vitest + Testing Library | 关键路径 |
| E2E | 关键用户流程 | Playwright | 黄金路径 |
| 视觉 | 组件外观 | Chromatic / Percy (可选) | 组件库 |

### 17.2 测试边界

- **领域/应用层**: 纯单元测试，不 mock 框架
- **适配器**: 尽可能使用真实实现的集成测试
- **组件**: React Testing Library — 测试行为，而非实现
- **E2E**: 模块安装流程、工具导航、布局自定义

---

## 18. 性能预算

| 指标 | 目标 | 测量方式 |
|------|------|---------|
| 首次内容绘制 | < 1.2s | Lighthouse |
| 最大内容绘制 | < 2.5s | Lighthouse |
| 可交互时间 | < 3.0s | Lighthouse |
| 核心壳包大小 | < 200KB (gzipped) | 构建分析 |
| 模块冷加载 | < 500ms | 自定义指标 |
| 布局调整回流 | < 16ms (60fps) | Performance API |

---

## 19. 路线图阶段

### 阶段 1: 基础（当前）

- [x] 设计系统规范 (DESIGN.md)
- [ ] 项目脚手架（monorepo，Vite+ 配置）
- [ ] 内核 + 插件系统
- [ ] Bridge 抽象 + Web 适配器
- [ ] 设计令牌包
- [ ] UI 组件库（核心集）
- [ ] 主应用壳（可配置布局）
- [ ] 主题切换（亮色/暗色）
- [ ] 国际化 (en + zh-CN)

### 阶段 2: 第一个模块

- [ ] Switch Host 模块
- [ ] 工具商店（模块市场）
- [ ] Module Federation 集成
- [ ] 导航栏（含置顶）
- [ ] 用户配置持久化

### 阶段 3: 桌面端

- [ ] Tauri 2 适配器
- [ ] Electron 适配器
- [ ] 离线模块打包
- [ ] 自动更新系统
- [ ] 桌面端特有功能（系统托盘、全局快捷键）

### 阶段 4: AI 与扩展

- [ ] AI 命令面板
- [ ] 第三方开发者插件 API
- [ ] CLI 脚本接口
- [ ] 模块开发工具包 / SDK
- [ ] 远程模块注册表

---

## 附录 A: 包依赖关系图

```
@x-tools/types          ← 无依赖（纯类型）
@x-tools/constants      ← @x-tools/types
@x-tools/utils          ← @x-tools/types
@x-tools/design-tokens  ← 无依赖（CSS + Tailwind 预设）
@x-tools/i18n           ← @x-tools/types
@x-tools/event-bus      ← @x-tools/types
@x-tools/bridge         ← @x-tools/types, @x-tools/event-bus
@x-tools/store          ← @x-tools/types
@x-tools/router         ← @x-tools/types
@x-tools/query          ← @x-tools/types
@x-tools/plugin-core    ← @x-tools/types, @x-tools/event-bus
@x-tools/kernel         ← @x-tools/plugin-core, @x-tools/event-bus, @x-tools/bridge, @x-tools/config
@x-tools/hooks          ← @x-tools/bridge, @x-tools/store, @x-tools/i18n
@x-tools/ui             ← @x-tools/design-tokens, @x-tools/hooks
@x-tools/icons          ← 无运行时依赖
@x-tools/config         ← @x-tools/types, @x-tools/bridge
@x-tools/module-federation ← @x-tools/plugin-core, @x-tools/kernel
@x-tools/platform-web   ← @x-tools/bridge（实现 BridgePort）
@x-tools/platform-tauri ← @x-tools/bridge（实现 BridgePort）
@x-tools/platform-electron ← @x-tools/bridge（实现 BridgePort）
@x-tools/app-main       ← @x-tools/kernel, @x-tools/ui, @x-tools/router, @x-tools/query, @x-tools/store
```

## 附录 B: 决策记录

| 决策 | 选择 | 考虑的替代方案 | 理由 |
|------|------|--------------|------|
| Monorepo 工具 | Vite+ (Vite Task) | Turborepo, Nx | 内置于 Vite+，带自动缓存；更少依赖 |
| UI 框架 | React 19 | Vue 3, Svelte, Solid | 生态规模、并发特性、人才池 |
| 组件方案 | 无头 (Radix/Ark) + Tailwind | Lit Web Components, shadcn/ui | 最佳开发体验 + 可访问性；样式层完全可替换 |
| 状态管理 | Zustand（接口封装） | Jotai, Redux Toolkit | 最少样板；需要时支持 Flux 风格；易于封装 |
| 微前端 | Module Federation + 插件注册表 | qiankun, single-spa, wujie | Vite 原生支持；更轻运行时；无框架锁定 |
| 桌面端 | Tauri 2 + Electron（双支持） | 仅 Tauri, 仅 Electron | Tauri 追求性能；Electron 追求兼容；桥接层统一 |
| 设计语言 | Vercel 风格 (DESIGN.md) | Material, Carbon, 自定义 | 成熟；简洁；开发者友好；AI 兼容 |
| 构建工具 | Vite+ | Vite + 单独 lint/test | 统一配置，100x 更快检查，内置任务运行器 |
| 包管理器 | pnpm | npm, yarn, bun | 严格依赖，磁盘高效，工作区支持，由 Vite+ 管理 |

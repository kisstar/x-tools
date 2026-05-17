# Switch-Host 模块 — 产品设计文档

> 版本: 1.0.0-draft | 创建时间: 2026-05-16 | 模块: `@x-tools/module-switch-host`

---

## 1. 产品概述

### 1.1 什么是 Switch-Host?

Switch-Host 是 xTools 的 hosts 文件管理模块，允许开发者创建、组织并快速切换多个 host 配置组。它提供可视化界面来编辑 `/etc/hosts`（或平台等效文件），支持分组、一键切换、冲突检测和基于环境的预设等功能。

### 1.2 问题陈述

开发者频繁需要切换 hosts 配置的场景:
- 在本地开发、预发布和生产环境之间切换
- 测试使用不同服务发现配置的多服务架构
- 通过将域名指向特定 IP 来调试 DNS 相关问题
- 同时开发多个项目且项目间 host 需求冲突

当前痛点:
- 手动编辑 `/etc/hosts` 需要 sudo 权限且容易出错
- 无版本历史或撤销功能
- 无法快速切换分组的启用/禁用
- 条目间的冲突在出问题之前不可见
- 无跨设备同步或团队共享

### 1.3 目标

| 目标 | 指标 |
|------|------|
| 缩短 host 切换时间 | 从约 60 秒（手动编辑）到 <2 秒（一键切换） |
| 消除配置错误 | 零格式错误的条目写入 hosts 文件 |
| 支持团队协作 | 通过可分享的 JSON 进行 host 分组的导入/导出 |
| 跨平台一致性 | 在 macOS、Windows、Linux (Tauri/Electron/Web) 上体验一致 |

### 1.4 非目标 (v1)

- DNS 服务器或代理功能
- 从运行中的容器/服务自动发现 host
- 云同步（计划在 v2 实现）
- 浏览器扩展实现按浏览器的 host 覆盖

---

## 2. 用户故事

### 2.1 核心故事

| # | 作为... | 我想要... | 以便... |
|---|---------|----------|---------|
| US-1 | 开发者 | 创建命名的 host 分组（如 "开发"、"预发布"、"生产"） | 按环境组织 hosts |
| US-2 | 开发者 | 一键切换 host 分组的启用/禁用 | 瞬间切换环境 |
| US-3 | 开发者 | 查看当前激活的分组 | 一目了然当前配置 |
| US-4 | 开发者 | 编辑分组内的单个 host 条目 | 微调特定映射 |
| US-5 | 开发者 | 检测分组间的冲突 | 不会意外启用冲突条目 |
| US-6 | 开发者 | 以 JSON/文本格式导入/导出 host 分组 | 与团队成员共享配置 |
| US-7 | 开发者 | 跨所有 host 条目搜索 | 快速找到特定域名或 IP |
| US-8 | 开发者 | 撤销最近的更改 | 从错误中恢复 |

### 2.2 高级故事

| # | 作为... | 我想要... | 以便... |
|---|---------|----------|---------|
| US-9 | 开发者 | 批量粘贴 host 条目 | 从文档或聊天中导入 |
| US-10 | 开发者 | 在应用更改前查看差异 | 了解系统 hosts 文件将发生什么变化 |
| US-11 | 开发者 | 将常用分组置顶 | 更快访问常用配置 |
| US-12 | 开发者 | 使用键盘快捷键切换分组 | 无需触碰鼠标即可切换 |
| US-13 | 开发者 | 设置分组为"启动时自动启用" | 默认环境始终就绪 |
| US-14 | 团队负责人 | 创建只读共享分组 | 团队成员不会意外修改共享配置 |

---

## 3. 功能规格

### 3.1 Host 分组管理

**Host 分组** 是基本的组织单元:

```typescript
interface HostGroup {
  readonly id: string                    // UUID
  readonly name: string                  // 用户可见名称（如 "生产 API"）
  readonly description?: string          // 可选备注
  readonly entries: readonly HostEntry[] // 有序的 host 条目列表
  readonly enabled: boolean             // 此分组是否激活
  readonly pinned: boolean              // 是否置顶
  readonly autoEnable: boolean          // 应用启动时自动启用
  readonly readOnly: boolean            // 防止编辑
  readonly color?: string               // 可选颜色标签，用于视觉分组
  readonly createdAt: number            // Unix 时间戳
  readonly updatedAt: number            // Unix 时间戳
}

interface HostEntry {
  readonly id: string                   // UUID
  readonly ip: string                   // IPv4 或 IPv6 地址
  readonly domain: string               // 主机名
  readonly enabled: boolean             // 条目级别开关
  readonly comment?: string             // 行内注释
}
```

#### 操作

| 操作 | 说明 |
|------|------|
| 创建分组 | 新建分组，含名称、可选描述、可选颜色标签 |
| 删除分组 | 删除分组（带确认对话框） |
| 复制分组 | 克隆分组，添加"(副本)"后缀 |
| 重命名分组 | 内联重命名，带验证 |
| 重排分组 | 拖拽排序 |
| 切换分组 | 启用/禁用分组内所有条目 |
| 置顶/取消置顶 | 移至置顶区域 |

### 3.2 Host 条目管理

#### 操作

| 操作 | 说明 |
|------|------|
| 添加条目 | 新建条目，含 IP + 域名（已验证） |
| 编辑条目 | 内联编辑 IP 或域名 |
| 删除条目 | 删除条目（单条无需确认） |
| 切换条目 | 启用/禁用单个条目 |
| 重排条目 | 组内拖拽排序 |
| 批量添加 | 粘贴多行 `IP 域名` 格式 |
| 批量切换 | 选择多个条目，统一切换 |

#### 验证规则

| 字段 | 规则 |
|------|------|
| IP | 有效的 IPv4 (`x.x.x.x`) 或 IPv6（完整/压缩表示法） |
| 域名 | 有效的主机名 (RFC 1123): 字母数字 + 连字符，总长 1-253 字符 |
| 重复 | 当同一域名存在于另一个已启用分组时发出警告（不阻止） |

### 3.3 系统 Hosts 文件同步

模块读写系统 hosts 文件:

| 平台 | 路径 | 权限 |
|------|------|------|
| macOS | `/etc/hosts` | `root:wheel 644` — 需要 sudo |
| Linux | `/etc/hosts` | `root:root 644` — 需要 sudo |
| Windows | `C:\Windows\System32\drivers\etc\hosts` | 管理员 |

#### 同步策略

```
┌─────────────────┐         ┌──────────────────┐
│    模块状态      │         │   系统 Hosts     │
│  (JSON 存储)     │  ────►  │  (/etc/hosts)    │
│                  │  ◄────  │                  │
└─────────────────┘         └──────────────────┘
       │                            │
       │  数据源                     │  派生输出
       │  (用户的分组)               │  (扁平化的活跃条目)
```

**写入流程:**
1. 用户切换分组 → 模块状态更新
2. 模块计算扁平化的 hosts（所有已启用分组中的所有已启用条目）
3. 模块生成带区段标记的 hosts 文件内容
4. Bridge 写入系统 hosts 文件（带提权）

**读取流程（初始加载）:**
1. 模块读取系统 hosts 文件
2. 不由 xTools 管理的条目（无区段标记）→ 放入"系统（未管理）"分组
3. xTools 标记内的条目 → 匹配到存储的分组

#### 区段标记

```
# === xTools Switch-Host START ===
# [Group: 生产 API]
192.168.1.100  api.example.com
192.168.1.100  auth.example.com

# [Group: 本地开发]
127.0.0.1  api.local.dev
127.0.0.1  web.local.dev
# === xTools Switch-Host END ===
```

标记外的内容永不被模块修改。

### 3.4 冲突检测

**冲突** 发生在同一域名出现在多个**已启用**条目中（跨分组或组内）:

| 严重度 | 条件 | 操作 |
|--------|------|------|
| 警告 | 同一域名在两个已启用分组中，相同 IP | 显示信息徽章 |
| 错误 | 同一域名在两个已启用分组中，不同 IP | 显示错误徽章 + 高亮两个条目 |
| 信息 | 同一域名在一个已启用和一个已禁用分组中 | 无操作（禁用分组不活跃） |

冲突解决 UI:
- 在冲突分组上显示内联横幅: "冲突: `api.example.com` 同时定义在 [分组名] 中"
- 点击跳转到冲突条目
- 快捷操作: "在此分组中禁用" / "在另一分组中禁用"

### 3.5 搜索与筛选

| 功能 | 说明 |
|------|------|
| 全局搜索 | 按 IP、域名、分组名或注释搜索 |
| 按状态筛选 | 仅显示已启用/已禁用分组 |
| 按冲突筛选 | 仅显示有冲突的分组 |
| 高亮匹配 | 搜索结果中匹配文本高亮 |

### 3.6 导入与导出

#### 导入格式

| 格式 | 说明 |
|------|------|
| 纯文本 | 标准 hosts 文件格式 (`IP 域名 # 注释`) |
| JSON | xTools 原生格式（保留分组、元数据） |
| URL (未来) | 从 URL 获取远程 hosts 文件 |

#### 导出格式

| 格式 | 说明 |
|------|------|
| 纯文本 | 标准 hosts 文件格式 |
| JSON | 完整的 xTools 格式，含分组元数据 |
| 剪贴板 | 复制活跃条目到剪贴板 |

### 3.7 历史与撤销

| 功能 | 说明 |
|------|------|
| 变更历史 | 最近 50 次操作，带时间戳 |
| 撤销/重做 | Ctrl+Z / Ctrl+Shift+Z 用于最近操作 |
| 快照 | 手动将当前状态保存为命名快照 |
| 差异视图 | 应用更改时的前后对比 |

---

## 4. UI/UX 设计

### 4.1 布局（在 xTools 壳内）

模块占据**内容区域** + 可选的**详情面板**:

```
┌──────┬─────┬─────────────────────────────────┬────────────────┐
│      │     │  ┌─────────────────────────────┐ │                │
│ 导航 │ 子  │  │  工具栏                     │ │  详情面板      │
│ 栏   │ 导  │  │  [+ 新建分组] [搜索] [⋮]   │ │                │
│      │ 航  │  ├─────────────────────────────┤ │  (条目编辑器   │
│      │     │  │                             │ │   或分组       │
│      │     │  │  分组列表                   │ │   设置)        │
│      │     │  │  ┌───────────────────────┐  │ │                │
│      │     │  │  │ ● 生产 API       [⏻] │  │ │  ┌──────────┐ │
│      │     │  │  │   api.example.com     │  │ │  │ IP       │ │
│      │     │  │  │   auth.example.com    │  │ │  │ 域名     │ │
│      │     │  │  └───────────────────────┘  │ │  │ 注释     │ │
│      │     │  │  ┌───────────────────────┐  │ │  │ [保存]   │ │
│      │     │  │  │ ○ 本地开发       [⏻] │  │ │  └──────────┘ │
│      │     │  │  │   api.local.dev       │  │ │                │
│      │     │  │  │   web.local.dev       │  │ │                │
│      │     │  │  └───────────────────────┘  │ │                │
│      │     │  │                             │ │                │
│      │     │  └─────────────────────────────┘ │                │
└──────┴─────┴─────────────────────────────────┴────────────────┘
```

### 4.2 子导航配置

Switch-Host 模块注册的子导航:

| 项目 | 图标 | 说明 |
|------|------|------|
| 所有分组 | list | 显示所有 host 分组（默认视图） |
| 仅活跃 | check-circle | 仅显示已启用分组 |
| 冲突 | alert-triangle | 显示有冲突的分组 |
| 历史 | clock | 显示变更历史 |
| 导入/导出 | download | 导入/导出面板 |

### 4.3 组件拆分

#### 4.3.1 分组卡片

代表一个 host 分组的可折叠卡片:

```
┌─────────────────────────────────────────────────────┐
│  ● [颜色点] 生产 API                       [⏻] [⋮] │
│  ├─ 2 个条目 · 活跃 · 最后修改 2 小时前            │
│  │                                                  │
│  │  ┌─────────────────────────────────────────────┐ │
│  │  │ [✓] 192.168.1.100    api.example.com       │ │
│  │  │ [✓] 192.168.1.100    auth.example.com      │ │
│  │  │ [ ] 192.168.1.101    ws.example.com        │ │
│  │  │                                             │ │
│  │  │ [+ 添加条目]                               │ │
│  │  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**应用的设计令牌:**
- 卡片表面: `{colors.canvas}`，`{rounded.md}`，Level 2 阴影
- 分组名: `{typography.body-sm-strong}`
- 条目文本 (IP): `{typography.code}` (等宽)
- 条目文本 (域名): `{typography.body-sm}`
- 元数据行: `{typography.caption}`，`{colors.mute}`
- 切换按钮: `{components.icon-button-circular}`
- 活跃指示器: `{colors.success}`（蓝点）或 `{colors.mute}`（灰点）
- 冲突徽章: `{colors.error}` 背景配 `{colors.error-soft}` 药丸

#### 4.3.2 条目行

分组内的单个 host 条目:

```
┌─────────────────────────────────────────────────────┐
│  [✓]  192.168.1.100       api.example.com    [⋮]   │
│        ↑ 等宽字体           ↑ body-sm               │
└─────────────────────────────────────────────────────┘
```

- 复选框: 条目级别切换
- IP: `{typography.code}`，固定宽度列
- 域名: `{typography.body-sm}`，flex-grow
- 上下文菜单: 编辑、删除、移动到分组、复制

#### 4.3.3 工具栏

```
┌─────────────────────────────────────────────────────┐
│  [+ 新建分组]  [导入]  |  🔍 搜索...       | [⋮]  │
└─────────────────────────────────────────────────────┘
```

- "新建分组"按钮: `{components.button-primary-sm}`
- "导入"按钮: `{components.button-secondary-sm}`
- 搜索: `{components.form-input-sm}` 带搜索图标
- 溢出菜单: 批量操作、设置、导出

#### 4.3.4 差异视图（应用更改前）

```
┌─────────────────────────────────────────────────────┐
│  /etc/hosts 的更改                        [应用]    │
├─────────────────────────────────────────────────────┤
│  - 192.168.1.100  api.example.com                   │
│  + 127.0.0.1      api.example.com                   │
│    192.168.1.100  auth.example.com                   │
│  + 127.0.0.1      web.local.dev                     │
└─────────────────────────────────────────────────────┘
```

- 表面: `{components.code-editor-mockup}`（暗色背景）
- 差异颜色: 红色为删除，绿色/青色为新增
- 字体: `{typography.code}`

### 4.4 交互模式

| 操作 | 交互 |
|------|------|
| 切换分组 | 点击切换图标 → 立即状态变更 + 写入 hosts |
| 切换条目 | 点击复选框 → 分组保持启用，条目切换 |
| 编辑条目 | 双击 → 进入内联编辑模式 |
| 添加条目 | 点击"+ 添加条目" → 新行，焦点在 IP 字段 |
| 删除分组 | 上下文菜单 → 确认对话框 |
| 重排 | 分组卡片左侧拖拽手柄 |
| 搜索 | 模块内 Cmd+F → 聚焦搜索输入框 |
| 撤销 | Cmd+Z → 撤销最后操作 |

### 4.5 空状态

当没有分组时:

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│           [插画: 网络节点]                            │
│                                                     │
│         轻松管理你的 hosts。                          │
│                                                     │
│    创建分组来组织 host 条目                           │
│    并即时切换环境。                                   │
│                                                     │
│         [+ 创建第一个分组]  [导入]                    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

- 表面: `{components.ex-empty-state-card}`
- 标题: `{typography.display-sm}`
- 正文: `{typography.body-md}`，`{colors.body}`
- CTA: `{components.button-primary-sm}` + `{components.button-secondary-sm}`

### 4.6 键盘快捷键

| 快捷键 | 操作 |
|--------|------|
| `Cmd+N` | 新建分组 |
| `Cmd+F` | 聚焦搜索 |
| `Cmd+Z` | 撤销 |
| `Cmd+Shift+Z` | 重做 |
| `Cmd+S` | 将待处理更改应用到 hosts 文件 |
| `Cmd+I` | 打开导入对话框 |
| `Cmd+E` | 打开导出对话框 |
| `Enter`（在分组上） | 展开/折叠分组 |
| `Space`（在分组上） | 切换分组启用/禁用 |
| `Delete`（在条目上） | 删除选中条目 |

---

## 5. 技术架构

### 5.1 模块结构

```
renderer/modules/switch-host/
├── package.json                    # @x-tools/module-switch-host
├── manifest.ts                     # 模块清单 (MF + Plugin)
├── locales/
│   ├── en/switch-host.json
│   └── zh-CN/switch-host.json
├── domain/
│   ├── entities/
│   │   ├── host-group.ts           # HostGroup 实体
│   │   └── host-entry.ts           # HostEntry 实体
│   ├── value-objects/
│   │   ├── ip-address.ts           # IPv4/IPv6 值对象，含验证
│   │   └── hostname.ts             # 主机名值对象，含验证
│   ├── services/
│   │   ├── conflict-detector.ts    # 检测重复域名冲突
│   │   ├── hosts-parser.ts         # 解析 hosts 文件文本 → 结构化数据
│   │   └── hosts-renderer.ts       # 渲染分组 → hosts 文件文本
│   └── ports/
│       ├── hosts-file.port.ts      # 读写系统 hosts 文件
│       └── group-storage.port.ts   # 持久化分组配置
├── application/
│   ├── commands/
│   │   ├── create-group.ts
│   │   ├── toggle-group.ts
│   │   ├── update-entry.ts
│   │   ├── import-groups.ts
│   │   └── apply-hosts.ts          # 写入系统 hosts 文件
│   ├── queries/
│   │   ├── get-all-groups.ts
│   │   ├── search-entries.ts
│   │   └── get-conflicts.ts
│   └── orchestrators/
│       └── sync-orchestrator.ts    # 协调状态 → hosts 文件同步
├── infrastructure/
│   ├── adapters/
│   │   ├── bridge-hosts-file.ts    # 基于 BridgePort 的 hosts 文件适配器
│   │   └── storage-group.ts        # 基于 StoragePort 的分组持久化
│   └── mappers/
│       └── hosts-file-mapper.ts    # 文件格式与领域实体间的映射
├── presentation/
│   ├── components/
│   │   ├── GroupCard.tsx
│   │   ├── EntryRow.tsx
│   │   ├── GroupToolbar.tsx
│   │   ├── ConflictBadge.tsx
│   │   ├── DiffView.tsx
│   │   ├── ImportDialog.tsx
│   │   ├── ExportDialog.tsx
│   │   └── EmptyState.tsx
│   ├── hooks/
│   │   ├── use-host-groups.ts      # 分组查询 hook
│   │   ├── use-toggle-group.ts     # 切换的 mutation hook
│   │   ├── use-conflicts.ts        # 派生冲突状态
│   │   └── use-search.ts           # 搜索状态管理
│   ├── pages/
│   │   ├── GroupListPage.tsx        # 主列表视图
│   │   ├── HistoryPage.tsx          # 变更历史视图
│   │   └── ImportExportPage.tsx     # 导入/导出视图
│   └── store/
│       └── switch-host.store.ts     # 模块级 Zustand 切片
└── index.ts                         # 模块入口 (Plugin + routes)
```

### 5.2 平台桥接集成

模块需要一个新的 Bridge 端口用于提权文件系统操作:

```typescript
// system/bridge/src/ports/elevated-fs.port.ts

interface ElevatedFileSystemPort {
  readFileElevated(path: string): Promise<string>
  writeFileElevated(path: string, content: string): Promise<void>
  checkElevatedAccess(): Promise<boolean>
  requestElevatedAccess(): Promise<boolean>
}
```

**平台实现:**

| 平台 | 机制 |
|------|------|
| Tauri 2 | `tauri-plugin-shell` 配合 `pkexec` / `osascript` / `runas` |
| Electron | `sudo-prompt` 包或原生对话框 + `child_process.execFile` |
| Web (本地服务器) | 服务端进程预授权 sudo (Docker/开发服务器设置) |

### 5.3 数据流

```
用户操作（切换分组）
    │
    ▼
表现层（hook: useToggleGroup）
    │
    ▼
应用层（命令: ToggleGroupCommand）
    │
    ├── 更新分组状态（通过 GroupStoragePort）
    ├── 重新计算冲突（ConflictDetector）
    ├── 渲染新的 hosts 内容（HostsRenderer）
    │
    ▼
基础设施层（BridgeHostsFile 适配器）
    │
    ├── 向用户展示差异（可选，可配置）
    ├── 通过 ElevatedFileSystemPort 写入
    │
    ▼
系统 hosts 文件已更新
```

### 5.4 状态管理

```typescript
// 模块状态（Zustand 切片）
interface SwitchHostState {
  readonly groups: readonly HostGroup[]
  readonly searchQuery: string
  readonly filterMode: 'all' | 'active' | 'conflicts'
  readonly expandedGroupIds: readonly string[]
  readonly selectedEntryId: string | null
  readonly pendingChanges: boolean
  readonly lastSyncTimestamp: number
  readonly history: readonly HistoryEntry[]
  readonly historyIndex: number
}
```

### 5.5 模块清单

```typescript
// manifest.ts
import type { ModuleManifest } from '@x-tools/module-federation'

const manifest: ModuleManifest = {
  id: 'switch-host',
  name: 'Switch Host',
  version: '1.0.0',
  description: '管理并切换 host 配置',
  entry: './remoteEntry.js',
  exposedComponents: [
    { name: 'SwitchHostModule', path: './pages/GroupListPage', lazy: true },
  ],
  navConfig: {
    icon: 'globe',
    label: 'Switch Host',
    order: 10,
  },
  subNavConfig: {
    items: [
      { id: 'all', icon: 'list', label: '所有分组' },
      { id: 'active', icon: 'check-circle', label: '活跃' },
      { id: 'conflicts', icon: 'alert-triangle', label: '冲突' },
      { id: 'history', icon: 'clock', label: '历史' },
      { id: 'import-export', icon: 'download', label: '导入/导出' },
    ],
  },
  dependencies: [],
  permissions: ['elevated-fs:read', 'elevated-fs:write', 'storage:readwrite'],
  requiresRestart: false,
}
```

---

## 6. 安全考虑

### 6.1 权限提升

| 风险 | 缓解措施 |
|------|---------|
| 通过提权 FS 任意写文件 | 在提权适配器中仅白名单 hosts 文件路径 |
| 通过畸形 host 条目注入 | 渲染前严格验证 IP + 域名 |
| 导入时的路径遍历 | 验证导入内容为纯 hosts 格式 |
| sudo 会话过期 | 5 分钟不活动后重新提示密码 |

### 6.2 数据完整性

| 风险 | 缓解措施 |
|------|---------|
| hosts 文件损坏 | 始终原子写入（写入临时文件，然后重命名） |
| 丢失系统条目 | 保留 xTools 标记外的内容 |
| 并发修改 | 写入时锁文件，检测外部更改 |
| 写入时崩溃 | 保留 hosts 文件之前状态的备份 |

### 6.3 输入验证

```typescript
// domain/value-objects/ip-address.ts
const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/
const IPV6_REGEX = /^(?:[a-fA-F0-9]{1,4}:){7}[a-fA-F0-9]{1,4}$|^::(?:[a-fA-F0-9]{1,4}:){0,5}[a-fA-F0-9]{1,4}$|^[a-fA-F0-9]{1,4}::(?:[a-fA-F0-9]{1,4}:){0,4}[a-fA-F0-9]{1,4}$/

// domain/value-objects/hostname.ts
const HOSTNAME_REGEX = /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.[a-zA-Z0-9-]{1,63})*$/
const MAX_HOSTNAME_LENGTH = 253
```

---

## 7. 性能考虑

| 场景 | 目标 | 方案 |
|------|------|------|
| 初始加载 (100 个分组) | < 200ms | 虚拟列表懒渲染 |
| 切换分组 | < 100ms 状态 + < 500ms 文件写入 | 乐观 UI 更新 |
| 搜索 (1000 条) | < 50ms | 内存索引，防抖输入 |
| 导入大文件 (500 条) | < 1s | 批量解析，渐进 UI 更新 |
| 冲突检测 | < 50ms | 基于域名字段的预计算索引 |

---

## 8. 国际化

### 8.1 关键字符串 (en)

```json
{
  "module.name": "Switch Host",
  "module.description": "管理并切换 host 配置",
  "group.create": "新建分组",
  "group.delete.confirm": "删除分组「{{name}}」？此操作无法撤销。",
  "group.toggle.enable": "启用分组",
  "group.toggle.disable": "禁用分组",
  "entry.add": "添加条目",
  "entry.ip.placeholder": "IP 地址",
  "entry.domain.placeholder": "主机名",
  "conflict.detected": "冲突: {{domain}} 同时定义在 {{groupName}} 中",
  "sync.success": "Hosts 文件更新成功",
  "sync.error.permission": "权限被拒绝。请授予提权访问以修改 hosts 文件。",
  "sync.error.locked": "Hosts 文件被其他进程锁定",
  "import.title": "导入 Host 条目",
  "export.title": "导出 Host 条目",
  "history.title": "变更历史",
  "empty.title": "轻松管理你的 hosts。",
  "empty.body": "创建分组来组织 host 条目并即时切换环境。",
  "search.placeholder": "搜索 hosts..."
}
```

---

## 9. 错误处理

| 错误 | 用户提示 | 恢复方式 |
|------|---------|---------|
| 权限被拒绝 | "权限被拒绝。请授予提权访问以修改 hosts 文件。" | 显示原生权限对话框 |
| 文件锁定 | "Hosts 文件被其他进程锁定。重试？" | 带指数退避的重试按钮 |
| 无效导入格式 | "无法解析导入文件。期望 hosts 格式或 JSON。" | 显示首个错误的行号 |
| 写入失败 | "保存 hosts 文件失败。你的更改已本地保留。" | 下次切换时自动重试，手动"应用"按钮 |
| 外部修改 | "Hosts 文件被外部修改。重新加载？" | 显示差异，提供合并或覆盖选项 |

---

## 10. 分析事件（可选加入）

| 事件 | 载荷 |
|------|------|
| `module.activated` | `{ groupCount }` |
| `group.created` | `{ entryCount }` |
| `group.toggled` | `{ enabled: boolean, entryCount }` |
| `import.completed` | `{ format, entryCount }` |
| `conflict.detected` | `{ conflictCount }` |
| `sync.completed` | `{ duration_ms, entryCount }` |
| `sync.failed` | `{ errorType }` |

---

## 11. 测试策略

### 11.1 单元测试（领域层）

- IP 地址值对象验证（IPv4、IPv6、无效输入）
- 主机名值对象验证（有效、过长、无效字符）
- Hosts 解析器（解析标准格式、注释、空行）
- Hosts 渲染器（渲染带标记的分组、保留未管理内容）
- 冲突检测器（相同域名/相同 IP、相同域名/不同 IP、禁用分组）

### 11.2 集成测试（应用层）

- 创建分组 → 验证存储写入
- 切换分组 → 验证 hosts 文件内容
- 导入 JSON → 验证分组正确创建
- 外部文件修改 → 检测并提示

### 11.3 E2E 测试（关键路径）

- 创建分组 → 添加条目 → 切换 → 验证 hosts 文件
- 从剪贴板导入 → 验证分组
- 冲突检测 → 解决流程
- 撤销/重做链

---

## 12. 发布计划

### 阶段 1: 核心 (MVP)

- 分组 CRUD 操作
- 条目 CRUD 操作
- 切换分组/条目
- 系统 hosts 文件同步（先支持 macOS）
- 基础搜索

### 阶段 2: 完善

- 冲突检测 + 解决 UI
- 导入/导出（JSON + 纯文本）
- 撤销/重做历史
- 应用前差异视图
- 键盘快捷键

### 阶段 3: 高级

- 置顶分组
- 启动时自动启用
- 快照/恢复
- 拖拽排序
- 颜色标签

### 阶段 4: 协作（未来）

- 通过 URL/二维码分享分组
- 团队共享分组（只读）
- 云同步
- 远程 hosts 文件订阅（基于 URL 的自动更新分组）

---

## 13. 竞品分析

| 功能 | SwitchHosts! | iHosts | xTools Switch-Host |
|------|-------------|--------|-------------------|
| 平台 | Win/Mac/Linux | 仅 Mac | Win/Mac/Linux + Web |
| 分组管理 | 是 | 是 | 是 |
| 冲突检测 | 否 | 否 | 是 |
| 撤销/重做 | 否 | 否 | 是 |
| 差异视图 | 否 | 否 | 是 |
| 导入/导出 | 基础文本 | 否 | JSON + 文本 + URL |
| 团队共享 | 否 | 否 | 计划中 (v2) |
| 插件系统 | 否 | 否 | 是（xTools 原生） |
| AI 集成 | 否 | 否 | 计划中（自动建议） |
| UI 品质 | Electron（过时） | 原生（有限） | 现代（Vercel 设计） |

---

## 14. 待讨论问题

| # | 问题 | 状态 |
|---|------|------|
| 1 | hosts 文件更新后是否应自动触发 DNS 刷新？ | 建议: 是（平台特定命令） |
| 2 | 是否应支持通配符域名（如 `*.local.dev`）？ | 建议: v1 不支持（非标准 hosts 格式） |
| 3 | 如何处理超大 hosts 文件（>1000 条）？ | 建议: 虚拟滚动 + 索引搜索 |
| 4 | 模块是否应在纯 Web 模式下工作（无系统文件访问）？ | 建议: 是，但为"仅预览"模式（生成文本，用户手动复制） |
| 5 | 颜色标签应该是预定义还是自定义？ | 建议: 8 种预定义颜色，匹配设计系统 |

---

## 附录 A: Hosts 文件格式参考

```
# 标准 hosts 文件格式
# 注释以 # 开头
# 格式: IP地址    主机名    [别名...]

# 回环地址
127.0.0.1       localhost
::1             localhost

# 自定义条目
192.168.1.100   api.example.com
192.168.1.100   auth.example.com    auth2.example.com
```

## 附录 B: JSON 导出格式

```json
{
  "version": 1,
  "exportedAt": "2026-05-16T10:30:00Z",
  "groups": [
    {
      "name": "生产 API",
      "description": "生产服务端点",
      "enabled": true,
      "entries": [
        { "ip": "192.168.1.100", "domain": "api.example.com", "enabled": true },
        { "ip": "192.168.1.100", "domain": "auth.example.com", "enabled": true }
      ]
    }
  ]
}
```

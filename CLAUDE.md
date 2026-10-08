# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> xTools — 跨端模块化工具平台（一个 Electron 主进程 + 两个前端：客户端渲染端 · 本机浏览器）

## 语言要求

所有回答和输出内容必须使用中文。

## 命令

```bash
pnpm install                        # 仅允许 pnpm（preinstall 有 only-allow 守卫）

pnpm dev                            # Vite 开发服务器（端口 5173，strictPort）
pnpm dev:electron                   # Electron 开发模式 —— 当前跑不起来，见「已知缺口」
pnpm build                          # 前端 SPA -> renderer/apps/main/dist/
pnpm build:electron                 # 前端 + 主进程 + electron-builder
pnpm preview                        # 预览生产构建
pnpm typecheck                      # renderer/apps/main + electron + protocol
```

**尚不存在的命令**：没有 lint（ESLint 未安装），没有 test（vitest / Playwright 均未安装）。
不要假设 `pnpm test` 可用；需要跑测试时先确认工具链已装。

## 仓库现状（实际目录）

```
xTools/
├── protocol/          # @x-tools/protocol —— 类型化 IPC 契约（channels / ports / types）
├── renderer/          # 前端 monorepo（React 19 + Vite 6 + Tailwind 4 + TanStack Router）
│   ├── apps/main/     # @x-tools/app-main —— 宿主应用 SPA
│   └── packages/      # design-tokens · i18n · icons · platform-bridge · types
├── hosts/             # 宿主壳层
│   └── electron/      # @x-tools/electron —— 主进程 + preload + IPC 注册 + services
└── docs/              # 架构与 PRD 文档
```

> 目标方案已移出 Rust / Tauri / CLI / MCP（见下）；现状与目标的差异不是 bug，是待迁移项。

`renderer/`、`hosts/electron/` 各有自己的 CLAUDE.md（技术栈、组件规范），
在对应子目录内工作时以子文件为准，本文件只讲跨目录的全局约定。

## 目标架构（文档是唯一真源）

`docs/architecture/cross-platform-design.md` 是 2026-10-03 修订后的权威方案（索引 + 9 个分章）。
本次已**移出 Rust core / Tauri 宿主 / CLI / MCP**，形态收敛为 **一个 Electron 主进程 + 两个前端（客户端渲染端走 ipc · 本机浏览器走 ws）**。
**它描述的是目标形态，与上面的现状目录有意不一致**，做架构相关改动前必须先读对应章节：

| 章节 | 文件 |
|---|---|
| §1 目标 · §2 拓扑 · §3 monorepo 与分层 · §4 核心不变式 | `cross-platform-design/01-topology.md` |
| §5 契约层（channel RPC · zod 真源 · 五个稳定错误码） | `02-contracts.md` |
| §6 两条传输 · 三重闸门 · WS 安全基线 · 提权 | `03-transports-and-security.md` |
| §7 capability registry · 按会话求值 | `04-capabilities.md` |
| §8 事件总线与跨端同步 | `05-event-sync.md` |
| §9 微内核边界 · §10 runtime 矩阵 · §11 生命周期 · §12 权限 · §13 插件 channel · §14 渲染侧与两级导航 | `06-plugin-architecture.md` |
| §15 契约测试套件 | `07-contract-tests.md` |
| §16 架构风格 · §17 设计原则 · §18 23 种设计模式映射 | `08-styles-and-patterns.md` |
| §19 不做 · §20 分期 · §21 决策状态 | `09-scope-and-roadmap.md` |

已定的关键决策（不要重新论证）：

- **一份 TS core，两个前端消费**。唯一后端是 Electron main，客户端渲染端走 ipc、本机浏览器走 ws；两条传输只是 `IMessagePassingProtocol` 的两个实现，channel 层之上完全同形。无双写、无跨语言 codegen（§2）。
- **跨端一致性退化为进程内发布订阅**。两个前端订阅同一个后端，变更经事件总线广播给所有已连接会话（含发起端），事件是**纯失效通知**（`{topic,revision,scope?}`）；不需要账号、中转、冲突合并（§8）。
- **微内核 + 一切皆插件**。内核只留 5 件：channel server / capability registry / plugin host / transports（含 SessionRegistry + EventBus）/ OS 原语 capabilities。导航项、工具卡、命令面板条目、设置分区、switch-host 全部是插件贡献物（§9）。
- **插件 runtime 只有 `ui` / `node` 两种**。`node` 对两个前端恒可用（都连同一个主进程）；真正的跨端差异不在 runtime，而在**按会话求值的 capability**。`desktop-only` 能力对 ws 会话不可用，但仍注册、仍给 `reason`（§7、§10）。
- **内置插件不是特权代码路径**：manifest 格式、贡献点、生命周期、权限闸门、卸载语义与动态插件完全同一套；内置插件也必须可禁用（§9.2）。
- **导航是两级贡献点**：`contributes.viewContainers`（一级导航格子，`location` / `order` / `emphasis`）+ `contributes.views`（挂在 container 上，`slot: 'content' | 'subnav'`）。二级导航的有无是**派生结论**——看 container 有没有 `slot: 'subnav'` 的视图，不是枚举字段。内核不内置「分类」概念，只透传不解释 `views[].tags`；「工具大全」是内置 `ui` 插件 `tool-catalog`，读 registry 须声明 capability `registry.read`。nav 状态真源是 URL（两条静态路由 `/tool/$containerId` 与 `/tool/$containerId/$viewId`），不是 store（§14）。
- **契约走 channel RPC**（借 VSCode `vs/base/parts/ipc` 分层），传输可换、业务零改动；现在的胖 `Bridge` 接口（`protocol/src/ports.ts:70`）要被替换，不是被扩展。`CallContext` 必带 `origin`/`transport`/`client`/`sessionId`，`origin==='plugin'` 时 `pluginId` 必填——它是权限白名单的落点（§5.2、§12.2）。
- **zod 是 schema 的唯一真源**，渲染侧只 `import type`，在 `verbatimModuleSyntax` 下被完全擦除。动态插件的运行时 schema 是显式例外，且只存在于 TS 一侧（§5.7、§13.1）。
- **提权语言无关**：判据是「谁以 root 身份执行动作」，绝不 Node-as-root；固定白名单动作，不接受任意 shell。**`shell.elevate` 与 `fsScope: unrestricted` 仅内置插件可申请，第三方声明即加载期拒绝**，不给用户「允许」弹窗（§6.5、§12.3）。
- 明确不做：Rust / Tauri / CLI / MCP、无后端的纯浏览器降级、账号 / 云端中转 / CRDT·OT、`StatePort`/`RouterPort`/`QueryPort`、插件内再套端口抽象、Module Federation、trpc 式中间件链、中立 IDL；一期不做 wasm runtime / 远程 registry / 签名校验 / 插件间直接依赖 / 插件沙箱（§19）。

目标目录与现状的对应关系：`hosts/electron` 已存在。
`core/`（TS 能力核心，内含 `kernel` / `channel-server` / `capabilities` / `plugin-host` 四 package）尚未建立，
能力实现现在还散在 `hosts/electron/src/services/`；`plugins/`、`elevate/` 也还没有。
`renderer/packages/platform-bridge` 规划更名为 `channel-client`（channel 之上的类型化前端 facade，不再「桥接多个宿主」）。

## 核心不变式（改动必须守住）

1. **UI 只认 channel client，永不感知宿主**。`platform === 'electron'`、`isBrowser` 这类判断在 `renderer/apps` 与 `renderer/packages` 中必须零出现——跨端差异一律经 capability 的 `available` / `reason` / `limits` 表达（§7）。
2. **channel server 是唯一信任边界**，所有入参在此做 zod 校验，ipc 与 ws 两条传输共用同一张校验表（§5）。
3. **core 内不得出现窗口 / 托盘 / 菜单概念** —— 浏览器会话根本没有窗口，core 里任何「当前窗口」假设都会在 ws 会话上崩。窗口 / 托盘 / 菜单属 host shell。
4. **两条传输共用同一份 channel 注册表**，不手工维护第二份清单。两条传输的差异只能来自**按会话求值**，且必须能由 `capability:list` 查出（§7.3）。
5. **core 对两条传输的对外行为由契约测试锁定**，不由代码审查或口头约定锁定（§15）。
6. **契约不得承诺实现不支持的能力**：字段做不到就从类型里删掉，或在 capability 的 `limits` 里显式声明，禁止静默降级（§5.5）。
7. **内核代码中不得出现具体业务模块的名字**。`grep -rn "switch-host" core/` 必须为空，由 CI 断言（§9.1）。
8. **事件不得先于提交**：跨端失效事件由 channel wrapper 在 handler **成功 resolve 之后**自动发出，插件拿不到 `ctx.publish()`——杜绝「业务代码在写成功前就广播失效」这类竞态（§8.4）。

## 跨包与分层规则

| layer | 可 import | 禁止 |
|---|---|---|
| `common`（protocol） | 无 | 任何运行时宿主 API；渲染侧只 `import type` |
| `browser`（renderer） | `common` | `node:*`、electron API、`renderer/apps/*`（packages 侧） |
| `node`（core） | `common` | electron、DOM |
| `electron-main`（hosts/electron） | `common`、`node` | DOM、renderer 代码 |
| `plugin-model`（`plugins/*/model`） | 无 | React、channel client、`node:*`、同插件的 `ui/` 与 `data/` |
| `plugin-ui`（`plugins/*/ui`） | `common`、同插件 `model/` `data/` | channel client 直连（必须经 `data/`） |
| `plugin-data`（`plugins/*/data`） | `common`、同插件 `model/`、channel client | 同插件的 `ui/` |

- **`protocol/` 的规则**：不是「零运行时依赖」，而是「**渲染进程侧零运行时开销**」——允许依赖 zod 作为 schema 真源，渲染侧只 `import type`，在 `verbatimModuleSyntax` 下被完全擦除（§5.4）。
- 平台适配器只实现契约接口，不含应用逻辑。
- 分层纪律要由 ESLint `no-restricted-paths` 强制（§3.1）。ESLint 一期要装（§20 阶段 0），当前未装，改动时靠人守。

## 代码约定

- 包名 `@x-tools/kebab-case`；内部依赖用 `workspace:*`；共享版本写在 `pnpm-workspace.yaml` 的 `catalog:` 段。
- **禁止默认导出**，只用命名导出。
- **禁止 index.ts 桶文件**，用描述性文件名 —— 例外：`protocol/src/index.ts` 作为公共 API 表面。
- **不可变数据**：始终创建新对象；接口属性与函数参数一律 `readonly`。
- **严格 TypeScript**：`strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`；禁止 `any`，用 `unknown` + 类型收窄。
- 导入顺序：Node 内置 → 外部包 → 工作区包 → 相对导入 → 纯类型导入（最后）。

| 实体 | 约定 | 示例 |
|---|---|---|
| 文件夹 / 通用文件 | kebab-case | `platform-bridge/`、`create-bridge.ts` |
| 组件文件 | PascalCase | `NavBar.tsx`、`ToolCard.tsx` |
| 变量 / 函数 | camelCase | `createBridge`、`detectPlatform` |
| 布尔值 | is/has/should/can 前缀 | `isLoading` |
| 接口 / 类型 | PascalCase | `IChannel`、`Capability` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| CSS 变量 | `--dt-`（令牌）/ `--color-`（语义） | `--dt-space-md` |

设计系统遵循 `DESIGN.md`（Vercel 风格；4px 基准网格、Geist 字体、5 级阴影）。

## 已知缺口（文档已记录，不要当成新发现或自己引入的问题）

| 位置 | 问题 |
|---|---|
| `hosts/electron/scripts/dev.mjs:7,41` | `.mjs` 里写了 TS 语法 → SyntaxError，`pnpm dev:electron` 跑不起来 |
| `hosts/electron/src/ipc/register.ts:14` | 直接解构 renderer 入参、拿 path 直接读写，无 schema、无路径白名单 —— 当前唯一的信任边界实缺口 |
| `hosts/electron/src/services/shell.ts:8` | `elevated` 参数只接收不生效 |
| `renderer/packages/platform-bridge/src/web-adapter.ts:25` | 一整套 `notImpl()` reject，方向与目标方案相反（应重写为 WS 客户端） |
| `renderer/apps/main/src/data/mock-tools.ts`、`NavBar.topItems` | 工具清单与一级导航硬编码，须换成 `viewContainers` / `views` 两级贡献点派生（§14） |
| `SubNav.categories`、`nav-store.ts:13-15` | 7 条固定分类须**删除**（搬进 `tool-catalog` 插件）；`activeNavId` / `activeCategoryId` 须删除（真源是 URL），`isSubNavCollapsed` 保留（§14.5） |

阶段 0（修地基：dev.mjs、gitignore、装 ESLint、装 vitest）**当前明确不执行**（§20.1）。

## 文档

- `docs/architecture/cross-platform-design.md` —— 跨端架构方案（索引，分章在同名目录）
- `docs/prd/switch-host.md` —— Switch-Host 模块产品需求
- `DESIGN.md` —— 视觉设计系统规范

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> xTools — 跨端模块化工具平台（Electron / Tauri 2 / Web / CLI-MCP）

## 语言要求

所有回答和输出内容必须使用中文。

## 命令

```bash
pnpm install                        # 仅允许 pnpm（preinstall 有 only-allow 守卫）

pnpm dev                            # Vite 开发服务器（端口 5173，strictPort）
pnpm dev:electron                   # Electron 开发模式 —— 当前跑不起来，见「已知缺口」
pnpm dev:tauri                      # Tauri 开发模式（自动带起 Vite + cargo）
pnpm build                          # 前端 SPA -> renderer/apps/main/dist/
pnpm build:electron                 # 前端 + 主进程 + electron-builder
pnpm tauri:build                    # Tauri 原生安装包
pnpm preview                        # 预览生产构建
pnpm typecheck                      # renderer/apps/main + electron + protocol
```

Rust 侧在 `tauri/` 目录内直接用 `cargo build` / `cargo clippy` / `cargo fmt` / `cargo test`。

**尚不存在的命令**：没有 lint（ESLint 未安装），没有 test（vitest / Playwright 均未安装）。
不要假设 `pnpm test` 可用；需要跑测试时先确认工具链已装。

## 仓库现状（实际目录）

```
xTools/
├── protocol/          # @x-tools/protocol —— 类型化 IPC 契约（channels / ports / types）
├── renderer/          # 前端 monorepo（React 19 + Vite 6 + Tailwind 4 + TanStack Router）
│   ├── apps/main/     # @x-tools/app-main —— 宿主应用 SPA
│   └── packages/      # design-tokens · i18n · icons · platform-bridge · types
├── electron/          # @x-tools/electron —— 主进程 + preload + IPC 注册 + services
├── tauri/             # Tauri 2 后端（Rust，crate 名 xtools，14 个 #[tauri::command]）
└── docs/              # 架构与 PRD 文档
```

`renderer/`、`electron/`、`tauri/` 各有自己的 CLAUDE.md（技术栈、组件规范、Rust 规范），
在对应子目录内工作时以子文件为准，本文件只讲跨目录的全局约定。

## 目标架构（文档是唯一真源）

`docs/architecture/cross-platform-design.md` 是 2026-08-30 对齐后的权威方案（索引 + 6 个分章）。
**它描述的是目标形态，与上面的现状目录有意不一致**，做架构相关改动前必须先读对应章节：

| 章节 | 文件 |
|---|---|
| §2 拓扑 · §3 monorepo 分层 · §4 双实现边界 | `cross-platform-design/01-topology.md` |
| §5 契约层（channel RPC / zod 真源 / 跨语言 codegen） | `02-contracts.md` |
| §6 四条触达路径 · §7 CLI 分发 · §8 提权 helper | `03-access-and-distribution.md` |
| §9 capability registry · §10 插件模型 | `04-capabilities-and-plugins.md` |
| §11 契约测试套件 | `05-contract-tests.md` |
| §12 不做 · §13 分期 · §14 决策状态 | `06-scope-and-roadmap.md` |

已定的关键决策（不要重新论证）：

- **TS core 与 Rust core 各一份完整实现**。Rust core 服务 Tauri / `xtools serve` / CLI-MCP 三条触达面，TS core 唯一消费者是 Electron main。代价是业务模块双写，由契约测试兜住漂移。
- **契约走 channel RPC**（借 VSCode `vs/base/parts/ipc` 分层），传输可换、业务零改动；现在的胖 `Bridge` 接口（`protocol/src/ports.ts:70`）要被替换，不是被扩展。
- **zod 是 schema 的唯一真源**，构建期导出 JSON Schema 供 Rust codegen 与 MCP 共用；Rust 侧 struct 是生成物，禁止手改。
- **CLI / serve / MCP 是同一个 Rust 二进制 `xtools` 的三个子命令**，不产出多个二进制。
- 提权走独立小二进制 `xtools-elevate`，不合并进 `xtools`。
- 明确不做：`StatePort`/`RouterPort`/`QueryPort`、Module Federation、trpc 式中间件链、中立 IDL、无后端的纯浏览器降级（§12）。

目标目录与现状的对应关系：`core-ts/`（TS 能力核心）与 `core-rs/`（Rust 能力核心）尚未建立，
能力实现现在还散在 `electron/src/services/` 与 `tauri/src/commands/`；`hosts/` 层级也还没拆出来。
kernel（DI 容器 / 事件总线 / 生命周期）属 `core-ts/packages/kernel` 的规划，代码里目前不存在。

## 核心不变式（改动必须守住）

1. **UI 只认 channel client，永不感知宿主**。`platform === 'electron'` 这类判断在 `renderer/apps` 与 `renderer/packages` 中必须零出现。
2. **channel server 是唯一信任边界**，所有入参在此做 schema 校验；TS / Rust 两份 server 的校验规则由同一份 schema 生成。
3. **core 内不得出现窗口 / 托盘 / 菜单概念** —— CLI 与 serve 形态没有窗口，这些属于 host shell。
4. **四条触达路径共用同一个 channel 注册表**，MCP tool 列表、CLI 子命令、HTTP 路由全部由注册表派生，不手工维护第二份清单。
5. **两份 core 的对外行为由契约测试锁定**，不由代码审查或口头约定锁定。
6. **契约不得承诺实现不支持的能力**：字段做不到就从类型里删掉，或在 capability 的 `limits` 里显式声明，禁止静默降级（§5.5）。

## 跨包与分层规则

| layer | 可 import | 禁止 |
|---|---|---|
| `common`（protocol） | 无 | 任何运行时宿主 API |
| `browser`（renderer） | `common` | `node:*`、electron / tauri API、`renderer/apps/*`（packages 侧） |
| `node`（core-ts） | `common` | electron、tauri、DOM |
| `electron-main` | `common`、`node` | DOM、renderer 代码 |

- **`protocol/` 的规则已变更**：不再是「零运行时依赖」，而是「**渲染进程侧零运行时开销**」——允许依赖 zod 作为 schema 真源，渲染侧只 `import type`，在 `verbatimModuleSyntax` 下被完全擦除（§5.4，已批准）。
- Rust 侧用 crate 依赖方向替代 layer 字段：`capabilities` / `modules` 不得依赖 `hosts/*`；传输壳只依赖 `channel`，不得绕过校验闸门直连 `capabilities`。
- 平台适配器只实现契约接口，不含应用逻辑。
- 分层纪律目前**只活在文档里**（ESLint 未装），改动时靠人守；落地强制的方案见 §3 末尾。

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
| `electron/scripts/dev.mjs:7,41` | `.mjs` 里写了 TS 语法 → SyntaxError，`pnpm dev:electron` 跑不起来 |
| `renderer/packages/platform-bridge/src/tauri-adapter.ts:107-133` | 11 处误用 `Channels` 常量当 Tauri 命令名，Tauri 下 storage / shell 全部调不通。**修法是 §5.3 的单 `rpc` 收口，不要逐个改命令名** |
| `electron/src/ipc/register.ts:14` | 直接解构 renderer 入参、拿 path 直接读写，无 schema、无路径白名单 —— 当前唯一的信任边界实缺口 |
| `electron/src/services/shell.ts:8`、`tauri/src/commands/shell.rs:24` | `elevated` 参数只接收不生效 |
| `tauri/src/commands/fs.rs:129` | `fs_watch` 只返回 UUID，从不 emit |
| `renderer/packages/platform-bridge/src/web-adapter.ts:25` | 一整套 `notImpl()` reject，方向与目标方案相反（应重写为 WS 客户端） |
| `renderer/apps/main/src/data/mock-tools.ts` 等 | 工具清单 / 导航 / 分类三处硬编码，待插件 manifest 接管 |
| `.gitignore` | 忽略了 `Cargo.lock`、未忽略 `tauri/gen/` —— 两条正好该对调 |

阶段 0（修地基：dev.mjs、gitignore、装 ESLint、装 vitest）**当前明确不执行**（§14）。

## 文档

- `docs/architecture/cross-platform-design.md` —— 跨端架构方案（索引，分章在同名目录）
- `docs/prd/switch-host.md` —— Switch-Host 模块产品需求
- `DESIGN.md` —— 视觉设计系统规范

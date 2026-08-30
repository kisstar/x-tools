# CLAUDE.md — xTools

> 跨平台模块化工具平台（Web / Tauri 2 / Electron）

## 语言要求

所有回答和输出内容必须使用中文。

## 项目结构

```
xTools/
├── renderer/          # 前端 monorepo（React 19, Vite, Tailwind 4）
│   ├── apps/main/     # @x-tools/app-main — 宿主应用（SPA）
│   └── packages/      # 共享库：design-tokens, i18n, icons, platform-bridge, types
├── electron/          # Electron 主进程（Node.js, CommonJS）
├── tauri/             # Tauri 2 后端（Rust）
└── protocol/          # @x-tools/protocol — 类型化 IPC 契约（命令、事件、类型）
```

## 常用命令

```bash
pnpm dev              # 启动前端开发服务器（Vite，端口 5173）
pnpm dev:electron     # 启动 Electron 开发模式（前端 + 主进程）
pnpm dev:tauri        # 启动 Tauri 开发模式（前端 + Rust 后端）
pnpm build            # 构建前端生产版本
pnpm build:electron   # 完整 Electron 打包（前端 + 主进程 + electron-builder）
pnpm typecheck        # 类型检查 renderer、electron 和 protocol
```

## 架构要点

- **整洁架构**：表现层 -> 应用层 -> 领域层 -> 基础设施层
- **依赖向内流动**：外层依赖内层，绝不反向
- **平台桥接**：所有平台 API 通过 `BridgePort` 接口访问 — Web/Tauri/Electron 适配器在运行时自动选择（`@x-tools/platform-bridge`）
- **协议包**：定义渲染进程与后端之间的类型化 IPC 命令/事件 — 跨进程通信的唯一真实来源
- **微内核**：DI 容器 + 事件总线 + 生命周期管理器

## 核心约定

- **包名**：`@x-tools/kebab-case`
- **工作区协议**：package.json 中内部依赖使用 `workspace:*`
- **版本目录**：共享版本定义在 `pnpm-workspace.yaml` 的 `catalog:` 段
- **禁止默认导出**：所有地方只使用命名导出
- **禁止 index.ts 桶文件**（使用描述性文件名）— 例外：`protocol/src/index.ts` 作为公共 API 表面
- **不可变数据**：始终创建新对象，绝不修改原对象
- **readonly**：所有接口属性和函数参数
- **严格 TypeScript**：`strict: true`，禁止 `any`，使用 `unknown` + 类型收窄

## 导入顺序

1. Node 内置模块（`node:path`）
2. 外部包（`@tanstack/react-router`、`react`）
3. 内部工作区包（`@x-tools/ui`、`@x-tools/protocol`）
4. 相对导入（`../utils/format`、`./Component`）
5. 纯类型导入放最后（`import type { ... }`）

## 跨包规则

- `protocol/` 必须零运行时依赖 — 纯类型和接口
- `renderer/packages/` 不可导入 `renderer/apps/`
- 平台适配器只实现 `BridgePort` 接口 — 不含应用逻辑
- Electron 主进程和 Tauri 后端不可导入前端代码（仅允许 protocol）

## 命名规范

| 实体 | 约定 | 示例 |
|------|------|------|
| 文件夹 | kebab-case | `switch-host/`、`platform-bridge/` |
| 文件（通用） | kebab-case | `create-bridge.ts`、`use-theme.ts` |
| 文件（组件） | PascalCase | `NavBar.tsx`、`ToolCard.tsx` |
| 变量 / 函数 | camelCase | `createBridge`、`detectPlatform` |
| 布尔值 | is/has/should/can 前缀 | `isLoading`、`hasPermission` |
| 接口 / 类型 | PascalCase | `BridgePort`、`PluginManifest` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| CSS 变量 | `--dt-`（令牌）、`--color-`（语义） | `--dt-space-md`、`--color-ink` |

## 设计系统

遵循 Vercel 风格设计语言（详见 `DESIGN.md`）。关键令牌：
- 颜色：`--color-ink`、`--color-canvas`、`--color-hairline`、`--color-primary`
- 间距：4px 基准网格（`--dt-space-xxs` 到 `--dt-space-6xl`）
- 字体：Geist（无衬线）+ Geist Mono（等宽）
- 阴影：5 级层级系统（`--dt-shadow-level-1` 到 `--dt-shadow-level-5`）

## 测试

- 框架：Vitest（单元/集成），Playwright（E2E）
- 覆盖率目标：80%+
- 测试文件就近放置：`*.test.ts` 放在源文件旁边

## 文档

- `docs/architecture/cross-platform-design.md` — 跨端架构设计方案（索引，分章在同名目录下）
- `docs/prd/` — 各模块产品需求文档
- `DESIGN.md` — 视觉设计系统规范

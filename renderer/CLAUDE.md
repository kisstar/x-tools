# CLAUDE.md — renderer/

> 前端 monorepo：React 19 + Vite + Tailwind CSS 4 + TanStack Router

## 语言要求

所有回答和输出内容必须使用中文。

## 目录结构

```
renderer/
├── apps/main/         # @x-tools/app-main — 宿主应用 SPA
│   ├── src/
│   │   ├── components/    # 应用级组件
│   │   ├── layouts/       # Shell 布局（AppShell, Header, NavBar）
│   │   ├── pages/         # 路由页面
│   │   ├── hooks/         # 应用级 Hooks
│   │   ├── store/         # Zustand 状态切片
│   │   ├── providers/     # React Context 提供者
│   │   ├── router.tsx     # TanStack Router 路由树
│   │   └── main.tsx       # 入口文件
│   └── vite.config.ts
└── packages/
    ├── design-tokens/     # CSS 自定义属性 + Tailwind 预设
    ├── i18n/              # i18next 配置 + 语言包加载
    ├── icons/             # 图标库封装（Lucide）
    ├── platform-bridge/   # BridgePort 运行时检测 + 适配器
    └── types/             # 共享 TypeScript 接口
```

## 命令

```bash
# 从仓库根目录执行：
pnpm dev                 # Vite 开发服务器，地址 http://localhost:5173
pnpm build               # 生产构建 -> renderer/apps/main/dist/
pnpm preview             # 本地预览生产构建
pnpm typecheck           # 类型检查（包含 renderer tsconfig）
```

## 技术栈

| 关注点 | 库 | 说明 |
|--------|-----|------|
| 框架 | React 19 | 仅函数组件，禁止类组件 |
| 路由 | TanStack Router | 类型安全，文件约定可选 |
| 状态 | Zustand | 切片放 `store/`，无全局单一 store |
| 样式 | Tailwind CSS 4 | 通过 CSS 变量使用设计令牌，禁止任意值 |
| 国际化 | i18next + react-i18next | 按模块命名空间，懒加载 |
| 图标 | Lucide React | 可摇树，线宽一致 |

## 组件规范

- 一个文件一个组件，PascalCase 文件名与组件名匹配
- Props 定义为 `interface 组件名Props`，放在组件上方
- 文件底部命名导出：`export { ComponentName }`
- 禁止 `React.FC` — 使用普通函数声明
- Hooks：`use` 前缀，camelCase 文件名（`use-theme.ts`）

```typescript
interface ToolCardProps {
  readonly tool: ToolManifest
  readonly onPin: (toolId: string) => void
  readonly isPinned: boolean
}

function ToolCard({ tool, onPin, isPinned }: ToolCardProps) {
  // ...
}

export { ToolCard }
```

## 样式规则

- 仅使用 Tailwind 工具类 — 禁止内联样式、禁止 CSS Modules
- 通过 Tailwind 主题扩展引用设计令牌（如 `bg-canvas`、`text-ink`、`border-hairline`）
- 禁止使用 Tailwind 任意值（`bg-[#xxx]`）— 缺少令牌时，添加到 `design-tokens`
- 暗色模式通过 `<html>` 上的 `data-theme="dark"` 属性切换，令牌自动适配

## 平台桥接

`@x-tools/platform-bridge` 检测运行时并提供正确的适配器：

```typescript
import { createBridge } from '@x-tools/platform-bridge'

const bridge = await createBridge()  // 自动检测：tauri | electron | web
bridge.fs.readFile(path)
```

- Web 适配器：桩实现或 fetch/WebSocket 连接本地服务器
- Tauri 适配器：封装 `@tauri-apps/api` 的 invoke/listen
- Electron 适配器：封装 `window.electronAPI`（preload 暴露）

## 状态管理

- 每个功能在 `store/` 中有独立的 Zustand 切片
- 切片是返回 store 创建器的纯函数
- 组件中不直接访问 store — 封装为自定义 Hook
- 仅使用不可变更新（展开运算符，禁止修改原对象）

## 路由

- 路由定义在 `src/router.tsx`，使用 TanStack Router
- 根路由组件（`AppShell`）作为全局布局包裹所有路由
- 模块页面使用 `React.lazy` + 路由 `component` 懒加载

## TypeScript 配置

- 基础配置：`renderer/tsconfig.json`（严格模式、ESNext 模块、bundler 解析）
- JSX：`react-jsx` 转换（无需导入 React）
- `verbatimModuleSyntax: true` — 类型导入必须使用 `import type`
- `noUncheckedIndexedAccess: true` — 数组/对象索引返回 `T | undefined`
- `exactOptionalPropertyTypes: true` — `undefined` 必须显式声明

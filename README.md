# xTools

xTools 是一个跨平台智能工具平台，灵感来源于 [uTools](https://www.u-tools.cn/)，目标是模块化、AI 优先、插件驱动的工作空间，支持 Web、Tauri 2 和 Electron 三种运行时。

## 仓库结构

```
xTools/
├── renderer/      # 前端 monorepo（React + Vite，所有 UI 代码）
│   ├── apps/main/             # 主应用
│   └── packages/              # 共享包：design-tokens、i18n、icons、types、platform-bridge
├── protocol/      # @x-tools/protocol — 渲染进程与主进程之间的类型化协议
├── electron/      # @x-tools/electron — Electron 主进程 + IPC 实现
└── tauri/         # Tauri 2 后端（Rust）
```

## 先决条件

- Node.js >= 20
- pnpm >= 9
- Rust（仅在打 Tauri 时需要）：`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- Tauri CLI：`cargo install tauri-cli --version "^2.0.0"`

## 安装

```bash
pnpm install
```

## 开发

```bash
# 仅 Web（浏览器）
pnpm dev

# Electron 桌面端（自动启动 Vite 并打开 Electron 窗口）
pnpm dev:electron

# Tauri 2 桌面端（自动启动 Vite 并编译 Rust）
pnpm tauri:dev
```

## 构建

```bash
# Web SPA
pnpm build

# Electron 安装包（dmg / nsis / AppImage / deb）
pnpm build:electron

# Tauri 原生安装包
pnpm tauri:build
```

## 架构

整体架构遵循"端口与适配器"模式：

- 渲染层调用 `@x-tools/protocol` 中定义的端口接口（`FileSystemPort`、`WindowPort`、`StoragePort` 等）
- `@x-tools/platform-bridge` 在运行时检测平台并返回对应的适配器
  - Tauri：`@tauri-apps/api invoke()` → Rust 命令处理器
  - Electron：`window.electronAPI.invoke()` → 主进程 IPC 处理器
  - Web：本地降级实现（localStorage、Web Notifications API 等）
- 同一份渲染代码在三种运行时中行为一致

详见 [docs/architecture/cross-platform-design.md](./docs/architecture/cross-platform-design.md)。

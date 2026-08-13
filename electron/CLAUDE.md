# CLAUDE.md — electron/

> Electron 主进程：桌面应用的 Node.js 后端

## 语言要求

所有回答和输出内容必须使用中文。

## 目录结构

```
electron/
├── src/
│   ├── main.ts            # 入口：应用生命周期、窗口创建
│   ├── preload.ts         # 上下文桥接（向渲染进程暴露 electronAPI）
│   ├── ipc/               # IPC 处理器注册（ipcMain.handle）
│   ├── services/          # 后端服务（文件、存储等）
│   └── window/            # 窗口管理工具
├── scripts/
│   └── dev.mjs            # 开发脚本（同时启动前端和 Electron）
├── package.json           # @x-tools/electron
└── tsconfig.main.json     # CommonJS 输出，Node 类型，outDir: ./dist
```

## 命令

```bash
# 从仓库根目录执行：
pnpm dev:electron          # 开发模式（前端 HMR + Electron 重载）
pnpm build:electron        # 完整构建（前端 + 主进程 + electron-builder）

# 从 electron/ 目录执行：
pnpm typecheck             # 类型检查主进程代码
pnpm build:main            # 编译 TS -> dist/（CommonJS）
```

## 核心规则

### 模块系统

- **CommonJS 输出**（tsconfig 中 `"module": "CommonJS"`）— Electron 主进程需要 CJS
- 通过标准 import 导入 protocol 类型（编译时解析）
- Node 内置模块使用 `node:` 前缀：`import { resolve } from 'node:path'`

### IPC 通信模式

所有渲染进程 <-> 主进程通信通过 `@x-tools/protocol` 定义的通道：

```typescript
// ipc/file-system.ts — 注册处理器
import { ipcMain } from 'electron'

ipcMain.handle('fs:readFile', async (_event, path: string) => {
  // 具体实现
})
```

```typescript
// preload.ts — 通过 contextBridge 暴露给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  fs: {
    readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
  },
})
```

- 通道名必须与 `@x-tools/protocol` 定义一致
- 所有 IPC 处理器必须验证输入（路径穿越、权限）
- 只返回可序列化数据（Buffer 需要转换）

### 安全

- **上下文隔离**：始终启用，禁止 `nodeIntegration`
- **Preload 脚本**：是向渲染进程暴露 Node API 的唯一途径
- 验证所有来自渲染进程的文件路径 — 防止路径穿越
- 永远不向渲染进程暴露原始 `ipcRenderer`
- 传递给 Node API（fs、child_process）前必须清理用户输入

### 窗口管理

- 默认单窗口（未来可配置多窗口）
- `BrowserWindow` 配置：`contextIsolation: true`、`sandbox: true`
- 开发模式加载 `http://localhost:5173`，生产模式加载本地 `file://` 指向前端 dist

### 依赖管理

- `@x-tools/protocol`：workspace 依赖 — 共享 IPC 类型
- `electron`：devDependency（由 electron-builder 打包）
- 保持主进程依赖最少 — 所有依赖都会打进应用包

### 构建输出

- TypeScript 编译到 `dist/`（CJS）
- electron-builder 读取 `dist/main.js` 作为入口
- 前端 dist 引用自 `../renderer/apps/main/dist/`
- 平台目标：macOS（dmg, arm64/x64）、Windows（nsis, x64）、Linux（AppImage/deb, x64）

## 禁止事项

- 禁止从 `renderer/` 包导入（只允许 `protocol/`）
- 禁止输出中使用 ES 模块语法（必须 CJS）
- 禁止在渲染进程代码中访问 Electron API（使用 preload 桥接）
- 禁止在未检查 electron-builder 兼容性的情况下引入大型原生模块

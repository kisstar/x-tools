# CLAUDE.md — tauri/

> Tauri 2 后端：桌面应用的 Rust 原生外壳

## 语言要求

所有回答和输出内容必须使用中文。

## 目录结构

```
tauri/
├── src/
│   ├── main.rs            # 入口：Tauri builder 配置、插件注册
│   ├── state.rs           # 应用状态（Mutex 包装的共享状态）
│   └── commands/          # Tauri 命令处理器（#[tauri::command]）
├── Cargo.toml             # Crate 配置（edition 2021, rust-version 1.77）
├── build.rs               # Tauri 构建脚本
├── tauri.conf.json        # Tauri 配置（窗口、CSP、打包、构建钩子）
└── capabilities/          # Tauri 权限能力声明
```

## 命令

```bash
# 从仓库根目录执行：
pnpm dev:tauri             # 开发模式（前端 Vite + cargo tauri dev 热重载）
pnpm tauri:build           # 生产构建（原生二进制）

# 直接 cargo（从 tauri/ 目录）：
cargo build                # 调试构建
cargo clippy               # 代码检查
cargo test                 # 运行测试
cargo fmt                  # 格式化
```

## 核心规则

### Tauri 命令模式

```rust
#[tauri::command]
async fn read_file(path: String) -> Result<String, String> {
    // 验证路径、执行操作、返回可序列化结果
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}
```

- 命令默认异步 — I/O 操作使用 `async fn`
- 返回 `Result<T, String>`（或实现 `Serialize` 的自定义错误类型）
- 在 `main.rs` 中注册：`.invoke_handler(tauri::generate_handler![read_file])`
- 命令名映射到 `@x-tools/protocol` 的通道定义

### 使用的 Tauri 插件

| 插件 | 用途 |
|------|------|
| `tauri-plugin-shell` | 执行系统命令 |
| `tauri-plugin-fs` | 文件系统访问（受限作用域） |
| `tauri-plugin-dialog` | 原生文件/文件夹对话框 |
| `tauri-plugin-notification` | 系统通知 |
| `tauri-plugin-store` | JSON 键值持久化 |

### 状态管理

```rust
use std::sync::Mutex;

pub struct AppState {
    // Mutex 包装的共享可变状态
}

// 在命令中通过 State<> 访问：
#[tauri::command]
async fn get_config(state: tauri::State<'_, Mutex<AppState>>) -> Result<Config, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    // ...
}
```

### 安全

- **CSP 强制执行**：在 `tauri.conf.json` 中配置 — 无充分理由不得削弱
- 文件系统访问通过 `tauri-plugin-fs` 权限限定作用域
- 验证所有来自前端的路径 — 禁止无限制的文件访问
- 使用 `capabilities/` 声明最小所需权限
- 未经用户明确同意不得暴露 shell 执行能力

### 构建配置

- `tauri.conf.json`：
  - `build.beforeDevCommand`：启动前端开发服务器
  - `build.devUrl`：`http://localhost:5173`
  - `build.frontendDist`：`../renderer/apps/main/dist`
  - 窗口：默认 1440x900，最小 960x600，覆盖式标题栏
- Release 配置：`panic = "abort"`，启用 LTO，剥离符号

### Rust 代码风格

- Edition 2021，最低 Rust 1.77
- 使用 `thiserror` 定义自定义错误类型（如有引入）
- 简单命令用 `String` 错误，复杂场景用自定义错误类型
- `tokio` 作为异步运行时（启用 full 特性）
- `serde` + `serde_json` 负责所有序列化
- 提交前运行 `cargo fmt` 和 `cargo clippy`

## 禁止事项

- 禁止导入或引用前端 TypeScript 代码（仅 protocol 概念适用）
- 禁止在未说明原因的情况下禁用或削弱 CSP
- 禁止在未注释说明不变量的情况下使用 `unsafe`
- 禁止在未检查跨平台兼容性的情况下添加原生依赖
- 禁止向前端暴露无限制的文件系统访问

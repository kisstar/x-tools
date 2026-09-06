# 触达路径、实现语言与分发

> 属 [xTools 跨端架构设计方案](../cross-platform-design.md)。章节编号沿用总文，行内 `§N.M` 引用按索引的映射表定位。

---

## 6. 四条触达路径

四者的差别只在「谁提供 `IMessagePassingProtocol`」和「谁做鉴权」，业务代码完全一致。

| 路径 | 传输 | 鉴权 | 谁在用 |
|---|---|---|---|
| Electron | `ipcRenderer` ↔ `ipcMain` | preload 白名单 + sender guard | 桌面端 UI |
| Tauri | 单 `rpc` 命令 + `Channel` | Tauri capabilities 配置 + 单命令内校验 | 桌面端 UI |
| Web | WebSocket → `xtools serve` | **loopback 绑定 + 一次性 token**（见下） | 浏览器打开 UI |
| CLI / MCP | in-process | 进程内，无跨进程边界 | AI Agent |

### 三重闸门（Electron 路径）

1. **preload 白名单** → `CHANNEL_NOT_ALLOWED`
2. **main sender guard**（校验 `webContentsId` 属顶层窗口 + `senderFrame.origin` 在白名单）→ `FORBIDDEN`
3. **zod 入参校验** → `INVALID_ARGS`

这三层在工程上有两个必须避开的坑：

- **绕过闸门的旁路通道**：契约里声明了 channel，实现却用裸 `ipcMain.handle` + 裸 `ipcRenderer.invoke`，三层一起绕过。**纪律要靠 wrapper 强制，不能靠人记得用**——`registerChannel()` 应是注册的唯一入口，裸 `ipcMain.handle` 用 ESLint 禁掉。
- **preload 静默失败**：未白名单的 `invoke` 会 reject（正确），但未白名单的 `on` 若**静默返回 noop 退订函数**、`send` 若**静默丢弃**，问题就被埋掉了。三个入口的 fail 行为必须一致地响亮。

### Web 路径的安全基线

本地 server 一旦监听端口，任何本机进程（含浏览器里的任意站点，通过 DNS rebinding 或 `localhost` 直连）都可能访问它。因此：

- 只绑 `127.0.0.1`，**不绑 `0.0.0.0`**
- 启动时生成一次性 token 写入 `~/.xtools/session`（0600），UI 首次连接携带；无 token 一律拒绝
- 校验 `Origin` 头，只允许 server 自己托管的 UI 源
- WebSocket 升级前完成鉴权，不接受未鉴权连接
- 默认不启用 CORS 通配

**这一层是 `xtools serve` 的实缺口，必须在第一版就有，不能留到后面补。**

### 五个稳定的传输层错误码

`CHANNEL_NOT_ALLOWED` / `FORBIDDEN` / `CAPABILITY_UNAVAILABLE` / `INVALID_ARGS` / `INTERNAL`。业务错误码由各 channel 自行定义，不与这五个混用。UI 侧负责翻译成文案，传输层只保留稳定码。

---

## 7. server / CLI 的实现语言与分发（正面回答）

### 7.1 前提核对：判断成立，但「无依赖」不是 Rust 独占

「Rust 二进制不依赖外部环境，TS 的 CLI 需要 Node」——这个判断在**裸跑 `node dist/serve.js`** 的前提下完全正确。但需要补一条事实：TS 侧同样能产出自包含二进制。

| 方案 | 产物 | 需用户装 Node | 启动 | 状态 |
|---|---|---|---|---|
| `bun build --compile` | 单文件，约 55–100MB | **否** | ~10–30ms | stable |
| Node SEA（`--experimental-sea-config`） | 单文件，约 80–110MB | **否** | ~40–80ms | 实验性（Node 20+） |
| `deno compile` | 单文件，约 80MB | **否** | ~30ms | stable |
| 裸 `node dist/serve.js` | ~2MB | **是** | ~50ms | — |
| Rust + axum（release+LTO+strip） | 单文件，约 3–8MB | **否** | ~5ms | — |

（体积与启动为量级估算，需实测确认；`vercel/pkg` 已于 2024 年归档，不要用。）

**所以「不依赖 Node」是打包方式的属性，不是 Rust 独占的属性。** 真实差距是体积约 20 倍（100MB vs 5MB）与启动约 5 倍（30ms vs 5ms）。这一点必须说清楚，否则后续讨论会拿一个不成立的前提当论据。

### 7.2 已选定：Rust server + Rust core

三种组合的后果：

| 组合 | 后果 | 结论 |
|---|---|---|
| Rust server + TS core | Rust 得 spawn Node 子进程或内嵌 JS 引擎。前者「无依赖」优势归零（还是要 Node，只是藏起来了），后者复杂度爆炸 | ❌ |
| **Rust server + Rust core** | Web 形态经 serve 拿能力 → **Rust core 必须完整**（含业务模块）→ 每个业务模块双写 | ✅ **已选定** |
| TS server + TS core | Rust core 可维持在 OS 原语子集，成本更低；但 CLI/serve 分发体积约 100MB，且 Tauri 长期停在二等宿主 | ❌ |

选定第二种，代价与收益都明确：

- **代价**：业务模块双写，Rust core 的实现进度成为 Web 与 CLI 两条触达面的关键路径（§13）；schema 需跨语言 codegen（§5.6）；契约测试从「保险」升级为「生命线」（§11）。
- **收益**：CLI 与 serve 是零外部运行时依赖的 5–10MB 单二进制，AI Agent 场景下「下一个二进制就能跑」；Tauri 随 Rust core 完整而自然与 Electron 功能对等，不再是二等宿主。

「Electron 为主」从此只指**发行形态**——用户下载安装的客户端主要是 Electron，不再指能力实现的重心。

### 7.3 TS core 的定位收窄

TS core 仍然完整实现，但**唯一消费者是 Electron main**。它不再服务 CLI / serve / MCP，因此：

- 不需要为它做 `bun build --compile`——Electron 自带 Node runtime，TS core 随客户端一起分发，额外体积为 0。
- 它不承担 loopback server。若 Electron 客户端也想对外提供 `serve`（例如已装客户端的用户在浏览器打开 UI），有两种选择：客户端内嵌一个 WS 传输挂到 TS channel server 上，或直接 spawn 随包附带的 `xtools` 二进制。**一期取前者**（不引入进程管理），但两条路的对外 HTTP/WS 行为由同一份契约用例锁定，切换成本低。

### 7.4 分发矩阵

| 场景 | 能力由谁提供 | 额外分发体积 |
|---|---|---|
| 已装 Electron 客户端 | Electron main + TS core（内嵌 WS 传输供浏览器打开 UI） | **0** |
| 已装 Tauri 客户端 | Tauri 壳 + Rust core（静态链接） | 0 |
| 仅 CLI / MCP / serve | `xtools` 单二进制（Rust，含 core + serve + MCP） | **~5–10MB** |
| 开发态 | `cargo run -p cli -- serve` / `pnpm dev:electron` | — |

`xtools` 是**一个**二进制，`serve` / `mcp` / 各业务子命令都是它的子命令。不产出多个二进制，避免 Rust core 被静态链接多遍。

---

## 8. 提权 helper 为什么仍要独立

Rust core 已经是 Rust 了，很自然会问：提权动作直接由 `xtools` 二进制以 root 跑不就行了？**不行。** 判断依据不是语言，是**以 root 运行的那个进程有多大能力**。

改 hosts（Switch-Host 的核心动作）、装证书、写系统目录都要 root / 管理员。此时执行体的攻击面直接决定风险等级：

| 以 root 运行的东西 | 体积 | 该进程具备的能力 |
|---|---|---|
| 完整 `xtools` 二进制 | ~5–10MB | HTTP/WS server、全部业务模块、任意路径读写、子进程 spawn |
| Node 单二进制 | ~100MB | 完整 JS 引擎、`eval`、动态 `require`、完整依赖链 |
| **`xtools-elevate`（Rust）** | ~3MB | 只有编译进去的那几个白名单动作，无脚本执行能力、不监听端口 |

完整 core 二进制含 server 与全部模块，以 root 跑等于把一个监听端口的多能力进程提到管理员权限——这比 Node 那一栏危险程度低，但仍远高于一个只有三四个白名单动作的 helper。**因此 `elevate-rs` 保持独立 crate、独立二进制，不合并进 `xtools`。**

`elevate-rs` 产出一个极小的二进制，接口是**固定的白名单动作**而非通用命令执行：

```
xtools-elevate hosts-write --stdin-content   # 内容从 stdin 读，不走 argv
xtools-elevate hosts-backup
```

要求：

- **不接受任意 shell 命令**，只接受枚举出的动作；`shell.ts:8` / `shell.rs:24` 现在那个只接收不生效的 `elevated` 参数，正确形态是把它换成对本 helper 的调用，而不是给 shell 命令加个提权开关
- 目标路径在 helper 内部硬编码或经白名单校验，不信任调用方传入的 path
- 文件内容走 stdin，不走 argv（避免出现在进程列表 / shell 历史）
- 每次提权动作写审计日志
- TS core 与 Rust core **共同调用同一个 helper**，因此 §4 表格里「提权执行」这一行的契约测试是强制的

这样 Rust 承担了它真正有优势的部分（最小攻击面的原生执行体），而不必为了「无依赖」去重写整个 server。

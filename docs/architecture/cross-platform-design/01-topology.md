# 拓扑与分层

> 属 [xTools 跨端架构设计方案](../cross-platform-design.md)。章节编号沿用总文，行内 `§N.M` 引用按索引的映射表定位。

---

## 2. 整体拓扑

```
                    渲染进程 UI（完全一套，零平台分支）
                              │
                     typed channel client
              ┌───────────────┼───────────────┬──────────────┐
        electron ipc     tauri invoke      WebSocket     MessagePort
              │               │               │      （Extension Host，二期）
              ▼               ▼               ▼
        Electron main    Tauri Rust     xtools serve（Rust）
              │               │               │
      ┌───────┴───────┐  ┌────┴───────────────┴────┐
      │ channel server│  │  channel server（Rust）  │
      │    （TS）     │  │ 路由 + schema 校验 + 审计 │
      └───────┬───────┘  └────────────┬────────────┘
              │                       │
     ┌────────┴────────┐     ┌────────┴─────────┐
     │ TS core（完整） │     │ Rust core（完整） │
     └────────┬────────┘     └────────┬─────────┘
              │                       │
     仅被 Electron main 复用    被 Tauri / serve / CLI-MCP 复用
                                      │
                                ┌─────┴──────┐
                                │ CLI / MCP  │ in-process channel
                                └────────────┘   → tool 列表零手工维护

            ┌────────────────────────────┐
            │ xtools-elevate（Rust, ~3MB）│ ← 提权执行体，两个 core 共同调用
            └────────────────────────────┘
```

**注意 channel server 也是两份**（TS 一份供 Electron，Rust 一份供其余三条路径）。这是双实现的必然结果，也让 §5.6 的 schema 跨语言真源成为强制项——两份 server 各自做入参校验，若 schema 不同源，信任边界就出现两套不一致的规则。

### 插件在这张图里的位置

上图画的全部是**内核**。业务能力不在图里，它们是插件，挂在 plugin host 上（§15）：

```
        ┌──────────────── 内核（上图全部）────────────────┐
        │ channel server · capability registry           │
        │ plugin host · transports · capabilities        │
        └───────────────────────┬────────────────────────┘
                                │ PluginContext（唯一访问面）
        ┌───────────────────────┴────────────────────────┐
        │  plugins/  switch-host · json-formatter · ...   │
        │  内置与动态安装同一套机制，manifest 声明 runtime  │
        └────────────────────────────────────────────────┘
```

插件后端的源码**物理上都在插件目录内**（§20.1 的 `backend/ts` / `backend/rs`），内核侧不存放业务代码。两侧的挂载方式不对称，源于静态编译这条硬约束：

- **TS 侧不需要挂载点。** `ts` 后端由 plugin host 在运行时按 manifest 路径 `import()`（§16.2），因此 `core-ts/packages/modules/` 没有内容可放，**这个包不该存在**。
- **Rust 侧需要一份，且必须是生成物。** `rust-builtin` 后端在编译期链接进二进制，需要一处 `register_all()`。它一旦手写就会列出插件名，直接违反不变式 6，因此 `core-rs/crates/modules/` 的唯一内容是**构建期从各插件 manifest 派生生成**的注册代码（详见 §3「workspace 归属」）。

### 关键不变式

1. **UI 只认 channel client**，永不感知宿主。`platform === 'electron'` 这类判断在 `renderer/apps` 与 `renderer/packages` 中必须零出现。
2. **channel server 是唯一的信任边界**，所有入参在此处做 schema 校验；两份 server 的校验规则由**同一份 schema 生成**，不手写第二遍。
3. **core 内不得出现窗口/托盘/菜单概念**。CLI 与 serve 形态没有窗口，这些属于 host shell。
4. **同一宿主内的各触达面共用同一份 channel 注册表**。MCP tool 列表、CLI 子命令、HTTP 路由全部由该宿主的注册表派生，不手工维护第二份清单。（**已修订**：不同宿主的注册表可因插件 runtime 支持情况而不同，差异必须能由 `capability:list` 查出，见 §19.4。）
5. **两份 core 的对外行为由契约测试锁定**，不由代码审查或口头约定锁定（§11）。
6. **内核代码中不得出现具体业务模块的名字**。`grep -rn "switch-host" core-ts/ core-rs/` 必须为空，由 CI 断言（§15.1）。业务概念——导航项、首页工具卡、命令面板条目、设置分区——全部是插件贡献物。

---

## 3. monorepo 拓扑与分层

```
xTools/
├── protocol/                       # layer: common —— channel 契约 + zod schema（见 §5）
│
├── core-ts/                        # layer: node —— TS 能力核心（完整实现，唯一消费者是 Electron main）
│   ├── packages/capabilities/      # OS 原语：fs / shell / storage / net / path-guard
│   ├── packages/channel-server/    # channel 路由 + schema 校验 + capability registry
│   ├── packages/plugin-host/       # 发现 / 装载 / 卸载 / effect 回收 / 权限闸门（§15.1、§17）
│   └── packages/kernel/            # DI 容器 + 事件总线 + 生命周期 + 插件注册表（不依赖 React）
│                                   #   注意：没有 modules/ —— ts 后端由 plugin host 运行时 import()
│
├── core-rs/                        # Rust 能力核心（完整实现，见 §4）
│   ├── crates/capabilities/        # OS 原语
│   ├── crates/modules/             # 仅一份构建期生成的 register_all()，无业务代码（见下）
│   ├── crates/channel/             # channel 路由 + schema 校验（schema 由 §5.6 codegen 产出）
│   └── crates/kernel/              # 能力注册表 + 生命周期 + plugin host（内置插件）
│
├── elevate-rs/                     # Rust 提权 helper 二进制（见 §8）
│
├── plugins/                        # 内置插件源码，一插件一目录（§20.1 的四层结构）
│   └── switch-host/                #   manifest.json · ui/ · model/ · data/ · backend/{ts,rs}
│
├── hosts/
│   ├── electron/                   # layer: electron-main —— 薄壳：窗口/托盘/菜单/更新 + ipc 传输
│   ├── tauri/                      # Rust 薄壳：窗口 + 单 rpc 命令传输
│   └── cli/                        # Rust bin crate（产出二进制 xtools）—— argv 解析
│                                   #   三个子命令：业务命令 / `serve` / `mcp`，同一个二进制
│
└── renderer/                       # layer: browser —— UI，完全一套
    ├── apps/main/
    └── packages/                   # channel-client / design-tokens / i18n / icons / types
```

CLI / serve / MCP 不是三个包，而是**一个** Rust bin crate `cli` 的三个子命令（产出二进制名 `xtools`）：

| 子命令 | 传输 | 用途 |
|---|---|---|
| `xtools <业务命令>` | in-process，一次性执行后退出 | 人在终端里用、脚本调用 |
| `xtools serve` | HTTP + WebSocket，loopback | 浏览器打开 UI（§7.4） |
| `xtools mcp` | stdio JSON-RPC，长驻 | AI Agent 挂载 |

三者都只是同一个 channel server 前面换一层传输适配，不含任何业务逻辑；子命令清单与 MCP tool 列表同由 channel 注册表派生（不变式 4）。拆成两个二进制会让 Rust core 静态链接两遍，分发体积翻倍且无收益，还要维护两份注册表初始化路径。

crate 名与目录名不必一致：`hosts/tauri` 的 crate 不能叫 `tauri`（会与 crates.io 的 `tauri` 依赖同名冲突），按 Cargo 惯例另取一个名字。

### workspace 归属

一个仓库两套 workspace，顶层目录被两边分别收：

| workspace | members / globs |
|---|---|
| pnpm（`pnpm-workspace.yaml`） | `protocol`、`core-ts/packages/*`、`hosts/electron`、`renderer/apps/*`、`renderer/packages/*`、**`plugins/*`** |
| cargo（顶层 `Cargo.toml`，**当前不存在**） | `core-rs/crates/*`、`hosts/tauri`、`hosts/cli`、`elevate-rs`、**`plugins/*/backend/rs`** |

**`plugins/*` 必须进 pnpm workspace。** 内置插件的 `ui/` 参与主 bundle 构建（§20.3），要用 React 与 workspace 内的 `channel-client`，因此每个插件目录有自己的 package.json。现状 globs 只有 `renderer/apps/*` / `renderer/packages/*` / `electron` / `protocol`，缺 `plugins/*`。

**动态安装的插件不进任何 workspace。** 它们是磁盘上的预构建 ESM，装在 userData 目录下，不在仓库里。§15.3「内置不是特权代码路径」指的是**机制**同一套（manifest / 贡献点 / 生命周期 / 权限闸门 / 卸载语义），**分发形态本来就不同**——内置随客户端一起构建，动态的运行时 `import()`。

cargo workspace 现在还不存在（`tauri/Cargo.toml` 是单 crate）。建立时 `members` 用 glob 收插件后端：

```toml
members = ["core-rs/crates/*", "hosts/tauri", "hosts/cli", "elevate-rs", "plugins/*/backend/rs"]
```

`backend/rs` 是**插件目录内的一个 crate**（自带 Cargo.toml），由 `core-rs` 以路径依赖引入。因此 `core-rs/crates/modules/` 里没有业务代码，唯一内容是一份 `register_all()`——而它一旦手写就会列出插件名，直接违反不变式 6。**这份注册必须由构建期从各插件 manifest 派生生成**（`build.rs` 或 codegen 产物），并沿用 §5.6 的同一条纪律：生成物、禁止手改、CI 断言重新生成后无 diff。

### layer 纪律（必须有工具强制）

| layer | 可 import | 禁止 |
|---|---|---|
| `common` | 无 | 任何运行时宿主 API |
| `browser` | `common` | `node:*`、electron、tauri API |
| `node` | `common` | electron、tauri、DOM |
| `electron-main` | `common`、`node` | DOM、renderer 代码 |
| `browser`（renderer/packages） | `common` | `renderer/apps/*` |
| `plugin-model`（`plugins/*/model`） | 无 | React、channel client、`node:*`、同插件的 `ui/` 与 `data/`（§20.1） |
| `plugin-ui`（`plugins/*/ui`） | `common`、同插件 `model/` `data/` | channel client 直连（必须经 `data/`） |
| `plugin-data`（`plugins/*/data`） | `common`、同插件 `model/`、channel client | 同插件的 `ui/` |

Rust 侧不参与 layer 字段体系（无 package.json），用 crate 依赖方向替代：`capabilities` / `modules` 不得依赖 `hosts/*`；`tauri` 与 `cli` 都只依赖 `channel`，不直接依赖 `capabilities` crate——保证传输壳不绕过 channel server 的校验闸门。这条由 `cargo-deny`/CI 检查依赖图落实。

**这条纪律必须由 ESLint 落实，不能只写在 CLAUDE.md 里。** 分层约定最常见的两种失效方式：

- **`layer` 字段没有任何工具读取**——每个 package.json 都标了 layer，但 lint 配置里根本没有消费它的规则，字段退化成装饰。
- **`no-restricted-imports` 的 pattern 写成 `'@x/pkg/*'`（带 `/*`）**——它只拦深路径，**不拦 barrel 导入本身**。此时合法状态是运气，不是约束。

xTools 现在连 ESLint 都没装，规则完全活在散文里。

落地要求：`eslint-plugin-import` 的 `no-restricted-paths` + 一个读 package.json `layer` 字段的自定义规则；pattern 必须同时覆盖 barrel（`@x/pkg`）与深路径（`@x/pkg/*`）。

---

## 4. 双实现的边界

选定「Rust server + Rust core」后，边界**不再能定在 OS 原语层**。推导链条是强制的：Web 形态经 `xtools serve` 拿能力 → serve 是 Rust → **Rust 侧的内核必须完整**（channel server / capability registry / capabilities / plugin host 四件齐全）。

业务功能这一层的推导则**止于插件自己的声明**：某个功能想在 Web / Tauri / CLI 上可用，它就得提供 `rust-builtin` 后端；不提供就在那些宿主上置灰。这是插件作者的取舍，不是内核的强制要求（§16.2）。

| 层 | TS core | Rust core | 契约测试覆盖 |
|---|---|---|---|
| OS 原语（fs / shell / storage / path-guard） | ✅ 完整 | ✅ 完整 | ✅ 必须 |
| 网络（http / ws / sse） | ✅ 完整 | ✅ 完整 | ✅ 必须 |
| channel server / capability registry / plugin host | ✅ 完整 | ✅ 完整 | ✅ 必须 |
| 业务模块（switch-host 等） | **不双写**——插件按 manifest `runtimes` 声明，声明了哪种就实现哪种（§16.2） | 同左 | ✅ 仅对声明的 runtime 跑（§21.3） |
| 提权执行 | 调 `xtools-elevate` | 调 `xtools-elevate` | ✅ 必须 |
| 窗口 / 托盘 / 菜单 / 更新 | ❌ 属 host shell | ❌ 属 host shell | ❌ |

**两份 core 覆盖面相同，但权重不同**：Rust core 服务三条触达面（Tauri / serve / CLI-MCP），TS core 只服务一条（Electron main）。

### 成本与承担方式

**双写被关进内核**（§15.2）。原方案「每个业务模块写两遍」这条已收窄——它是无界成本（随产品增长，且第三方插件作者不会写两遍），而内核双写是固定一套的有界成本。成本控制方式：

1. **契约测试从「保险」升级为「生命线」**（§11）。没有它，内核双写在第三个 capability 就会静默漂移。
2. **模块以能力清单为单位切分**，而不是以 UI 页面为单位。switch-host 对外只有 `hosts.list` / `hosts.apply` / `hosts.backup` 三个 channel，需要双份实现的是这三个函数——**而且只在插件作者主动要求四端全可用时才需要**；只声明 `ts` 的插件在 Tauri / serve / CLI 上 `available: false, reason: 'runtime-unsupported'`（§16.3），这是可接受的显式降级，不是缺陷。
3. **纯逻辑部分可考虑 Rust 单实现 + WASM 给 TS core 调用**（解析、序列化、diff 这类无 I/O 的部分），使双写只发生在 I/O 边界。**待评估，不作为一期方案**——`wasm` runtime 是二期把 `ts` / `rust-builtin` 两列合并成一列的统一路径（§16.2）。

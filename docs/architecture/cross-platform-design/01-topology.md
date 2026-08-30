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

### 关键不变式

1. **UI 只认 channel client**，永不感知宿主。`platform === 'electron'` 这类判断在 `renderer/apps` 与 `renderer/packages` 中必须零出现。
2. **channel server 是唯一的信任边界**，所有入参在此处做 schema 校验；两份 server 的校验规则由**同一份 schema 生成**，不手写第二遍。
3. **core 内不得出现窗口/托盘/菜单概念**。CLI 与 serve 形态没有窗口，这些属于 host shell。
4. **四条触达路径共用同一个 channel 注册表**。MCP tool 列表、CLI 子命令、HTTP 路由全部由注册表派生，不手工维护第二份清单。
5. **两份 core 的对外行为由契约测试锁定**，不由代码审查或口头约定锁定（§11）。

---

## 3. monorepo 拓扑与分层

```
xTools/
├── protocol/                       # layer: common —— channel 契约 + zod schema（见 §5）
│
├── core-ts/                        # layer: node —— TS 能力核心（完整实现，唯一消费者是 Electron main）
│   ├── packages/capabilities/      # OS 原语：fs / shell / storage / net / path-guard
│   ├── packages/modules/           # 业务模块能力：switch-host / ...
│   ├── packages/channel-server/    # channel 路由 + schema 校验 + capability registry
│   └── packages/kernel/            # DI 容器 + 事件总线 + 生命周期 + 插件注册表（不依赖 React）
│
├── core-rs/                        # Rust 能力核心（完整实现，见 §4）
│   ├── crates/xtools-capabilities/ # OS 原语
│   ├── crates/xtools-modules/      # 业务模块能力
│   ├── crates/xtools-channel/      # channel 路由 + schema 校验（schema 由 §5.6 codegen 产出）
│   └── crates/xtools-kernel/       # 能力注册表 + 生命周期
│
├── elevate-rs/                     # Rust 提权 helper 二进制（见 §8）
│
├── hosts/
│   ├── electron/                   # layer: electron-main —— 薄壳：窗口/托盘/菜单/更新 + ipc 传输
│   ├── tauri/                      # Rust 薄壳：窗口 + 单 rpc 命令传输
│   └── xtools-cli/                 # Rust bin crate —— argv 解析 + `serve` 子命令 + MCP stdio
│                                   #   （CLI 与 serve 同一个二进制，serve 只是一个子命令）
│
└── renderer/                       # layer: browser —— UI，完全一套
    ├── apps/main/
    └── packages/                   # channel-client / design-tokens / i18n / icons / types
```

`hosts/cli` 与 `hosts/serve` 不再是两个 node 包——它们合成一个 Rust bin crate `xtools-cli`，`xtools serve` 是子命令。理由：两者都只是 Rust core 的薄传输壳，分成两个二进制会让 Rust core 静态链接两遍，分发体积翻倍且无收益。

### layer 纪律（必须有工具强制）

| layer | 可 import | 禁止 |
|---|---|---|
| `common` | 无 | 任何运行时宿主 API |
| `browser` | `common` | `node:*`、electron、tauri API |
| `node` | `common` | electron、tauri、DOM |
| `electron-main` | `common`、`node` | DOM、renderer 代码 |
| `browser`（renderer/packages） | `common` | `renderer/apps/*` |

Rust 侧不参与 layer 字段体系（无 package.json），用 crate 依赖方向替代：`xtools-capabilities` / `xtools-modules` 不得依赖 `hosts/*`；`tauri` 与 `xtools-cli` 都只依赖 `xtools-channel`，不直接依赖 capabilities crate——保证传输壳不绕过 channel server 的校验闸门。这条由 `cargo-deny`/CI 检查依赖图落实。

**这条纪律必须由 ESLint 落实，不能只写在 CLAUDE.md 里。** 分层约定最常见的两种失效方式：

- **`layer` 字段没有任何工具读取**——每个 package.json 都标了 layer，但 lint 配置里根本没有消费它的规则，字段退化成装饰。
- **`no-restricted-imports` 的 pattern 写成 `'@x/pkg/*'`（带 `/*`）**——它只拦深路径，**不拦 barrel 导入本身**。此时合法状态是运气，不是约束。

xTools 现在连 ESLint 都没装，规则完全活在散文里。

落地要求：`eslint-plugin-import` 的 `no-restricted-paths` + 一个读 package.json `layer` 字段的自定义规则；pattern 必须同时覆盖 barrel（`@x/pkg`）与深路径（`@x/pkg/*`）。

---

## 4. 双实现的边界

选定「Rust server + Rust core」后，边界**不再能定在 OS 原语层**。推导链条是强制的：Web 形态经 `xtools serve` 拿能力 → serve 是 Rust → Web 上能用的每个业务功能都必须有 Rust 实现 → **Rust core 必须完整，含业务模块**。

| 层 | TS core | Rust core | 契约测试覆盖 |
|---|---|---|---|
| OS 原语（fs / shell / storage / path-guard） | ✅ 完整 | ✅ 完整 | ✅ 必须 |
| 网络（http / ws / sse） | ✅ 完整 | ✅ 完整 | ✅ 必须 |
| 业务模块（switch-host 等） | ✅ 完整 | ✅ 完整 | ✅ 必须 |
| 提权执行 | 调 `xtools-elevate` | 调 `xtools-elevate` | ✅ 必须 |
| 窗口 / 托盘 / 菜单 / 更新 | ❌ 属 host shell | ❌ 属 host shell | ❌ |

**两份 core 覆盖面相同，但权重不同**：Rust core 服务三条触达面（Tauri / serve / CLI-MCP），TS core 只服务一条（Electron main）。

### 成本与承担方式

成本是明确的：**每个业务模块写两遍**。这是 Q1 决策已接受的代价，此处只记录如何把成本控在可承受范围：

1. **契约测试从「保险」升级为「生命线」**（§11）。没有它，双写在第三个模块就会静默漂移。新模块的验收标准是「两份实现同时通过同一份契约用例」，不是「TS 侧能跑」。
2. **模块以能力清单为单位切分**，而不是以 UI 页面为单位。switch-host 对外只有 `hosts.list` / `hosts.apply` / `hosts.backup` 三个 channel，两遍实现的是这三个函数，不是整个功能的两套设计。
3. **纯逻辑部分可考虑 Rust 单实现 + WASM 给 TS core 调用**（解析、序列化、diff 这类无 I/O 的部分），使双写只发生在 I/O 边界。**待评估，不作为一期方案**——它引入 wasm 构建链，只有在双写漂移真的成为高频问题时才值得。

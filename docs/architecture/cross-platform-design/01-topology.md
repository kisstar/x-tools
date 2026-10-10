# 目标 · 拓扑 · monorepo 分层 · 核心不变式

> 属 [xTools 跨端架构设计方案](../cross-platform-design.md)。章节编号沿用总文，行内 `§N.M` 引用按索引的映射表定位。
>
> 本章取代旧版「四条传输 / 两份 core / CLI-MCP 分发」的拓扑。形态收敛为 **一个 Electron 主进程 + 两个前端（客户端渲染端 · 本机浏览器）**，参考 VSCode `vs/base/parts/ipc` 的 channel 分层与 code-server 把同一套 channel 换到 WebSocket 的做法。

---

## 1. 目标

一句话：**按「能力」切实现，宿主只剩外壳。**

| 想达到的 | 怎么度量 |
|---|---|
| 一份能力实现，两个前端消费 | 新增一个能力，只在 core 写一遍；ipc 与 ws 两端自动都能用 |
| 跨端一致性不靠账号、不靠中转 | 同一工具在客户端与浏览器同时打开，一端改动另一端自动失效刷新（§8） |
| 宿主可换、业务零改动 | 换传输（ipc↔ws）或将来换进程模型，`registerChannel()` 之上的业务代码不动（§5.2） |
| 内核不含业务 | `grep -rn "switch-host" core/` 为空，由 CI 断言（不变式 7） |

**非目标**（§19 展开）：Rust core、Tauri 宿主、CLI、MCP、无后端的纯浏览器降级。「Web」在本方案里特指 Electron 客户端拉起的第二个渲染端，**脱离正在运行的客户端不可用**。

## 2. 拓扑

主进程是**唯一后端、单一真源**。客户端渲染端走 ipc，本机浏览器走 ws，两者之上是同一套 channel 契约、同一份能力实现、同一个事件总线。

```
客户端渲染端 ──ipc──┐
                     ├──► Electron main（channel server · capability registry · plugin host）
本机浏览器   ──ws───┘              │
                                   └──事件总线──► 广播回所有已连接会话（含发起端）
```

「同一个工具在客户端和浏览器同时打开」因此不是「同步两份状态」，而是**两个前端订阅同一个后端**——跨端一致性退化成进程内的发布订阅：不需要账号、不需要中转、不需要冲突合并（§8）。

两条传输只是 `IMessagePassingProtocol` 的两个实现，channel 层之上完全同形。差异只有两处且都被显式建模：**按会话求值**（某能力对 ws 会话标 `desktop-only`，§7）与 **事件广播**（变更广播给所有会话，§8）。契约测试正是只覆盖这两处分叉（§15）。

## 3. monorepo 与分层

```
xTools/
├── protocol/          # @x-tools/protocol —— channel 契约 + zod schema 真源（common 层）
├── core/              # 能力实现容器（node 层），唯一消费者是 Electron main；自身是纯容器（无 package.json）
│   ├── bootstrap/      # @x-tools/bootstrap —— 组合根 createChannelServer（§9），core 唯一公共入口
│   ├── kernel/         # DI 容器 · 事件总线 · 生命周期
│   ├── channel-server/ # 路由 + schema 校验 + 审计（唯一信任边界）
│   ├── capabilities/   # fs / shell / storage / net / path-guard
│   └── plugin-host/    # 发现 / 装载 / 卸载 / effect 回收 / 权限闸门
├── plugins/           # 业务模块，一切皆插件（内 ui/model/data/node 四层，§14、§20.1）
├── hosts/
│   └── electron/      # @x-tools/electron —— main + preload + ipc/ws 传输壳
├── renderer/          # 前端 monorepo（React 19 + Vite 6 + Tailwind 4 + TanStack Router）
│   ├── apps/main/     # @x-tools/app-main —— 宿主应用 SPA
│   └── packages/      # design-tokens · i18n · icons · channel-client · types
└── docs/
```

**本次相对旧版的删减**：`core-rs/`、`elevate-rs/`、`hosts/tauri/`、`hosts/cli/`、顶层 cargo workspace 全部移除。`core-ts/` 更名为 `core/`（不再需要用语言区分，只有一份），且 `core/` 自身是**纯容器**（无 package.json）；因只含 node 层包、没有 `apps/`，不再套 `packages/` 子层，五个包直接平铺在 `core/*`（对齐 `hosts/*`、`plugins/*`）。组合根不叫 `core`——内核真正的核心是 `kernel`——而是 `@x-tools/bootstrap`（`createChannelServer`，§9），落在 `core/bootstrap`，与 kernel/channel-server/capabilities/plugin-host 平级。`platform-bridge` 更名为 `channel-client`——它不再「桥接多个宿主」，只是 channel 之上的类型化前端 facade。`elevate/` 保留但语言无关（§6.5）。

分层纪律（layer 表见 §3.1）**由 ESLint `no-restricted-paths` 强制**，不靠人守。ESLint 一期要装（§20 阶段 0）。

### 3.1 层与依赖方向

| layer | 可 import | 禁止 |
|---|---|---|
| `common`（protocol） | 无 | 任何运行时宿主 API；渲染侧只 `import type`，zod 运行时被 `verbatimModuleSyntax` 擦除 |
| `browser`（renderer） | `common` | `node:*`、electron API、`renderer/apps/*`（packages 侧） |
| `node`（core） | `common` | electron、DOM |
| `electron-main`（hosts/electron） | `common`、`node` | DOM、renderer 代码 |
| `plugin-model`（`plugins/*/model`） | 无 | React、channel client、`node:*`、同插件的 `ui/`、`data/` 与 `node/` |
| `plugin-ui`（`plugins/*/ui`） | `common`、同插件 `model/` `data/` | channel client 直连（必须经 `data/`）、同插件 `node/` |
| `plugin-data`（`plugins/*/data`） | `common`、同插件 `model/`、channel client | 同插件的 `ui/` 与 `node/` |
| `plugin-node`（`plugins/*/node`） | `common`、同插件 `model/` | React、channel client/server、`node:*`（OS 原语经 deps 注入）、同插件的 `ui/` 与 `data/` |

## 4. 核心不变式

改动必须守住。前七条是硬约束，第八条是本次新增拓扑带来的新约束。

1. **UI 只认 channel client，永不感知宿主。** `platform === 'electron'`、`isBrowser` 这类判断在 `renderer/apps` 与 `renderer/packages` 中必须零出现——跨端差异一律经 capability 的 `available` / `reason` / `limits` 表达（§7）。
2. **channel server 是唯一信任边界。** 所有入参在此做 zod 校验，ipc 与 ws 两条传输共用同一张校验表（§5）。
3. **core 内不得出现窗口 / 托盘 / 菜单概念。** 这是**正确性**不是洁癖：浏览器会话根本没有窗口，core 里任何「当前窗口」假设都会在 ws 会话上崩。窗口 / 托盘 / 菜单属 host shell。
4. **两条传输共用同一份 channel 注册表。** MCP 已移出，但本条仍在：ipc 与 ws 由同一个 channel server 服务，注册表只有一份，不手工维护第二份清单。两条传输的差异只能来自**按会话求值**，且必须能由 `capability:list` 查出（§7.3）。
5. **core 对两条传输的对外行为由契约测试锁定**，不由代码审查或口头约定锁定（§15）。
6. **契约不得承诺实现不支持的能力。** 字段做不到就从类型里删掉，或在 capability 的 `limits` 里显式声明，禁止静默降级（§5.5）。
7. **内核代码中不得出现具体业务模块的名字。** `grep -rn "switch-host" core/` 必须为空，由 CI 断言（§9.1）。
8. **事件不得先于提交。** 跨端失效事件由 channel wrapper 在 handler **成功 resolve 之后**自动发出，插件拿不到 `ctx.publish()`——杜绝「业务代码在写成功前就广播失效」这类竞态（§8.4）。

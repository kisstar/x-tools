# xTools 跨端架构设计方案

> 2026-10-03 修订。本次移出 **Rust core / Tauri 宿主 / CLI / MCP** 三块设计，形态收敛为
> **一个 Electron 主进程 + 两个前端（客户端渲染端 · 本机浏览器）**。
>
> 本套文档是架构的唯一真源，与仓库现状**有意不一致**——它描述目标形态，不描述现状。
>
> 公开参考：VSCode `vs/base/parts/ipc` 的 channel 分层、code-server 把同一套 channel 换到 WebSocket 的做法、
> VSCode `viewsContainers` + `views` 两级贡献点、DSH「一切皆插件」的 effect 可逆卸载。

一句话定位：**xTools 当前按「宿主」切实现；目标是按「能力」切实现，宿主只剩外壳。**

---

## 形态

主进程是**唯一后端、单一真源**。客户端渲染端走 ipc，本机浏览器走 ws，两者之上是同一套
channel 契约、同一份能力实现、同一个事件总线。

「同一个工具在客户端和浏览器同时打开」因此不是「同步两份状态」，而是**两个前端订阅同一个后端**——
这是本次拓扑选择最大的收益：跨端一致性退化成了进程内的发布订阅，不需要账号、不需要中转、不需要冲突合并。

```
客户端渲染端 ──ipc──┐
                     ├──► Electron main（channel server · capability registry · plugin host）
本机浏览器   ──ws───┘              │
                                   └──事件总线──► 广播回所有已连接会话
```

## 已定决策

| 事项 | 结论 |
|---|---|
| 宿主形态 | Electron 客户端 + 本机浏览器，**共用同一个 Electron 主进程**；浏览器端不可脱离客户端运行 |
| 核心运行时 | **一份 TS core**，唯一消费者是 Electron main。无双写、无跨语言 codegen |
| 传输 | `ipc`（客户端渲染端）/ `ws`（本机浏览器）。契约与传输完全解耦，换传输业务零改动 |
| 跨端一致性 | 主进程单一真源；变更经事件总线**广播给所有已连接会话（含发起端）**，事件是纯失效通知 |
| capability 求值 | **按会话求值**。`desktop-only` 能力对 ws 会话不可用，但仍注册、仍给 `reason` |
| 架构内核 | 微内核 + 一切皆插件。内核只留 5 件，不含任何业务概念 |
| 插件 runtime | `ui` / `node` 两种 |
| 鉴权 | 单用户本机：loopback 绑定 + 一次性 token + Origin 校验；WS server **默认关闭** |
| 提权 | 固定白名单动作，**不接受任意 shell**；四条要求语言无关（§6.5） |

## 本次移出，以及连带消失的复杂度

移出不是删一个目录，而是删掉它拖着的一整串约束。下表左列是移出物，右列是**因此不再需要存在**的东西——这些才是本次收敛真正买到的简单。

| 移出 | 连带消失的复杂度 |
|---|---|
| **Rust core** | 「TS core + Rust core 双写」整条约束链没了：不再需要契约测试去锁两份实现的行为一致，不再需要「内核双写是有界成本」这类辩护 |
| **跨语言 codegen** | zod → JSON Schema → Rust struct 的生成管线、「Rust struct 是生成物禁止手改」的纪律、codegen 漂移这一类 bug 全部不存在 |
| **Tauri 宿主** | `tauri-adapter.ts` 的 11 处命令名误用、`cargo` 工具链、Rust 侧 `#[tauri::command]` 注册、`fs_watch` 只返 UUID 不 emit 这些缺口随宿主一起走 |
| **CLI / MCP** | 「同一个 Rust 二进制三个子命令」「MCP tool 列表由注册表派生」「serve 形态没有窗口」这些触达面全不在范围内；core 不再需要为「无窗口形态」做抽象 |
| **`rust-builtin` / `wasm` runtime** | runtime 矩阵从四种塌成两种（`ui` / `node`），manifest 的 `runtimes` 交集求值退化成「桌面侧 node 可用性」一个维度 |
| **`elevate-rs`（Rust 提权二进制）** | 提权不再绑定某一门语言，判据回到「谁以 root 身份执行动作」，实现语言自由（§6） |

**双写消失意味着什么**：旧方案里最贵的一笔是「同一份能力写两遍（TS 一遍、Rust 一遍）」，并派一整套契约测试去兜两份实现的行为漂移。现在只有一份 TS core、唯一消费者是 Electron main，契约测试的职责从「锁两份实现一致」降级为「锁一份实现对两个前端（ipc / ws）行为一致」——而后者本就因为是同一份代码、同一个进程而天然成立，测试只需覆盖**按会话求值**与**事件广播**这两处真正有分叉的地方（§8、§7）。

## 章节

本文件是索引与决策锚点。详细设计分章在同名目录 `cross-platform-design/` 下，改架构前先读对应章节。

| 章节 | 文件 |
|---|---|
| §1 目标 · §2 拓扑 · §3 monorepo 与分层 · §4 核心不变式 | `01-topology.md` |
| §5 契约层（channel RPC · zod 真源 · 五个稳定错误码） | `02-contracts.md` |
| §6 两条传输 · 三重闸门 · WS 安全基线 · 提权 | `03-transports-and-security.md` |
| §7 capability registry · 按会话求值 | `04-capabilities.md` |
| §8 事件总线与跨端同步（本次新增） | `05-event-sync.md` |
| §9 微内核边界 · §10 runtime 矩阵 · §11 生命周期 · §12 权限 · §13 插件 channel · §14 渲染侧与两级导航 | `06-plugin-architecture.md` |
| §15 契约测试套件 | `07-contract-tests.md` |
| §16 架构风格 · §17 设计原则 · §18 23 种设计模式映射（本次新增） | `08-styles-and-patterns.md` |
| §19 不做 · §20 分期 · §21 决策状态 | `09-scope-and-roadmap.md` |

正文用 `§N.M` 交叉引用；`§N` 落在哪个文件由上表决定，不在正文里重复路径。

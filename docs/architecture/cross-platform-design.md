# xTools 跨端架构设计方案

> 本文是 2026-08-30 对齐后的权威跨端方案，覆盖平台抽象、契约层、插件模型、CLI/服务形态。
> 公开参考：VSCode `vs/base/parts/ipc` 的 channel 分层、code-server 把同一套 channel 换到 WebSocket 的做法。

**本文已拆分。** 决策摘要留在这里，其余章节各自成文于 `cross-platform-design/`，内容只存一份，本页只做导航。章节编号连续贯穿全套文档，因此各文件内的 `§N.M` 引用按下方映射表定位。

---

## 1. 决策摘要

| 决策项 | 结论 |
|---|---|
| 服务核心运行时 | **TS 与 Rust 各一份**，靠共享契约测试套件保证行为一致 |
| 渲染进程 UI | **完全一套**，无平台分支，可在 Electron / Tauri / Web 中打开 |
| CLI 与本地 server | **不面向终端用户**，是 core 的另外两条触达面；CLI 专供 AI Agent |
| CLI 对外形态 | 本地 WS/HTTP JSON-RPC + 托管 UI，并直接暴露为 MCP server |
| **server / CLI 实现语言** | **Rust**（跟随 Rust core），单二进制约 5–10MB、零外部运行时依赖 |
| **Rust core 覆盖范围** | **完整，含业务模块**——被 Tauri / serve / CLI-MCP 三条触达面复用 |
| TS core 覆盖范围 | 完整，但**唯一消费者是 Electron main** |
| 宿主定位 | Electron 为主要发行形态；**Tauri 随 Rust core 完整而自然功能对等** |
| 插件模型 | 编译期模块 + 声明式贡献点先落地，VSCode 式独立进程 Extension Host 为第二阶段 |
| 提权执行 | 独立小二进制 `xtools-elevate`（Rust，最小攻击面），两个 core 共同调用 |
| **schema 跨语言真源** | zod 为唯一真源 → 构建期导出 JSON Schema → 供 Rust codegen 与 MCP 共用（§5.6） |

### 一句话形状

xTools 当前按「宿主」切实现（Electron 一份、Tauri 一份），目标是按「能力」切实现、按「宿主」只切外壳。这条抽象轴不换，插件化与 CLI 两件事都做不出来。

### 重心说明（本轮决策的直接后果）

选定「Rust server + Rust core」后，**两份 core 的权重不再对称**：

- **Rust core 承担三条触达面**（Tauri 宿主、`xtools serve`、CLI/MCP），是覆盖面最广的一份，因此必须完整实现业务模块
- **TS core 只承担一条**（Electron main）

「Electron 为主」从此只指**发行形态**（用户下载安装的客户端主要是 Electron），不再指能力实现的重心。「Tauri 契约预留」这个说法作废——Rust core 完整了，Tauri 宿主自然拿到全部能力，它与 Electron 的差别只剩窗口 / 托盘 / 更新这些 host shell 层面的东西。

这个选择的代价是明确的，且是上一轮 Q1 决策就已接受的：**每个业务模块写两遍，契约测试从「保险」升级为「生命线」**（§11）。收益是 CLI 与 serve 拿到零依赖的 5–10MB 单二进制，且 Tauri 不再是二等宿主。

---

## 章节 → 文件

| 章节 | 文件 |
|---|---|
| §2 整体拓扑 · §3 monorepo 拓扑与分层 · §4 双实现的边界 | [01-topology.md](cross-platform-design/01-topology.md) |
| §5 契约层（5.1–5.6） | [02-contracts.md](cross-platform-design/02-contracts.md) |
| §6 四条触达路径 · §7 server / CLI 的实现语言与分发 · §8 提权 helper 为什么仍要独立 | [03-access-and-distribution.md](cross-platform-design/03-access-and-distribution.md) |
| §9 capability registry · §10 插件模型 | [04-capabilities-and-plugins.md](cross-platform-design/04-capabilities-and-plugins.md) |
| §11 契约测试套件 | [05-contract-tests.md](cross-platform-design/05-contract-tests.md) |
| §12 明确不做 · §13 分期 · §14 决策状态 | [06-scope-and-roadmap.md](cross-platform-design/06-scope-and-roadmap.md) |

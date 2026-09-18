# xTools 本地服务架构设计方案

> 本文是 xTools 的权威架构方案，覆盖：CLI 启动本地服务、web 承载全部功能、单一 Go 运行时核心、微内核 + 一切皆模块/插件。
> 公开参考：VSCode `vs/base/parts/ipc` 的 channel 分层与贡献点模型、code-server 把同一套 channel 换到 WebSocket 的做法。

**本文已拆分。** 决策摘要留在这里，其余章节各自成文于 `local-service-design/`，内容只存一份，本页只做导航。章节编号连续贯穿全套文档，各文件内的 `§N.M` 引用按下方映射表定位。

---

## 1. 决策摘要

| 决策项 | 结论 |
|---|---|
| 入口形态 | **单个 CLI 二进制 `xtools`**，子命令做应用管理（start / stop / status），复杂功能全在 web 页面 |
| 服务核心运行时 | **Go，仅一份**。工作负载是网络 IO + 托管前端，非 CPU 密集，Go 在 stdlib HTTP / 交叉编译 / 单静态二进制 / 编译速度上占优 |
| 端能力获取方式 | web 页面向本地服务发请求；**CLI 不直接承载业务**，只做进程管理 |
| 一期监听 | `127.0.0.1:10312`，仅本机访问；端口用户可配 |
| 主通道 | **WebSocket**（JSON-RPC），HTTP 仅承载静态资源与少数一次性请求 |
| 前端框架 | **React 19 + TanStack Router（hash 模式）+ Tailwind 4** |
| 架构范式 | **两侧微内核**：Go 核只做 5 件事、web 核只有 5 段 runtime，**内核仅含 runtime**；能力、协议、界面全部是模块/插件（§4、§17、§28.1） |
| 协议的位置 | **不在内核**。内核只定义 `Transport` 端口，HTTP/WS/（二期）MCP 各是一个可插拔模块——加触达面内核零改动（§4.2、§4.3） |
| 唯一信任边界 | **内核 Invoke 管线**：身份绑定 → schema 校验 → 权限闸门 → 可用性 → 配额/超时 → handler；transport 只能经 `kernel.Invoke` 入内核（§9.3） |
| 连接准入 | **Origin + Host + session token 三重校验，硬编开启无关闭开关**（本机监听 ≠ 安全，须挡 CSWSH 与 DNS rebinding，§9.4） |
| CLI 的定位 | **客户端，不是第四种 handler**：能力直调转发到运行中的服务，与 web 对等、共用同一条管线；单一状态源（§22） |
| schema 真源 | **Go struct 为唯一真源** → 构建期导出 JSON Schema → 单向生成 web 的 TS 契约与运行时校验，禁止手改、禁止漂移 |
| 插件（一期） | 从固定本地目录扫描；**纯 UI 贡献**（消费能力，不提供后端能力）；无远程安装 |
| 插件目录 / 端口 | 均可经配置文件覆盖 |
| web 可移植性 | UI 只认抽象 `IChannel`，宿主差异塌缩为 transport 适配器；某天塞进 Electron/Rust 渲染进程 = 新增一个 transport + 一个入口装配，业务与 UI 一行不改 |

### 一句话形状

**一个 Go 二进制起一个本地服务，web 页面是唯一的复杂 UI，端能力靠 web 向本地服务发 WS 请求；两侧内核都只含 runtime，能力、协议、界面全是模块/插件，CLI 子命令、HTTP 路由、WS 方法全部由同一份能力注册表派生。**

### 单核红利（「只有一份 core」的直接后果）

- **业务能力只实现一次**，不存在多语言 core 并行实现、互相对齐的固定成本。
- schema 真源落在 **Go struct**，跨语言生成只剩单向一条（Go → JSON Schema → TS），web 侧只消费不回写，天然无漂移。
- 契约测试是常规单元/集成测试，不承担「锁多核行为一致」的职责。
- 代价：Go 侧要自建微内核骨架（注册表 / DI 容器 / 事件总线 / Invoke 管线 / 生命周期编排），这是一次性有界成本，见 §4。协议不在其中——HTTP/WS 是模块（§4.2）。

---

## 章节 → 文件

| 章节 | 文件 |
|---|---|
| §1 拓扑与形状 · §2 一期约束 · §3 核心不变式 | [01-topology-and-invariants.md](local-service-design/01-topology-and-invariants.md) |
| §4 微内核五件事 · §5 Module 与 ActivationContext · §6 生命周期与激活顺序 | [02-go-kernel.md](local-service-design/02-go-kernel.md) |
| §7 Capability 定义 · §8 一次注册三处触达 · §9 CallCtx 与信任边界 | [03-capability-and-transports.md](local-service-design/03-capability-and-transports.md) |
| §10 schema 真源 · §11 Go→JSON Schema→TS 生成链 · §12 校验落点 | [04-contract-codegen.md](local-service-design/04-contract-codegen.md) |
| §13 模块与插件统一模型 · §14 manifest · §15 权限闸门 · §16 隔离路线 | [05-module-and-plugin.md](local-service-design/05-module-and-plugin.md) |
| §17 web 微内核五段 runtime · §18 传输无关 channel client · §19 按宿主装配 · §20 模块贡献点 · §21 稳定业务中心 | [06-web-microkernel.md](local-service-design/06-web-microkernel.md) |
| §22 CLI 是客户端 · §23 进程管理 · §24 配置文件 | [07-cli-process-config.md](local-service-design/07-cli-process-config.md) |
| §25 设计模式落点 · §26 明确不做 · §27 分期 | [08-patterns-scope-roadmap.md](local-service-design/08-patterns-scope-roadmap.md) |
| §28 架构风格映射（含风格→不变式对照） | [09-architecture-styles.md](local-service-design/09-architecture-styles.md) |

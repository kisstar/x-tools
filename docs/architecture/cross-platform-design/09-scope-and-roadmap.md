# 不做 · 分期 · 决策状态

> 属 [xTools 跨端架构设计方案](../cross-platform-design.md)。章节编号沿用总文，行内 `§N.M` 引用按索引的映射表定位。
>
> 本章取代旧版「Rust core / CLI / MCP 的分期」。移出 Rust / Tauri / CLI / MCP 后，范围显著收窄——本章把「明确不做」「分几期」「哪些已定不再论证」三件事钉死。

---

## 19. 明确不做（非目标）

把这些写进非目标，是为了杜绝「顺手加一下」的范围蔓延。每条都给出不做的理由。

| 不做 | 理由 |
|---|---|
| **Rust core / Tauri 宿主** | 单一 TS core 服务两个前端已满足诉求；双语言 core 的跨语言 codegen、struct 对账是纯成本（§5.4 删除） |
| **CLI / `xtools serve` / MCP** | 「Web」特指 Electron 客户端拉起的第二渲染端，不是独立服务面。无 headless 诉求 |
| **无后端的纯浏览器降级** | 浏览器会话脱离运行中的客户端不可用（§1 非目标）——不维护一套「没有主进程时」的 fallback 实现 |
| **账号 / 云端中转 / CRDT·OT 冲突合并** | 两前端订阅同一后端，一致性退化为进程内发布订阅（§8.1），不需要分布式同步机制 |
| **wasm runtime** | runtime 只留 `ui`/`node`（§10）。wasm 隔离一期无需求 |
| **远程 registry / 签名校验** | 安装来源一期仅本地目录 / zip；`publisher`/`signature` 字段预留但不校验（§6.6）——不给「已验证」的虚假安全感 |
| **插件间直接依赖 / 插件沙箱** | 插件协作只经 channel（§12.4）；沙箱待引入 extension host 子进程时再做 |
| **`StatePort`/`RouterPort`/`QueryPort`、插件内再套端口抽象** | 过度抽象。TanStack Query/Router 直接用，不包一层中立端口 |
| **Module Federation / trpc 式中间件链 / 中立 IDL** | channel RPC + zod 已够；再加这些是无收益的间接层 |

## 20. 分期

### 20.1 阶段 0：修地基（当前明确不执行）

dev 脚本修复、`.gitignore` 修正、装 ESLint、装 vitest——**当前不执行**（§14 决策）。本方案是**目标架构设计**，不含代码改动（本会话只做架构设计，不动代码）。阶段 0 列在这里是为说明「落地从哪起步」，不是本次交付物。

### 20.2 阶段 1：内核骨架 + 契约

- `protocol/`：channel RPC 契约 + zod 真源 + 五错误码 + `defineCommand`（§5）。
- `core/`：kernel（DI / EventBus / SessionRegistry）+ channel-server（三重闸门 + 审计）+ capabilities（fs/shell/storage/net/path-guard）+ plugin-host（六态机 + effect LIFO 回收）（§6、§9、§11）。
- `hosts/electron/`：main + preload + ipc / ws 两条传输壳 + WS 安全基线（§6.3）。
- 契约测试：in-process 直连，覆盖两处分叉 + 卸载泄漏（§15，待 vitest）。

### 20.3 阶段 2：首个端到端插件

把 **switch-host** 作为第一个完整插件打通：`model/`+`data/`+`ui/`+`node` 四部分，贡献 viewContainer + views + channel + capability + settings，验证两级导航派生、按会话求值、事件广播、卸载回收全链路。再实现内置 `tool-catalog`（读 registry 分组）与 nav 从贡献点派生。

### 20.4 阶段 3：提权与第三方

- 提权通道（§6.5）：一期系统对话框 + 固定动作脚本；两条红线加载期裁决（§12.3）。
- 第三方插件安装（本地目录 / zip，未验证来源显式提示，§6.6）。
- 事务化更新 + 设置深合并落地（§11.5、§11.6）。

## 21. 决策状态（已定，不再论证）

以下已对齐，改动前读对应章节即可，**不重开讨论**：

| 决策 | 结论 | 依据 |
|---|---|---|
| 拓扑 | 一个主进程 + 两前端（ipc / ws），单一 TS core | §2 |
| 微内核 | 内核五件，一切皆插件，内置不特权且可禁用 | §9 |
| 契约 | channel RPC（借 VSCode ipc 分层），zod 单一真源，渲染侧零 zod 运行时 | §5 |
| 错误码 | 五个稳定码，不新增不改名；`FORBIDDEN`≠`CAPABILITY_UNAVAILABLE` | §5.5 |
| 跨端差异 | 唯一出口是按会话求值的 capability；UI 零 `isBrowser` | §7、不变式 1 |
| 跨端同步 | 进程内发布订阅，纯失效通知 + revision 对账，无账号无中转 | §8 |
| 事件时序 | wrapper 在 handler resolve 后代发，插件无 `publish` | §8.4、不变式 8 |
| runtime | 只 `ui`/`node`；`node` 对两前端恒可用 | §10 |
| 提权 | 语言无关，判据是「谁以 root 执行」；绝不 Node-as-root；两条红线仅内置可申请 | §6.5、§12.3 |
| 导航 | 两级贡献点，subnav 有无是派生；nav 真源是 URL | §14 |
| 架构方法论 | 7 风格（微服务诚实不采用）+ 7 原则 + 23 模式（5 处诚实不采用） | §16–§18 |
| 不做 | Rust / Tauri / CLI / MCP / 纯浏览器降级 / 账号同步 / wasm / 远程 registry（§19 全表） | §19 |

> 本方案描述目标形态，与当前仓库现状（仍有 Rust / Tauri 残留）**有意不一致**。落地按 §20 分期推进；现状与目标的差异不是 bug，是待迁移项。

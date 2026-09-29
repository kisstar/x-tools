# AGENTS.md

This file provides guidance to AI coding agents working with code in this repository.
`CLAUDE.md` is a symlink to this file — **只改这一份**，不要让两份内容分叉。

> xTools — 单 CLI 二进制启动本地 Go 服务、由 Web 承载复杂交互的本地工具平台。

所有回答和输出内容使用中文（仓库全部规格文档为中文）。

## 仓库现状：只有文档，还没有代码

`main` 分支当前是**纯文档仓库**（25 个追踪文件，全部是 md / mmd / 配置）。不存在
`package.json`、`pnpm-workspace.yaml`、`turbo.json`、`go.work`、任何 `go.mod`，也没有
`node_modules`。

因此：

- **没有可运行的 build / lint / test / dev 命令。** 不要假设 `pnpm test`、`go test`、
  `turbo run build` 可用；也不要凭想象写进文档或回答里。
- 需要落地骨架时，命令与任务图必须按
  [10-workspace-and-build-governance.md](docs/architecture/local-service-design/10-workspace-and-build-governance.md)
  规定的形状建立（pnpm workspace + Turborepo 管 Web；多 go.mod + 根 go.work 管 Go；
  CI 额外以 `GOWORK=off` 逐 module 验证）。
- `.editorconfig`：2 空格、LF、UTF-8、文件末尾补换行。`.npmrc` 已锁定 pnpm 配置
  （`shamefully-hoist=false`、`strict-peer-dependencies=true`）。

## 架构规格是唯一真源

[docs/architecture/local-service-design.md](docs/architecture/local-service-design.md)
是索引页，10 个主题文件构成权威规格。**每项规则只在一个文件中定义**，索引页只做摘要和
路由，不复制正文。

按任务读取（索引页有完整表格，勿一次全读）：

| 任务 | 读取 |
|---|---|
| 理解整体架构 | 索引 + 01 + 02 |
| 新增/评审 Go capability、改 kernel | 02 + 03 + 06 |
| 新增 Web 工具或 UI 插件 | 04 + 05 + 06 |
| 新增 transport 或宿主 | 02 + 03 + 04 + 06 |
| 权限、安全、外部插件 | 03 + 05 + 06 |
| 建目录、移包、命名新契约 | 02 + 06 + 08 |
| 错误码、日志、超时、配置 | 03 + 05 + 09 |
| 改 pnpm/Turbo/go.work 或加 workspace 成员 | 06 + 08 + 10 |

规范词是可验证约束：**MUST/必须**、**MUST NOT/禁止**、**SHOULD/应当**。
工程组织决策见 [ADR-001](docs/decisions/001-polyglot-workspace-management.md)。

## 承重不变式（任何改动都要守住）

完整 15 条见
[06-invariants-and-verification.md](docs/architecture/local-service-design/06-invariants-and-verification.md)。
最常被违反的几条：

1. **两侧内核只有 runtime 机制。** Go 内核只做：生命周期编排、贡献注册表+只读快照、
   技术 DI、事件总线、统一 Invoke 管线。HTTP/WS/文件/Shell/插件目录都不属于内核，
   内核里不得出现任何具体模块名。
2. **依赖单向朝内**，层级为 L0 contracts ← L1 kernel ← L2 capability modules /
   L3 transports ← host composition root。**业务模块之间零横向 import。**
3. **三种通信通道不可互换**：需要结果/权限/超时/审计的同步业务调用只能走 capability；
   DI 只给技术服务（Logger/Clock/ConfigReader/mux），不得成为业务调用后门；
   event 只做「已发生、无返回、可丢失」的事实通知。
4. **模块间调用也走同一个 Invoke 管线**，通过内核创建的 CapabilityClient（绑定
   `module:<id>` 主体）。身份由服务端确立，**客户端/请求 payload 不得自报身份**；
   浏览器传来的 `pluginId` 只是不可信审计提示。
5. **触达面单一真源**：WS JSON-RPC 方法表、HTTP 端点、CLI 能力命令树、未来 MCP tools
   全部从同一个 frozen CapabilityRegistry 派生。
6. **Schema 单一真源**：Go 输入/输出 struct → JSON Schema → TS 类型 + 校验器，
   单向生成、生成物提交仓库、CI 重新生成必须无 diff、禁止手改、禁止 TS 回写 Go。
   Web 前置校验只改善 UX，**Go Invoke 校验才是安全边界**。
7. **UI 宿主无关**：业务代码只依赖 `IChannel`；`platform` 判断、`window.__TAURI__`、
   直接 new WebSocket 只允许出现在 adapter 与 composition root。
8. **Fail-closed**：准入、校验、授权、filter、模块激活失败都不放行残缺状态。
   必需模块缺失在激活前失败；内置模块激活失败逆序回滚并退出，不带残缺注册表 Serving。
9. **能力边界显式**：不可用能力仍在清单中并返回结构化原因，不静默消失、不静默降级。
10. **插件信任措辞必须真实**：一期外部 UI 插件是用户主动安装的**可信同上下文代码**。
    文档、UI、注释 MUST NOT 把 `requires` / `scopedChannel` / `ErrorBoundary` 描述成
    恶意代码隔离——它们分别只是依赖声明、调用侧收窄和故障隔离。

新增/修改任何 MUST 约束时，必须在同一变更内给出自动化测试、静态守卫或评审证据；
「后续补测试」不算完成。

## 目标目录结构（尚未建立）

完整树与每个目录的允许/禁止依赖见
[08-directory-and-code-organization.md](docs/architecture/local-service-design/08-directory-and-code-organization.md)。
骨架落地时必须按此建立，偏离需同步更新该文档与守卫：

```
cmd/xtools/          独立 go.mod；CLI + Go composition root
go/contracts/        L0：ID、错误码、技术 service token
go/kernel/           L1：lifecycle registry invoke eventbus services
go/modules/<id>/     L2：fs shell storage catalog pluginhost，各自独立 go.mod
go/transports/<id>/  L3：http ws，各自独立 go.mod
contracts/schema/    生成的 JSON Schema，按 capability@major 组织
apps/web/            唯一 Web composition root
packages/            web-runtime · contracts(生成) · adapter-ws · modules/<ui>
tests/               architecture · integration · e2e
```

- 外部 UI 插件**不进源码树**，运行时从配置的 pluginDir 加载。
- 禁止 `shared` / `common` / `utils` / `helpers` 业务目录；真正跨层的数据要先证明有两个
  独立消费者才进 contracts。
- 不要把单个 React 组件拆成 package；拆包单位必须对应 runtime / adapter / app /
  独立 UI module 边界。
- 新增顶层目录、Go module、pnpm package、跨层公共包或 service token 属架构变更，需评审。

## ID 命名规范

| 对象 | 规范 | 示例 |
|---|---|---|
| Module ID | 小写点分 | `fs`、`transport.http`、`host.localservice` |
| Capability ID | `<domain>.<verb>@<major>`，省略版本等价 `@1` | `fs.read@1` |
| Event ID | `<domain>.<past-tense-fact>@<major>` | `fs.changed@1` |
| Service token | `tech.<area>.<name>@<major>`，仅技术服务 | `tech.http.mux@1` |
| UI contribution ID | `<module-id>.<local-id>` | `workbench.settings` |

删字段、改语义、加必填字段必须升主版本；兼容地加可选字段可保留主版本。

## 一期边界（提案超出此范围要先做架构决策）

单机、单用户、单 Go 进程，监听 `127.0.0.1:10312`（端口可配）；WS 上的 JSON-RPC 为主
调用通道，HTTP 只做静态资源/健康检查/少量无状态请求；React 19 + TanStack Router
hash 模式 + Tailwind 4；启动/首帧前注册随后 freeze，**不热插拔**；仅 loopback。

一期不做：外部插件后端代码、进程内脚本沙箱、插件签名、后台守护、配置热重载、MCP、
微服务拆分、事件持久化/重放。

## 设计系统

[DESIGN.md](DESIGN.md) 是多主题设计系统规格：Default（Vercel 风）与 Aurora
（AI 原生深色，`#7C3AED` 紫作为唯一品牌色），各支持 Dark/Light。CSS 自定义属性统一
`--xt-` 前缀，主题通过 `:root` / `.theme-aurora-dark` 等类切换。紫→青渐变
（`ai-flow`）**只用于 AI 相关交互**，不做通用装饰。

`design/main.pen` 是 UI 设计稿（Pen 格式 JSON）。

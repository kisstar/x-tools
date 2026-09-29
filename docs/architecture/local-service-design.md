# xTools 本地服务正式架构规格

| 属性 | 值 |
|---|---|
| 状态 | 已确认，作为实现与评审的架构真源 |
| 适用范围 | xTools Go 本地服务、Web 应用、CLI 与一期 UI 插件 |
| 主架构 | 双侧微内核 + 强隔离模块化单体 |
| 更新日期 | 2026-09-19 |

本文与 local-service-design/ 下的主题文件共同构成唯一权威架构规格。每项规则只在一个文件中定义；本页只提供摘要和读取路由，不复制正文。

规范词含义：**MUST / 必须**与 **MUST NOT / 禁止**是可验证约束；**SHOULD / 应当**是有充分理由才能偏离的建议；示例只用于说明，不构成额外契约。

## 核心决策

- Go 与 Web 内核都只包含 runtime 机制；业务、协议实现和界面全部位于模块或插件。
- 一期采用单 Go 进程的强隔离模块化单体，不采用微服务。
- 模块之间零横向 import；同步业务走 capability，技术协作走 DI，事实通知走 event。
- Host Composition Root 在内核外选择模块并声明宿主必需模块。
- Go capability struct 是跨端 schema 唯一真源；各触达面由同一冻结注册表派生。
- 一期外部 UI 插件是用户主动安装的可信同上下文代码，只提供故障隔离，不提供恶意代码隔离。
- 仓库采用 polyglot monorepo：Web 使用 pnpm workspace + Turborepo，Go 使用多 go.mod + 根 go.work。

该工程组织决策及备选方案见 [ADR-001](../decisions/001-polyglot-workspace-management.md)。

## 按主题读取

| 主题 | 权威文件 |
|---|---|
| 目标、范围、质量属性、运行拓扑 | [01-drivers-and-context.md](local-service-design/01-drivers-and-context.md) |
| 双侧微内核、分层、宿主装配、模块生命周期 | [02-microkernel-and-modules.md](local-service-design/02-microkernel-and-modules.md) |
| 模块通信、Capability、Invoke、EventBus、契约生成 | [03-capability-runtime.md](local-service-design/03-capability-runtime.md) |
| Web runtime、UI 贡献、IChannel、CLI 与配置 | [04-web-cli-and-hosts.md](local-service-design/04-web-cli-and-hosts.md) |
| 插件信任、Principal、连接准入及能力安全 | [05-plugins-and-security.md](local-service-design/05-plugins-and-security.md) |
| 架构不变式、自动化守卫与测试分层 | [06-invariants-and-verification.md](local-service-design/06-invariants-and-verification.md) |
| 架构风格、GoF 23 种模式、演进与评审清单 | [07-patterns-and-evolution.md](local-service-design/07-patterns-and-evolution.md) |
| Go/Web 目录树、包职责、依赖与命名规范 | [08-directory-and-code-organization.md](local-service-design/08-directory-and-code-organization.md) |
| 错误、日志、可观测性、资源预算及配置治理 | [09-operational-policies.md](local-service-design/09-operational-policies.md) |
| pnpm、Turborepo、go.work、多 module 与 CI 规则 | [10-workspace-and-build-governance.md](local-service-design/10-workspace-and-build-governance.md) |

## AI 最小读取路径

| 任务 | 建议读取 |
|---|---|
| 理解整体架构 | 本页 + 01 + 02 |
| 新增或评审 Go capability | 02 + 03 + 06 |
| 修改 kernel/runtime | 02 + 03 + 06 |
| 新增 Web 工具或 UI 插件 | 04 + 05 + 06 |
| 新增 transport 或宿主 | 02 + 03 + 04 + 06 |
| 处理权限、安全或外部插件 | 03 + 05 + 06 |
| 评估设计模式或演进路线 | 06 + 07 |
| 创建目录、移动包或命名新契约 | 02 + 06 + 08 |
| 设计错误码、日志、超时或配置 | 03 + 05 + 09 |
| 修改 pnpm/Turbo/go.work 或新增 workspace 成员 | 06 + 08 + 10 |

除非进行全架构评审，不应默认一次读取全部主题文件。

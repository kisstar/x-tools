# 运行策略与横切契约

> **按需读取**：设计错误码、日志、追踪、资源预算、配置或兼容性策略时读取。
>
> **前置文档**：[03-capability-runtime.md](03-capability-runtime.md) 与 [05-plugins-and-security.md](05-plugins-and-security.md)。本文补足横切策略，不改变模块边界。

## 1. 错误模型

所有触达面必须映射同一稳定错误模型；transport 只能转换协议表示，不能创造不同业务语义。

| 错误类别 | 含义 | 是否可重试 |
|---|---|---|
| invalid_argument | 输入未通过 schema 或领域前置条件 | 否，修正输入 |
| unauthenticated | 连接未建立可信 principal | 重新准入后可重试 |
| permission_denied | principal 无权调用 | 否，除非权限变化 |
| not_found | capability、版本或业务资源不存在 | 通常否 |
| unavailable | capability 在当前平台/配置不可用 | 条件变化后可重试 |
| conflict | 状态冲突或资源已占用 | 读取新状态后决定 |
| resource_exhausted | 配额、并发、队列或大小超限 | 遵循 retryAfter（如有） |
| deadline_exceeded | 调用超过预算 | 仅幂等调用可谨慎重试 |
| internal | 未预期实现错误 | 不自动重试；使用 traceId 排查 |

错误响应至少包含 code、message、traceId；可选 details 必须有 schema 且不得包含堆栈、token、文件内容或命令参数。CLI、WS 和未来 MCP 对相同错误必须保持同一 code。

## 2. 日志、审计与观测

- 使用结构化日志；每条调用日志至少包含 timestamp、level、moduleId、capabilityId、principalKind、traceId、durationMs、resultCode。
- 审计与诊断默认只记录元数据，不记录 payload、session token、文件内容、环境变量或完整命令参数。
- Logger 由 runtime 作为技术服务注入；模块不得自行建立不受治理的全局 logger。
- handler panic 必须转成 internal 错误并记录服务端堆栈；堆栈不返回客户端。
- 至少提供调用计数、失败计数、延迟、in-flight、event dropped 和模块激活失败指标；一期可先落到日志聚合，不要求外部监控系统。

## 3. 超时、取消与资源预算

- 所有 Invoke 必须有 deadline；服务默认预算由配置给出，capability 只能收紧或显式声明更小预算。
- 客户端断开或取消必须传播到 handler context；handler 和 adapter 应当及时停止可取消工作。
- 每个有界资源必须有所有者、默认值和上限：并发调用、输入/输出大小、event 队列、订阅数、文件读取大小、命令运行时间。
- resource_exhausted 不得静默扩容或无限排队；如建议重试，应返回有界 retryAfter。
- 重试不是 kernel 的默认行为。只有 capability 明确声明幂等且调用方有退避策略时才允许自动重试。

具体数值必须通过基线测试确定；未测量前只定义配置位置与硬上限，不虚构 SLO。

## 4. 配置治理

配置启动时一次性读取、校验后转成不可变快照。来源优先级固定为：命令行显式参数 > 配置文件 > 内置默认值。环境变量只用于明确列入白名单的启动项，不允许自动映射所有配置。

未知配置项必须报错，避免拼写错误静默失效；缺省配置必须可启动。敏感值不得输出到诊断转储。配置变更一期通过重启生效，不做运行期局部热更新。

| 可配置 | 一期规则 |
|---|---|
| port、pluginDir、fs roots | 允许配置并在启动时验证 |
| timeout、queue、size limits | 允许在内置安全上下限内配置 |
| additional origins | 只允许追加明确 origin；禁止通配符 |
| listen address、admission enable、token path | 固定；不得提供关闭或重定向开关 |

## 5. 兼容性与废弃

- Capability 使用主版本表达破坏性变化；兼容新增保留主版本。
- deprecated capability 必须在 capability.list 中公开 replacement 与 sunsetAfter；删除前至少跨一个发布周期。
- UI plugin 的 engines.xtools 在加载前检查；不匹配时拒绝加载并给出可操作原因。
- 错误 code、Principal kind、manifest 核心字段和生成 schema 都属于兼容性契约，不得在补丁版本中改变语义。

## 6. 就绪、存活与诊断

进程存活与服务就绪必须区分：存活只表示进程可响应；就绪要求 required modules 激活完成、注册表已 freeze、必需 transport 已启动。未就绪时不得接受 capability 调用。

status/健康检查只返回运行状态、版本、启动时间和模块摘要，不返回 token、路径白名单细节或插件私有数据。诊断信息必须能通过 traceId 关联日志，但不能扩大客户端权限。

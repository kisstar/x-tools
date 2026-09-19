# 架构不变式与验证

> **按需读取**：任何实现、代码评审或架构变更都应读取。本文定义跨主题硬约束与最低证据。
>
> **前置文档**：先读取任务对应的主题文档；本文不重复各机制的详细设计。

## 1. 必须持续成立的不变式

1. **Runtime-only kernel**：Go/Web 内核无业务、具体协议实现、界面和具体模块名。
2. **单向依赖**：依赖朝 L0/L1；kernel 不依赖外层。
3. **模块零横向 import**：Go 与 Web 业务模块不得直接依赖另一个模块实现或公开 API 包。
4. **同步业务调用只有 capability**：外部与内部调用均经过同一 Invoker/Invoke 管线。
5. **DI 仅技术服务**：DI 不得成为业务调用后门。
6. **Event 仅事实通知**：可丢、无返回、非状态真源。
7. **Host 决定必需模块**：kernel 与 manifest 不硬编码宿主必需性。
8. **触达面单一真源**：所有方法、命令和 tool 清单从同一冻结注册表派生。
9. **Schema 单一真源**：Go struct 单向生成 JSON Schema 与 Web 契约。
10. **UI 宿主无关**：UI 业务只依赖 IChannel，不识别宿主与协议。
11. **身份不可自报**：安全 principal 由连接或内核创建的客户端绑定。
12. **插件信任描述真实**：一期外部 UI 插件是可信同上下文代码，客户端 scope 不是恶意代码隔离。
13. **Fail-closed**：准入、校验、授权、过滤器和激活失败不放行残缺状态。
14. **能力边界显式**：不可用、版本和 limits 可查询，不静默降级。

## 2. 自动化守卫

| 约束 | 最低验证方式 |
|---|---|
| Kernel 无业务/协议 | import allowlist + 禁止依赖 module/transport/React/router/HTTP/WS 实现 |
| 分层与横向隔离 | Go import graph/depguard；Web ESLint boundaries/no-restricted-imports |
| DI 仅技术服务 | service token 定义集中在 L0，新增 token 需架构评审；禁止 token 返回业务模块类型 |
| Invoke 唯一路径 | transport 与 module 包无法引用 Handler；组件测试验证内外调用经过相同 filters |
| Registry freeze | 状态机与并发单测；freeze 后注册失败 |
| 契约无漂移 | codegen 后 working tree 无 diff |
| UI 宿主无关 | 禁止直接 import transport 与宿主全局变量；adapter 契约测试 |
| 连接安全 | Host、Origin、token 分别缺失/伪造测试；CLI 无 Origin + 有效 token 正向测试 |
| 事件有界 | 慢消费者、overflow、panic 隔离和状态重查测试 |
| 插件故障隔离 | activate、entry 加载和 render 三类失败均不影响其他插件 |
| 信任措辞 | 文档评审检查 scopedChannel/requires 未被描述为恶意代码隔离 |

简单 grep 可以作为补充诊断，但关键依赖规则应当由语法树或依赖图工具验证，避免注释、别名与生成代码造成误判。

## 3. 测试分层

1. **静态架构测试**：依赖、包边界、生成物和禁用 API。
2. **单元测试**：registry、生命周期状态机、Invoke 各步骤、版本解析、event overflow。
3. **模块组件测试**：每个 capability 模块使用内存技术服务独立运行，无真实网络和 UI。
4. **集成测试**：真实 HTTP/WS 握手、准入、JSON-RPC、schema 与优雅停机。
5. **少量 E2E**：CLI 启动服务、Web 完成一次调用、UI 插件失败降级。

发布前至少证明：新增模块不改 kernel、所有架构守卫通过、契约生成无差异、负向准入测试通过、单个 handler/UI 插件故障不扩散。

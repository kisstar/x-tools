# 架构风格、设计模式与演进

> **按需读取**：选择架构/设计模式、讨论微服务拆分、调整路线或执行架构评审时读取。
>
> **前置文档**：[06-invariants-and-verification.md](06-invariants-and-verification.md)。模式不得覆盖或绕过不变式。

## 1. 架构风格定位

| 定位 | 风格 | 用途 |
|---|---|---|
| 主风格 | Microkernel + Strongly Modular Monolith | 稳定 runtime 与可变功能分离 |
| 结构约束 | Layered + Ports and Adapters | 规定依赖方向与技术边界 |
| 部署拓扑 | Client–Server | 保持一个服务端状态真源 |
| 局部机制 | Pipe and Filter | Invoke 与 codegen 有序处理 |
| 局部机制 | Event-Driven | 仅用于可丢失事实通知 |
| UI 分离原则 | MVC | Model/View/interaction orchestration 分离，不引入控制器类体系 |
| 一期不采用 | Microservices | 单机单用户无独立伸缩收益；保留 capability 拆分缝 |

风格不是平均叠加。微内核是整体形状，其余风格各自在限定范围内解决具体问题；发生冲突时，架构不变式优先。

## 2. 关键决策取舍

| 决策 | 采用 | 未采用及原因 |
|---|---|---|
| 模块隔离强度 | 强隔离模块化单体：零横向 import | 共享模块 API 会绑定升级与禁用；一期微服务会增加部署和观测成本 |
| 必需模块归属 | Host Composition Root 声明 required IDs | Kernel 或 ModuleManifest 声明会把 runtime/模块绑定到具体宿主 |
| 跨模块同步调用 | CapabilityClient 进入统一 Invoke | DI 业务服务会形成授权、超时和审计后门 |
| 一期外部 UI 插件 | 用户主动安装的可信同上下文代码 | iframe/Worker 强沙箱成本暂不支付；因此不宣称插件级安全授权 |
| 设计模式 | 仅采用有真实变化点的模式 | 不为覆盖 GoF 23 种而制造抽象 |
| Web workspace | pnpm workspace + Turborepo | 单包无法形成编译边界；Nx 对当前规模过重 |
| Go workspace | 多 go.mod + 根 go.work | 单 go.mod 边界较弱；go.work 不等同 Cargo workspace，不能共享锁与公共配置 |

## 3. GoF 23 种模式决策

“采用”表示代码中存在该模式解决的真实变化点，不要求创建同名类。普通函数或数据结构足够时，禁止为了模式名称增加抽象层。

### 3.1 创建型（5）

| 模式 | 决策 | 落点或原因 |
|---|---|---|
| Singleton | 不采用 | 每宿主一个实例是装配基数，不使用全局单例或包级可变状态 |
| Factory Method | 不采用 | Go 的普通 New 构造函数已足够，没有子类决定实例类型的问题 |
| Abstract Factory | 采用 | Host composition 成套创建 channel adapter、技术服务与模块集合 |
| Builder | 不采用 | 配置 + composition root 已能清晰构造，无渐进构造复杂对象的需求 |
| Prototype | 不采用 | 无复制复杂原型对象的需求 |

### 3.2 结构型（7）

| 模式 | 决策 | 落点或原因 |
|---|---|---|
| Adapter | 采用 | HTTP/WS/MCP transport 与各宿主 IChannel adapter |
| Bridge | 采用 | IChannel 抽象与宿主 transport 实现独立演进 |
| Composite | 局部采用 | 只用于 UI container/view 树，不泛化进 kernel |
| Decorator | 采用 | Invoke filters 与 view ErrorBoundary |
| Facade | 采用 | ActivationContext、CapabilityClient、IChannel |
| Flyweight | 不采用 | 无大量同质细粒度对象导致的已测内存问题 |
| Proxy | 条件采用 | scopedChannel 仅作声明/审计；进程拆分后的远程代理等真实需求出现再使用 |

### 3.3 行为型（11）

| 模式 | 决策 | 落点或原因 |
|---|---|---|
| Strategy | 采用 | 宿主 channel/transport 实现可替换 |
| Template Method | 局部采用 | Kernel 固定生命周期骨架、模块提供 hooks；以组合表达，不引入继承体系 |
| Observer | 采用 | EventBus、服务推送与 React subscription hooks |
| Iterator | 不采用 | 语言原生集合遍历足够 |
| Chain of Responsibility | 采用 | 受控顺序与锚点的 Invoke filter chain |
| Command | 采用 | UI command contributions 与可描述的 capability call |
| Memento | 不采用 | 当前没有撤销或对象状态快照恢复需求 |
| State | 采用 | Kernel/module 生命周期显式状态机 |
| Visitor | 不采用 | Schema/贡献物处理无需双分派，普通遍历更简单 |
| Mediator | 采用 | Invoker/CapabilityClient 与 EventBus 中介模块协作 |
| Interpreter | 不采用 | 无领域语言；JSON-RPC 或 schema 解析不等于解释器模式 |

新增模式必须在评审中说明：具体变化点、参与者、被替代的简单方案、收益、成本与删除条件。模式可以替换，不得借模式绕过架构不变式。

## 4. 分期演进

| 阶段 | 目标 | 关键变化 |
|---|---|---|
| 一期 | CLI + Go 本地服务 + Web UI + 内置能力 + 可信 UI 插件 | 落实本规格全部承重不变式 |
| 二期候选 | MCP 触达面 | 新增 transport adapter；由冻结 capability 清单派生 tools；kernel 零修改 |
| 三期候选 | 更丰富但仍可信的 UI runtime | 只有真实插件需求出现后再定义，不改变一期安全表述 |
| 四期候选 | 外部后端插件 | 子进程隔离、受限 RPC、独立 principal 与资源治理；重新安全评审 |
| 可选 | 后台服务形态 | 仅改变 host/process management，不把 daemon 概念放进 kernel |

微服务拆分只有在独立伸缩、发布、故障隔离或外部后端插件带来明确收益时才考虑。拆分单位是成组 capability；原位置保留代理，使调用方契约不变。

## 5. 已知风险与决策触发器

| 风险 | 当前处理 | 需要重新设计的触发器 |
|---|---|---|
| 外部 UI 插件与主页面同权限 | 明确为用户信任代码，提供故障隔离而非安全隔离 | 需要运行不可信插件 |
| 单进程故障域 | recover、模块回滚、资源预算 | 某能力频繁崩溃或必须独立伸缩 |
| Event 至多一次 | overflow 后重查状态 | 出现必须送达、事务或跨进程事件 |
| Freeze 无热插拔 | 重启服务/刷新页面 | 安装不中断成为验证过的产品需求 |
| 单向 Go schema | 简单、无双写 | 出现多个平等语言提供方 |
| 多 Go module 管理成本 | go.work 联调，CI 逐 module 验证 | module 数量/版本协调成本明显高于边界收益 |
| Turbo 缓存配置错误 | 任务显式 inputs/outputs，CI dry-run 检查 | 缓存命中错误或构建产物遗漏 |

## 6. 架构评审清单

任何新增功能或重构至少回答：

1. 它属于 kernel runtime、host、transport、capability module 还是 UI module？
2. 是否能在不修改 kernel 的情况下新增或移除？
3. 是否引入了模块横向 import 或经 DI 进行业务调用？
4. 同步调用、技术服务和事实通知是否选择了正确通道？
5. 新增契约的唯一真源在哪里，其他表示如何派生？
6. 主体由谁确立，授权能否被客户端自报信息影响？
7. 失败会传播到哪一层，是否存在残缺启动或静默降级？
8. 哪条自动化测试证明新增代码仍满足本规格？
9. 若引入设计模式，普通函数或数据结构为何不足？
10. 该变化是否扩大一期范围；若扩大，是否需要新的架构决策？

以上问题无法得到明确答案时，不应进入实现。

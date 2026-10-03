# 架构风格 · 设计原则 · 设计模式

> 属 [xTools 跨端架构设计方案](../cross-platform-design.md)。章节编号沿用总文，行内 `§N.M` 引用按索引的映射表定位。
>
> 本章把前面各章的具体设计，回扣到**七种架构风格 · 七条设计原则 · 二十三种 GoF 模式**。原则是「为什么这么分」，模式是「具体怎么搭」。**不硬凑**：用上的说清落点，没用上的（5 种模式 + 微服务风格）诚实标注「不采用」并给出理由——硬套一个模式是复杂度，不是严谨。

---

## 16. 七种架构风格的落点

| 风格 | 在本架构的落点 | 关键依据 |
|---|---|---|
| **分层架构** | `common`(protocol) → `node`(core) → `electron-main`(host)；插件内 `model/` ← `data/` → `ui/`。依赖单向，由 ESLint `no-restricted-paths` 强制 | §3.1、§14.1 |
| **管道-过滤器** | 每次 channel 调用顺流过「三重闸门 → zod 校验 → handler → emits 广播」四段，每段只做一件事、失败即短路 | §6.1、§8.4 |
| **事件驱动** | 跨端一致性退化为进程内发布订阅：写操作 → wrapper 广播 `InvalidationEvent` → 所有会话 refetch。无账号、无中转 | §8 |
| **微内核** | 内核只留五件，一切业务皆插件；内置与动态同一套机制 | §9 |
| **微服务** | **不采用**（§16.1）——单用户本机、单进程后端，拆进程只增运维无收益；以 modulith（进程内模块化单体）替代 | §16.1 |
| **客户端-服务器** | 主进程是唯一后端，两个前端（ipc 客户端渲染端 / ws 本机浏览器）是客户端；信任边界只在 server 侧 | §2、§6.2 |
| **MVC** | 插件三层正是 MVC 的变体：`model/`(M) · `ui/`(V) · `data/`+channel(C)。View 不直连数据，经 `data/` 取数 | §14.1 |

### 16.1 微服务为什么诚实地「不采用」

诉求里列了微服务风格，但本应用是**单用户、本机、单进程后端**。微服务的收益（独立部署、独立扩缩、团队边界）在这里全不成立，代价（进程间通信、服务发现、分布式故障）却全要付。

**取而代之的是 modulith**：进程内的模块化单体——用插件边界（manifest + capability + channel 命名空间）获得微服务的**模块隔离**收益，不付**进程拆分**的代价。要点在「边界清晰」而非「进程分离」。将来真需要隔离某插件（如不信任的第三方），引入 extension host 子进程即可，那是 §19 的后续，不是一期架构。

> ponytail: 硬上微服务是教科书式的过度设计。单机单用户拆微服务，是给自己发明分布式问题。modulith 拿到隔离、不付分布式税，这才是本场景的正解。

## 17. 七条设计原则的落点

| 原则 | 落点 | 反面（本架构如何避免） |
|---|---|---|
| **开闭原则 OCP** | 加能力只在 core 写一遍 + 加插件，不改内核；channel 注册表开放扩展、闸门逻辑闭合不改 | 旧版胖 `Bridge` 加字段要动多文件（§5.1），对扩展封闭 |
| **里氏替换 LSP** | ipc / ws / in-process 三个 `IMessagePassingProtocol` 实现可互换，channel 层之上行为一致（契约测试锁定，§15） | 某实现偷偷降级 → 替换后行为变（被 §5.6 禁止） |
| **依赖倒置 DIP** | 业务依赖 `IChannel` 抽象，不依赖具体传输；core 依赖 capability 抽象，不依赖 OS 实现 | UI 直接 `if (isBrowser)` 硬依赖宿主（被不变式 1 禁止） |
| **单一职责 SRP** | 三重闸门每关管一件事（§6.1）；插件三层各担一职（§14.1）；内核五件各司其职（§9.1） | 一个码混 `FORBIDDEN` 与 `CAPABILITY_UNAVAILABLE`（被 §5.5 禁止） |
| **接口隔离 ISP** | `IChannel`(call/listen) 与 `IServerChannel` 分开；`PluginContext` 只暴露插件需要的，不给 `publish`（§11.2） | 旧版把 6 端口塞进一个 `Bridge`，插件被迫看见全部（§5.1） |
| **迪米特法则 LoD** | 插件只跟 `ctx` 说话（§11.2），不 import 内核内部；插件间不直接依赖，只经 channel（§12.4） | 插件 A 直接调插件 B 内部（被 §12.4 禁止） |
| **合成复用 CRP** | 传输差异靠**组合**不同 `IMessagePassingProtocol`，不靠继承一棵传输类树；capability 靠组合 `limits` / `available` 函数 | 用继承表达「WS 是特殊的 IPC」会把两者耦死 |

## 18. 二十三种 GoF 模式的落点

分三族逐一回扣。**用上的给落点，没用上的标「不采用」并说明**——不为凑满 23 个硬塞。

### 18.1 创建型（5）

| 模式 | 采用? | 落点 / 理由 |
|---|---|---|
| **Factory Method** | ✅ | `createInProcessChannel()` / 各传输的 protocol 工厂——按形态造 `IMessagePassingProtocol`，调用方不 new 具体类 |
| **Abstract Factory** | ✅ | plugin host 按 manifest 的 `runtimes` 组装一族相关对象（channel handler + 贡献点 + effect 容器），`ui`/`node` 两族产物一致装配 |
| **Builder** | ✅ | `defineCommand({...})` 分步声明 channel/command/args/result/capability/emits，构造出不可变的命令描述符（§5.4） |
| **Singleton** | ✅ | 内核五件在主进程各一例（channel server / capability registry / plugin host / EventBus / SessionRegistry）；经 DI 容器持有，非全局变量 |
| **Prototype** | ❌ 不采用 | 无「克隆已有对象造新对象」的需求。配置用深合并（§11.6）不是克隆，事件是新建的不可变对象。硬套 Prototype 无落点 |

### 18.2 结构型（7）

| 模式 | 采用? | 落点 / 理由 |
|---|---|---|
| **Adapter** | ✅ | `EventSink` 把 `webContents.send`(ipc) 与 `socket.send`(ws) 适配成同一「往会话推字节」契约（§8.2）；channel-client 是 channel 之上的类型化前端 facade 兼 adapter |
| **Bridge** | ✅ | 契约（`IChannel`）与传输（`IMessagePassingProtocol`）两个维度独立变化——正是 Bridge 模式。换传输不动契约（§5.2）。注意：这是**模式** Bridge，与被废弃的胖**接口** `Bridge`（§5.1）同名不同物 |
| **Composite** | ✅ | 两级导航 `ViewContainer` → `View` 的树；effect 回收的 LIFO 栈也是组合结构的逆序遍历（§14.2、§11.3） |
| **Decorator** | ✅ | channel wrapper 装饰 handler：在 handler 外层叠加「闸门 → 校验 → 广播」而不改 handler 本身（§8.4） |
| **Facade** | ✅ | `channel-client` 给渲染侧一个类型化门面，隐藏传输 / 序列化细节（§3 命名由来）；`PluginContext` 是内核能力的门面（§11.2） |
| **Flyweight** | ❌ 不采用 | 无「海量细粒度对象共享内在状态」的场景。单用户本机，对象量级远未到需要享元。硬套只增间接层 |
| **Proxy** | ✅ | channel server 对 handler 是保护代理（三重闸门做访问控制，§6.1）；`ctx.call` 是远程代理（本地调用形态，底层过传输） |

### 18.3 行为型（11）

| 模式 | 采用? | 落点 / 理由 |
|---|---|---|
| **Chain of Responsibility** | ✅ | 三重闸门 + zod 是一条责任链：①channel 白名单 → ②capability 声明 → ③按会话求值 → ④校验，任一关不过即短路（§6.1） |
| **Command** | ✅ | `defineCommand` 把「调什么」物化为可传输、可审计、可声明 `emits` 的命令对象（§5.4）——Command 模式的教科书落点 |
| **Observer** | ✅ | `SessionRegistry` 维护订阅者（会话），`EventBus.publish` 通知全体——发布订阅即 Observer（§8.2） |
| **Strategy** | ✅ | capability 的 `available: (session) => boolean` 是可替换策略；不同 `IMessagePassingProtocol` 是传输策略（§7.1、§5.3） |
| **State** | ✅ | 插件六态机（discovered/installed/active/disabled/failed...），状态决定可做的操作与转移（§11.1） |
| **Memento** | ✅ | 事务化更新保存旧版 active 快照，新版 activate 失败则回滚到旧态（§11.5）；设置深合并保留用户已存值（§11.6） |
| **Mediator** | ✅ | channel server 是插件间的中介：插件不直接通信，都经 server 路由（§12.4）——避免 N×N 直连 |
| **Iterator** | ✅ | `IChannel.listen` 返回 `AsyncIterable`，流式事件按 JS 原生迭代协议消费（§5.2） |
| **Template Method** | ❌ 不采用 | 用组合（Decorator 包 handler）表达「固定骨架 + 可变步骤」，不用继承抽象类留抽象方法。TS 侧组合优于继承（合成复用，§17），硬套 Template Method 会引入无谓类继承 |
| **Visitor** | ❌ 不采用 | 贡献点结构稳定、操作少，不存在「频繁对固定结构加新操作」的压力。Visitor 的双分派成本在此无收益，加它反而使加新节点类型变难（违背 OCP） |
| **Interpreter** | ❌ 不采用 | 无自定义 DSL / 表达式语言要解释。zod schema 的校验由 zod 内部完成，不是我们写解释器。无落点 |

### 18.4 诚实的五处「不采用」

Prototype · Flyweight · Template Method · Visitor · Interpreter——这五个没有真实落点。**不硬凑是设计纪律的一部分**：GoF 模式是解特定问题的工具，场景没有那个问题就不该上那个模式。硬塞一个 Visitor 到稳定的贡献点结构上，不是「用了 11 个行为型模式」的成就，是给后人留的理解负担。架构的严谨体现在**该用什么用什么、不该用的说清为什么**，而非覆盖率。

> ponytail: 「23 种模式全用上」是反模式。真正的功夫在那 5 个「不采用」——能说清为什么不用，比硬用更需要想明白。

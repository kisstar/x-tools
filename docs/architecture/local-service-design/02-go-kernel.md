# §4–6 Go 微内核

## §4 微内核只做五件事

### §4.1 内核 = runtime，五件事，没有第六件

kernel 是唯一的运行时核心，**不含任何业务，也不含任何协议**。它只负责五件事，其余全部由模块/插件贡献：

| # | 职责 | 说明 |
|---|---|---|
| 1 | **生命周期编排** | 按依赖顺序激活模块，freeze 注册表，优雅停机（§6） |
| 2 | **注册表（Registries）** | capability / command / route / view / transport / filter 六类贡献点的登记簿（§7、§8、§20） |
| 3 | **服务容器（DI）** | 类型化依赖注入：模块声明依赖、内核解析并注入（§5.2） |
| 4 | **事件总线（Event Bus）** | 进程内 pub/sub，模块间解耦通信（§6.3） |
| 5 | **调用管线（Invoke）** | 一条有序过滤器链：身份 → 校验 → 权限 → 可用性 → 配额 → handler。**唯一信任边界**（§9.3） |

### §4.2 协议不在内核里

早期草稿把「Transport Host」算作内核第五件事，让内核持有 HTTP listener、WS upgrader 和 cobra root。**这违反「内核仅含 runtime」**：内核会因此长出 HTTP、WebSocket、JSON-RPC 编解码、命令行解析四种协议知识，每加一条触达面都要改内核。

现在的划分是：

- 内核只定义 `Transport` **端口（port）**，并提供 `Invoke` 与注册表快照。
- HTTP / WS /（二期）MCP 各是一个**普通模块**，自己持有 listener、自己做编解码，把请求翻译成一次 `Invoke`。
- 内核不知道自己被谁调用；加第 N 条触达面 = 加一个模块，**内核零改动**。

CI 断言（不变式 7）：`grep -rEn "net/http|websocket|cobra|encoding/json" internal/kernel/` 必须为空。

### §4.3 Transport 端口

```go
// 内核定义端口，模块提供实现（依赖倒置）
type Transport interface {
    Name() string
    // inv 是唯一入口；snap 是激活后冻结的注册表快照（只读）
    Serve(ctx context.Context, inv Invoker, snap RegistrySnapshot) error
    Close() error
}

type Invoker interface {
    Invoke(ctx context.Context, call Call) (Result, error)
}

type Call struct {
    CapabilityID string
    RawInput     []byte    // 未校验的原始入参，由管线校验（§9.3）
    Conn         ConnInfo  // 连接期已确立的身份来源（§9.4）
}
```

transport 拿到的是 `Invoker` 与**只读快照**，拿不到 `Handler`、也拿不到注册表写权限——绕过管线在类型层面就不可能（不变式 2）。`Call.Conn` 由 transport 按**连接**填入，而非按请求；调用方不能自报身份（不变式 10）。

> 反面清单：kernel 不引反射式 DI 框架（如运行时扫描 tag 的容器），不为单实现造接口，不做中立 IDL，不内置任何协议。DI 容器就是一个 `map[token]constructor` + 拓扑排序，几十行足够。`// ponytail:` 标注这类刻意从简处。

## §5 Module 与 ActivationContext

### §5.1 Module 接口

模块与插件（内置部分）共用同一接口——**内置不是特权代码路径**（§13）：

```go
type Module interface {
    Manifest() ModuleManifest          // 静态元信息：id、依赖、贡献声明
    Activate(ctx ActivationContext) error   // 注册贡献物、拿依赖、订阅事件
    Deactivate() error                 // 释放资源（可禁用）
}

type ModuleManifest struct {
    ID        string
    DependsOn []string   // 内核据此做拓扑排序
    Provides  []string   // 本模块提供的 service token（供 DI 解析）
}
```

### §5.2 ActivationContext —— 模块与内核的唯一接触面

模块只通过 `ctx` 触碰内核，不直接 import 内核内部包（依赖倒置）：

```go
type ActivationContext interface {
    Capabilities() CapabilityRegistry   // 注册/查询能力
    Commands() CommandRegistry          // 注册 CLI 命令贡献（供客户端派生，§22）
    Routes() RouteRegistry              // 注册 HTTP/静态路由贡献
    Transports() TransportRegistry      // 注册 transport 实现（§4.3）
    Filters() FilterRegistry            // 在锚点插入横切过滤器（§9.3）
    Require(token string) (any, error)  // 从 DI 容器取依赖服务
    Provide(token string, svc any)      // 向 DI 容器登记服务
    Events() EventBus                   // pub/sub
    Config() ConfigReader               // 只读配置（§24）
    Log() Logger                        // 带模块名的结构化日志
}
```

`Require` 返回 `any` 需调用方类型断言——这是 Go 无泛型注册表的已知取舍。可选辅助：`func Require[T any](ctx, token) (T, error)` 泛型包装收敛断言，但不放进接口本身（避免接口泛型化的复杂度）。`// ponytail: any + 断言，够用；泛型包装按需加`。

### §5.3 内置模块清单（一期）

模块分类只是**阅读分组，不是特权分级**——都走同一接口、同一生命周期、同一权限闸门：

| 类 | module | 贡献 | 依赖 |
|---|---|---|---|
| transport | `transport.http` | 持有唯一 listener；`Provide("http.mux")`；派生 HTTP 端点表 | — |
| transport | `transport.ws` | 在 `http.mux` 上挂 `/ws`；JSON-RPC 编解码；派生 WS 方法表 | `http.mux`（DI token） |
| 能力 | `fs` | `fs.read` `fs.write` `fs.list` `fs.watch` | — |
| 能力 | `shell` | `shell.exec`（`elevate` 仅内置可申请，§15） | — |
| 能力 | `storage` | `storage.get` `storage.set` | — |
| 能力 | `catalog` | `capability.list`（供前端置灰派生与工具大全） | — |
| 资源 | `static` | 托管 `web/dist`（embed.FS），并注入 session token（§9.4） | `http.mux`（DI token） |
| 宿主 | `pluginhost` | 扫描 pluginDir、加载 manifest、暴露 `plugin.list` | `fs.list`（capability 调用） |

两处示范了不变式 8 的合法交互路径：

- `transport.ws` / `static` 需要与 HTTP 复用同一端口 → 走 **DI token** `http.mux`（由 `transport.http` 在 `Provides` 声明，token 常量定义在 L0 `contracts`），而**不是** import `transport.http` 包。
- `pluginhost` 需要读盘 → **调 capability** `fs.list`，而不是 import `fs` 模块。

`catalog` 读注册表须声明 capability `registry.read`——**内核不内置"分类"概念**，工具大全是一个普通内置模块，不是特权。`capability.list` 的结果按调用方过滤：插件只看得到自己 `requires` 声明过的能力及其可用性，看不到全量注册表。

## §6 生命周期与激活顺序

### §6.1 启动序列

```
加载配置 → 构造 kernel（空注册表 + DI 容器 + event bus）
       → 收集内置模块 + 扫描 pluginDir 得到插件 manifest
       → 依赖拓扑排序（DependsOn），检测环 → 报错退出
       → 依序 Activate：模块注册贡献物、Provide/Require 服务
       → freeze 注册表：生成只读快照，此后写入 panic（不变式 4）
       → 各 transport.Serve(ctx, inv, snap)：从同一快照派生自己的方法表
       → 绑定 127.0.0.1:10312，就绪
```

**freeze 是分界线**：激活期可写、服务期只读。注册表在服务期不可变，消除了「运行中能力表变了、两条触达面看到不同清单」的竞态，也让快照可无锁并发读。因此一期**不做插件热插拔**——加载新插件要重启（§26）。

任一模块 `Activate` 返回错误 → 逆序 Deactivate 已激活模块并退出，**不带残缺注册表启动**（fail-closed）。外部插件 manifest 非法或申请特权（§15.2）→ 拒绝该插件并记日志，其余照常启动。

### §6.2 停机序列

```
收到 SIGINT/SIGTERM → 停止接受新连接 → 广播 shutdown 事件
                   → 逆拓扑序 Deactivate 各模块 → 释放监听与锁文件 → 退出
```

停机有超时预算；超时未清理干净则强制退出并记日志，不无限等待。

### §6.3 事件总线的定位与语义

event bus 只做**进程内**解耦（如 `fs.watch` 变更通知、插件加载完成广播），**不是** capability 调用通道。跨进程/跨宿主通信一律走 channel（§8、§18）。两者不可混用：event 是广播、无返回、可丢；capability 调用是请求-响应、有 schema、有权限。

语义定死，避免"事件驱动"退化成隐式全局耦合：

| 项 | 取值 |
|---|---|
| 主题命名 | `<module>.<event>`，如 `fs.changed`；`#` 前缀段保留给能力推送（`fs.watch#event`，§8.2） |
| 投递 | 每订阅者一个有界队列，默认 256（可配 `[limits] eventQueue`，§24） |
| 队列满 | **丢最旧**，累计 dropped 计数，并投一条 `#overflow` 通知消费者"你漏了 N 条" |
| 发布者 | 永不阻塞（慢订阅者不能拖垮 publisher） |
| 订阅者 panic | 内核 recover + 记日志 + 摘除该订阅，不波及他人 |
| 不提供 | 持久化、重放、投递保证、跨进程（§26） |

**只用于通知，不用于命令与查询**：需要结果、需要顺序、需要重试的一律走 capability 调用。丢事件的正确恢复方式是重新查一次状态（`fs.list`），而不是要求总线补发。


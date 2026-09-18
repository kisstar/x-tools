# §7–9 能力、触达与信任边界

## §7 Capability：能力定义一次

### §7.1 结构

一个 Capability 定义一次，包含它的输入/输出 schema、所需权限、暴露给哪些触达面、处理函数：

```go
type Capability struct {
    ID          string          // 如 "fs.read"，等价于 "fs.read@1"（§7.4）
    Version     int             // 主版本号，默认 1
    Input       Schema          // 从 Go struct 反射得来（§10）
    Output      Schema
    Permissions []string        // 调用方需持有的权限（§9、§15）
    Transports  Exposure        // 暴露到哪些触达面（§8）
    Limits      map[string]any  // 显式声明能力边界（§7.3）
    Available   bool            // false 时前端置灰而非消失（§7.3）
    Reason      string          // Available==false 时的人类可读原因
    Handler     func(CallCtx, Input) (Output, error)
}

type Exposure struct {
    WS   bool   // 走 WS JSON-RPC（默认 true）
    CLI  bool   // 派生一个 CLI 子命令（客户端侧，§22）
    HTTP bool   // 派生一个一次性 HTTP 端点（少用）
    MCP  bool   // 未来：派生一个 MCP tool
}
```

### §7.2 注册

模块在 `Activate` 里注册，一行声明即在所有勾选的触达面同时可见：

```go
func (m *fsModule) Activate(ctx ActivationContext) error {
    ctx.Capabilities().Register(Capability{
        ID:          "fs.read",
        Input:       SchemaOf[FsReadInput](),
        Output:      SchemaOf[FsReadOutput](),
        Permissions: []string{"fs.read"},
        Transports:  Exposure{WS: true, CLI: true},
        Handler:     m.handleRead,
    })
    return nil
}
```

### §7.3 能力边界显式化，禁止静默降级（不变式 6）

- 某能力在当前环境做不到（如无权限、平台不支持），注册时置 `available=false` 并给 `reason`，**不是不注册**——前端能查到并置灰（§20.3），而不是"能力凭空消失"。
- 有限制的能力（如 `fs.watch` 最大监听数、`shell.exec` 超时上限）写进 `Limits`，前端据此收敛 UI，而不是让用户撞墙。

### §7.4 能力是有版本的契约

能力 ID 隐含主版本：`fs.read` ≡ `fs.read@1`。插件在 manifest 里可写 `requires = ["fs.read@1"]`（§14）。

| 变更 | 处理 |
|---|---|
| 加可选字段、加输出字段 | 兼容，主版本不变 |
| 删字段 / 改语义 / 改必填 | **新主版本** `fs.read@2`，与 `@1` 并存一段时间 |
| 要下线旧版 | 老版本标 `deprecated=true` + `sunsetAfter`，`capability.list` 可查；到期才删 |

这条让「插件与核心分别演进」成立：核心升级不静默改变旧插件的调用语义（不变式 6 的时间维度）。

## §8 一次注册，三处触达（皇冠不变式）

### §8.1 派生，而非重复

注册表在激活末尾 freeze（§6.1），各 transport 模块**从同一份只读快照各自派生**自己的对外清单：

```
CapabilityRegistry（真源，freeze 后只读）
   ├─ WS 方法表      ← transport.ws  取 Transports.WS==true 的能力
   ├─ HTTP 端点表     ← transport.http 取 Transports.HTTP==true 的能力
   ├─ CLI 命令树      ← CLI 客户端启动时查 capability.list（§22）
   └─（二期）MCP tool ← transport.mcp  取 Transports.MCP==true 的能力
```

**任何触达面都不手工维护第二份清单**（不变式 4）。新增能力 = 注册一个 Capability；它自动出现在勾选的每条触达面上。删除能力同理，不会出现"WS 有、CLI 忘了删"的漂移。派生方向单向：transport 只读快照，**不能反过来往注册表写**。

### §8.2 WS JSON-RPC 是主通道

web 与本地服务之间用 WS 承载全部 capability 调用。消息形如：

```
→ { "id": 7, "method": "fs.read", "params": { "path": "..." } }
← { "id": 7, "result": { ... } }            // 或 "error": { code, message }
```

订阅型能力（如 `fs.watch`）用同一连接的服务端推送（`{ "method": "fs.watch#event", "params": {...} }`），复用 §6.3 的 event，不另开通道。推送沿用 §6.3 的**有界队列 + 丢最旧**语义：客户端消费不过来时会收到 `fs.watch#overflow` 告知漏了 N 条，客户端据此重查一次全量，而**不是**让服务端无限缓冲（内存被慢客户端拖爆）。

### §8.3 CLI 命令由能力派生

`Transports.CLI==true` 的能力自动获得一个 CLI 子命令；flag 从 Input schema 生成。CLI 主要给 AI Agent 与脚本用；**应用管理命令（start/stop/status）是 CLI 专属命令，不是能力派生**（§22）。

### §8.4 MCP 是未来的第四条派生面

`Transports.MCP` 预留。届时 MCP 作为**又一个 transport 模块**接入，tool 列表由注册表派生，`inputSchema` 直接复用 §11 的 JSON Schema——同一份真源第三次收利息，**内核零改动**（§4.2）。一期不实现。

## §9 CallCtx 与唯一信任边界

### §9.1 CallCtx 携带调用方身份

每次调用都带一个 `CallCtx`，其 `CallerID` 是权限白名单的落点：

```go
type CallCtx struct {
    CallerID string   // "builtin" / "<pluginId>" / "cli-user"
    // trace id、deadline 等
}
```

- 来自内置模块 → `builtin`
- 来自某插件的 UI 发起的调用 → 该 `pluginId`
- 来自 CLI/脚本 → `cli-user`

`CallerID` 由**服务端按连接派生**（连接握手时确立，§9.4），不接受请求里自报的身份（不变式 10）。

> 诚实的边界说明：一期所有前端插件跑在**同一个页面、同一条连接**里，因此 `pluginId` 级别的 CallerID 是**纵深防御与审计信号，不是安全边界**——同页面的代码理论上能冒充同页面的另一个插件。真正的硬边界是：fs 路径白名单（§15.3）+ 特权能力仅内置可申请（§15.2）+ 连接准入（§9.4）。不要在文档或代码里把它说成沙箱。

### §9.2 校验与闸门只在这一层

内核在把调用交给 handler 前完成校验与授权，**这是唯一信任边界**（不变式 2）：

```
1. schema 校验 input（生成自 Go struct，§12）——不合法直接拒
2. 权限闸门：CallCtx.CallerID 是否被允许调用该 capability.Permissions（§15）
3. 能力可用性：available==false 直接返回 reason，不进 handler
```

过闸后 handler 可信任入参已合法、调用方已授权，**handler 内不再重复边界校验**——重复校验是坏味道，也会让"边界在哪"变模糊。

### §9.3 Invoke 管线：管道-过滤器

上面三步是管线里的三节。整条管线是一条**有序过滤器链**（Pipe and Filter / 中间件链），由内核固定顺序：

```
transport
   │ kernel.Invoke(call)
   ▼
[recover + trace + deadline]        ← 最外层，永远存在
[身份绑定]   CallerID ← 连接（§9.4），不可自报
[schema 校验] 生成自 Go struct（§12），拒非法入参
   ── 锚点 preAuthorize
[权限闸门]   CallerID × capability.Permissions（§15）
   ── 锚点 postAuthorize
[可用性]     available==false → 返回 reason，不进 handler
[配额/超时]  Limits 覆盖默认 30s deadline，并发/频次上限
   ── 锚点 preHandler
[审计]       记 capability id / CallerID / 耗时 / 结果码
   ▼
handler（此时入参与身份都已可信）
```

规矩三条，缺一管线就会变成隐蔽的后门：

1. **顺序由内核固定**，模块只能在 `preAuthorize` / `postAuthorize` / `preHandler` 三个锚点插过滤器（`ctx.Filters()`，§5.2），不能重排或摘掉内核自带的节。
2. **过滤器只能拒绝或附加只读注解**，**不得改写业务入参**——否则 handler 收到的就不是被 schema 校验过的那份数据，校验形同虚设。
3. **fail-closed**：过滤器返回错误、panic、或超时 → 整个调用失败。没有"校验器挂了就放行"。

审计**只记元数据不记 payload**（避免文件内容、命令行参数进日志）。最外层 recover 把 handler panic 变成错误码，不让单次调用打死进程。

### §9.4 连接准入：本机监听不等于安全

`127.0.0.1` 只挡住了局域网，**挡不住用户浏览器里任意一个网页**。WebSocket 不受 CORS 限制，恶意页面可以直接 `new WebSocket("ws://127.0.0.1:10312/ws")` 并调用 `fs.read` / `shell.exec`（Cross-Site WebSocket Hijacking）；DNS rebinding 还能伪造 Host。所以每条连接必须先过三重校验，缺一即拒（不变式 10）：

| 闸门 | 规则 | 挡住什么 |
|---|---|---|
| **Origin 白名单** | 仅允许 `http://127.0.0.1:<port>`、`http://localhost:<port>`、`http://x-tools.localhost[:port]`；缺失 Origin 的非浏览器客户端必须持 token | 任意站点的跨站 WS/HTTP 连接 |
| **Host 校验** | Host 必须在同一白名单内，不接受任意域名解析到本机 | DNS rebinding |
| **session token** | 每次 `start` 轮换，写 `~/.xtools/session.token`（`0600`）；`static` 模块注入进它服务的页面；CLI 从该文件读 | 非本机用户 / 未授权进程 |

- token 只存在于本机文件系统与本机进程内存，**不进日志、不进 URL query、不写进仓库**。
- 校验通过后服务端确立该连接的 `CallerID`（§9.1）；连接内的请求不能改身份。
- 三重校验**不可通过配置关闭**；`allowedOrigins` 可加白名单项（§24），但文档必须写明每加一项就是放大攻击面。


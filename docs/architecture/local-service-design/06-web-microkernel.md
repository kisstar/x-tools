# §17–21 Web 微内核

## §17 Web 也是微内核：核心只有 runtime

### §17.1 五段 runtime，工作台不在其中

web 侧与 Go 核**同构**：内核只含 runtime，不含任何业务界面。

| 段 | 职责 | 对应 Go 核 |
|---|---|---|
| **契约（contracts）** | 生成自 Go struct 的 TS 类型 + 运行时校验器（§11） | L0 contracts |
| **贡献注册表（registry）** | 登记导航容器、视图、命令、设置分区；首帧前 freeze | Registries |
| **DI 容器** | 前端服务的类型化注入（channel、i18n、主题等） | 服务容器 |
| **channel 端口** | `IChannel` —— 唯一对外调用口，屏蔽宿主差异（§18） | Transport 端口（§4.3） |
| **模块生命周期与失效隔离** | 拓扑激活、freeze、降级隔离（§17.3） | 生命周期编排（§6） |

**工作台不是内核**：导航骨架、工具大全、命令面板、设置页全部属于内置 UI 模块 `workbench`，与外部插件走同一套 manifest、同一套注册机制、同一套生命周期——§13「内置不是特权代码路径」在 web 侧同样成立，`workbench` 也必须可禁用。

React 19 + TanStack Router（hash 模式）+ Tailwind 4 承载渲染；内核不认任何具体工具。

### §17.2 前端模块生命周期

```ts
interface UIModule {
  manifest: UIManifest                        // id / dependsOn / contributes
  activate(ctx: UIActivationContext): void | Promise<void>
  deactivate?(): void
}

interface UIActivationContext {
  contributes: ContributionRegistry           // 登记导航/视图/命令
  require<T>(token: Token<T>): T              // 取 DI 服务
  provide<T>(token: Token<T>, svc: T): void
  channel: IChannel                           // 已按 requires 收窄（§17.3）
  log: Logger                                 // 带模块名
}
```

激活序列与 Go 侧同规（§6.1）：按 `dependsOn` 拓扑排序 → 依序 `activate` → **首帧前 freeze 注册表**，此后写入抛错。渲染期注册表只读，消除了"渲染中导航项变了"的竞态。因此一期前端也**不做热插拔**：装新插件要刷新页面。

### §17.3 失效隔离：一个插件炸不掉工作台

| 失效点 | 处理 |
|---|---|
| `activate` 抛错 | 跳过该模块的贡献物并记日志，其余模块照常激活（fail-closed 到单模块） |
| 懒加载 entry 失败/超时 | 该视图置降级态 + `reason`，**不白屏**、不影响其他视图（不变式 6） |
| 渲染期抛错 | 每个 view 外包一层 ErrorBoundary，只毁自己那一格 |
| 越权调用 | `scopedChannel(pluginId)` 按 `manifest.requires`（§14）收窄的代理，未声明的 capability 直接拒 |

> `scopedChannel` 的诚实边界：一期所有前端插件同页面同上下文，它是**UX 与审计闸门，不是沙箱**——同页面代码理论上能拿到未收窄的 channel。硬边界只在 Go 侧：连接准入（§9.4）+ 权限闸门（§15）+ fs 路径白名单（§15.3）。

## §18 传输无关的 channel client

### §18.1 IChannel 是 UI 的唯一调用口

UI 永远只调 `IChannel.call`，永不感知自己跑在浏览器、Electron 还是 Rust 渲染进程里（不变式 1）：

```ts
interface IChannel {
  call<TIn, TOut>(capabilityId: string, input: TIn): Promise<TOut>
  subscribe<T>(eventId: string, handler: (payload: T) => void): () => void
}
```

- `call` 走请求-响应，映射到一次 capability 调用。
- `subscribe` 走服务端推送（如 `fs.watch#event`），复用 §8.2 的同一连接。

### §18.2 宿主差异只活在 transport 适配器

| 宿主 | transport 实现 |
|---|---|
| web-serve（一期） | WS 客户端连 `127.0.0.1:10312`，JSON-RPC |
| Electron（后续） | 走 IPC，主进程转发到同一份能力 |
| Rust 渲染进程（后续） | 走原生调用 |

换宿主 = 换一个 transport 适配器 + 入口装配（§19），**业务与 UI 零改动**。这是 web 可低成本移植到 Electron / Rust 渲染进程的关键（不变式 1）。

### §18.3 前端校验是 UX，不是安全边界

channel client 在发请求前用生成的 zod/ajv 校验器做一次前置校验（提前反馈、置灰按钮），但**真正的信任边界只在 Go 侧**（§9.2、§12）。前端校验被绕过也无所谓，Go 侧仍拒。

## §19 每宿主装配：composeHost

入口层用**抽象工厂**按宿主装配内核：选定 transport、注入 DI、收集并激活模块（§17.2）。

```
composeHost.web()      → WS transport   + 浏览器 DI
composeHost.electron() → IPC transport  + Electron DI（后续）
composeHost.rust()     → native transport（后续）
```

三个装配函数产出同一个 `IChannel` 实现给 UI 用。**UI 不知道用了哪个**——它只从 DI 里拿 `IChannel`。装配层是唯一允许出现宿主判断的地方（不变式 1）。

## §20 工作台：贡献点与派生

### §20.1 一切界面都是贡献物

导航项、工具卡、命令面板条目、设置分区，全部是插件往前端注册表登记的贡献物；核心不硬编码任何一个。

### §20.2 useCapability：订阅式消费

React 侧用 hook 消费能力，能力可用性变化时自动重渲染（Observer）：

```ts
const { data, loading, error, available, reason } = useCapability('fs.read', input)
```

### §20.3 不可用即置灰，不是消失（不变式 6）

能力 `available=false` 时（无权限、平台不支持），前端**查到并置灰**并展示 `reason`，而非让入口凭空消失。清单从 `capability.list`（§5.3 catalog 模块）派生。

### §20.4 两级导航是贡献点派生

- 一级导航 = 所有 `contributes.viewContainers`（`id` / `title` / `order`）。
- 二级导航 = 该 container 下有没有 `slot="subnav"` 的 view，**派生结论**，不是枚举字段。
- 内容区 = `slot="content"` 的 view。

内核不内置"分类"概念，只透传不解释 `views[].tags`；"工具大全"是内置 UI 插件，读注册表须声明 `registry.read`（§5.3）。

### §20.5 nav 状态真源是 URL

两条静态路由 `/tool/$containerId` 与 `/tool/$containerId/$viewId` 是导航状态的真源，**不是 store**。`activeNavId` / `activeCategoryId` 这类镜像状态一律删除；只保留纯 UI 偏好（如 `isSubNavCollapsed`）在 store 里。

### §20.6 插件之间零直接依赖（不变式 8 的 web 侧）

前端插件不得 import 另一个插件的模块，跨插件协作只有三条合法路径，与 Go 侧对称：

| 路径 | 用途 |
|---|---|
| **命令（command）** | 调另一个插件登记的命令（`contributes.commands`），只认 id 与入参 |
| **事件** | 前端 event bus 广播通知，无返回、可丢 |
| **共享 capability** | 都调同一个后端能力（如 `storage.get`），经 Go 侧管线 |

CI 用 eslint `no-restricted-imports` 断言 `plugins/<a>` 不出现对 `plugins/<b>` 的 import（唯一例外是生成的 contracts 包）。跨插件直接 import 一旦放开，两个插件就必须同时升级、同时禁用，"可插拔"随即失效。

## §21 业务模块是稳定中心

五段 runtime（§17.1）是稳定内环，工具与工作台都是可插拔外环。加一个工具 = 写一个前端插件 + （若需新后端能力）加一个内置 Module；**不动内核**。这与 Go 核的"加能力 = 注册一个 Capability"（§8.1）对称——两侧都靠注册表把变化挡在内核之外。

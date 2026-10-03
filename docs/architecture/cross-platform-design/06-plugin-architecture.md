# 微内核 · runtime · 生命周期 · 权限 · 插件 channel · 渲染侧两级导航

> 属 [xTools 跨端架构设计方案](../cross-platform-design.md)。章节编号沿用总文，行内 `§N.M` 引用按索引的映射表定位。
>
> 本章是「一切皆插件」的全部落地细节。参考 Linux 微内核、VSCode `viewsContainers` + `views` 两级贡献点、DSH「一切皆插件」的 effect 可逆卸载。本次相对旧版：runtime 从四种（`ui`/`ts`/`rust-builtin`/`wasm`）塌成两种（`ui`/`node`），提权语言无关。

---

## 9. 微内核边界

### 9.1 内核只留五件

内核不含任何业务概念。导航项、工具卡、命令面板条目、设置分区、switch-host——**全部是插件贡献物**。内核只有五件：

| # | 内核组件 | 职责 | 不做 |
|---|---|---|---|
| 1 | channel server | 路由 + 三重闸门 + zod 校验 + 审计（§6） | 不认识任何具体 channel 的业务含义 |
| 2 | capability registry | 注册 / 按会话求值 / `capability:list`（§7） | 不实现能力，只登记元数据 |
| 3 | plugin host | 发现 / 装载 / 卸载 / effect 回收 / 权限闸门（§11、§12） | 不区分内置与第三方的代码路径（§9.2） |
| 4 | transports | ipc / ws 两个 `IMessagePassingProtocol` 实现 + SessionRegistry + EventBus（§5.3、§8） | 不碰 channel 之上的语义 |
| 5 | OS 原语 capabilities | fs / shell / storage / net / path-guard（§6.5、§7） | 不含窗口 / 托盘 / 菜单（不变式 3，属 host shell） |

**不变式 7（CI 断言）**：`grep -rn "switch-host" core/` 必须为空。内核代码里出现任何具体业务模块名，即视为边界被击穿。这条由 CI 机械执行，不靠评审。

### 9.2 内置插件不是特权代码路径

内置插件与动态插件**共用同一套**：manifest 格式、`contributes` 贡献点、生命周期状态机、权限闸门、卸载语义。区别只有两点，且都不是「代码路径」层面的：

1. **分发方式**：内置随 `xtools` 一起打包，动态从本地目录 / zip 安装（§6.6）。
2. **可申请的权限上限**：两条红线（`shell.elevate` / `fsScope: unrestricted`）仅内置可申请（§12.3）。

**内置插件也必须可禁用**。用户在设置里关掉一个内置插件，它就走正常的 deactivate → effect 回收（§11），和关第三方插件完全一样。「内置」不等于「不可关、走后门」——否则「一切皆插件」就只是口号。

## 10. runtime 矩阵

### 10.1 两种 runtime

manifest 声明插件各部分跑在哪：

| runtime | 跑在哪 | 两个前端的可用性 |
|---|---|---|
| `ui` | 渲染进程（React 组件 / 视图） | ipc / ws 都 ✅（都是渲染端，都能挂载 UI） |
| `node` | 主进程（能力实现 / channel handler） | ipc / ws 都 ✅（都连同一个主进程） |

```jsonc
// manifest 片段
{ "runtimes": ["ui", "node"] }   // 带前端视图 + 主进程后端的典型插件
```

**本次相对旧版的塌缩**：旧版四种 runtime（`ui`/`ts`/`rust-builtin`/`wasm`）要对宿主做交集求值。移出 Rust、wasm 后只剩 `ui`/`node`（`ts`→`node` 改名）；而「两个前端共用一个主进程」意味着 `node` 对两个前端**恒可用**。runtime 维度几乎塌成常量——真正的跨端差异不在 runtime，而在**按会话求值的 capability**（§7.3）。

### 10.2 `runtime-unsupported` 的归宿

`reason: 'runtime-unsupported'`（§7.1）在两传输世界里基本不触发——留作前向兼容：将来若引入隔离的 extension host 形态，某些 `node` 能力可能在受限会话上不可用，届时这个 reason 才有真实分支。一期它是保留值，不删（删了将来加回要动契约），但也不假装它有用。

> ponytail: 保留 `runtime-unsupported` 是为契约稳定，不是为当下功能。一期真正活跃的 reason 是 `desktop-only` / `user-disabled` / `not-implemented` / `permission-denied`。

## 11. 生命周期与 effect 回收

### 11.1 六态机

每个插件在 plugin host 里走同一条状态机：

```
discovered ──install/enable──► installed ──activate──► active
    ▲                              │                     │
    │                              │ disable             │ deactivate
    │                              ▼                     ▼
    └────────uninstall──────── disabled ◄───────────── (effect 回收)
                                   │
                              failed（任意阶段抛错落此，带诊断，不污染其他插件）
```

- **discovered**：plugin host 扫到 manifest，还没校验 / 装载。
- **installed**：manifest 过校验、channel schema 已注册进 server 校验表（§13），但 `activate()` 未跑。
- **active**：`activate(ctx)` 成功，贡献点已挂载、channel handler 已就绪。
- **disabled**：被用户或依赖关闭；effect 已全部回收（§11.3）。内置插件同样可落此态（§9.2）。
- **failed**：任意阶段抛错的落点。失败插件被隔离——**不中断宿主启动、不影响其他插件**，诊断进审计日志，UI 在设置里标红可重试。

### 11.2 PluginContext

`activate(ctx)` 拿到的 `ctx` 是插件与内核的**唯一**接触面。插件不 import 内核内部，只用 `ctx`：

```ts
export interface PluginContext {
  readonly pluginId: string;
  readonly registerChannel: (channel: ChannelContribution) => void;   // 带 zod，否则拒绝（§13.3）
  readonly contributes: ContributionSink;                             // viewContainers / views / commands / settings（§14）
  readonly effect: <T>(acquire: () => T, release: (resource: T) => void) => T;  // 登记可逆副作用（§11.3）
  readonly call: IChannel['call'];                                    // 调别的 channel（仍过三重闸门）
  readonly settings: SettingsAccessor;                                // 本插件命名空间下的配置（§12.2）
  // 注意：没有 publish。插件拿不到 EventBus（§8.4），广播只能靠 defineCommand 的 emits。
}
```

关键缺项是**没有 `ctx.publish`**：插件无法主动广播失效事件，只能在 `defineCommand` 上声明 `emits`，由 wrapper 在 handler 成功后代发（§8.4，不变式 8）。这是「事件不得先于提交」能被机械保证的根因。

### 11.3 effect 逆序回放回收（LIFO）

卸载最大的坑是**副作用残留**：注册了没注销、监听了没解绑、定时器没清。解法借 DSH——所有副作用必须经 `ctx.effect(acquire, release)` 登记，plugin host 记一条 `release`：

```ts
// 插件内：注册一个 fs 监听
ctx.effect(
  () => fsWatcher.watch(path),              // acquire
  (sub) => sub.dispose(),                   // release —— 卸载时自动逆序调用
);
```

deactivate 时，plugin host **按登记的逆序**（LIFO）依次调 `release`——后获取的先释放，依赖关系天然正确（先建的后拆）。插件自己不写卸载逻辑，杜绝「漏掉一个 release」。

### 11.4 卸载泄漏可被测试断言

六个副作用面必须在 deactivate 后归零：**channel 注册 · 贡献点（nav/view/command/settings）· capability · 事件订阅 · 定时器 · 文件监听**。契约测试对任一插件跑 **activate → deactivate 循环 20 次**，断言这六面计数回到初始值（§15）。泄漏表现为计数单调增，循环放大后必现。

### 11.5 事务化更新

插件更新（装新版）必须**原子**：新版 `activate` 成功才切换，失败则旧版保持 active，不留「半升级」中间态。

```
① 旧版仍 active
② 装载新版到隔离态，跑新版 activate
③ 新版 activate 成功 ──► 旧版 deactivate（LIFO 回收）──► 新版转正
   新版 activate 失败 ──► 丢弃新版，旧版继续 active，报错进审计
```

### 11.6 设置深合并

插件配置随版本演进要加字段。读配置时，用**插件声明的 schema 默认值**与**用户已存的值**做深合并（deep-merge）：新增字段取默认、用户改过的字段保留。不是整存整取（会丢用户值或丢新字段），也不是浅合并（嵌套对象会被整段覆盖）。

## 12. 权限模型

### 12.1 声明即授权，闸门即执行

插件要用一件能力，必须在 manifest 的 `capabilities` 里声明。**声明是授权的前提，不是授权本身**——真正放行在 channel server 的三重闸门第②关（§6.1）：调用方 manifest 没声明 `fs.read`，调 `fs:readFile` 直接 `FORBIDDEN`。声明与执行分离，使「插件能干什么」在 manifest 里**静态可审**，不必读遍代码。

### 12.2 命名空间隔离 · `CallContext.pluginId` 是落点

- **channel 命名空间**：插件贡献的 channel 一律挂在 `plugin.<id>.` 前缀下，不同插件的 channel 名物理隔离，不会撞车。
- **配置命名空间**：`ctx.settings` 只能读写 `plugin.<id>.` 下的键，碰不到别的插件或内核的配置。
- **权限白名单的落点是 `CallContext.pluginId`**（§5.2）：`origin === 'plugin'` 时 `pluginId` 必填，三重闸门第①②关都按它判定——「这个插件获准访问这个 channel 吗」「这个插件声明了这个 capability 吗」。`pluginId` 由 plugin host 在装载时绑定，插件无法伪造。

### 12.3 两条红线（硬边界）

- **红线一**：`shell.elevate` capability **仅内置插件可申请**。第三方插件在 manifest 里声明它，**加载期直接拒绝**（落 `failed` 态），不给用户「允许」弹窗——不把提权决定权推给用户。
- **红线二**：`fsScope: unrestricted` **仅内置插件可声明**，由 core 的 path-guard 执行。第三方插件的 fs 访问一律限定在声明的 scope 内，path-guard 对越界路径返回 `FORBIDDEN`。

两条红线在**加载期**（manifest 校验阶段）就裁决，不拖到调用期。第三方插件连「声明了但调不动」的机会都没有，直接装不上。

### 12.4 无插件间直接依赖

一期插件之间**不允许直接 import / 直接调对方内部**。要协作只能经 channel（走三重闸门，可审计、可权限控制）。这避免了插件间的隐式耦合网——A 插件改内部实现不会悄悄弄坏 B。插件沙箱、插件间显式依赖声明是 §19 的非目标，一期不做。

## 13. 插件贡献的 channel

### 13.1 两类来源，一张校验表

| channel 来源 | schema 归属 | 注册进校验表的时机 |
|---|---|---|
| 内核 + 内置插件 | `protocol/src/commands/*.ts` | 构建期随 `protocol/` 编译 |
| 动态插件 | 随插件分发的 zod | 装载时（installed 态）**运行时**注册进 channel server 的校验表 |

两类最终进的是**同一张**校验表（不变式 2、4）。动态插件的运行时 schema 是「zod 唯一真源」的显式例外（§5.7），且因为只有一份 TS channel server，这例外天然只落在 TS 一侧，无跨语言问题。

### 13.2 插件 channel 的能力声明

插件贡献的每个 channel 命令同样用 `defineCommand`，带 `capability` 与可选 `emits`：

```ts
// 插件 switch-host 贡献
export const SWITCH_HOST_SET_ACTIVE = defineCommand({
  channel: 'plugin.switch-host',           // 强制命名空间前缀（§12.2）
  command: 'setActive',
  args: SetActiveArgs,
  capability: 'switch-host.write',          // 本插件自定义 capability，仍走三重闸门
  emits: ['switch-host.profiles.changed'],  // 成功后 wrapper 广播（§8.4）
});
```

### 13.3 无 schema 即拒绝

**红线**：插件贡献的 channel **必须**带 zod schema，没有 schema 的 channel **拒绝注册**（插件落 `failed` 态）。信任边界不接受未校验入参，插件来的入参尤其如此。这条无例外——「先注册跑起来、schema 以后补」不被允许，因为那等于在信任边界开一个无校验的洞。

## 14. 渲染侧与两级导航

### 14.1 插件三层：`ui/` → `model/` ← `data/`

每个带前端的插件内部分三层，依赖方向由 ESLint `no-restricted-paths` 强制（§3.1）：

| 层 | 职责 | 可依赖 | 禁止 |
|---|---|---|---|
| `model/` | 纯领域模型 / 纯函数，无副作用 | 无 | React、channel client、`node:*`、同插件 `ui/` `data/` |
| `data/` | 调 channel client 取数、封装成查询 | `common`、同插件 `model/`、channel client | 同插件 `ui/` |
| `ui/` | React 组件 / 视图 | `common`、同插件 `model/` `data/` | channel client 直连（必须经 `data/`） |

`ui/` 不得直连 channel client——取数一律经 `data/`。这让 UI 可测（mock `data/`）、让传输细节不漏进组件（不变式 1）。

### 14.2 两级导航是两个贡献点

导航不是内核内置的，是插件贡献的，分两级：

```ts
// 一级导航格子
export interface ViewContainerContribution {
  readonly id: string;
  readonly location: 'primary' | 'secondary';   // 主/次导航区
  readonly order: number;                        // 排序
  readonly emphasis?: 'normal' | 'strong';       // 视觉强调
  readonly title: string;
  readonly icon: string;
}

// 挂在 container 上的视图
export interface ViewContribution {
  readonly containerId: string;                  // 挂到哪个 container
  readonly slot: 'content' | 'subnav';           // 内容区 or 二级导航
  readonly id: string;
  readonly title: string;
  readonly tags?: readonly string[];             // 内核只透传，不解释（§14.4）
}
```

### 14.3 二级导航的有无是派生结论

**没有「这个 container 有没有二级导航」的枚举字段**。二级导航存在 ⟺ 该 container 上有 `slot: 'subnav'` 的视图。派生而非声明，避免「声明了有 subnav 但实际没挂视图」的不一致。渲染侧遍历 container 的 views，有 subnav slot 就画二级导航栏，没有就不画。

### 14.4 内核不内置「分类」概念

内核**只透传不解释** `views[].tags`。「工具大全」里的分类（如「网络」「系统」「开发」）不是内核概念，是内置 `ui` 插件 **`tool-catalog`** 读 registry 后自己分的组。`tool-catalog` 读 registry 须声明 capability **`registry.read`**——连「读有哪些插件 / 视图」都走能力闸门，内核不给任何插件免费的全局视野。

### 14.5 nav 状态真源是 URL

导航状态**真源是 URL**，不是 store。两条静态 catch-all 路由：

```
/tool/$containerId              → 渲染该 container 的 content 视图
/tool/$containerId/$viewId      → 渲染该 container 下指定 view
```

旧版 nav-store 里的 `activeNavId` / `activeCategoryId` **删除**（真源是 URL，store 存它们必然和 URL 漂移）；`isSubNavCollapsed` 这类**纯 UI 偏好**保留在 store（它不是导航位置，是展开状态）。前进后退、刷新、深链分享全部天然正确，因为位置只存在于 URL 一处。


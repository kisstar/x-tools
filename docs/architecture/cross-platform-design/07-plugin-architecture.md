# 微内核插件架构

> 属 [xTools 跨端架构设计方案](../cross-platform-design.md)。章节编号沿用总文，行内 `§N.M` 引用按索引的映射表定位。
>
> 本章取代 §10.2「一期：编译期模块」的定位。§10.1 的三条不可协商约束与 §10.4 的清单漂移仍然成立，是本章的前提。

---

## 15. 微内核边界

### 15.1 不可卸载的五件东西

内核只保留「不属于任何业务、且插件必须站在它上面才能运行」的部分：

| 内核组件 | 职责 | 为什么不能是插件 |
|---|---|---|
| channel server | 路由 + schema 校验 + 审计 | 唯一信任边界（不变式 2）。可替换即失守 |
| capability registry | `available` / `reason` / `mode` / `limits` 的真源 | 插件的可用性判定依赖它，不能由插件提供 |
| plugin host | 发现 / 装载 / 卸载 / effect 回收 / 权限闸门 | 装载器自己不能是被装载物 |
| transports | ipc / tauri rpc / ws / in-process 四个适配 | 属宿主壳，插件运行时已在其之上 |
| capabilities | fs / shell / storage / net / path-guard | OS 原语，权限模型的最小授予单位 |

**内核不含任何业务概念。** 导航项、首页工具卡、命令面板条目、设置页分区、switch-host —— 全部是插件贡献物。这加一条不变式：

> **不变式 6**：内核代码中不得出现具体业务模块的名字。`grep -rn "switch-host" core-ts/ core-rs/` 必须为空，由 CI 断言。

### 15.2 为什么内核双写可接受，插件双写不可接受

§4 定的「每个业务模块写两遍」是本次要解掉的那条。解法不是取消双写，是**把双写关进内核**：

| | 数量 | 增长方式 | 作者 |
|---|---|---|---|
| 内核（channel server / capabilities / plugin host） | 固定一套 | 一次性，之后只维护 | 我们自己 |
| 业务模块 | 随产品无上限增长 | 每加一个 ×2 | 我们 + 第三方 |

内核双写是**有界成本**，且契约测试（§11）本就是为它设计的。业务模块双写是**无界成本**，而且第三方插件作者不会写两遍——这一条单独就足以否掉插件双写。

因此 §4 的表格要改：OS 原语 / 网络 / 提权仍双写，**业务模块改为「插件按 manifest 声明 runtime，不要求双写」**。

### 15.3 内置插件不是特权代码路径

「内置」只影响两件事：**来源可信度**（§18）与**能否声明 `rust-builtin` runtime**（§16.2）。

manifest 格式、贡献点、生命周期、权限闸门、卸载语义——内置插件与动态安装插件走**完全同一套**。内核里不存在「内置模块专用注册入口」。这是「一切皆插件」在本项目的确切含义：内置模块只是预装的插件，不是绕过插件机制的代码。

推论：**内置插件也必须可禁用**。用户在设置里关掉 switch-host，它的导航项、命令、channel 全部消失，与卸载一个动态插件走同一条 dispose 路径。若内置模块走不了这条路径，说明它在内核里留了硬编码，违反不变式 6。

---

## 16. 插件清单与运行时矩阵

### 16.1 manifest 形状

```jsonc
// plugins/switch-host/manifest.json
{
  "id": "switch-host",
  "version": "1.2.0",
  "engines": { "xtools": "^1.0.0" },

  // 本插件提供了哪几种后端实现。宿主与它取交集，空集 → available: false
  "runtimes": ["ts", "rust-builtin"],

  "activationEvents": ["onCommand:switchHost.open", "onViewContainer:switchHost"],

  "contributes": {
    // 一级导航格子。不声明 viewContainers → 本插件不占导航位（§20.5）
    "viewContainers": [
      { "id": "switchHost", "title": "Hosts 切换", "icon": "network",
        "location": "nav-top", "order": 300 }
    ],
    // 视图必须挂在某个 container 上；slot 决定它进内容区还是二级导航
    "views": [
      { "id": "hosts", "container": "switchHost", "slot": "content",
        "title": "Hosts 切换", "tags": ["network"] }
    ],
    "commands": [{ "id": "switchHost.open", "title": "打开 Hosts 切换" }],
    "channels": ["plugin.switch-host.hosts"],          // §19
    "capabilities": ["fs.read", "fs.write", "shell.elevate"],
    "fsScope": "unrestricted"                          // §18.3，仅内置可声明
  },

  // 一期预留、不校验（§18.1）
  "publisher": "xtools-builtin",
  "signature": null
}
```

`engines.xtools` 必须有**执行者**。DSH 的 `engines.dsh` 是纯声明、无人校验，等于装饰字段；xTools 的 plugin host 在 resolve 阶段做 semver 比对，不匹配直接置 `unsupported` 并给出 reason，不进入激活。

### 16.2 四种 runtime 与宿主可用性

| runtime | 后端载体 | Electron | Tauri | serve | CLI/MCP | 谁能声明 |
|---|---|---|---|---|---|---|
| `ui` | 无后端，只调内核已有 channel | ✅ | ✅ | ✅ | ❌ 无 UI | 任何插件 |
| `ts` | TS 模块，Electron main 内 `import()` | ✅ | ❌ | ❌ | ❌ | 任何插件 |
| `rust-builtin` | 编译进 Rust core 的 crate | ❌ | ✅ | ✅ | ✅ | **仅内置插件** |
| `wasm` | WASI P2 Component | 二期 | 二期 | 二期 | 二期 | 二期 |

一个插件可同时声明多个 runtime（如上例 switch-host 内置且两侧都实现，四端全可用）。动态安装的第三方插件一期只能声明 `ui` 与 `ts`，因此**在 Tauri / serve / CLI 上不可用**——这是 Rust core 静态编译这条硬约束的直接后果，不是疏漏。

`wasm` 是二期把 `ts` / `rust-builtin` 两列合并成一列的路径：一份产物四端可用，且 import 集合天然是权限声明。一期不引入 wasmtime + jco 构建链（§12）。

### 16.3 不可用要「注册后置灰」，不能「不注册」

沿用 §9.3 那条判断：**缺 key 与 `available: false` 对 UI 是两种完全不同的信号。**

插件在**所有四个宿主上都注册进 registry**，只是 available 不同：

```ts
// 一个只声明了 runtimes: ["ts"] 的插件，在 Tauri 宿主上
{ key: 'plugin.json-formatter', available: false, reason: 'runtime-unsupported' }
```

这要求 §9.1 的 `reason` 联合类型新增 `'runtime-unsupported'`。UI 拿到它才能显示「此工具需要桌面客户端（Electron）」，而不是让工具在列表里凭空消失、用户以为没装。

---

## 17. 生命周期与可逆卸载

### 17.1 状态机

```
discovered ──resolve──► resolved ──activate──► activated
     │                     │                      │
     │                     │                   dispose
     ▼                     ▼                      ▼
 unsupported            failed              disposed ──► （可再次 activate）
（engines 不匹配 /
  runtime 交集为空）
```

只有 6 个状态，没有 DSH 的 `PENDING` / `LOADING` 双向回退。理由在 §17.3。

### 17.2 一切注册都是 effect（动态卸载的唯一前提）

这是 DSH 唯一必须照搬的机制：插件不许持有裸的全局注册，所有注册经 `ctx.effect()` 返回 disposer，`ctx` 被 dispose 时**反向重放**。

```ts
// PluginContext 的注册面 —— 每个方法都返回 Disposable 且已登记进 ctx 的 effect 栈
export interface PluginContext {
  readonly registerChannel: (name: string, ch: IServerChannel) => Disposable;
  readonly registerViewContainer: (c: ViewContainerContribution) => Disposable;  // §20.5
  readonly registerView: (view: ViewContribution) => Disposable;
  readonly registerCommand: (id: string, handler: CommandHandler) => Disposable;
  readonly call: <T>(channel: string, command: string, arg?: unknown) => Promise<T>;
  readonly effect: (setup: () => Disposable) => Disposable;
  readonly settings: PluginSettings;   // §17.5
  readonly registry: NavRegistryReader; // 只读；需声明 capability `registry.read`（§20.5）
}
```

纪律靠 wrapper 强制，与 §6 那条同理：**`ctx.registerChannel()` 是插件注册 channel 的唯一入口**，plugin host 不向插件暴露内核的裸注册表引用（§10.1 第 3 条）。插件拿不到裸引用，就不可能留下 dispose 时清不掉的注册。

### 17.3 不采用 DSH 的「服务可用性驱动激活」

DSH 用 `inject: ['llm']` + Fiber `PENDING` 取代 activationEvents 与依赖排序，插件依赖未到就挂起、到齐自动前进、依赖消失自动回退。这套很漂亮，但它成立的前提 xTools 不具备：

| | DSH | xTools |
|---|---|---|
| 插件与依赖的关系 | 同进程，服务是 JS 对象引用，可随时出现/消失 | 依赖是 channel 另一侧的 capability |
| 依赖何时确定 | 运行时，取决于别的插件装没装 | **启动时即确定**，由宿主与 OS 决定 |
| 需要双向回退吗 | 需要（插件 B 卸载时依赖它的 A 要退回 PENDING） | 不需要 |

所以 xTools 保留声明式 `activationEvents`。同时收窄一条，把 DSH 的整套 Fiber 复杂度直接消掉：

> **一期禁止插件间直接依赖。** 插件只依赖内核 capability。插件想把能力给别的插件用，必须贡献 channel（§19），走同一条信任边界与同一套校验。

这条同时消掉了依赖拓扑排序、循环依赖检测、以及「A 依赖 B 的私有 API，B 升级后 A 静默坏掉」这类问题。代价是插件间协作要经一次序列化，一期可接受。

### 17.4 更新是事务

借 DSH 的顺序，不可颠倒：

1. 加载新版本产物（不 dispose 旧的）
2. 新版本 activate 成功 → dispose 旧版本 → 提交
3. 新版本任一步失败 → dispose 新版本，**旧版本保持 activated** → 回滚
4. 回滚过程本身也失败 → 聚合 `AggregateError`，插件置 `failed`，两个版本都 dispose，UI 明确报错

先 dispose 旧的再加载新的，是升级失败即功能消失；顺序反过来只是多占一份内存。

### 17.5 插件设置必须深合并（DSH 的坑）

DSH 的 patch 是**整体替换** `config` 对象，结果：用户覆写过某项设置后，插件新版本新增的默认值会被静默丢掉。

xTools 的 `ctx.settings` 读取时按 `默认值 ← 用户覆写` **深合并**，用户覆写只存 diff，不存完整快照。这样新版本新增的默认字段自动生效。数组不深合并（无稳定 identity），整体替换并在 schema 里注明。

---

## 18. 权限与信任模型

### 18.1 一期的安装来源

| 来源 | 一期 | 信任等级 |
|---|---|---|
| 内置（随客户端分发） | ✅ | 与内核同级 |
| 本地目录 / zip 手动安装 | ✅ | **未验证**，安装时必须显式提示 |
| 远程 registry | ❌ | 二期 |

manifest 的 `publisher` / `signature` 一期**预留字段但不校验**。这是有意识的取舍，必须记录清楚，否则将来会被当成「已经有签名校验了」：

> DSH 的信任模型等于「你信任 pnpm 装进来的一切」，它没有签名、没有沙箱（其 `vm` 用法自述不是安全边界）。xTools 一期同样没有——但因为一期只允许**用户手动指定本地路径**安装，攻击者需要先能写用户磁盘，此时插件已不是最薄弱环节。开放远程 registry 的那一天，签名校验是前置条件，不是可选项。

### 18.2 声明即授权，且在加载期而非调用期拒绝

`contributes.capabilities` 是白名单，不是文档：

- **加载期**：声明了插件不允许持有的 capability → 拒绝加载，置 `failed` + reason。不是等到调用时才拒。
- **调用期**：调用未声明的 capability → `FORBIDDEN`。这在 channel server 里判，因此 `CallContext` 必须带 `pluginId`。

`CallContext` 加 `pluginId` 是本章对 §5 契约层的唯一改动要求。没有它，channel server 无法区分「内核自己在调」与「某个插件在调」，权限白名单就没有落点。

### 18.3 两条红线

**红线一：`shell.elevate` 仅内置插件可申请。** 第三方插件在 manifest 里声明它 → **加载期直接拒绝**，不弹窗、不给用户「允许」按钮。

理由：`xtools-elevate` 的设计意图（§8）就是**调用方不能自由指定动作**，只能触发编译进去的白名单动作。把提权决策 externalize 成一个用户点击的弹窗，等于把这个设计意图作废——用户对「是否允许修改系统 hosts」这个问题没有足够信息做判断，而这恰是恶意插件最常见的入口。

**红线二：fs 访问范围必须显式声明。** 声明 `fs.read` / `fs.write` 时必须同时给 `fsScope`：

| `fsScope` | 可访问 | 谁能声明 |
|---|---|---|
| `plugin-data`（默认） | 只有本插件自己的数据目录 | 任何插件 |
| `user-selected` | 只有经文件选择器拿到的路径 | 任何插件 |
| `unrestricted` | 任意路径（仍过 path-guard） | **仅内置插件** |

这与 §9.2 已有的判断对齐（「通用 fs 与只能经文件选择器拿到的本地文件分开」）。`fsScope` 由 core 的 path-guard 执行，不由插件自律。

### 18.4 审计

每次插件经 channel 的调用记 `pluginId` + `channel.command` + `capability` + 结果码。提权动作已有独立审计日志（§8），两者不合并——提权日志的保留策略和敏感度都不同。

---

## 19. 插件贡献 channel

### 19.1 收益：CLI 子命令与 MCP tool 自动出现

不变式 4 说「四条触达路径共用同一个 channel 注册表，MCP tool 列表 / CLI 子命令 / HTTP 路由全部由注册表派生」。插件贡献 channel 直接吃到这条：**插件装上，它的能力就自动成为一个 MCP tool，AI Agent 立刻能用**，无需任何手工登记。

### 19.2 命名空间与冲突

插件贡献的 channel 必须前缀 `plugin.<id>.`。加载期检查：

- 与内核 channel 名冲突 → 拒绝加载（防止插件劫持 `fs` / `storage`）
- 与已装插件冲突 → 拒绝加载（`id` 唯一，前缀天然不冲突，此检查兜 manifest 手写错误）
- manifest 的 `contributes.channels` 与运行时实际注册的集合不一致 → 拒绝加载

第三条是防漂移的：声明了没注册，或注册了没声明，都说明 manifest 不再是真源（§10.4）。

### 19.3 动态插件的 schema 只能在运行时校验

这是 §5.6 codegen 链路必须面对的例外。构建期 codegen 对**编译期未知的插件**无能为力：

| 插件类型 | schema 归属 | 校验发生在 | MCP tool 定义 |
|---|---|---|---|
| 内置 | 进 `protocol/`，参与构建期 codegen | 两份 server 都有生成物 | 构建期导出 |
| 动态（`ts` / `ui`） | 随插件一起分发的 zod | **运行时注册进 TS channel server 的校验表** | 加载时现场 `zod-to-json-schema` |

这条推导正好落在 §16.2 的约束上：动态插件只能在 Electron 上有后端，而 Electron 侧本来就有 zod 运行时，**不需要 Rust codegen**。所以运行时 schema 这条例外只存在于 TS 一侧，Rust 侧的「struct 是生成物、禁止手改」不受影响。

要求不变：插件贡献的 channel **必须**带 zod schema，没有 schema 的 channel 拒绝注册。信任边界不接受未校验入参，插件来的入参尤其如此。

### 19.4 对不变式 4 的修订

不变式 4 原文「四条触达路径共用同一个 channel 注册表」在插件化后**不再字面成立**：动态插件只在 Electron 宿主注册，`xtools` 二进制看不到它们的 channel。

修订为：

> **不变式 4（修订）**：**同一宿主内**的各触达面共用同一份 channel 注册表，MCP tool 列表、CLI 子命令、HTTP 路由全部由该宿主的注册表派生，不手工维护第二份清单。不同宿主的注册表可因插件 runtime 支持情况而不同，差异必须能由 `capability:list` 查出（§16.3）。

这不是妥协，是把事实说准：Electron 客户端内嵌的 WS server 能把动态插件的 channel 暴露给浏览器 UI 与 MCP，而独立 `xtools` 二进制只有内置插件的 channel。两者都各自自洽，且都能自述自己有什么。

---

## 20. 渲染侧组织与动态路由

### 20.1 插件内部三层

```
plugins/switch-host/
├── manifest.json
├── package.json                                      ← pnpm workspace member（§3）
├── ui/           HostsPage.tsx · HostList.tsx        ← React，可 import model
├── model/        parse-hosts.ts · diff.ts            ← 纯函数，零依赖，可单测
├── data/         hosts-client.ts                     ← 调 channel，可 import model
└── backend/
    ├── ts/       hosts-service.ts                    ← runtime: ts，运行时 import()
    └── rs/       Cargo.toml · src/lib.rs             ← runtime: rust-builtin，cargo workspace member
```

**端能力与渲染代码在同一个目录内，不按端拆包。** 理由是三条已定约束的直接后果：

1. **可插拔的单位必须等于目录的单位。** 动态安装是「本地目录 / zip」（§18.1），物理上就是落一个目录；卸载是删一个目录 + 一次 `ctx` dispose。拆成多个包后「装一个插件」变成往多处放文件并保证版本一致，§21.1 的六个注册面归零也失去单一落点。
2. **manifest 必须和它描述的东西在一起。** §19.2 的加载期检查要断言「manifest 声明的 channels == 运行时实际注册的 channels」，拆包会让 manifest 与它约束的代码分处两个版本号之下。
3. **跨端差异已由 `runtimes` 表达过一次**（§16.2），不需要靠目录再表达一遍。构建期按 runtime 挑子目录即可：`backend/rs` 对 Electron 构建就是不存在的输入。

两个后端的挂载方式不对称，这是静态编译的直接后果，不是设计不一致：`backend/ts` 由 plugin host 在运行时按 manifest 路径 `import()`；`backend/rs` 是插件目录内的一个 crate（自带 Cargo.toml），由顶层 cargo workspace 的 `plugins/*/backend/rs` glob 收进来、`core-rs` 以路径依赖引入，在编译期被链接进二进制（§3「workspace 归属」）。

依赖方向 `ui → model ← data`，由 ESLint `no-restricted-paths` 强制：

- `model/` 不得 import `ui/` / `data/` / channel client / React / `node:*`
- `ui/` 不得 import `data/` 之外的任何 channel 访问方式，也不得直接 import channel client
- `data/` 不得 import `ui/`

**到此为止。** 不为每层再套 interface，不把 DI 容器引进渲染侧——§12 已否掉 `StatePort` / `QueryPort` 那类投机抽象，「整洁架构」在这里的兑现物是**依赖方向被工具强制**，不是目录层数。

收益具体：`model/` 层零 mock 可测，`parse-hosts.ts` / `diff.ts` 这类最容易出 bug 的逻辑不需要起 Electron 就能跑。这也是契约测试之外插件作者唯一被要求写的测试。

#### `model/` 只被 TS 侧共享（一期的已知代价）

`ui/` / `data/` / `backend/ts` 三者共用同一份 `parse-hosts.ts`；**`backend/rs` 用不了它，必须自己写一遍**。

这是「一个插件一个包」方案里唯一真实的双写残留，且它落在最不该重复的地方——解析 / diff 这类纯逻辑是最容易出 bug 的部分（§21.4 第 5 条正因如此才要求 `model/` 有单测）。一期接受它，因为：

- 只有同时声明 `ts` + `rust-builtin` 的**内置**插件才付这个成本，第三方插件（一期只能声明 `ui` / `ts`）完全不涉及
- 两份实现由同一份契约用例双跑锁定（§21.3），漂移会被测出来而不是静默发生

`wasm` runtime 是它的正解，也是 §16.2 那两列合并的真正动机：一份 Rust 编译成 component，TS 侧调它，`model/` 只有一份。二期（§12）。

### 20.2 路由必须先改成 catch-all

`renderer/apps/main/src/router.tsx:31` 的 `rootRoute.addChildren([homeRoute, welcomeRoute])` 在**模块加载期**定型。TanStack Router 的路由树是静态结构，插件在运行时装上之后**无法往里插路由**。这是动态插件在渲染侧的真实约束点，不是配置问题。

改法：两条静态 catch-all 承载全部插件视图，层级与 §20.5 的两级贡献点一一对应。

```tsx
// /tool/$containerId          → 该 container 的默认 content 视图
// /tool/$containerId/$viewId  → container 内的具体 content 视图（二级导航选中项）
const toolRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tool/$containerId',
  component: PluginViewHost,   // 内部查 registry → 拿到组件 → 渲染
});
const toolViewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tool/$containerId/$viewId',
  component: PluginViewHost,
});
const routeTree = rootRoute.addChildren([homeRoute, welcomeRoute, toolRoute, toolViewRoute]);
```

两段而非一段是必需的：**二级导航的选中项必须进 URL**，否则刷新与深链会丢失插件内部状态（§20.5 缺口三）。不用可选参数（`$viewId?`）是为了不依赖 TanStack Router 的可选段语法，两条静态路由等价且更稳。

`PluginViewHost` 负责三种情况：视图存在且可用 → 渲染；插件已装但 `available: false` → 渲染置灰说明 + `reason`（§16.3）；`containerId` / `viewId` 查不到 → 404。第二种是最容易漏的，漏了就等于把「不可用」退化成「不存在」。

### 20.3 插件 UI 的交付形态

| 插件类型 | 交付 | 加载 |
|---|---|---|
| 内置 | 参与主 bundle 构建 | `import()` 懒加载，按 `activationEvents` 触发 |
| 动态 | 磁盘上的预构建 ESM | 运行时 `import()` 远端 URL |

动态插件的 UI 加载在 Electron 下有一个必须解决的工程点：**渲染进程默认 CSP 不允许从任意 `file://` 加载 ESM**。方向是注册一个 custom protocol（`xtools-plugin://<id>/<path>`）由 main 侧按插件安装目录解析并施加路径白名单，把 CSP 收在 `xtools-plugin:` 这一个源上。

**具体方案待实施时定型**，但方向不能是「放开 CSP」——那等于让任意本地文件成为渲染进程可执行代码源。

### 20.4 三处硬编码的替换目标

§10.4 列的三处，替换后各自的真源（两级贡献点的定义见 §20.5）：

| 现状 | 替换为 |
|---|---|
| `data/mock-tools.ts:3` 的 12 条 `mockTools`（被 `HomePage.tsx:11`、`CommandPalette.tsx:7` import） | **搬进内置插件 `tool-catalog`**，由它经 `ctx.registry` 读全部 `views` 派生（§20.5） |
| `NavBar.tsx:9` 的 `topItems` / `NavBar.tsx:17` 的 `bottomItems` / `NavBar.tsx:45` 的 primary 按钮 | `contributes.viewContainers` 的 `location` + `order` + `emphasis` 派生，叠加插件启用状态 |
| `SubNav.tsx:12` 的 7 条 `categories` | **删除。** 内核不内置分类概念；SubNav 面板降级为 `slot: 'subnav'` 视图的宿主，分类列表本身搬进 `tool-catalog` 插件 |

替换完成的判据不是「代码删了」，是**新增一个插件后这三处不需要改任何代码**。

---

### 20.5 导航是两级贡献点

§20.4 的前一版把 `NavBar.topItems` 直接映射到 `contributes.views`，那是层级错配：`topItems`（`home` / `ai` / `files` / `code` / `image`）是**工作区**语义，一个 view 是**单个工具**语义。12 个插件装上会把图标栏撑成 12 格。同时旧版 manifest 的 `ViewContribution` 只有 `{ id, title, icon }`，表达不了「进不进导航」「排第几」「点进去有没有二级导航」。

沿用 VSCode `viewsContainers` + `views` 的两级模型（成熟、已被大规模验证，不自造布局 DSL）：

```ts
export interface ViewContainerContribution {
  readonly id: string;
  readonly title: string;
  readonly icon: string;
  readonly location: 'nav-top' | 'nav-bottom' | 'none';  // none → 不占导航格子
  readonly order: number;
  readonly emphasis?: 'primary';   // 可选高亮样式；多个声明时 order 最小者生效，其余降级为普通
}

export interface ViewContribution {
  readonly id: string;
  readonly container: string;             // 必填，指向同插件或已存在的 container
  readonly slot: 'content' | 'subnav';
  readonly title?: string;
  readonly icon?: string;
  readonly tags?: readonly string[];      // 内核不解释，仅透传给读 registry 的插件
}
```

**二级导航的有无是派生结论，不是独立开关**：某 container 是否显示 SubNav 面板 = 它有没有 `slot: 'subnav'` 的视图。这样就不需要 `subnav: 'none' | 'plugin'` 这类枚举字段——枚举与实际注册可能不一致，派生不可能不一致。同理没有新增「注册 subnav 组件」的 API，subnav 只是 view 的一个 slot，卸载走同一条 dispose 路径。

三种形态因此都可表达：

| 想要的效果 | manifest 怎么写 |
|---|---|
| 占一个导航格子，点击后**直接进内容区**，无二级导航 | 1 个 container + 1 个 `slot: 'content'` 视图 |
| 占一个导航格子，点击后**二级导航列出自己的条目** | 1 个 container + ≥1 个 `slot: 'subnav'` 视图 + n 个 `slot: 'content'` 视图 |
| **不在导航显示**，只从命令面板 / 工具大全进入 | container 声明 `location: 'none'`，或干脆不声明 container、把 view 挂到 `tool-catalog` 的 container 上 |

`activationEvents` 相应扩为 `onViewContainer:<id>`（用户点击导航格子时触发）与 `onView:<id>`（内容视图或 subnav 视图首次渲染时触发）。前者是必需的：`subnav` 视图要在用户点导航时就能渲染，不能等内容区先加载。

#### 「工具大全」是第一个内置插件，不是内核功能

删掉 `SubNav.categories` 后，「按分类浏览全部工具」这件事没有内核落点——**这正是想要的结果**。它成为内置 `ui` 插件 `tool-catalog`：

- 贡献一个 `location: 'nav-top'` / `order: 0` / `emphasis: 'primary'` 的 container（对应现在 `NavBar.tsx:45` 那个 primary 按钮）
- 贡献 `slot: 'subnav'` 的分类列表视图 + `slot: 'content'` 的工具网格视图
- 经 `ctx.registry` 读全部 container / view，按 `views[].tags` 分组；tag → 显示名 / 图标 / 排序的映射由它自己持有，未知 tag 原样显示

它顺带成为不变式 6 的第一个真实检验：**如果内核里连一份分类列表都不需要，说明业务概念确实清干净了。** 内核对「分类」的全部认知就是 `tags?: readonly string[]` 一个不被解释的字段。

`ctx.registry` 是只读视图，且**必须声明 capability `registry.read`**（§9.2 新增的 key）。它不构成插件间依赖（§17.3 禁的是那个）——读的是内核 registry，不是别的插件的私有 API；某插件禁用后只是从结果里消失，不会让 `tool-catalog` 进入 `PENDING`。

#### nav 状态的真源是 URL，不是 store

`nav-store.ts:13-15` 现在是三个裸默认值（`activeNavId: "home"` / `activeCategoryId: "all"` / `isSubNavCollapsed: false`），出处不明且与路由脱节。registry 化后：

| 状态 | 真源 |
|---|---|
| 当前 container | URL 的 `$containerId`（§20.2） |
| 当前 content 视图 | URL 的 `$viewId` |
| SubNav 内部选中项（如分类） | 提供 subnav 的**插件自己**的状态；要深链就编码进 `$viewId` |
| `isSubNavCollapsed` | 保留在 store —— 它是用户界面偏好，与导航内容无关 |

因此 `activeNavId` / `activeCategoryId` 两个字段删除，避免「导航状态有两个真源」。

**空态必须有明确行为**：全部插件被禁用时导航为空，`/` 不能指向一个不存在的 container。规则是 `/` → `location: 'nav-top'` 中 `order` 最小且可用的 container；一个都没有 → 内核自带的 `welcomeRoute`（现有 `router.tsx:25`）。这是内核唯一允许硬编码的「视图」，因为它不属于任何业务模块。

---

## 21. 插件的契约测试与卸载泄漏检测

### 21.1 卸载泄漏是本章唯一的新测试类型

「可动态卸载」如果没有验证，就只是一句声明。卸载后必须断言**六个注册面全部归零**：

```
dispose(plugin) 之后：
  1. channel 注册表中该插件的 channel 数 == 0
  2. capability registry 中该插件的 key 数 == 0
  3. 命令注册表中该插件的 command 数 == 0
  4. 视图注册表中该插件的 view 数 == 0（content 与 subnav 两种 slot 都算）
  5. 导航注册表中该插件的 viewContainer 数 == 0（§20.5）
  6. 事件总线上该插件的 listener 数 == 0
```

加一条循环用例：**「装 → 卸」重复 N 次（N ≥ 20），上述六项与进程句柄数不单调增长。** 单次卸载干净但反复装卸泄漏，是 effect 栈实现有 bug 的典型症状，只跑一次测不出来。

container 那一项不能省：它是唯一会**留下可见残留**的注册面——泄漏的 channel 用户看不见，泄漏的导航格子用户直接点得到，点进去是空白。

### 21.2 沿用 §11.2 第 3 条：断言器要能检测自己什么都没检测到

这条对插件测试同样是关键，且更容易失效——插件发现是运行时行为，一个路径写错就是「扫到 0 个插件，全部通过」：

- 发现到的插件数为 0 → **fail**
- 某插件 manifest 声明了 `contributes.channels` 但契约用例文件缺失 → **fail**
- 声明 `runtimes: ["rust-builtin"]` 但 Rust runner 未覆盖其 channel → **fail**（这是双写仍然存在的那部分，见 §16.2）
- 卸载泄漏用例数为 0 → **fail**

### 21.3 覆盖矩阵

| 对象 | 测试方式 |
|---|---|
| 内核（channel server / capabilities / path-guard / 提权） | §11 原有的 TS + Rust 双跑，不变 |
| `runtimes: ["rust-builtin"]` 的内置插件 | TS + Rust 双跑同一份契约用例 |
| `runtimes: ["ts"]` 的插件 | 仅 TS runner；用例断言其在 Rust 侧 registry 里存在且 `reason: 'runtime-unsupported'` |
| `runtimes: ["ui"]` 的插件 | 无后端契约；只跑 `model/` 单测 + 卸载泄漏 |
| 权限闸门（未声明 capability → `FORBIDDEN`） | 每个插件必跑，用例由 manifest 派生 |
| 两条红线（第三方声明 `elevate` / `unrestricted` → 加载期拒绝） | 内核用例，用合成的恶意 manifest 断言拒绝 |
| 导航贡献点（`views[].container` 指向不存在的 container → 加载期拒绝；`emphasis: 'primary'` 撞车按 order 收敛） | 内核用例，合成 manifest fixture（§20.5） |
| 卸载泄漏六项 + 装卸循环 | 每个插件必跑 |

最后一条红线用例值得单独强调：它需要一个**故意违规的合成 manifest** 作为 fixture。没有这个 fixture，「第三方不能提权」这条只是散文——与 §3 里 `layer` 字段没有任何工具读取是同一种失效方式。

### 21.4 插件的验收标准

替换 §11.4 的四条（对插件而言）：

1. manifest 声明与运行时实际注册完全一致（channel / viewContainer / view / command 四项集合相等）
2. 声明的每个 runtime 都有对应实现产物；未声明的宿主上能查到 `runtime-unsupported`
3. 契约用例覆盖成功路径 + 每个错误码路径 + 每个未声明 capability 的 `FORBIDDEN` 路径
4. 卸载泄漏六项归零，装卸循环 20 次无增长
5. `model/` 层有单测

写进插件 PR 模板，靠清单强制，不靠记性。

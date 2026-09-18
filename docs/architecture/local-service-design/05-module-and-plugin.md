# §13–16 模块与插件模型

## §13 统一模型：Module = 编译进来的能力提供者，Plugin = 外部贡献者

xTools 只有一套贡献机制，`Module`（§5.1）是它的接口。两种形态共用同一接口、同一生命周期、同一权限闸门：

| | Module（内置） | Plugin（外部） |
|---|---|---|
| 来源 | 编译进 `xtools` 二进制的 Go 包 | 从 pluginDir 扫描发现 |
| 能力 | **可提供** capability（后端能力） | **一期只消费** capability（纯 UI 贡献） |
| manifest | Go 结构体 `ModuleManifest` | `plugin.toml` 文件（§14） |
| 生命周期 | Activate/Deactivate | 同左（一期仅 UI 注册，无 Go 侧激活） |
| 权限 | 可申请特权（§15） | 特权申请**加载期拒绝**（§15） |

**内置不是特权代码路径**：manifest 格式、贡献点、生命周期、权限闸门、可禁用性与外部插件完全同一套。内置模块也必须可禁用（配置里关掉即不激活），否则"一切皆插件"就是空话。

> 一期的实际含义：后端能力（fs/shell/storage…）都是内置 Module；外部 Plugin 只往前端注册导航项/工具卡/视图，其行为通过调用内置能力实现，不引入新的后端 capability。这把插件的信任问题一期压到最小。

## §14 插件 manifest（`plugin.toml`）

```toml
id = "com.example.hash-tool"
name = "哈希工具"
version = "0.1.0"
runtimes = ["ui"]                       # 一期只允许 "ui"
requires = ["fs.read@1", "storage.get@1"]  # 声明要调用的 capability（带主版本，§7.4）

[engines]
xtools = "^1"                           # 兼容的宿主主版本，不匹配则拒绝加载

[[contributes.viewContainers]]          # 一级导航格子（§20.4）
id = "hash"
title = "哈希"
order = 30

[[contributes.views]]                   # 挂在 container 上的视图
containerId = "hash"
id = "hash.main"
slot = "content"                        # content | subnav
entry = "ui/index.js"                   # 前端入口（懒加载）
```

- `runtimes` 声明插件支持的运行形态。一期只接受 `["ui"]`；将来的 `ts` / `wasm` / `rust-builtin` 是后续阶段（§27）。`rust-builtin`（原生编译进核心）**仅内置可声明**。
- `requires` 是权限白名单的输入：插件只能调用它声明过的 capability，且这些 capability 不得是特权能力（§15）。省略 `@N` 视为 `@1`；宿主没有该版本 → 该能力对此插件 `available=false` + reason，插件仍加载（置灰而非消失，不变式 6）。
- `engines.xtools` 不匹配 → **拒绝加载并记日志**，不做"猜它大概能跑"的静默尝试。
- 贡献点 `viewContainers` / `views` 是两级导航的真源（§20.4）。二级导航有无是派生结论（看有没有 `slot="subnav"` 的视图），不是枚举字段。
- manifest 未知字段忽略（向前兼容），但 `id` / `runtimes` / `engines` 缺失或非法 → 拒绝加载。

## §15 权限闸门

### §15.1 白名单落在 CallerID

§9 的 `CallCtx.CallerID` 决定一次调用能否过闸：

```
调用 fs.read，CallerID = "com.example.hash-tool"
   → 查该插件 manifest.requires 是否含 "fs.read" → 含 → 放行
   → 查该 capability 是否特权 → 否 → 放行
```

### §15.2 特权能力仅内置可申请

`shell.elevate`（提权执行）与 `fs` 的 `unrestricted` 作用域（越过路径白名单）是特权能力：

- 内置 Module 可申请。
- 外部 Plugin 声明即在**加载期拒绝**（拒绝加载该插件并记日志），**不给用户"允许"弹窗**——不把提权决策推给可能被诱导的用户。

### §15.3 路径与作用域

`fs` 类能力默认限定在配置的工作根目录内（路径白名单）；越界访问被信任边界拒。`unrestricted` 是内置专属的显式豁免。

## §16 隔离路线（分阶段）

一期外部插件纯 UI，后端能力全内置，因此**一期不需要进程隔离**——攻击面在前端沙箱内。当引入"外部插件提供后端能力"时（后续阶段），采用 **VSCode 式子进程隔离**：

| 阶段 | 外部插件形态 | 隔离手段 |
|---|---|---|
| 一期 | 纯 UI | 前端侧隔离即可，Go 侧不加载外部代码 |
| 后续 | 提供后端能力 | **独立子进程 + JSON-RPC**（不在 Go 进程内跑不可信代码） |

明确**不采用**同进程可逃逸的脚本沙箱（如可被 `constructor` 逃逸的 `vm`）跑不可信第三方代码——xTools 的 pluginDir 是不可信来源，Go 核不能被外部代码污染。`// ponytail: 一期零隔离成本，隔离随"外部后端能力"这个需求一起来，不提前造`。

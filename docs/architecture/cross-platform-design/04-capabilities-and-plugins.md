# capability registry 与插件模型

> 属 [xTools 跨端架构设计方案](../cross-platform-design.md)。章节编号沿用总文，行内 `§N.M` 引用按索引的映射表定位。

---

## 9. capability registry

### 9.1 形状

capability 的形状要能同时承载三层信息：能力是否存在、不可用的原因、以及可用时的上限差异。

```ts
export interface Capability<TService = unknown> {
  readonly key: CapabilityKey;
  readonly available: boolean;
  readonly reason?: 'not-implemented' | 'user-disabled' | 'permission-denied' | 'no-window';
  readonly mode?: string;
  readonly limits?: Readonly<Record<string, unknown>>;
  readonly service: TService;
}
```

**`available` 只表示能力是否存在，不表示能力上限一致。** 跨端有明显差异的能力必须声明 `mode` / `limits`，业务读数据做分支，而不是用布尔值硬判。例如批量上传在两端都 `available: true`，但上限差两个数量级：Web `{ maxFilesPerUpload: 300, maxFileSize: '4GB' }` vs Electron `{ maxFileSize: '300GB' }`。

### 9.2 key 粒度要细到能力，不是模块

`detect.ts:11` 现在只返回平台枚举，表达不了「Electron 宿主但此刻 headless 没有窗口」。粒度基准是「一个 key 对应一个可被单独拒绝的动作」：读与写分开声明（`clipboard-write` 只声明写），通用 fs 与「只能经文件选择器拿到的本地文件」分开。数量级上几十个 key 是正常的，十个以内一定太粗。xTools 至少要能区分：

```
fs.read / fs.write / fs.watch / shell.open / shell.elevate
storage.get / window.control / notification.show / update.check
```

`fs.watch` 必须独立成 key：`tauri/src/commands/fs.rs:129` 的 `fs_watch` 只返回 UUID 从不 emit，正确表达是 `{ key: 'fs.watch', available: false, reason: 'not-implemented' }`，而不是让 UI 拿到一个永不触发的订阅。

### 9.3 服务侧必须可查（这是 CLI/AI Agent 的关键）

CLI 与 serve 形态没有渲染进程，但 AI Agent 需要知道当前能调什么。因此 registry 不能只活在 renderer：

- registry 由 **channel server 持有真源**——两份 channel server 各持一份（`core-ts/packages/channel-server` 与 `core-rs/crates/xtools-channel`）
- 暴露一个 channel：`capability:list` → 返回全部 key + available + reason + limits
- **两份 registry 的输出一致性由契约测试锁定**：`capability:list` 是契约用例覆盖的 channel 之一，用例断言 key 集合与 limits 结构一致（`available` 允许因宿主而异，但 key 必须齐全、`reason` 必须给）
- MCP 侧把它作为一个 tool 暴露，Agent 可先查能力再决定调用
- renderer 侧的 `isAvailable(key)` 是这份数据的订阅视图，**每次调用实时查询不缓存**，天然感知运行时变化
- `capability:changed` 事件推送变更

**注意**：两份 registry 允许对同一 key 给出不同 `available`（例如 `window.control` 在 serve 形态下 `available: false, reason: 'no-window'`），但**不允许某个 key 在一份 registry 里根本不存在**。缺 key 与 `available: false` 对 UI 是两种完全不同的信号，前者会让 UI 拿不到 `reason` 而无法给出解释。

### 9.4 反模式

- ❌ 组件里判 `platform === 'electron'`
- ❌ 用 `available` 代替能力上限判断（该读 `mode` / `limits`）
- ❌ 同一 key 在不同宿主注册不同接口（接口是契约，实现可不同）
- ❌ capability 未注册就直接调用（`bridge.xxx` 在不可用时抛错，须先 `isAvailable`）

---

## 10. 插件模型

两件事都要做，但分期，且**第一天就把三条约束定死**——这三条现在零成本，事后补要重写插件 API。

### 10.1 三条不可协商的约束

1. **插件 API 全部 async**。同步 API 一旦被插件依赖，就永远搬不进独立进程。
2. **贡献点是静态声明式 manifest，不是插件代码调 `registry.register()`**。UI 必须能在插件未激活时渲染入口，否则「按需激活」不可能实现——这是 VSCode Contribution Point 的真正价值所在，不是配置风格偏好。
3. **插件只能通过注入的 `PluginContext` 访问内核**，禁止 import 内核模块。这条决定了将来能否把插件搬到 Extension Host。

### 10.2 一期：编译期模块 + 声明式贡献点

```jsonc
// plugins/switch-host/manifest.json
{
  "id": "switch-host",
  "activationEvents": ["onCommand:switchHost.open", "onView:switchHost"],
  "contributes": {
    "views": [{ "id": "switchHost", "title": "Hosts 切换", "icon": "network" }],
    "commands": [{ "id": "switchHost.open", "title": "打开 Hosts 切换" }],
    "capabilities": ["fs.read", "fs.write", "shell.elevate"]
  }
}
```

一期插件与宿主同进程，`PluginContext` 内部直连 channel client。**因为 API 已经是 async、访问已经走 context，二期换成跨进程只是换 `IMessagePassingProtocol` 的实现。**

`contributes.capabilities` 同时是**权限声明**：插件调用未声明的 capability 直接 `FORBIDDEN`，不靠代码审查兜。

### 10.3 二期：独立进程 Extension Host

传输换成 `MessagePort` 或 child process stdio，channel 层完全复用（见 §5.2 表格最后一行）。届时新增的只有进程生命周期管理、崩溃隔离与重启、以及资源配额。

### 10.4 必须避开的清单漂移

**漂移的机制**：模块注册信息一旦分散在多处——路由配置类型、路由工厂、侧边栏数组、每个 app 入口——新增一个模块就要同步改多处，且这些位置往往是逐字重复的配置块。漂移是必然结果，典型症状是「侧边栏项被注释掉了，但路由和入口注册都还在」：**路由可达，侧边栏无入口**，而且没有任何检查会报错。

xTools 会有四个入口（Electron / Tauri / Web / CLI），复制点比单宿主应用更多，漂移风险更高。因此：

- **manifest 是唯一真源**，路由表、侧边栏、命令面板、MCP tool 全部由它派生
- `renderer/apps/main/src/data/mock-tools.ts:3` 那 12 条硬编码 `mockTools`（被 `HomePage.tsx:11` 与 `CommandPalette.tsx:7` 直接 import）、`NavBar.tsx:9` 的 `topItems`、`SubNav.tsx:12` 的 `categories` —— 全部替换为从 registry 读
- 加一条构建期断言：manifest 里声明的每个 view 都能解析到组件，每个 command 都有 handler；**并且断言器要能检测到「自己什么都没检测到」**（见 §11）

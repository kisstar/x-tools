# capability registry · 按会话求值

> 属 [xTools 跨端架构设计方案](../cross-platform-design.md)。章节编号沿用总文，行内 `§N.M` 引用按索引的映射表定位。
>
> 本章讲**跨端差异的唯一出口**：UI 永不感知宿主（不变式 1），一切「这台能不能做」都退化成对 capability 的查询。本次新增**按会话求值**，让同一份 registry 对 ipc / ws 两个前端给出不同结论。

---

## 7. capability registry · 按会话求值

### 7.1 capability 是什么

capability 是「一件底层能力」的声明式描述——不是函数，是元数据。channel 的 handler 执行要靠它放行（§6.1 第②③关），UI 决定「画成可用还是置灰」也靠它。

```ts
// core/packages/capabilities/registry.ts
export interface Capability {
  readonly id: string;                    // 'fs.read' / 'shell.exec' / 'net.fetch' ...
  readonly available: (session: SessionInfo) => boolean;   // 按会话求值（§7.3）
  readonly reason?: CapabilityUnavailableReason;           // 不可用时为什么
  readonly limits?: Readonly<Record<string, unknown>>;     // 可用但有约束（§7.2）
}

export interface SessionInfo {
  readonly client: 'electron-renderer' | 'browser';
  readonly sessionId: string;
}

export type CapabilityUnavailableReason =
  | 'not-implemented'      // 还没实现
  | 'user-disabled'        // 用户在设置里关了
  | 'permission-denied'    // 调用方 manifest 没声明 / 申请了禁止项
  | 'desktop-only'         // 本能力只在客户端渲染端可用，浏览器会话拿不到（本次新增）
  | 'runtime-unsupported'; // 该插件 runtime 在本宿主不可用（§10）
```

### 7.2 `limits`：可用但有约束，是降级的替代品

契约不得静默降级（§5.6）。当一件能力「能做但有边界」，边界必须显式写进 `limits`，而不是实现里偷偷截断：

```ts
{ id: 'fs.read', available: () => true, limits: { maxFileSize: 50 * 1024 * 1024 } }
```

UI 读到 `limits.maxFileSize` 就能在选文件时提前拦，而不是让用户传了 60MB 再吞一个无声失败。`limits` 是「我做得到，但只做到这」的诚实声明。

### 7.3 按会话求值：跨端差异的唯一建模处

`available` 是**会话的函数**，不是常量。同一个 registry、同一份能力实现，对 ipc 会话和 ws 会话给出不同答案——这是整套架构里**唯一**承认两个前端有别的地方（§5.2 CallContext 的 `client` 正是为此）：

```ts
// 「打开系统文件管理器定位到某文件」——浏览器会话根本没有这个概念
{
  id: 'shell.revealInFolder',
  available: (s) => s.client === 'electron-renderer',
  reason: 'desktop-only',
}
```

关键在**它仍然注册、仍然在 `capability:list` 里出现**，只是对浏览器会话 `available === false` 且 `reason === 'desktop-only'`。对照旧版的 `'no-window'`：那是「宿主没有窗口」的宿主视角，本次废弃；`'desktop-only'` 是「这件能力绑定客户端」的能力视角，判据从「宿主形态」挪到「会话类型」，更贴合「两个前端一个后端」的拓扑。

**于是不变式 1 成立**：UI 从不写 `if (isBrowser)`，它只 `capability:list` 查到 `shell.revealInFolder` 对本会话 `available: false, reason: 'desktop-only'`，据此把按钮置灰 + 给出「请在客户端中打开」的提示。换传输、加第三个前端，UI 代码一行不动。

### 7.4 `capability:list` 是前端的唯一事实来源

```ts
// 内核 channel，任何会话可调，无需额外 capability
CAPABILITY_LIST = defineCommand({
  channel: 'capability',
  command: 'list',
  result: z.array(CapabilitySnapshot),   // { id, available, reason?, limits? }，已对本会话求值
});
```

server 收到调用时，用 `ctx` 构造 `SessionInfo`，对每条 capability 跑一遍 `available(session)`，返回**已求值的快照**。前端拿到的是「对我这台会话而言」的结论，不需要自己判断任何宿主 / 传输信息。

capability 集合变化（如用户在设置里开关了某项）通过事件总线广播 `capability.changed`（§8），前端重新 `capability:list` 刷新。这把「跨端一致性」与「能力可用性」统一到同一套发布订阅里。

### 7.5 不变式回收

- **UI 只认 channel client**（不变式 1）：跨端差异一律经 `available` / `reason` / `limits`，`renderer/` 中 `platform === 'electron'` / `isBrowser` 零出现。
- **契约不得承诺实现不支持的能力**（不变式 6）：做不到→从类型删，或进 `limits`，或 `available: false` + `reason`。三条出口，没有第四条叫「静默降级」。
- **两条传输差异必须可查**（不变式 4）：差异只能来自按会话求值，且必能由 `capability:list` 查出——不存在「文档里写了但接口查不到」的隐藏差异。

# 事件总线与跨端同步

> 属 [xTools 跨端架构设计方案](../cross-platform-design.md)。章节编号沿用总文，行内 `§N.M` 引用按索引的映射表定位。
>
> 本章是本次拓扑收敛**最大的收益兑现处**。用户的原始诉求——「同一功能用户可能在 web 和客户端同时访问，需要通知另一端更新」——在「两个前端一个后端」的拓扑下，退化成了**进程内的发布订阅**：不需要账号、不需要中转、不需要冲突合并。

---

## 8. 事件总线与跨端同步

### 8.1 问题被拓扑消解了

诉求是「一端改动，另一端更新」。常规做法要上账号、云端中转、冲突合并（CRDT / OT）。但本方案里两个前端**订阅的是同一个主进程**（§2）——数据只有一份、在主进程里。所谓「同步两端」其实是「**同一份数据变了，通知所有看着它的前端重新取**」。于是整件事退化为：

```
某会话 call 写操作 ──► 主进程改数据 ──► 事件总线广播失效 ──► 所有会话（含发起端）收到 ──► 各自重新 call 读
```

没有两份状态要对齐，就没有冲突要合并。这是选「两个前端一个后端」而非「两个独立应用 + 同步层」换来的根本简化。

### 8.2 SessionRegistry + EventBus

主进程持有两个内核组件：

```ts
// core/packages/kernel/session-registry.ts
export interface SessionRegistry {
  readonly register: (session: SessionInfo, sink: EventSink) => Disposable;  // 连接建立时登记
  readonly broadcast: (event: InvalidationEvent) => void;                    // 发给所有在册会话
}

// core/packages/kernel/event-bus.ts
export interface EventBus {
  readonly publish: (event: InvalidationEvent) => void;   // 仅内核 / channel wrapper 可调（§8.4）
}
```

`EventSink` 是「往某个会话推字节」的抽象，ipc 会话实现为 `webContents.send`，ws 会话实现为 `socket.send`——又是同一套契约换传输（§5.3）。`EventBus.publish` 转交 `SessionRegistry.broadcast`，**广播给每一个在册会话，包含发起这次写操作的那个会话本身**（§8.6）。

### 8.3 事件是纯失效通知

一期事件**不带 payload**，只带「什么失效了」：

```ts
export interface InvalidationEvent {
  readonly topic: string;        // 'fs.changed' / 'switch-host.profiles.changed' ...
  readonly revision: number;     // 单调递增，全局序号（§8.5）
  readonly scope?: string;       // 可选，细化失效范围（如某个 profileId），省则整 topic 失效
}
```

为什么不带数据：带数据就要考虑「推过去的数据版本和前端稍后主动读到的会不会不一致」，又把两份状态对齐的问题请回来了。纯失效通知下，前端收到 `fs.changed` 只做一件事——**把对应的查询标脏、重新 `call` 读**。真源永远是主进程那一次读，事件只负责「提醒去读」。这天然契合 TanStack Query 的 `invalidateQueries`。

### 8.4 声明式 `emits`，wrapper 在提交后广播（不变式 8）

插件**拿不到 `EventBus.publish`**。要广播，只能在 `defineCommand` 上声明 `emits`（§5.4）：

```ts
SWITCH_HOST_SET_ACTIVE = defineCommand({
  channel: 'switch-host',
  command: 'setActive',
  args: SetActiveArgs,
  capability: 'switch-host.write',
  emits: ['switch-host.profiles.changed'],   // 声明：这个命令成功后要广播什么
});
```

channel wrapper 的时序是硬约束：

```
① zod 校验通过
② 执行 handler
③ handler 成功 resolve ◄──────────── 只有走到这里
④ 按 emits 广播失效事件            ◄── 才广播，且由 wrapper 代发，不由业务代码
⑤ 把 handler 结果返回发起端
```

**事件不得先于提交**（不变式 8）：handler 若抛错（走到 `INTERNAL` / 任意 reject），**第④步不执行**。这杜绝了「业务代码写一半先广播了失效、别的会话重新读却读到旧值 / 中间态」的竞态。把 publish 从业务代码手里收走、交给 wrapper 在 resolve 之后统一代发，是这条不变式能被机械保证（而非靠自觉）的原因。

### 8.5 重连用 revision 对账，不留事件日志

ws 会话会断线重连（切后台、睡眠、网络抖动）。断线期间错过的事件不靠「事件日志 + 回放」补——那要在主进程存一份带 TTL 的日志，是状态、是复杂度。改用**单调 revision 对账**：

```
每次 broadcast，revision += 1（全局单调）
会话在本地记住「我见过的最大 revision」
重连时握手带上 since: <lastSeenRevision>
主进程比对当前 revision：
  若 since < 当前       ──► 回 { stale: true }
  会话收到 stale        ──► 把所有查询标脏、全量重新 call 读
```

代价是重连后多一次全量 refetch，但省掉了整个事件日志子系统。单用户本机、重连不频繁，这个取舍成立。`revision` 只需全局一个计数器，不按 topic 分——粒度粗一点，重连全量刷，简单压倒精细。

### 8.6 发起端也收自己的事件 · 冲突即后写胜

- **发起端收自己的事件**：广播不排除发起会话。好处是 UI 只需写一条「收到失效→refetch」的路径，不用再为「我自己发起的写」单独写一条乐观更新回填——两条路径合一，UI 幂等。代价是发起端多一次 refetch，可忽略。
- **冲突 = 后写胜（last-write-wins）**：主进程**串行**处理 channel 调用（§8.4 的 wrapper 时序对每次调用成立），两个会话几乎同时写同一数据，也是一个先到先改、另一个后到覆盖，各自成功后各自广播。没有并发写同一内存，就没有需要合并的冲突。
  > ponytail: 主进程串行 + 后写胜，是单用户本机下的正确默认。若将来出现「长事务 + 高并发写同键」才需要加 per-key 锁或版本号 CAS——一期不做。

### 8.7 与 capability 变化统一

capability 集合变化（用户在设置里开关能力、插件启停）同样走这条总线，广播 `capability.changed`，前端重新 `capability:list`（§7.4）。「跨端数据一致」与「跨端能力一致」是同一套发布订阅的两个 topic，不是两套机制。

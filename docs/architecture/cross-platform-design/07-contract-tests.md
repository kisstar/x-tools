# 契约测试套件

> 属 [xTools 跨端架构设计方案](../cross-platform-design.md)。章节编号沿用总文，行内 `§N.M` 引用按索引的映射表定位。
>
> 本章取代旧版「两份 core 的跨语言一致性测试」。移出 Rust 后，**不再有两份实现要对账**——契约测试的职责从「锁定两份 core 行为一致」收窄为「锁定一份 core 对两条传输行为一致，且卸载无泄漏」。

---

## 15. 契约测试套件

### 15.1 职责变了：从「两份对账」到「一份两传输」

旧版有 TS / Rust 两份 server，契约测试要跨语言对账两者行为。现在只有一份 TS channel server（§5.4），**没有第二份实现要对比**。契约测试的新职责有二，都是**锁定不变式、不靠评审**（不变式 5）：

1. **一份 core，两条传输同形**：同一个 channel 调用，走 ipc 与走 ws 必须得到相同结果——除了被显式建模的两处分叉（§15.3）。
2. **卸载无泄漏**：任一插件 activate/deactivate 循环后，六个副作用面计数归零（§15.4）。

### 15.2 in-process 直连，不走网络

契约测试用第三条传输 `in-process`（§5.3）：在内存里直接对接 `IMessagePassingProtocol` 的 `send` / `onMessage`，不起 WebSocket、不起 Electron。这样测试快、无端口占用、无宿主依赖，同时**走的仍是同一个 channel server、同一张校验表、同一套三重闸门**——测的是真实信任边界，不是 mock。

```ts
// 契约测试骨架
const { client, server } = createInProcessChannel();   // 内存对接 send/onMessage
server.registerChannel('fs', fsChannel);

// 同一组断言，分别以 client='electron-renderer' 和 client='browser' 跑一遍
for (const client of ['electron-renderer', 'browser'] as const) {
  const ctx = makeContext({ transport: 'in-process', client });
  // ... 断言 call 结果、错误码、capability 求值
}
```

### 15.3 只覆盖两处分叉

两条传输之上**同形**，差异只有两处，契约测试**只需覆盖这两处**（其余同形部分测一遍即可，不必 ipc/ws 各测）：

| 分叉 | 测什么 |
|---|---|
| **按会话求值**（§7.3） | `desktop-only` 能力对 `client: 'browser'` 返回 `available: false, reason: 'desktop-only'`，对 `client: 'electron-renderer'` 返回 `available: true`。调用时浏览器会话命中第③关 `CAPABILITY_UNAVAILABLE`，客户端会话放行。 |
| **事件广播**（§8） | 一个会话触发带 `emits` 的写操作，`SessionRegistry` 把失效事件广播给**所有在册会话（含发起端）**；handler 抛错时**不广播**（不变式 8）；重连带 `since` 落后时回 `{ stale: true }`。 |

### 15.4 卸载泄漏：六面 + 20× 循环

对每个插件（内置与动态同等对待）跑 **activate → deactivate 循环 20 次**，断言六个副作用面计数回到初始：

```
① channel 注册数        activate 时 +N，deactivate 后应回 0 增量
② 贡献点数（nav/view/command/settings）
③ capability 注册数
④ 事件订阅数
⑤ 定时器数
⑥ 文件监听数
```

泄漏表现为计数**单调递增**——循环 20 次把「每轮漏一个」放大成「漏 20 个」，必现。单轮测不出的慢泄漏，循环必抓。这把「effect 必须经 `ctx.effect` 登记、deactivate 按 LIFO 全回收」（§11.3）从约定变成断言。

### 15.5 错误码契约锁定

五个错误码（§5.5）是契约的一部分，契约测试逐条锁定触发条件：

```
CHANNEL_NOT_ALLOWED   —— 未获准会话 / 插件访问某 channel
FORBIDDEN             —— 调用方未声明所需 capability（改 manifest 可解）
CAPABILITY_UNAVAILABLE—— 环境不满足（desktop-only 命中 ws）
INVALID_ARGS          —— zod 校验失败
INTERNAL              —— handler 抛未分类错误，细节只进审计不回传
```

重点锁 `FORBIDDEN` 与 `CAPABILITY_UNAVAILABLE` **不混淆**（§5.5）：构造「没声明 capability」与「声明了但对本会话不可用」两个用例，断言各自回对应码。这两个码混了，UI 就无法区分「插件写错了」与「请去客户端打开」。

### 15.6 测试工具链一期不装

vitest 一期**明确不装**（阶段 0，§14 / CLAUDE.md）。本章描述的是**契约测试的设计契约**——测什么、怎么分叉、断言什么不变式。等阶段 0 执行、vitest 落地时，按本章结构实现即可。先定契约、后落工具，不颠倒。

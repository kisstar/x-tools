# 契约层

> 属 [xTools 跨端架构设计方案](../cross-platform-design.md)。章节编号沿用总文，行内 `§N.M` 引用按索引的映射表定位。
>
> 本章取代旧版「四种传输 / 跨语言 codegen / Rust struct 生成物」的契约层。传输收敛为 **ipc + ws 两条**，schema 真源只在 TS 一侧，不再有跨语言生成链路。

---

## 5. 契约层

### 5.1 为什么必须换掉胖 `Bridge`

`protocol/src/ports.ts:70` 把 6 个端口聚合成一个 `Bridge` 接口。后果有二，且都已实证：

1. **新增能力要动多个文件**，插件无法往接口里加字段——这套契约结构在设计上排斥插件贡献能力，而这恰是核心目标。
2. **产出了整类 bug**：适配层把常量误当传输层标识用（`renderer/packages/platform-bridge/src/*-adapter.ts`），调用名与实际注册名对不上，整条能力静默失联；`web-adapter.ts:25` 则一整套 `notImpl()` reject，方向与目标相反。

根因是**契约与传输耦合在一个胖接口里**。解法不是把接口拆得更细，而是把「调什么」与「怎么传」彻底分开——channel RPC。

### 5.2 目标形状：channel RPC

借 VSCode `vs/base/parts/ipc` 的分层——契约与传输彻底解耦：

```ts
// protocol/src/channel.ts
export interface IChannel {
  readonly call: <TResult>(command: string, arg?: unknown) => Promise<TResult>;
  readonly listen: <TEvent>(event: string, arg?: unknown) => AsyncIterable<TEvent>;
}

export interface IServerChannel {
  readonly call: (ctx: CallContext, command: string, arg?: unknown) => Promise<unknown>;
  readonly listen: (ctx: CallContext, event: string, arg?: unknown) => AsyncIterable<unknown>;
}

// 唯一需要按传输实现的接口
export interface IMessagePassingProtocol {
  readonly send: (buffer: Uint8Array) => void;
  readonly onMessage: (handler: (buffer: Uint8Array) => void) => Disposable;
}

// 调用上下文。channel server 唯一能信的身份信息，全在这里。
export interface CallContext {
  readonly origin: 'kernel' | 'plugin';
  readonly pluginId?: string;                        // origin === 'plugin' 时必填，权限白名单的落点（§12.2）
  readonly transport: 'ipc' | 'ws' | 'in-process';   // in-process 仅契约测试用
  readonly client: 'electron-renderer' | 'browser';  // 按会话求值的依据（§7.3）
  readonly sessionId: string;                         // 事件广播的寻址单位（§8.2）
}
```

`client` 与 `sessionId` 是本次新增、也是整套契约里**唯一**承认「两个前端有别」的地方：`client` 让 capability 能对浏览器会话标 `desktop-only`（§7.3），`sessionId` 让事件总线能把失效通知广播回每个会话（§8.2）。除这两处外，channel 层之上完全不区分传输。

### 5.3 两条传输 = 两个 `IMessagePassingProtocol` 实现

core 与 UI 零改动，换传输只换这一层：

| 形态 | protocol 实现 | 鉴权 |
|---|---|---|
| 客户端渲染端 | `ipcRenderer` / `ipcMain` | 同进程，preload 注入，无需 token |
| 本机浏览器 | `WebSocket` | loopback + 一次性 token + Origin 校验（§6） |
| 契约测试 | in-process 直连（内存里对接 send/onMessage） | 不走网络（§15） |

code-server 就是同一套 channel 换 WebSocket 跑起来的，这条路径已被大规模验证。两条传输之上同形，差异只在**按会话求值**（§7）与**事件广播**（§8）两处，由契约测试锁定（§15）。

### 5.4 schema 是单一真源

channel 的入参 / 出参 schema 用 zod 声明，类型用 `z.infer` 推导，一处定义、校验与类型同源：

```ts
// protocol/src/commands/fs.ts
export const FsReadFileArgs = z.object({
  path: z.string().min(1),
  encoding: z.enum(['utf8', 'base64']).default('utf8'),
});
export type FsReadFileArgs = z.infer<typeof FsReadFileArgs>;

export const FS_READ_FILE = defineCommand({
  channel: 'fs',
  command: 'readFile',
  args: FsReadFileArgs,
  result: FsReadFileResult,
  capability: 'fs.read',       // 权限闸门第二关的落点（§6.2、§12）
  emits: ['fs.changed'],       // 成功后由 wrapper 广播的失效事件（§8.4），无则省略
});
```

**`protocol/` 的依赖规则（已获批准）**：不是「零运行时依赖」，而是「**渲染进程侧零运行时开销**」。protocol 允许依赖 zod 作为 schema 真源；渲染侧只 `import type`，在 `verbatimModuleSyntax` 下被完全擦除，zod 不进 web bundle。校验只发生在 channel server（唯一信任边界，§6.2），渲染侧无需 zod 运行时。

**本次相对旧版的删减**：旧方案有「zod → JSON Schema → Rust serde struct」的跨语言 codegen 链路，用来兜 TS / Rust 两份 server 的校验一致性。现在只有一份 TS channel server，**校验表只有一份，不存在跨语言漂移，整条 codegen 链路删除**。zod 可以自由用 `.refine()` 表达约束，不再受「必须能过 JSON Schema」的限制。

### 5.5 五个稳定错误码

channel server 对外只抛这五个码，传输无关、两端一致。它们是契约的一部分，UI 依此分支，**不得新增、不得改名**：

```ts
// protocol/src/channel.ts
export type ChannelErrorCode =
  | 'CHANNEL_NOT_ALLOWED'      // 三重闸门第一关：该会话 / 该插件无权访问此 channel（§6.1）
  | 'FORBIDDEN'               // 第二关：调用方未声明所需 capability，或申请了禁止项（§12）
  | 'CAPABILITY_UNAVAILABLE'  // 第三关：capability 按本会话求值不可用（如 desktop-only 命中 ws 会话，§7.3）
  | 'INVALID_ARGS'            // zod 校验失败（§5.4）
  | 'INTERNAL';               // handler 抛出的未分类错误，细节只进审计日志，不回传给前端（§6）

export interface ChannelError {
  readonly code: ChannelErrorCode;
  readonly message: string;   // 面向开发者，不含敏感路径 / 栈
  readonly command: string;   // '<channel>:<command>'
}
```

区分 `FORBIDDEN` 与 `CAPABILITY_UNAVAILABLE` 是关键：前者是**调用方自己没声明**（代码错误，改 manifest），后者是**环境不满足**（如浏览器会话调桌面独占能力，运行时结论）。两者混成一个码，UI 就无法区分「该引导用户去客户端打开」还是「这插件写错了」。

### 5.6 契约不得承诺实现不支持的能力

典型反面形态：契约把 `signal` 声明为必填，某条实现路径却 `console.warn` 一句就丢掉；`timeout` 只在调用方 `Promise.race`，底层请求继续跑。调用方按契约写代码，只在 console 拿到一条 warn。

**规则**：契约字段若实现能力不足，要么从类型里删掉，要么在 capability 的 `limits` 里显式声明（§7.2），禁止静默降级。

### 5.7 插件贡献的 channel 必须带 zod schema

内核 + 内置插件的 channel 在构建期已知，schema 随 `protocol/` 一起编译。动态安装的插件在构建 `xtools` 时还不存在，它的 schema 随插件分发：

| channel 来源 | schema 归属 | 注册进校验表的时机 |
|---|---|---|
| 内核 + 内置插件 | `protocol/src/commands/*.ts` | 构建期 |
| 动态插件 | 随插件分发的 zod | 装载时**运行时**注册进 channel server 的校验表（§11） |

不放松的红线：插件贡献的 channel **必须**带 zod schema，没有 schema 的 channel **拒绝注册**（§13.3）。信任边界不接受未校验入参，插件来的入参尤其如此。只有一份 TS channel server，这条例外天然只落在 TS 一侧，无跨语言问题。

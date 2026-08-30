# 契约层

> 属 [xTools 跨端架构设计方案](../cross-platform-design.md)。章节编号沿用总文，行内 `§N.M` 引用按索引的映射表定位。

---

## 5. 契约层

### 5.1 为什么必须换掉胖 `Bridge`

`protocol/src/ports.ts:70` 把 6 个端口聚合成一个 `Bridge` 接口。后果有三个，且都已实证：

1. **新增能力要动 5 个文件**，插件无法往接口里加字段——这套契约结构在设计上排斥插件贡献能力，而这恰是核心目标。
2. **产出了整类 bug**：`tauri-adapter.ts:107`–`133` 共 11 处误把 `Channels` 常量当 Tauri 命令名用，`invoke(Channels.storageGet)` 实际发出 `"storage:get"`，而 `tauri/src/main.rs:28` 注册的是 `storage_get`。Tauri 下 storage / shell 全部调不通，update / notification Rust 侧根本没注册。
3. **表达不了 headless**：`detect.ts:11` 只返回平台枚举，无法表达「Electron 宿主但此刻没有窗口」。

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
```

四种传输 = 四个 `IMessagePassingProtocol` 实现，core 与 UI 零改动：

| 形态 | protocol 实现 |
|---|---|
| Electron | `ipcRenderer` / `ipcMain` |
| Tauri | 单个 `#[tauri::command] rpc(frame)` + `tauri::ipc::Channel` 反向推送 |
| Web | `WebSocket` |
| CLI / MCP | in-process 直连 |
| Extension Host（二期） | `MessagePort` 或 child process stdio |

code-server 就是同一套 channel 换 WebSocket 跑起来的，这条路径已被大规模验证。

### 5.3 Tauri 侧收口

从 14 个 `#[tauri::command]` 收成 **1 个** `rpc(frame)` + 1 个 `Channel`。**§5.1 第 2 点那 11 个命令名不匹配的 bug 整类消失**——因此不要逐个去修那些调用点，直接做这个收口。

### 5.4 schema 是单一真源，并顺带解锁 MCP

`electron/src/ipc/register.ts:14` 直接解构 renderer 传入的参数、拿 path 直接读写，无 schema、无路径白名单——这是当前唯一的信任边界实缺口。而 MCP server 需要每个 tool 的 JSON Schema。**同一件事，两个收益**：

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
  capability: 'fs.read',
});
```

注册表 → `zod-to-json-schema` → MCP tool 定义，零手工维护。

**规则变更（已获批准）**：CLAUDE.md 原规定「`protocol/` 必须零运行时依赖 — 纯类型和接口」，现改为「**渲染进程侧零运行时开销**」，允许 protocol 依赖 zod。理由：schema 是契约的单一真源，类型用 `z.infer` 推导；渲染进程只 `import type`，在 `verbatimModuleSyntax` 下被完全擦除，zod 不进 web bundle。校验只发生在 channel server（信任边界所在），渲染侧无需 zod 运行时。这比拆成两个包更简单，且保住单一真源。落地时需同步改 CLAUDE.md 的「跨包规则」一节。

### 5.5 契约不得承诺实现不支持的能力

典型的反面形态：契约里把 `signal` 声明为必填，某条实现路径却 `console.warn` 一句就把它丢掉；`timeout` 只在调用方 `Promise.race`，底层请求继续跑。调用方按契约写代码，只在 console 拿到一条 warn。

xTools 已有同类问题四处：

- `electron/src/services/shell.ts:8` 与 `tauri/src/commands/shell.rs:24`：`elevated` 参数只接收不生效
- `UpdatePort` 三个方法返回 `null`/`undefined`（`electron/src/ipc/register.ts:52` 空壳）
- `tauri/src/commands/fs.rs:129`：`fs_watch` 只返回 UUID，从不 emit
- `Events.windowClosed` 两端从未 emit，`WindowPort.onClose` 在桌面端是死订阅

**规则**：契约字段若实现能力不足，要么从类型里删掉，要么在 capability 的 `limits` 里显式声明，禁止静默降级。

### 5.6 schema 的跨语言真源（双实现的必答题）

双实现意味着 channel server 有两份（TS 一份、Rust 一份），**入参校验规则也就有两份**。若两份手写，信任边界会出现两套不一致的规则——这类漂移比业务逻辑漂移更危险，因为它直接是安全边界。

方案：**zod 单向 codegen，不搞双向同步。**

```
protocol/src/commands/*.ts   （zod，唯一真源，人手维护）
            │
            │ 构建期一次导出
            ▼
   build/schema/*.json       （JSON Schema，产物，不入版本控制 / 或入库但只读）
       ├────────────────────────────► MCP tool 定义（zod-to-json-schema）
       └────────────────────────────► Rust serde struct + validator
                                       （typify 或 schemars 反向流程）
```

要点：

- **真源只有一处**：`protocol/src/commands/*.ts`。Rust 侧的 struct 是**生成物**，禁止手改；CI 检查「重新生成后 git diff 为空」，与 lockfile 一个套路。
- `zod-to-json-schema` 本来就要为 MCP 装（§5.4），JSON Schema 这一跳是顺手的，没有新增依赖负担。
- 备选方案已否：**中立 IDL 作真源**（多引入一门语言和一套工具链，TS 侧还得反向生成 zod，收益不足）；**serde struct 作真源**（TS 侧要从 Rust 生成 zod，而 TS 侧才是契约的作者视角，方向反了）。
- 只生成**结构与基本约束**（类型、必填、min/max、enum）。zod 的 `.refine()` 这类自定义逻辑无法过 JSON Schema，必须列为「两侧各写一遍并由契约测试锁定」的部分——因此**尽量不用 `.refine()` 表达安全约束**，安全约束（如路径穿越检查）应下沉到 core 的 path-guard，那里本来就有契约测试覆盖。

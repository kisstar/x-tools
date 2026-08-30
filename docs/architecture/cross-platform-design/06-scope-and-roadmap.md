# 边界、分期与决策状态

> 属 [xTools 跨端架构设计方案](../cross-platform-design.md)。章节编号沿用总文，行内 `§N.M` 引用按索引的映射表定位。

---

## 12. 明确不做

| 不做 | 理由 |
|---|---|
| `StatePort` / `RouterPort` / `QueryPort`（早期方案里给前端库配的 Port） | 把 zustand / router / query 包一层是投机性抽象。「核心基座技术栈无关」的正确含义是**内核不依赖 React**，不是给每个前端库配一个 Port |
| Module Federation（早期方案里的插件加载选型） | `import()` + manifest 已经够用。运行时远程加载插件不是一期需求 |
| 通用中间件链 / trpc / router / procedure / link / context | 端内 IPC 不出网，`registerChannel()` wrapper 里内联做完 guard + 校验 + 埋点即可 |
| 出参脱敏（redactOut） | 端内 IPC 不出网。脱敏是遥测上报的单点职责，不是传输层职责 |
| 中立 IDL 作 schema 真源 | 多引入一门语言和一套工具链，TS 侧还要反向生成 zod。zod → JSON Schema 单向 codegen 已够（§5.6） |
| 纯逻辑 WASM 单实现 | 缓解双写漂移的可选优化，引入 wasm 构建链。只有在漂移成为高频问题时才评估（§4） |
| 多个 Rust 二进制（cli / serve 各一个） | Rust core 会被静态链接多遍，体积翻倍无收益。`serve` 是 `xtools` 的子命令（§7.4） |
| 无后端的纯浏览器降级 | Web 形态明确依赖本地 `xtools serve`。`web-adapter.ts:25` 现在那套 `notImpl()` reject 方向相反，应重写为 WS 客户端 |

---

## 13. 分期

排期因「Rust core 完整」发生一处关键调整：**契约测试必须前移到 Rust core 写第二个能力之前**。双写下它是唯一的漂移防线，事后补等于放任前几个模块先漂。

**阶段 0 — 修地基（当前 `pnpm dev:electron` 跑不起来）**

1. `electron/scripts/dev.mjs:7,41` 在 `.mjs` 里写了 TS 语法（`import { spawn, type ChildProcess }`、`new Promise<void>`）→ SyntaxError。改扩展名或去掉类型标注
2. `tauri/gen/` 加进 `.gitignore`；`Cargo.lock` 从 `.gitignore` 移出（二进制 crate 应提交锁文件）。两条正好对调
3. 装 ESLint + `eslint-plugin-import`，让 §3 的 layer 纪律真正生效
4. 装 vitest（契约测试的前提）

**阶段 1 — channel RPC 骨架（最高杠杆）**

5. `protocol/` 引入 zod + `defineCommand` 注册表（§5.4），先迁 fs 一个 channel 验证形状
6. **schema codegen 链路打通**（§5.6）：zod → JSON Schema → Rust serde struct，CI 断言产物无 diff。这一步必须与第 5 步同期，否则 Rust 侧会先手写一份 struct 然后再也删不掉
7. Electron 侧 `registerChannel()` wrapper + 三重闸门（§6）
8. Tauri 侧收成单 `rpc` 命令（§5.3）——**11 处命令名 bug 随之消失，不要单独修**
9. `renderer` 侧 channel client，6 个 Port 降级为 channel 之上的类型化 facade

**阶段 2 — 两份 core 抽离 + 契约测试（双写的起点，防线必须先立）**

10. 把能力实现从 `electron/src/services/` 搬进 `core-ts`，Electron 变薄壳
11. `core-rs` 建 crate 骨架：`xtools-channel` + `xtools-capabilities`，先只实现 fs 一个 channel
12. **契约测试套件 + §11.2 的四条自检**——以 fs 为第一个双跑对象，跑通后才继续加能力
13. capability registry 落两份 channel server，加 `capability:list`（§9.3），用例断言两侧 key 集合一致

**阶段 3 — Rust 触达面（Web / CLI / MCP 同时点亮）**

14. `xtools serve` 子命令：WS 传输 + §6 的鉴权基线 + 静态 UI 托管（Rust，axum）
15. `web-adapter` 重写为 WS 客户端
16. `xtools mcp` 子命令：in-process channel + MCP server（tool 定义由 §5.6 的 JSON Schema 派生）
17. `elevate-rs` 提权 helper，替掉 `elevated` 空参数

**阶段 4 — 业务模块双写铺开**

18. switch-host 作为第一个完整双写模块，走 §11.4 的四条验收
19. 其余模块按同一模板铺开；Tauri 宿主随 Rust core 补齐而自然功能对等

**阶段 5 — 插件化**

20. manifest + 贡献点，清掉 `mock-tools.ts` / `NavBar.topItems` / `SubNav.categories` 硬编码
21. Extension Host（换传输即可）

---

## 14. 决策状态

| 事项 | 状态 |
|---|---|
| `protocol/` 零运行时依赖规则改为「渲染进程侧零运行时开销」（§5.4） | ✅ **已批准**。落地时同步改 CLAUDE.md 跨包规则 |
| 旧架构文档的处置 | ✅ **已删除**。本套文档是架构的唯一真源，README 与 CLAUDE.md 的指向已同步 |
| 阶段 0 的四项是否立即执行（含 `pnpm dev:electron` 的 SyntaxError） | ⏸ **当前不执行**（用户明确）。本会话只做架构设计，不动代码 |

### 尚未定的技术细节（不阻塞设计，实施时再定）

- Rust codegen 工具选 `typify` 还是 `schemars` 反向流程——需实测哪个对 zod 导出的 JSON Schema 兼容性更好
- Rust HTTP/WS 框架选 `axum` 还是 `hyper` 裸写——serve 只有 3 个职责，`axum` 可能已经偏重
- 契约测试的 `setup` 字段（临时文件、环境变量）在两个 runner 里如何统一表达——第一个双跑用例落地时定型

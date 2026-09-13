# 边界、分期与决策状态

> 属 [xTools 跨端架构设计方案](../cross-platform-design.md)。章节编号沿用总文，行内 `§N.M` 引用按索引的映射表定位。

---

## 12. 明确不做

| 不做 | 理由 |
|---|---|
| `StatePort` / `RouterPort` / `QueryPort`（早期方案里给前端库配的 Port） | 把 zustand / router / query 包一层是投机性抽象。「核心基座技术栈无关」的正确含义是**内核不依赖 React**，不是给每个前端库配一个 Port |
| 插件内部再套端口抽象（`ui/` `model/` `data/` 三层之上加 interface、把 DI 容器引进渲染侧） | 同一条理由的插件版。「整洁」的兑现物是**依赖方向被 ESLint 强制**，不是目录层数（§20.1） |
| Module Federation（插件加载选型） | **前提已变**：动态安装一期就要有（§18.1），但加载方式仍是 `import()` + custom protocol（§20.3）。Module Federation 要求插件与宿主共享构建配置，与「磁盘上的预构建 ESM」这条交付形态不兼容，还带来一整套 shared-scope 版本协商 |
| `wasm` runtime（wasmtime + jco 构建链） | 二期。它是把 `ts` / `rust-builtin` 两列合并成一列的正解（§16.2），一期先让前 3 种 runtime 跑通 |
| 远程插件 registry | 二期。一期只允许本地目录 / zip 手动安装（§18.1） |
| 插件签名校验 | 与远程 registry 同期。manifest 的 `publisher` / `signature` 一期是预留字段、不校验；**开放远程 registry 的那一天它是前置条件，不是可选项**（§18.1） |
| 插件间直接依赖（DSH 的 `inject` + Fiber `PENDING` 双向回退） | 插件只依赖内核 capability；要把能力给别的插件用就贡献 channel（§19）。这条一并消掉依赖拓扑排序、循环检测、以及「A 依赖 B 的私有 API，B 升级后 A 静默坏掉」（§17.3） |
| 插件沙箱（`vm` / iframe / 进程隔离） | 一期插件与宿主同进程。权限模型靠 manifest 白名单 + channel server 闸门，不靠沙箱（§18.2）。真隔离等二期 Extension Host |
| 内核内置「分类」概念（`SubNav.categories` 那 7 条，或 manifest 里的分类字段） | 违反不变式 6。内核对分类的全部认知是 `views[].tags` 一个**不被解释**的透传字段，分类的显示名 / 图标 / 排序由 `tool-catalog` 插件自持（§20.5） |
| 导航布局 DSL（自造 `subnav: 'none' \| 'plugin'` 这类枚举字段） | 枚举与实际注册会漂移，派生不会：某 container 是否显示二级导航 = 它有没有 `slot: 'subnav'` 的视图（§20.5） |
| 通用中间件链 / trpc / router / procedure / link / context | 端内 IPC 不出网，`registerChannel()` wrapper 里内联做完 guard + 校验 + 埋点即可 |
| 出参脱敏（redactOut） | 端内 IPC 不出网。脱敏是遥测上报的单点职责，不是传输层职责 |
| 中立 IDL 作 schema 真源 | 多引入一门语言和一套工具链，TS 侧还要反向生成 zod。zod → JSON Schema 单向 codegen 已够（§5.6） |
| 多个 Rust 二进制（cli / serve 各一个） | Rust core 会被静态链接多遍，体积翻倍无收益。`serve` 是 `xtools` 的子命令（§7.4） |
| 无后端的纯浏览器降级 | Web 形态明确依赖本地 `xtools serve`。`web-adapter.ts:25` 现在那套 `notImpl()` reject 方向相反，应重写为 WS 客户端 |

---

## 13. 分期

排期有两处关键调整：

1. **契约测试前移到 Rust core 写第二个能力之前。** 双写下它是唯一的漂移防线，事后补等于放任前几个模块先漂。
2. **插件内核前移到第一个业务模块之前**（原「阶段 5 插件化」作废）。plugin host / manifest / 贡献点属内核五件之一（§15.1），若先按老路写一个业务模块再回头插件化，switch-host 的名字会先进内核、路由与导航会先硬编码一遍，等于事后要把不变式 6 从代码里挖出来。**第一个业务模块就应该是第一个插件。**

**阶段 0 — 修地基（当前 `pnpm dev:electron` 跑不起来）**

1. `hosts/electron/scripts/dev.mjs:7,41` 在 `.mjs` 里写了 TS 语法（`import { spawn, type ChildProcess }`、`new Promise<void>`）→ SyntaxError。改扩展名或去掉类型标注
2. `hosts/tauri/gen/` 加进 `.gitignore`；`Cargo.lock` 从 `.gitignore` 移出（二进制 crate 应提交锁文件）。两条正好对调
3. 装 ESLint + `eslint-plugin-import`，让 §3 的 layer 纪律真正生效
4. 装 vitest（契约测试的前提）

**阶段 1 — channel RPC 骨架（最高杠杆）**

5. `protocol/` 引入 zod + `defineCommand` 注册表（§5.4），先迁 fs 一个 channel 验证形状
6. **schema codegen 链路打通**（§5.6）：zod → JSON Schema → Rust serde struct，CI 断言产物无 diff。这一步必须与第 5 步同期，否则 Rust 侧会先手写一份 struct 然后再也删不掉
7. Electron 侧 `registerChannel()` wrapper + 三重闸门（§6）
8. Tauri 侧收成单 `rpc` 命令（§5.3）——**11 处命令名 bug 随之消失，不要单独修**
9. `renderer` 侧 channel client，6 个 Port 降级为 channel 之上的类型化 facade

**阶段 2 — 两份 core 抽离 + 契约测试（双写的起点，防线必须先立）**

10. 把能力实现从 `hosts/electron/src/services/` 搬进 `core-ts`，Electron 变薄壳
11. `core-rs` 建 crate 骨架：`channel` + `capabilities`，先只实现 fs 一个 channel
12. **契约测试套件 + §11.2 的四条自检**——以 fs 为第一个双跑对象，跑通后才继续加能力
13. capability registry 落两份 channel server，加 `capability:list`（§9.3），用例断言两侧 key 集合一致

**阶段 3 — Rust 触达面（Web / CLI / MCP 同时点亮）**

14. `xtools serve` 子命令：WS 传输 + §6 的鉴权基线 + 静态 UI 托管（Rust，axum）
15. `web-adapter` 重写为 WS 客户端
16. `xtools mcp` 子命令：in-process channel + MCP server（tool 定义由 §5.6 的 JSON Schema 派生）
17. `elevate-rs` 提权 helper，替掉 `elevated` 空参数

**阶段 4 — 插件内核（必须在第一个业务模块之前）**

18. plugin host：发现 / resolve（`engines.xtools` semver 要有执行者）/ 六态状态机 / `ctx.effect()` 栈与反向重放 / 事务式更新（§16.1、§17）
19. capability registry 接入 runtime 交集判定，补 `reason: 'runtime-unsupported'`（§16.3）；权限闸门加载期 + 调用期两处判定，两条红线落地（§18）
20. 渲染侧：路由改两条静态 catch-all `/tool/$containerId` + `/tool/$containerId/$viewId` + `PluginViewHost` 三态（§20.2）；导航改为 `viewContainers` / `views` 两级贡献点派生，`nav-store` 删 `activeNavId` / `activeCategoryId`（§20.5）
21. 插件测试基线：卸载泄漏六项 + 装卸循环 20 次、合成恶意 manifest fixture、§21.2 的四条自检

**阶段 5 — 第一个插件与铺开**

22. **`tool-catalog` 作为第一个内置插件**（纯 `ui` + `registry.read`）：接走 `mock-tools.ts` / `HomePage` / `CommandPalette` / `SubNav.categories` 四处硬编码，分类由 `views[].tags` 分组派生（§20.4、§20.5）。它必须排在业务插件之前——它是不变式 6 的第一个真实检验
23. switch-host 作为第一个带后端的插件（`runtimes: ["ts", "rust-builtin"]`），走 §21.4 的五条验收
24. 动态安装：本地目录 / zip + custom protocol `xtools-plugin://`（§20.3）；用一个只声明 `ui` / `ts` 的插件验证 Tauri / serve 上的置灰路径确实走通
25. 其余模块按同一模板铺开；Tauri 宿主随 Rust core 补齐而自然功能对等

**二期（不排期，前提条件已写在 §12）**

26. `wasm` runtime（合并 `ts` / `rust-builtin` 两列）· Extension Host（换传输即可）· 远程 registry + 签名校验（两者同期，不可拆）

---

## 14. 决策状态

| 事项 | 状态 |
|---|---|
| `protocol/` 零运行时依赖规则改为「渲染进程侧零运行时开销」（§5.4） | ✅ **已批准**。落地时同步改 CLAUDE.md 跨包规则 |
| 旧架构文档的处置 | ✅ **已删除**。本套文档是架构的唯一真源，README 与 CLAUDE.md 的指向已同步 |
| 阶段 0 的四项是否立即执行（含 `pnpm dev:electron` 的 SyntaxError） | ⏸ **当前不执行**（用户明确）。本会话只做架构设计，不动代码 |

### 微内核插件化（本轮，§15–§21）

| 决策项 | 结论 |
|---|---|
| 微内核边界 | ✅ **L2**：内核 = channel server + capability registry + plugin host + transports + OS 原语 capabilities，共 5 件。业务模块全部是插件（§15.1、不变式 6） |
| 插件是否双写 | ✅ **不双写**。manifest 声明 `runtimes`，宿主取交集；未支持处注册后置灰而非消失（§16） |
| 动态插件的后端形态 | ✅ 一期只允许 `ui` + `ts`（`rust-builtin` 仅内置，因 Rust core 静态编译）（§16.2） |
| 安装来源 | ✅ 一期**本地目录 / zip**，`publisher` / `signature` 预留不校验；远程 registry 与签名同期进二期（§18.1） |
| 插件渲染侧组织 | ✅ **插件内三层 `ui` / `model` / `data`，不加端口抽象、不引 DI 容器**，依赖方向由 ESLint 强制（§20.1） |
| 从 DSH 照搬的部分 | ✅ **只有 effect 可逆卸载**（§17.2）。`inject` + Fiber `PENDING` 双向回退不采用（§17.3），设置深合并是修正其坑而非照搬（§17.5） |
| 导航贡献点层级 | ✅ **两级：`viewContainers`（导航格子）+ `views`（`slot: 'content' \| 'subnav'`）**，抄 VSCode 成熟模型，不自造布局 DSL。二级导航的有无是派生结论而非独立开关；`tags` 由内核透传不解释（§20.5） |
| 「工具大全」/ 分类列表的归属 | ✅ **内置 `ui` 插件 `tool-catalog`**，不是内核功能。`SubNav.categories` 删除，`nav-store` 的 `activeNavId` / `activeCategoryId` 删除（真源是 URL），`isSubNavCollapsed` 保留（§20.4、§20.5） |
| 分期位置 | ✅ 插件内核**前移到第一个业务模块之前**（原阶段 5 作废，见 §13）；`tool-catalog` 排在 switch-host 之前 |

### 尚未定的技术细节（不阻塞设计，实施时再定）

- Rust codegen 工具选 `typify` 还是 `schemars` 反向流程——需实测哪个对 zod 导出的 JSON Schema 兼容性更好
- Rust HTTP/WS 框架选 `axum` 还是 `hyper` 裸写——serve 只有 3 个职责，`axum` 可能已经偏重
- 契约测试的 `setup` 字段（临时文件、环境变量）在两个 runner 里如何统一表达——第一个双跑用例落地时定型
- 动态插件 UI 的 custom protocol 具体形状（`xtools-plugin://<id>/<path>` 的路径白名单与 CSP 收口）——方向已定，细节待实施（§20.3）
- `ctx.settings` 的 schema 声明位置（manifest 内联还是随插件的独立 schema 文件）——影响深合并的默认值来源（§17.5）

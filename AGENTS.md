# AGENTS.md

This file provides guidance to AI coding agents working with code in this repository.
`CLAUDE.md` is a symlink to this file — **只改这一份**，不要让两份内容分叉。

> xTools — 单 CLI 二进制启动本地 Go 服务、由 Web 承载复杂交互的本地工具平台。

所有回答和输出内容使用中文（仓库全部规格文档为中文）。

## 仓库现状

骨架已落地且可完整构建：**6 个 Go module**（根 `go.work` 统一）+ **9 个 pnpm package**。
`pnpm verify` 是本地全量门禁，`pnpm verify:ci` 是 CI 入口——但 `.github/` 工作流尚未创建。

规格里写了、代码里**还没有**的部分（提案前先确认，别假设有实现）：

- Go 内核只实现 5 项职责中的 3 项：lifecycle / registry+snapshot / invoke 管线。
  **没有 `go/kernel/eventbus/`，没有 `go/kernel/services/`**；`lifecycle.ActivationContext`
  是空 struct 占位。
- 只有一个 capability module：`go/modules/preferences`（2 个 capability）。`fs` / `shell` /
  `storage` / `catalog` / `pluginhost` 都不存在。
- `Exposure` / `Permissions` 字段已声明但**未被执行**；`AuditRecord` 结构存在但生产路径未接线；
  没有 capability 清单发现端点；没有 `log/slog` 结构化日志。
- CLI 只有 flag（`-port` / `-assets` / `-token-file` / `-preferences-file`），**没有能力命令树**；
  静态资源走 `os.DirFS` 读磁盘，**不是 go:embed**。
- Web 侧：命令面板 `execute()` 是空实现（4 条命令硬编码、点击无效果）；detail 区在生产永远为
  null（`selectionId` 从未注入）；导航 `collapsed: false` 硬编码、`activeId` 不传。
- `UiModuleManifest.dependsOn` 是**装饰性**的，runtime 不做拓扑排序；真实激活顺序 =
  `apps/web/src/production-modules.ts` 的数组顺序，`workbenchShell` 必须排第一。
- **偏好类型是双真源**：手写 `packages/ui-contracts/src/preferences.ts` 与生成物
  `packages/contracts/src/generated.ts` 并存，违反「Schema 单一真源」不变式。动这块先读 doc 06。
- `tests/integration/` 不存在；doc 06 守卫表点名的 `preferences-controller.test.ts` 也不存在。

## 常用命令

优先用这两个聚合门禁，而不是自己拼命令：

| 命令 | 内容 |
|---|---|
| `pnpm verify` | 本地全量，按序：frozen install → turbo 任务图校验 → `format:check` → `lint` → `typecheck` → `test` → `build` → `codegen:check` → Go 工作区测试 → 逐 module `GOWORK=off` 验证 → mermaid → security → race → e2e |
| `pnpm verify:ci` | `pnpm lint:shell`（ShellCheck）后接 `pnpm verify`。**ShellCheck 只在 CI 要求**，本地没装不算失败，`verify.sh` 故意不含它 |

单项：`pnpm lint`（ESLint + Stylelint + 架构测试 + golangci-lint）、`pnpm typecheck`、
`pnpm test`、`pnpm build`、`pnpm dev`、`pnpm e2e`、`pnpm format` / `format:check`、
`pnpm test:go`、`pnpm test:race`、`pnpm security`（govulncheck）、
`pnpm codegen` / `codegen:check`、`pnpm mermaid:check`。

架构测试跑在 `pnpm lint` 里，**不在 `pnpm test` 里**。

### 跑单个测试

```bash
pnpm --filter @xtools/web-runtime test                             # 单个 package
pnpm --filter @xtools/web exec vitest run src/composition.test.tsx # 单个文件
node --test tests/architecture/web-boundaries.test.mjs             # 单个架构守卫
cd go/kernel && go test ./... -run TestName                        # 单个 Go 测试
pnpm e2e tests/e2e/workbench.spec.ts -g '命令面板'                  # 单个 e2e 用例
```

**坑**：根目录直接 `pnpm exec vitest` 只覆盖 `apps/web` 与 `workbench-shell`（
`vitest.workspace.ts` 按 `vite.config.ts` 发现成员，只有这两个有）。全量只能走 `pnpm test`。

### Go 工具前置

缺失时各 Go 脚本会打印精确安装命令。装到 `XTOOLS_TOOL_BIN`（默认 `/private/tmp/xtools-tools`）：

```bash
GOBIN=/private/tmp/xtools-tools go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.14.0
GOBIN=/private/tmp/xtools-tools go install golang.org/x/vuln/cmd/govulncheck@v1.8.0
```

`golangci-lint fmt` 内置执行 gofumpt / goimports / golines（120 字符软目标）；不再单独安装
goimports。工具版本被 `tests/architecture/go-workspace.test.mjs` 钉死，升级要同步改测试。
Go 缓存统一 `GOCACHE=/tmp/xtools-go-cache`、`GOMODCACHE=/tmp/xtools-go-modcache`。

## 代码地图

### Go 侧（启动顺序反直觉，按 `cmd/xtools/host.go` 为准）

`registry.New()` → `lifecycle.New([preferencesLifecycle])` → `manager.Activate(...)`
（**模块在 Activate 内部才调 `Register()`**）→ `capabilities.Freeze()`（在 Activate **之后**）
→ `invoke.New(snapshot)` → http transport（`Ready` 取 `manager.State()==Serving`）
→ ws transport → mux 挂 `/ws` 与 `/` → `manager.StartServing()`。监听地址硬编码 `127.0.0.1:%d`。

- `go/contracts`（L0）：`CapabilityID` 正则 `^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+@[1-9][0-9]*$`，
  省略版本自动补 `@1`；9 个错误码；3 种 principal kind；`Exposure` = websocket / cli。
- `go/kernel`（L1）：lifecycle 六态机；registry 的 `Capability` = Contract + 5 个函数指针，
  `Freeze()` 把 map 拷进未导出字段的 `Snapshot`；invoke 管线固定顺序 traceID → lookup →
  MaxInputBytes → WithTimeout → ValidateInput → principal 非空检查 → Authorize → Available →
  ctx 检查 → 并发信号量 → goroutine 内执行 handler → MaxOutputBytes → ValidateOutput，
  双重 panic 收敛为 `internal`；`ModuleClient` 把主体前缀成 `module:`。
- `go/modules/preferences`（L2）：`workbench.preferences.get@1`（query）与
  `workbench.preferences.update@1`（command）；revision CAS 失败返回 `conflict` +
  `details.currentRevision`；原子 0600 落盘；`DisallowUnknownFields`，偏好文件损坏会让
  `compose` 直接失败（fail-closed）。
- `go/transports/http`（L3）：`/health/live`、`/health/ready`、SPA fallback；**Host 校验在
  token 注入之前**；CSP `default-src 'self'; connect-src 'self' ws:; object-src 'none'; base-uri 'none'`。
- `go/transports/ws`（L3）：**JSON-RPC method 名就是完整 capability ID 字符串**；准入顺序
  Host → Origin → token（`Sec-WebSocket-Protocol: xtools-token.<value>`，
  `subtle.ConstantTimeCompare`）；principal 由服务端每连接设定一次，客户端不得自报。

### Web 侧

`apps/web/src/main.tsx`（注入 Channel + hashHistory）→ `composition.tsx#composeWebApp`：
`runtime.activate(modules, [workbench.shell])` → `freeze()` → `serve()` → 取偏好 →
空 hash 归一化到 `/home/home.overview` → `router.load()` → `rebuild()` 闭包，
并 `router.subscribe('onResolved')` 重建。整段包在 try/catch 里，失败降级为 `role="alert"`。

- `packages/ui-contracts`：5 个 branded ID 类型 + `ID_PATTERN`；`SlotDefinition`
  （`kind: single|list|keyed`，`scope: root|container|workspace`）；`Contribution<T>`。
- `packages/web-runtime`：六态机 `created→activating→frozen→serving→stopping→stopped`。
  **必需模块激活失败 → 逆序回滚 + 置 `stopped` + 抛出**；可选模块失败 → 冻结一条
  `plugin_activation_failed` 诊断后继续。`TransactionalActivationContext` 在 `declareSlot`
  和 `contribute` 两处都校验 `ownerId === moduleId`。
- `packages/adapter-ws`：浏览器 Channel 实现。**无重连**——`failPending` 会把 `closed`
  永久置真。
- `packages/modules/workbench-shell`：唯一宿主必需 UI module，声明 `root` 单插槽 +
  6 个 region 插槽 + 3 个 contribution 插槽（containers/views/navigation），注册 5 个默认渲染器。
  其余三个 UI module：workbench-home、workbench-settings、recent-tools。

**坑**：插槽 ID 在 `composition.tsx` 里是**裸字符串**（`'workbench.containers'` 等）+ `as` 断言，
barrel 没导出任何插槽 ID 常量。改插槽名必须手工全仓搜索。

### 契约生成链

Go 输入/输出 struct → `contracts/schema/<capability@major>/{input,output}.json` +
`packages/contracts/src/generated.ts`。`pnpm codegen` 恰好产出 5 个文件，`WriteContracts`
会先 `os.RemoveAll(contracts/schema)`。生成物提交仓库，`pnpm codegen:check` 保证无 drift，
禁止手改、禁止 TS 回写 Go。

## 守卫映射

| 违反什么 | 被谁拦下 |
|---|---|
| Web 层级/横向依赖、`WebSocket`/`localStorage`/region 字面量出现在 web-runtime | `tests/architecture/web-boundaries.test.mjs`（真实 TS AST 解析）+ eslint.config.js 的 5 个命名边界块 |
| pnpm 成员集合、`private: true`、`workspace:*` / `catalog:` 用法 | `tests/architecture/workspace-members.test.mjs` |
| 根脚本缺失、`lint` 丢 `--max-warnings=0`、catalog 出现 `^ ~ *`、lefthook pre-commit 塞重活、`verify.sh` 覆盖面 | `tests/architecture/quality-tooling.test.mjs` |
| go.mod 漏登记 go.work、生产 go.mod 混入 `replace`、工具版本未钉死 | `tests/architecture/go-workspace.test.mjs` |
| 单 module 模式下依赖集漂移、go.mod 被改写 | `scripts/verify-go-modules.sh`（`GOWORK=off` + `-modfile` + `cmp`） |
| 生成物与 Go struct 不一致 | `pnpm codegen:check` |
| CSS 自定义属性没有 `--xt-` 前缀 | `stylelint.config.mjs` 的 `custom-property-pattern` |
| 提交/推送前的格式与质量 | `lefthook.yml`：pre-commit 只处理 `{staged_files}`（ESLint / Stylelint / go fmt / shfmt）；pre-push 跑 web lint+typecheck+test 与 go test+lint |

## 架构规格是唯一真源

[docs/architecture/local-service-design.md](docs/architecture/local-service-design.md)
是索引页，10 个主题文件构成权威规格。**每项规则只在一个文件中定义**，索引页只做摘要和
路由，不复制正文。

按任务读取（索引页有完整表格，勿一次全读）：

| 任务 | 读取 |
|---|---|
| 理解整体架构 | 索引 + 01 + 02 |
| 新增/评审 Go capability、改 kernel | 02 + 03 + 06 |
| 新增 Web 工具或 UI 插件 | 04 + 05 + 06 + ADR-002 |
| 新增 transport 或宿主 | 02 + 03 + 04 + 06 |
| 权限、安全、外部插件 | 03 + 05 + 06 |
| 建目录、移包、命名新契约 | 02 + 06 + 08 |
| 错误码、日志、超时、配置 | 03 + 05 + 09 |
| 改 pnpm/Turbo/go.work 或加 workspace 成员 | 06 + 08 + 10 |

规范词是可验证约束：**MUST/必须**、**MUST NOT/禁止**、**SHOULD/应当**。

决策记录：[ADR-001 多语言工作区](docs/decisions/001-polyglot-workspace-management.md)、
[ADR-002 插件化 Web 工作台](docs/decisions/002-pluginized-web-workbench.md)（Slot 树模型）；
实施规格 [docs/specs/2026-09-30-pluginized-web-workbench-design.md](docs/specs/2026-09-30-pluginized-web-workbench-design.md)。

## 承重不变式（任何改动都要守住）

完整 **17 条**见
[06-invariants-and-verification.md](docs/architecture/local-service-design/06-invariants-and-verification.md)。
最常被违反的几条：

1. **两侧内核只有 runtime 机制。** Go 内核只做：生命周期编排、贡献注册表+只读快照、
   技术 DI、事件总线、统一 Invoke 管线。HTTP/WS/文件/Shell/插件目录都不属于内核，
   内核里不得出现任何具体模块名。
2. **依赖单向朝内**，层级为 L0 contracts ← L1 kernel ← L2 capability modules /
   L3 transports ← host composition root。**业务模块之间零横向 import。**
3. **三种通信通道不可互换**：需要结果/权限/超时/审计的同步业务调用只能走 capability；
   DI 只给技术服务（Logger/Clock/ConfigReader/mux），不得成为业务调用后门；
   event 只做「已发生、无返回、可丢失」的事实通知。
4. **模块间调用也走同一个 Invoke 管线**，通过内核创建的 CapabilityClient（绑定
   `module:<id>` 主体）。身份由服务端确立，**客户端/请求 payload 不得自报身份**；
   浏览器传来的 `pluginId` 只是不可信审计提示。
5. **触达面单一真源**：WS JSON-RPC 方法表、HTTP 端点、CLI 能力命令树、未来 MCP tools
   全部从同一个 frozen CapabilityRegistry 派生。
6. **Schema 单一真源**：Go 输入/输出 struct → JSON Schema → TS 类型 + 校验器，
   单向生成、生成物提交仓库、CI 重新生成必须无 diff、禁止手改、禁止 TS 回写 Go。
   Web 前置校验只改善 UX，**Go Invoke 校验才是安全边界**。
7. **UI 宿主无关**：业务代码只依赖 `IChannel`；`platform` 判断、`window.__TAURI__`、
   直接 new WebSocket 只允许出现在 adapter 与 composition root。
8. **Fail-closed**：准入、校验、授权、filter、模块激活失败都不放行残缺状态。
   必需模块缺失在激活前失败；内置模块激活失败逆序回滚并退出，不带残缺注册表 Serving。
9. **能力边界显式**：不可用能力仍在清单中并返回结构化原因，不静默消失、不静默降级。
10. **Slot 树所有权**：只有父贡献的 owner 才能声明子 Slot；注册后 freeze 于首帧之前；
    渲染器按显式 ID 解析（Shell 默认 → 容器默认 → 用户全局 → 工作区稀疏覆盖），
    **不按加载顺序**；活动容器/View 以 URL 为单一真源；持久化偏好必须走 Go capability，
    禁止 localStorage。
11. **插件信任措辞必须真实**：一期外部 UI 插件是用户主动安装的**可信同上下文代码**。
    文档、UI、注释 MUST NOT 把 `requires` / `scopedChannel` / `ErrorBoundary` 描述成
    恶意代码隔离——它们分别只是依赖声明、调用侧收窄和故障隔离。

新增/修改任何 MUST 约束时，必须在同一变更内给出自动化测试、静态守卫或评审证据；
「后续补测试」不算完成。

## 目录结构

完整树与每个目录的允许/禁止依赖见
[08-directory-and-code-organization.md](docs/architecture/local-service-design/08-directory-and-code-organization.md)。
现状（`†` = 规格要求但尚未建立）：

```
cmd/xtools/          独立 go.mod；CLI + Go composition root
go/contracts/        L0：ID、错误码、技术 service token
go/kernel/           L1：lifecycle registry invoke（eventbus† services†）
go/modules/<id>/     L2：仅 preferences（fs† shell† storage† catalog† pluginhost†）
go/transports/<id>/  L3：http ws，各自独立 go.mod
contracts/schema/    生成的 JSON Schema，按 capability@major 组织
apps/web/            唯一 Web composition root
packages/            ui-contracts · contracts(生成) · web-runtime · adapter-ws · modules/<ui>×4
tests/               architecture · e2e（integration†）
```

- 外部 UI 插件**不进源码树**，运行时从配置的 pluginDir 加载。
- 禁止 `shared` / `common` / `utils` / `helpers` 业务目录；真正跨层的数据要先证明有两个
  独立消费者才进 contracts。
- 不要把单个 React 组件拆成 package；拆包单位必须对应 runtime / adapter / app /
  独立 UI module 边界。
- 新增顶层目录、Go module、pnpm package、跨层公共包或 service token 属架构变更，需评审。
- 残留待清理：`packages/modules/example-contribution/`、`apps/web/src/boot-page.ts`、
  `workbench-shell/src/settings-panel.tsx`（均为死代码）。

## ID 命名规范

| 对象 | 规范 | 示例 |
|---|---|---|
| Module ID | 小写点分 | `fs`、`transport.http`、`host.localservice` |
| Capability ID | `<domain>.<verb>@<major>`，省略版本等价 `@1` | `fs.read@1` |
| Event ID | `<domain>.<past-tense-fact>@<major>` | `fs.changed@1` |
| Service token | `tech.<area>.<name>@<major>`，仅技术服务 | `tech.http.mux@1` |
| UI contribution ID | `<module-id>.<local-id>` | `workbench.settings` |

删字段、改语义、加必填字段必须升主版本；兼容地加可选字段可保留主版本。

## 依赖版本治理

- 新增或升级 JS/TS 依赖前，应查询 registry 的最新稳定版本，不要直接沿用旧 lockfile、缓存或示例中的版本号。
- workspace 内的外部依赖版本统一维护在根 `pnpm-workspace.yaml` 的 `catalog`；各 `package.json` 应使用
  `catalog:` 引用，内部 workspace 依赖继续使用 `workspace:*`。catalog 里**禁止** `^ ~ *`。
- 最新版本若违反运行时、框架或 peer dependency 约束，应选择约束范围内的最新稳定版本，并在变更说明中记录原因；不得通过关闭
  `strict-peer-dependencies` 掩盖冲突。
- 依赖变更后应重新生成并提交 `pnpm-lock.yaml`，用 `pnpm install --frozen-lockfile` 验证可复现安装，并跑 `pnpm verify`。
- 工具链现状：Go 1.26、Node >=24.1.0、pnpm 10.14.0。仓库唯一外部 Go 依赖是
  `github.com/coder/websocket`（仅 ws transport）。`.editorconfig` 为 2 空格、LF、UTF-8、末尾换行。

## 一期边界（提案超出此范围要先做架构决策）

单机、单用户、单 Go 进程，监听 `127.0.0.1:10312`（端口可配）；WS 上的 JSON-RPC 为主
调用通道，HTTP 只做静态资源/健康检查/少量无状态请求；React 19 + TanStack Router
hash 模式 + Tailwind 4；启动/首帧前注册随后 freeze，**不热插拔**；仅 loopback。

一期不做：外部插件后端代码、进程内脚本沙箱、插件签名、后台守护、配置热重载、MCP、
微服务拆分、事件持久化/重放。

## 设计系统

[DESIGN.md](DESIGN.md) 是多主题设计系统规格：Default（Vercel 风）与 Aurora
（AI 原生深色，`#7C3AED` 紫作为唯一品牌色），各支持 Dark/Light。CSS 自定义属性统一
`--xt-` 前缀，主题通过 `:root` / `.theme-aurora-dark` 等类切换。紫→青渐变
（`ai-flow`）**只用于 AI 相关交互**，不做通用装饰。

`design/main.pen` 是 UI 设计稿（Pen 格式 JSON）。

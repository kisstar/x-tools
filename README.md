# xTools

xTools 是一个本地优先的工具平台：由单个 Go CLI 启动仅监听 loopback 的本地服务，复杂交互由 React Web 工作台承载。项目采用双侧微内核与强隔离模块化单体，Go capability、Web UI 模块和 transport 通过显式契约组合。

当前仓库已落地第一阶段骨架，包括 Go 生命周期、能力注册与 Invoke 管线，HTTP/WS transport，工作台 Shell、首页、最近工具与设置模块，以及偏好设置的跨端契约生成。架构约束以[本地服务架构规格](docs/architecture/local-service-design.md)为唯一真源。

## 环境要求

- Node.js 24（版本见 `.node-version`）
- pnpm 10.14.0（版本锁定在根 `package.json`）
- Go 1.26（版本见 `go.work`）
- Chrome（仅运行 Playwright E2E 时需要）

## 本地启动

```sh
pnpm install --frozen-lockfile
pnpm build
go run ./cmd/xtools
```

服务默认监听 `http://127.0.0.1:10312`。启动后在浏览器访问该地址；进程会从 `apps/web/dist` 提供构建后的 Web 资源。

常用启动参数：

```text
-port              loopback HTTP 端口，默认 10312
-assets            Web 构建产物目录，默认 apps/web/dist
-token-file        私有会话令牌文件
-preferences-file  工作台偏好文件
```

会话令牌由服务端启动时生成，并通过 HTML 注入后用于 WebSocket 准入；不要自行把令牌写进前端配置。服务只接受 loopback Host 与已允许的 Origin。

健康检查：

```sh
curl http://127.0.0.1:10312/health/live
curl http://127.0.0.1:10312/health/ready
```

## 开发与验证

常用命令：

| 命令 | 用途 |
|---|---|
| `pnpm codegen` | 从 Go capability struct 生成 JSON Schema 与 TypeScript 契约 |
| `pnpm format:check` | 检查 Web、Go 与 Shell 格式 |
| `pnpm lint` | 运行 Web lint、架构守卫与 Go lint |
| `pnpm typecheck` | 检查所有 Web workspace package |
| `pnpm test` | 运行 Web 单元测试 |
| `pnpm test:go` | 在 workspace 和独立 module 模式下验证 Go |
| `pnpm build` | 构建 Web 应用与 packages |
| `pnpm e2e` | 启动本地服务并运行 Playwright 关键路径 |
| `pnpm verify` | 执行完整本地门禁 |
| `pnpm verify:ci` | 在完整门禁前额外检查 Shell 脚本 |

`pnpm verify` 还会执行依赖安装、codegen 无差异检查、Mermaid 校验、Go 漏洞扫描与 race test。Go 安全扫描和独立 module lint 依赖脚本中锁定版本的 `govulncheck` 与 `golangci-lint`；缺少工具时，脚本会输出对应安装命令。

## 仓库结构

```text
cmd/xtools/          Go CLI 与最终 composition root
go/contracts/        L0：跨层稳定契约
go/kernel/           L1：生命周期、注册表与 Invoke runtime
go/modules/          L2：capability modules
go/transports/       L3：HTTP 与 WebSocket transports
contracts/schema/    从 Go 生成并提交的 JSON Schema
apps/web/            唯一 Web composition root
packages/            Web runtime、契约、adapter 与 UI modules
tests/               架构守卫与 E2E 测试
design/              工作台设计稿
docs/                架构、ADR 与实现规格
```

Web 使用 pnpm workspace + Turborepo，Go 使用多个 `go.mod` + 根 `go.work`。内部 Web 依赖使用 `workspace:*`，外部依赖版本统一由 `pnpm-workspace.yaml` 的 catalog 管理。生成的 `contracts/schema/` 与 `packages/contracts/src/generated.ts` 必须提交，禁止手改。

## 架构导航

- [本地服务架构索引](docs/architecture/local-service-design.md)：按任务路由到权威主题文件
- [目录、包边界与命名规范](docs/architecture/local-service-design/08-directory-and-code-organization.md)：新增或移动模块前必读
- [Workspace 与构建治理](docs/architecture/local-service-design/10-workspace-and-build-governance.md)：修改 pnpm、Turbo 或 Go workspace 前必读
- [ADR-001：多语言单仓库管理](docs/decisions/001-polyglot-workspace-management.md)
- [ADR-002：插件化 Web 工作台](docs/decisions/002-pluginized-web-workbench.md)
- [设计系统](DESIGN.md)：Default / Aurora 主题与 UI token 约束

关键边界：内核只提供 runtime 机制；业务模块之间禁止横向 import；同步业务调用统一经过 capability Invoke；跨端 schema 只允许从 Go 单向生成；浏览器身份由服务端建立；一期外部 UI 插件是可信同上下文代码，不构成恶意代码隔离。

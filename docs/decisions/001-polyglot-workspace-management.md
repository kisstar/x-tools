# ADR-001：采用 pnpm/Turborepo 与 Go Workspace 管理多语言单仓库

## 状态

Accepted

## 日期

2026-09-19

## 背景

xTools 在一个 Git 仓库内同时包含 Web 应用、Web runtime、UI modules、Go runtime kernel、Go capability modules、transport modules 与最终 CLI host。双侧微内核要求模块之间具备可执行的编译期边界，同时仍需支持跨端契约的原子修改和统一验证。

单一 Web package 无法通过 package manifest 表达 app、runtime、adapter 与 UI module 边界；单一 Go module 也弱化了 kernel、capability module、transport 与 composition root 之间的发布和依赖边界。

Go 的 go.work 与 Rust Cargo workspace 用途相近：都能把多个本地成员纳入联合开发。但 go.work 不提供 Cargo workspace 的共享 lockfile、依赖继承、profile 或统一发布配置；每个 Go module 仍独立维护 go.mod/go.sum。

## 决策

仓库采用 polyglot monorepo：

- Web 使用 pnpm workspace 管理 package 与唯一 pnpm-lock.yaml。
- Web 使用 Turborepo 编排 codegen、build、test、lint、typecheck 及缓存。
- apps/web 是唯一 Web composition root。
- Web runtime、生成契约、每个 adapter 与每个内置 UI module 使用独立 private workspace package。
- Go 使用多个 go.mod 对齐 contracts、kernel、每个 capability module、每个 transport 和 cmd/xtools composition root。
- 根 go.work 纳入全部 Go modules，负责仓库内联合解析与开发。
- 各 Go module 仍独立维护 go.mod/go.sum；go.work 不承担共享版本或锁文件职责。
- CI 同时验证 workspace 整体，并以 GOWORK=off 逐 module 验证，防止 go.work 掩盖缺失依赖。
- Turborepo 不编排或改变 Go module 语义；仓库级 CI 组合两套生态的验证结果。

## 备选方案

### Web 使用单 package

优点是配置最少；缺点是不能通过 package.json dependencies/exports 强制 app、runtime、adapter 和 UI module 边界。拒绝，因为边界只能依赖路径 lint，弱于 workspace package 边界。

### pnpm workspace 但不使用 Turborepo

优点是工具更少；缺点是 codegen 与多 package build/test 的任务依赖、增量缓存和 CI 过滤需要自行维护。拒绝，因为用户确认引入 Turborepo，且这些任务图已经是明确需求。

### Go 使用单 go.mod

优点是依赖维护简单；缺点是 module 级边界不存在，所有 Go package 默认处于同一版本和依赖单元。拒绝，因为当前模块数量有限，多 module 成本可控，并与微内核边界一致。

### 每个 Go module 使用本地 replace，不提交 go.work

优点是单 module 命令直观；缺点是兄弟路径 replace 会污染可发布的 go.mod，并容易在 CI 与本地出现差异。拒绝，由 go.work 负责本地联合解析。

### 使用 Nx 统一管理

优点是功能全面；缺点是引入另一套更重的项目图与插件体系，且仍不能替代 Go 原生 module/workspace 语义。拒绝，当前 pnpm + Turborepo + go.work 足够。

## 后果

- 编译期边界更接近双侧微内核的逻辑边界。
- Web 获得显式 workspace 依赖、exports、过滤执行和任务缓存。
- Go 获得 module 级依赖边界及联合本地开发体验。
- 仓库增加多个 package.json、go.mod/go.sum 以及 workspace 同步成本。
- CI 必须验证 pnpm/Turbo 图、go.work 成员完整性和离开 workspace 后的各 Go module。
- 新增 workspace 成员、Go module 或跨边界依赖属于架构变更，必须同时更新目录规范与架构守卫。

## 重新评估触发器

- Go module 数量和版本协调成本持续高于边界收益。
- Turborepo 缓存产生不可接受的错误命中或配置维护成本。
- 出现需要独立发布的 npm/Go SDK，需增加版本与发布策略。
- 仓库级任务需要统一跨语言增量图；届时单独评估任务编排层，不默认用 Web 工具接管 Go。

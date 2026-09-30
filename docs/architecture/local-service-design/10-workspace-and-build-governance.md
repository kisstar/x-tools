# Workspace 与构建治理

> **按需读取**：新增 pnpm package、Go module，或修改 pnpm、Turborepo、go.work、codegen 与 CI 任务图时必须读取。
>
> **前置文档**：[08-directory-and-code-organization.md](08-directory-and-code-organization.md) 与 [06-invariants-and-verification.md](06-invariants-and-verification.md)。决策依据见 [ADR-001](../../decisions/001-polyglot-workspace-management.md)。

## 1. 职责分界

仓库是一个 polyglot monorepo，但不强行使用单一工具管理所有语言：

| 工具 | 负责 | 不负责 |
|---|---|---|
| pnpm workspace | Web package 解析、依赖和唯一锁文件 | Go module、任务缓存 |
| Turborepo | Web codegen/build/test/lint/typecheck 任务图和缓存 | Go module 解析、架构边界本身 |
| go.work | 多个本地 Go module 的联合解析与开发 | 共享锁文件、共享依赖版本、任务缓存 |
| go.mod/go.sum | 单个 Go module 的依赖与校验 | 兄弟 module 的本地路径编排 |
| 仓库 CI | 汇总 Web 与 Go 验证、执行架构守卫 | 改写生态工具的依赖语义 |

## 2. pnpm workspace

- 根 package.json 与所有 workspace package 必须 private: true，除非另有独立发布 ADR。
- pnpm-workspace.yaml 只包含明确模式：apps/*、packages/*、packages/modules/*；其中 `packages/ui-contracts` 是手写 UI 扩展契约，`packages/contracts` 是生成的跨端 capability 契约。
- 仓库内依赖统一使用 workspace:*；未在 package.json 声明的 phantom dependency 视为错误。
- 全仓库只提交 pnpm-lock.yaml；禁止 package-lock.json、yarn.lock 或子目录 pnpm lockfile。
- package.json exports 是公共 API 边界；其他 package 不得 deep import src/ 内部路径。
- workspace 依赖图必须无环；packages/modules/* 之间禁止依赖。
- packages/web-runtime 不得依赖 React、router 或具体 UI module；packages/modules/* 只能依赖 web-runtime、ui-contracts、生成 contracts 和经批准的 UI 技术库。

## 3. Turborepo

- Turborepo 管理 codegen、build、test、lint、typecheck 任务图与本地/CI 缓存；不管理 Go module。
- codegen 先生成 contracts/schema 和 packages/contracts，再允许依赖它们的 Web package build/typecheck。
- build 必须声明真实 inputs/outputs；lint/typecheck 默认无产物；dev 必须 cache=false 且 persistent=true。
- 每个 package 独立声明脚本与依赖，根脚本只做 turbo run 编排。
- CI 使用 Turbo dry-run 检查任务图，并至少执行 lint、typecheck、test 和 build。
- 一期不引入 Nx、Changesets 或远程缓存；多应用独立发布或已测 CI 瓶颈出现后再评估。

## 4. Go workspace

- 根 go.work 必须提交并 use 仓库内全部 Go module；新增/删除 module 时同步更新。
- go.work 只负责多 module 的本地解析与联合构建，不是共享依赖/版本/构建配置文件；每个 module 仍维护自己的 go.mod/go.sum。
- go.work.sum 由 Go 工具需要时生成并提交；不得手改。
- 仓库内 module 的本地联调由 go.work 提供，go.mod 不应堆叠指向兄弟目录的 replace。
- module path 必须稳定且与仓库正式 import path 对齐；不得使用临时本地路径作为 module path。
- Go module 依赖图必须无环，并遵循 contracts ← kernel ← module/transport ← cmd/xtools 的允许方向。
- 多 Go module 强化编译与发布边界，但不能替代 import 架构测试。

go.work 与 Cargo workspace 相似之处是联合本地成员；不同之处是 Go 没有 workspace 共享 lockfile、依赖继承、profile 或统一发布配置。不能把 Cargo 的 workspace 习惯直接套到 go.work。

## 5. CI 双重验证

Go 必须执行两类验证：

1. Workspace 模式：验证所有本地 module 能联合 build/test，go.work use 清单完整。
2. 独立 module 模式：逐 module 设置 GOWORK=off，执行 go mod tidy 后 diff 检查、go test 和必要的静态分析。

第二类验证防止 go.work 掩盖 go.mod 缺失依赖或错误版本。CI 不应修改并提交 go.mod、go.sum、go.work 或 go.work.sum；发现差异即失败。

Web 必须验证：pnpm frozen lockfile 安装、workspace 依赖边界、Turbo dry-run 任务图、lint、typecheck、test、build，以及 codegen 后无 diff。

## 6. 新成员准入

新增 pnpm package 或 Go module 必须同时完成：

- 声明所属架构层、所有者、公共 API 与允许依赖；
- 更新 workspace 成员清单和架构依赖守卫；
- 提供独立 build/test 入口；
- 更新受影响的 codegen/Turbo/CI 任务图；
- 证明它不能通过依赖反向穿透 kernel 或横向耦合其他业务 module；
- 若需要独立发布，另写版本与兼容性 ADR。

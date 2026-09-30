# 目录、包边界与命名规范

> **按需读取**：创建/移动目录、增加模块或 transport、配置 import 守卫、评审包职责时必须读取。
>
> **前置文档**：[02-microkernel-and-modules.md](02-microkernel-and-modules.md) 与 [06-invariants-and-verification.md](06-invariants-and-verification.md)。本文规定目标结构；项目骨架落地后若需变更，必须同步更新守卫和本文。
>
> **Workspace 规则**：[10-workspace-and-build-governance.md](10-workspace-and-build-governance.md)。决策依据见 [ADR-001](../../decisions/001-polyglot-workspace-management.md)。

## 1. 组织原则

仓库采用 polyglot monorepo：Web 由 pnpm workspace + Turborepo 管理，Go 由多个 go.mod + 根 go.work 管理。目录必须让架构边界可由工具识别，而不是只靠命名暗示：

- Go 的 composition root 位于 cmd/xtools；contracts、kernel、每个 capability module 与每个 transport 都是独立 Go module。
- Go kernel 只位于 go/kernel；跨层稳定标识和数据契约位于 go/contracts。
- Web app、runtime、adapter、生成契约和内置 UI modules 是独立 pnpm workspace packages；插件之间不得共用“临时公共业务包”。
- 生成物与手写代码分目录；生成物禁止手改。
- 测试默认与被测包同目录；跨组件测试单独放 tests/，不得为测试放宽生产依赖边界。

## 2. 推荐目录树

    package.json                    # 私有 JS workspace 根和 turbo 入口
    pnpm-workspace.yaml             # apps/*、packages/*、packages/modules/*
    pnpm-lock.yaml                  # Web 唯一依赖锁文件
    turbo.json                      # Web 构建、测试、lint、typecheck、codegen 任务图
    go.work                         # 提交；列出仓库内全部 Go modules
    go.work.sum                     # go work 需要时提交
    cmd/
    └── xtools/                     # 独立 go.mod；CLI 与最终 Go composition root
    go/
    ├── contracts/                  # 独立 go.mod；L0 标识、错误码、技术 token
    ├── kernel/                     # 独立 go.mod；L1 纯 runtime
    │   ├── lifecycle/
    │   ├── registry/
    │   ├── invoke/
    │   ├── eventbus/
    │   └── services/               # 技术 DI 容器，不放业务 service
    ├── modules/                    # L2；每个子目录独立 go.mod
    │   ├── fs/
    │   ├── shell/
    │   ├── storage/
    │   ├── catalog/
    │   └── pluginhost/
    └── transports/                 # L3；每个子目录独立 go.mod
        ├── http/
        └── ws/
    contracts/
    └── schema/                     # 生成的 JSON Schema，按 capability@major 组织
    apps/
    └── web/                        # @xtools/web；Web composition root
    packages/
    ├── ui-contracts/               # @xtools/ui-contracts；手写 Web 进程内 UI 扩展契约
    ├── web-runtime/                # @xtools/web-runtime；Web 微内核
    ├── contracts/                  # @xtools/contracts；生成的 TS 契约
    ├── adapter-ws/                 # @xtools/adapter-ws；IChannel 实现
    └── modules/                    # 每个内置 UI 模块一个 package
        ├── workbench-shell/
        └── <tool>/
    tests/
    ├── architecture/               # Go module 与 pnpm package 边界守卫
    ├── integration/                # HTTP/WS、准入、停机
    └── e2e/                        # 少量端到端场景

外部 UI 插件不进入源码树；运行时从配置的 pluginDir 加载。插件自身建议使用 plugin.toml、ui/ 与 assets/，entry 必须保持在插件根目录内。

## 3. 包职责与允许依赖

| 目录 | 职责 | 可以依赖 | 禁止依赖 |
|---|---|---|---|
| go/contracts | 跨层稳定标识、值类型和生成元数据 | 标准库 | kernel、module、transport、host |
| go/kernel | runtime 机制和端口 | contracts、标准库 | 具体 module/transport/host、net/http、WebSocket/Cobra 实现 |
| go/modules/<id> | 单一功能模块及 handler | kernel、contracts、第三方技术库 | 其他 capability module、transport、host |
| go/transports/<id> | 协议编解码、连接准入、Invoker 调用 | kernel、contracts、协议库 | capability module、handler、可写 registry |
| cmd/xtools | Go composition root、模块选择、required IDs、CLI | contracts、kernel、modules、transports | 被其他 Go module 反向依赖 |
| packages/contracts | 生成的 TS 类型和校验器 | 运行时校验库 | app、runtime、adapter、UI module |
| packages/ui-contracts | 手写的 Web 进程内 Slot、renderer、容器、导航与 RenderPlan 契约 | React 类型 | React 实现、router、app、runtime、adapter、UI module 实现 |
| packages/web-runtime | Web runtime 端口与机制 | ui-contracts、生成 contracts、通用技术库 | React、router、app、modules、具体 adapter、具体区域名 |
| packages/modules/<id> | UI 贡献与交互 | web-runtime、ui-contracts、生成 contracts | 其他 UI module、具体 adapter/app |
| packages/adapter-<id> | IChannel 等端口实现 | web-runtime、contracts、协议/宿主 API | UI module、app |
| apps/web | Web composition root | runtime、contracts、adapters、modules | 被 packages 反向依赖 |

go/kernel 可以公开模块实现所需的最小端口，但不得公开内部可变结构。若某类型只服务一个模块，应留在该模块内；不要为了复用猜想上移到 contracts。

## 4. 模块内部组织

模块小的时候保持扁平，不强制 controller/service/repository 三层。出现真实职责分离后，允许按以下角色拆分：

    go/modules/<id>/
    ├── go.mod           # 只声明 contracts、kernel 和本模块技术依赖
    ├── module.go        # Manifest、Activate、Deactivate、构造
    ├── capability.go    # capability 定义与注册
    ├── handler.go       # 用例协调；不包含协议逻辑
    ├── model.go         # 本模块私有实体/值类型
    ├── adapter_*.go     # OS/文件/外部库适配，仅在需要时出现
    └── *_test.go

模块包对外只需暴露 composition root 使用的构造函数；不要暴露 handler、repository 或内部模型供其他模块调用。模块之间共享的是 capability/schema，不是 Go 实现类型。

Web workspace package 必须声明 private: true，并通过 package.json exports 只暴露公共入口。仓库内依赖统一使用 workspace:*；未在 package.json 声明的 phantom dependency 视为错误。不要把单个 React 组件拆成 package，拆包单位必须对应 runtime、adapter、app 或独立 UI module 边界。

`packages/ui-contracts` 与 `packages/contracts` 不得合并：前者是多个 UI 插件消费的手写进程内扩展契约，后者只能是 Go capability struct 单向生成的跨端契约。具体 React renderer 留在所属 UI module；ui-contracts 只允许引用 React 类型。

## 5. 命名规范

| 对象 | 规范 | 示例 |
|---|---|---|
| Module ID | 小写点分命名；稳定且全局唯一 | fs、transport.http、host.localservice |
| Capability ID | <domain>.<verb>@<major>；省略版本等价 @1 | fs.read@1、storage.get@1 |
| Event ID | <domain>.<past-tense-fact>@<major> | fs.changed@1、plugin.loaded@1 |
| Service token | tech.<area>.<name>@<major>；仅技术服务 | tech.http.mux@1、tech.clock@1 |
| UI contribution ID | <module-id>.<local-id> | workbench.settings、hash.main |
| Go package | 小写单词，无通用 utils/common/helpers 包 | eventbus、localservice |
| 文件名 | 按职责命名，测试使用 _test.go | capability.go、handler.go |

禁止创建无法说明所有者的 shared、common、utils 或 helpers 业务目录。真正跨层稳定的数据先证明有两个独立消费者，再进入 contracts。

## 6. 生成代码与测试规范

- contracts/schema 与 packages/contracts 必须带生成标记，由同一 Go 真源生成；禁止手改。
- 架构测试必须验证目录到层的 import 规则，而非只匹配字符串。
- 单元测试与包同目录；需要黑盒边界时使用 package 名后缀 _test。
- tests/integration 只验证跨模块/协议行为，不直接 import 未公开 handler。
- tests/e2e 保持少量关键路径，不能替代 module 与 kernel 单元测试。
- 新增顶层目录、Go module、pnpm package、跨层公共包或 service token 必须经过架构评审。

# §10–12 契约与代码生成

## §10 schema 真源：Go struct

schema 真源是 **Go struct**（不变式 5）。每个 capability 的输入/输出各是一个带 tag 的 struct：

```go
type FsReadInput struct {
    Path     string `json:"path" validate:"required"`
    Encoding string `json:"encoding" json_schema:"enum=utf8|base64,default=utf8"`
}

type FsReadOutput struct {
    Content string `json:"content"`
    Size    int64  `json:"size"`
}
```

约束（required / enum / min / max / 默认值）写在 struct tag 上。**这里是唯一真源**——JSON Schema 与 web 的 TS 类型都从它生成，任何一端手改都算违规。

## §11 生成链：Go → JSON Schema → TS

### §11.1 单向、构建期、无回写

生成链本身就是一条**管道-过滤器**：每级只做一件事、只吃上一级的产物，中间产物可独立检查——这也是它能被 CI 逐级断言的原因。

```
Go struct（真源）
   │  构建期工具（go generate）：反射 struct + tag → JSON Schema
   ▼
JSON Schema（中间产物，纳入构建，不手改）
   ├─→ Go 侧：编译进二进制，运行时校验用（§12）
   └─→ web 侧：json-schema-to-typescript → TS 类型 + zod（或 ajv）运行时校验器
```

- **单向**：只有 Go → TS，没有 TS → Go。web 永远是契约的消费者，天然无双向漂移。
- **构建期**：生成物提交进仓库并由 CI 校验"生成物与真源一致"（`go generate` 后 `git diff` 必须为空），杜绝忘了重新生成。
- **带版本**：生成物按能力主版本组织（`fs.read@1`）；出现 `@2` 时两份类型并存，前端可分别 import（§7.4）。
- **web 的运行时 schema 例外**：动态插件在前端声明的表单 schema 是显式例外，只存在于 TS 一侧，不进 Go（插件一期纯 UI，见 §13）。

### §11.2 为什么不引中立 IDL

不引 protobuf / 中立 IDL / 双向 codegen。真源在 Go、消费在 TS，一条单向管线用现成库（`invopop/jsonschema` 之类）即可；引 IDL 等于凭空造第三种语言和一层同步负担，属于典型过度设计。`// ponytail: 单向生成够用，IDL 是为多真源准备的，我们只有一个真源`。

## §12 校验落点

| 位置 | 用途 | 数据来源 |
|---|---|---|
| **Go / Invoke 管线** | 唯一信任边界，拒绝非法入参（§9.2、§9.3） | 编译进二进制的 JSON Schema |
| **web / channel client** | 提前反馈、改善体验，**不是安全边界** | 生成的 zod/ajv 校验器 |

关键纪律：**web 侧校验是 UX 优化，不能替代服务端校验**。即便 web 校验被绕过（直连 WS、改前端），Go 侧仍会拒。两侧规则由同一份 schema 生成，因此不会出现"前端放过、后端拒绝"的规则不一致。

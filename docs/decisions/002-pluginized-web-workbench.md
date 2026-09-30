# ADR-002：采用所有者声明的类型化 Slot 树组装 Web 工作台

## 状态

Accepted

## 日期

2026-09-30

## 背景

Web runtime 已被限定为纯机制，但现有规格尚未说明 `design/main.pen` 中的工作台骨架如何作为插件落地，也没有定义顶部导航、侧栏、内容区和详情区如何被功能插件确定性定制。把这些区域固化进 runtime 会破坏 runtime-only kernel；允许插件按加载顺序覆盖任意区域则会使组合结果不可预测，并形成隐式耦合。

## 决策

- Web runtime 只内建唯一抽象根 Slot `root`，不知道任何具体区域名。
- Web 宿主把 `workbench.shell` 声明为必需 UI 模块；它占据 `root`，声明一级区域并提供默认 renderer。
- Slot 形成所有者声明的类型化树。只有父贡献所有者可以声明并渲染子 Slot；其他插件只能注册符合契约的贡献。
- 一期 Slot 基数只采用 `single`、`list` 和 `keyed`，所有注册在首帧前完成并 freeze。
- 每个区域使用独立 renderer 契约。renderer 可以输出任意 React 节点，但导航数据保持结构化。
- renderer 通过显式 ID 按 Shell 默认、容器默认、用户全局配置和工作区稀疏覆盖解析；禁止按加载顺序或隐式优先级覆盖。
- URL 是活动容器和 View 的唯一真源；跨宿主持久偏好通过 Go capability 保存。
- 根 Shell 失败时 Fail-closed；区域和 View 的运行时错误由各自 ErrorBoundary 隔离。

详细契约与失败语义由 [04-web-cli-and-hosts.md](../architecture/local-service-design/04-web-cli-and-hosts.md) 定义，验证要求由 [06-invariants-and-verification.md](../architecture/local-service-design/06-invariants-and-verification.md) 定义。

## 备选方案

### 扁平全局 Slot

所有扩展点由 runtime 预定义。实现简单，但 runtime 必须知道具体界面，功能模块也不能在自己拥有的视图内继续开放扩展点，因此拒绝。

### 任意动态布局图

允许任何插件创建、移动和连接区域。自由度高，但会产生隐式结构依赖、组合歧义和难以验证的状态；一期没有对应需求，因此拒绝。

### 加载顺序覆盖

后注册或高优先级插件接管区域。实现成本低，但结果依赖装配细节，无法可靠处理多个功能容器并存，因此拒绝。

## 后果

- 工作台骨架和区域 renderer 都可以在不修改 Web runtime 的情况下替换。
- Slot 所有权、基数、ID、版本和绑定解析成为必须自动验证的契约。
- 需要新增手写的 `packages/ui-contracts`，与 Go 单向生成的 capability contracts 分离。
- `apps/web` 仍是唯一具体模块聚合点，并负责声明宿主必需的 Shell。
- 用户工作台偏好成为可运行期更新的业务状态，不改变系统启动配置只读规则。
- 外部 UI 插件仍是可信同上下文代码；新机制不提供恶意代码隔离。

## 重新评估触发器

- 出现运行时安装或热切换插件的已验证需求。
- 出现需要任意拖放区域或多套命名工作台的产品需求。
- 需要运行不可信 UI 插件并建立真正的安全隔离。
- `single/list/keyed` 无法表达已出现且有测试用例的组合需求。

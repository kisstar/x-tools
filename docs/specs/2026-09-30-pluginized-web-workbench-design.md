# 插件化 Web 工作台设计

| 属性 | 值 |
|---|---|
| 状态 | 已确认，进入实施 |
| 适用范围 | `design/main.pen` 核心骨架、内置 UI 模块与一期可信外部 UI 插件 |
| 设计目标 | 在现有双侧微内核约束下，使工作台骨架、区域渲染器和功能界面均可由插件组合 |
| 日期 | 2026-09-30 |

## 1. 背景与目标

现有架构规定 Web 内核只能承担契约装载、贡献注册表、技术服务 DI、`IChannel`、UI 模块生命周期和故障隔离；导航骨架、命令面板、设置页和具体工具均不属于内核。本设计进一步定义 `design/main.pen` 所示工作台如何作为内置 UI 插件落地，以及按需安装的插件如何共同组成最终应用。

设计目标如下：

1. 工作台骨架本身是可替换插件，而不是 Web runtime 的内建页面。
2. 顶部导航、主侧栏、次侧栏、内容区、详情区和全局叠层均可配置，并可按活动功能容器选择不同 React 渲染器。
3. 功能插件可以向其他插件声明的稳定扩展点贡献内容，但不能直接依赖其实现。
4. 所有装配和替换都由显式 ID、类型契约及用户配置决定，不依赖加载顺序。
5. 默认装配还原 `design/main.pen` 的核心结构，并遵循 `DESIGN.md` 的设计令牌。
6. 一期继续遵守启动前注册后冻结、不热插拔、URL 为导航状态真源及可信同上下文 UI 插件的既有边界。

## 2. 已确认决策

### 2.1 根骨架和宿主边界

Web runtime 只内建一个抽象根槽 `root`，不知道工作台、导航或任何具体区域名。`apps/web` 是唯一 composition root，负责选择 UI 模块集合，并将 `workbench.shell` 声明为 Web 宿主必需模块。

`workbench.shell` 占据 `root`，提供完整可见骨架并声明一级区域。整个 Shell 可以由宿主配置替换，但普通插件不得通过注册先后或优先级抢占根槽。Shell 缺失、重复、激活失败或根视图无法构建时，应用 Fail-closed，不进入正常工作台。

宿主保留一个不属于插件化工作台的最小启动诊断页。该页面只承担加载进度、失败插件、错误原因和恢复提示，不提供业务功能或 UI 扩展点。

### 2.2 所有者声明的类型化 Slot 树

采用“所有者声明的类型化 Slot 树”：

```text
apps/web
└─ Web runtime
   └─ root
      └─ workbench.shell
         ├─ top-navigation
         ├─ primary-navigation
         ├─ secondary-navigation
         ├─ content
         ├─ detail
         └─ overlay
```

插件可以在自己拥有的视图或区域渲染器内部继续声明子 Slot。这里的所有权遵循“声明即占有”：

- 只有父贡献的所有者可以决定子 Slot 的位置、渲染时机、传入上下文和空态。
- 子 Slot 必须声明稳定 ID、贡献类型、基数、作用域、契约主版本和失败语义。
- 其他插件可以注册符合契约的贡献，但不能重新声明或直接渲染该 Slot。
- 父贡献不可用时，整棵子树退出实际渲染，但仍保留在诊断快照中。
- 注册和撤销归属插件生命周期；激活失败必须撤销该插件已产生的全部贡献。

一期 Slot 基数只定义实际需要的三种：

- `single`：唯一占据者，用于根骨架或完整区域。
- `list`：确定性有序的追加贡献。
- `keyed`：按稳定 key 精确选择一个贡献。

不引入任意布局图、万能槽位或运行时布局 DSL。

## 3. 工作台区域模型

`workbench.shell` 声明六个一级区域：

| 区域 | Shell 固定职责 | 可替换内容 |
|---|---|---|
| 顶部导航 | 高度、定位、响应式边界 | React 渲染器、导航数据、动作 |
| 主侧栏 | 宽度范围、折叠轨道、调整边界 | React 渲染器、导航结构 |
| 次侧栏 | 宽度范围、显隐与调整边界 | React 渲染器、当前容器导航 |
| 内容区 | 最小尺寸、路由出口 | React 渲染器、活动 View、局部工具栏 |
| 详情区 | 宽度范围、显隐与调整边界 | React 渲染器、详情贡献 |
| 全局叠层 | 层级、焦点和事件穿透规则 | 命令面板、通知、对话框等贡献 |

Shell 固定区域间的几何关系和页面级可访问性约束，不固定区域内部 DOM 或 React 树。不同区域使用各自的类型化渲染器契约，不建立万能 `RegionRenderer`：

- `TopNavigationRenderer`
- `PrimaryNavigationRenderer`
- `SecondaryNavigationRenderer`
- `ContentRenderer`
- `DetailRenderer`
- `OverlayContribution`

导航渲染器插件可以提供任意 React 组件，并在其内部输出任意 React 节点和布局。React 内容对 runtime 不透明；runtime 不解释或改写节点，只负责注册、绑定解析、生命周期和故障隔离。

任意 React 输出不等于无类型输入。渲染器仍只接收所属区域的类型化输入，包括活动容器、贡献快照、选择状态、折叠状态、可用性和受限动作。渲染器不得取得可变注册表、其他插件实例或绕过 `IChannel` 的宿主入口。

## 4. 容器、视图和导航贡献

### 4.1 ViewContainer

每个功能模块可以注册 `ViewContainer`。容器定义至少包含：

- 稳定容器 ID、标题、图标和默认路由；
- 它接受的 View 贡献；
- 各区域可选的默认渲染器 ID；
- 未指定区域继承 Shell 默认渲染器的声明；
- 它开放的结构化贡献集合；
- 所需 capability 及不可用原因。

第三方插件可以通过稳定 `containerId` 向其他插件的容器贡献导航项、View、命令或区域内容。贡献插件只依赖公共契约和 ID，不得导入容器插件的实现。目标容器缺失、停用或版本不兼容时，相关贡献保留在诊断清单中并标记为不可用，不得静默转移到其他容器。

### 4.2 导航数据

导航内容与导航渲染器分离。导航贡献采用结构化的 `item`、`group` 和 `hierarchy`，节点至少可以表达：

- 稳定 ID 和父节点 ID；
- 标题、图标与辅助描述；
- 显式 order；
- 路由目标或命令 ID；
- 可用状态和结构化不可用原因；
- 所属容器和适用区域。

导航贡献本身不得携带任意 React 节点。图标栏、分组列表和树形导航是同一贡献快照的不同呈现；切换渲染器不得改变节点 ID、路由目标、可用状态或用户排序。自定义操作通过命令贡献表达，再由导航节点引用命令 ID。

## 5. 区域渲染器选择

### 5.1 keyed 显式绑定

每个区域独立选择渲染器。`ViewContainer` 可以分别指定顶部导航、主侧栏、次侧栏、内容区和详情区渲染器；没有指定的区域继承 Shell 默认渲染器。A、B 两个功能模块因此可以在同一个 Shell 下分别使用图标式和树形式侧栏。

渲染器选择使用 `keyed` 显式绑定，不使用条件竞选、加载顺序或隐式优先级：

```text
URL 确定活动 ViewContainer
→ 按区域读取已解析的 rendererId
→ 在冻结的兼容候选集中精确查找
→ 生成 RegionRenderPlan
```

容器所有者声明区域默认渲染器。用户可以从已安装、激活成功、区域类型匹配且契约主版本兼容的候选中显式切换；第三方插件不能静默覆盖容器绑定。

### 5.2 配置解析顺序

配置按以下顺序解析：

```text
Shell 默认
→ ViewContainer 默认
→ 用户全局配置
→ 当前工作区稀疏覆盖
→ 最终 RendererBinding
```

这是由专门解析器生成的显式结果，不是在 React 组件内部用 `?? default` 临时拼接。某层明确引用不存在、不兼容或未激活的渲染器时，结果为 `renderer_unavailable`，不得继续向较低层静默回退。用户可以逐项清除覆盖，使其重新跟随上一级。

## 6. 注册表、配置和 RenderPlan

必须区分三个状态平面：

1. **贡献注册表**记录已安装插件能提供什么。所有模块在首帧前完成激活，注册表随后冻结；一期不热插拔。
2. **持久配置**记录用户选择什么。它可以在冻结后更新，但只能引用冻结候选集中的 ID，或保留当前不可用的历史引用。
3. **RenderPlan**是 URL、冻结快照和已解析配置共同产生的不可变渲染输入。

`RenderPlan` 至少包含：

```text
RenderPlan
├─ activeContainerId
├─ activeViewId
├─ topNavigation: RegionRenderPlan
├─ primaryNavigation: RegionRenderPlan
├─ secondaryNavigation: RegionRenderPlan
├─ content: RegionRenderPlan
├─ detail: RegionRenderPlan
└─ overlays: OverlayRenderPlan
```

每个 `RegionRenderPlan` 包含最终 renderer ID、契约版本、不可变贡献快照、区域状态输入和诊断结果。用户切换渲染器、显隐或排序时，只重新计算受影响的 RenderPlan，不解冻或修改贡献注册表。

URL 是活动容器和活动 View 的唯一状态真源。store 只保存本次展开、焦点、拖动过程等临时交互状态，不复制 active route。活动 View 不存在或不可用时，内容区显示可诊断的 Not Found/Unavailable，URL 不被静默改写。

## 7. 持久配置

持久偏好统一通过 Go capability 读写，Web 业务代码只依赖 `IChannel`，不得直接使用 `localStorage`。这样 Web 和未来宿主共享同一份配置，并使校验、审计和错误处理继续经过统一 Invoke 管线。

配置至少包含：

- 每个容器、每个区域的渲染器选择；
- 导航项固定、隐藏和排序；
- 次侧栏与详情区宽度；
- 面板默认显隐；
- 全局层、工作区稀疏覆盖和配置 revision。

更新流程为“读取 revision → 提交变更 → 服务端校验 → 返回新 revision”。并发冲突必须拒绝覆盖并返回当前版本。提交失败时保留旧配置和旧 RenderPlan，不执行客户端乐观持久化。

卸载或停用插件时不删除引用其 ID 的用户配置；该选择变为可诊断的不可用项，重新安装兼容插件后可以恢复。客户端不得自行清理未知配置。

纯临时交互状态可以留在 Web runtime，但跨会话或跨宿主的偏好必须经 capability 保存。

## 8. 生命周期与故障语义

UI 装配采用以下流程：

```text
Discover
→ Validate manifest
→ Resolve dependencies
→ Activate
→ Validate contribution graph
→ Freeze registry
→ Load and resolve configuration
→ Build RenderPlan
→ Mount
```

激活期间的全部贡献归属当前插件。激活失败必须事务式撤销该插件已注册的 Slot、渲染器、容器、View、命令和导航项。

故障处理如下：

| 故障 | 必须行为 |
|---|---|
| `workbench.shell` 缺失、重复或激活失败 | Fail-closed，只显示最小启动诊断页 |
| 宿主声明的其他必需 UI 模块失败 | Fail-closed，不挂载残缺应用 |
| 可选内置模块或外部 UI 插件激活失败 | 回滚该插件，保留诊断，继续装配其他插件 |
| Slot 重复声明、重复 ID、非法父子关系或版本不兼容 | 冻结前拒绝相关插件，不采用覆盖 |
| 冻结后尝试注册 | 明确拒绝 |
| 显式绑定渲染器不可用 | 该区域显示 `renderer_unavailable`，不静默回退 |
| 区域渲染器运行时异常 | 区域 ErrorBoundary 接管，其他区域继续运行 |
| View 运行时异常 | 当前 View ErrorBoundary 接管 |
| 单个导航贡献无效 | 从有效快照排除并保留诊断，不使整个区域白屏 |
| 配置持久化失败 | 保持旧配置与旧 RenderPlan，显示含 trace ID 的错误 |

“一切皆插件”不表示所有插件同等必需。必需性由 `apps/web` 声明，不进入 runtime，也不能由插件自行提高。

类型化 Slot、受限 renderer 输入和 ErrorBoundary 只提供组合约束与故障隔离。外部 UI 插件仍是用户主动安装的可信同上下文代码，不能将这些机制描述为恶意代码隔离或服务端插件级授权。

## 9. 模块边界与目录

建议新增以下 Web workspace 边界：

```text
packages/ui-contracts/
packages/web-runtime/
packages/modules/workbench-shell/
packages/modules/<feature-ui>/
apps/web/
```

### 9.1 `packages/ui-contracts`

手写的 L0 Web 进程内扩展契约包，包含 Slot、区域、容器、View 和渲染器 ID，导航数据，各区域独立 renderer 输入，RenderPlan、诊断类型及契约版本规则。它不得包含 React 实现、store、路由实例、宿主判断或业务逻辑。

该包与 Go struct 单向生成的 `packages/contracts` 分离：前者是多个 UI 插件共同消费的进程内扩展契约，后者是跨 Go/Web capability 契约。

### 9.2 `packages/web-runtime`

只提供 React 无关的 UI 模块生命周期、Slot 声明、贡献注册、所有权校验、事务回滚、freeze、只读快照、绑定解析和 RenderPlan 生成。它不得依赖 React、Router、具体 Shell、具体区域名或任何功能模块。

### 9.3 `packages/modules/workbench-shell`

占据 `root`，实现 `design/main.pen` 的页面级几何，声明一级区域，注册默认区域渲染器，调用最终 renderer，并为每个区域和 View 提供 ErrorBoundary、加载态、空态与不可用状态。

### 9.4 功能 UI 模块

功能模块可以依赖 UI contracts、web-runtime 注册 facade、生成 capability contracts 和 `IChannel`。它们可以注册容器、View、结构化导航、命令、任一区域的 React renderer，以及自己拥有的子 Slot。

功能模块禁止依赖 `workbench-shell` 或其他 UI 模块实现。跨插件协作只能通过稳定 ID、贡献注册表、命令、Web event 或共同调用后端 capability。

### 9.5 `apps/web`

只负责构造 runtime、选择模块、声明宿主必需模块、注入 channel adapter、Router 和技术服务，完成激活与 freeze 后挂载根 UI，并在启动失败时保留最小诊断页。

新增 `ui-contracts` 包、顶层 Slot 机制和工作台模块属于架构变更。进入实现前必须同步更新现有架构规格的 02、04、06、07、08、10 主题文件，并为新增 MUST 约束指定验证证据。

## 10. 设计模式

只采用存在真实变化点的模式：

- **Microkernel**：稳定 runtime 与可变 UI 模块分离。
- **Composite**：所有者声明的类型化 Slot 树。
- **Strategy**：同一区域的可替换 React renderer。
- **Registry**：容器、View、renderer、命令和导航贡献注册。
- **Command**：导航节点引用命令 ID。
- **Adapter / Bridge**：UI 通过 `IChannel` 与宿主交互。
- **Decorator**：区域与 View ErrorBoundary。
- **State**：UI 模块生命周期。
- **Facade**：模块只访问受限 ActivationContext。

不为模式名称增加万能接口、抽象工厂层或运行时布局语言。

## 11. `design/main.pen` 默认映射

`design/main.pen` 是 `workbench.shell` 与默认 renderer 的视觉规格，不是 runtime 的固定页面。

| 设计区域 | 默认实现 |
|---|---|
| Header | 默认顶部导航 renderer：品牌、当前上下文、命令入口和全局动作 |
| NavBar | 默认主导航 renderer：容器入口、固定项、工具市场和设置入口 |
| SubNav | 默认次导航 renderer：当前容器的结构化导航快照 |
| Content Area | 默认内容 renderer：活动 View、局部工具栏和空态 |
| Detail Panel | 默认详情 renderer：当前选择对象的详情和辅助操作 |
| Command Palette | 全局 overlay 贡献：聚合命令、容器、View 与可调用能力 |
| Settings | 设置模块：管理主题、插件、renderer 绑定和全局/工作区偏好 |

尺寸、颜色、间距和响应式规则来自 `DESIGN.md` 的 `--xt-*` 令牌及布局约束。若 `DESIGN.md` 与 Pen 画布存在差异，必须先统一规格，不能在实现中静默选择其中之一。

设置界面分为“全局布局”和“当前工作区”。当前工作区只显示相对全局配置的覆盖并支持逐项恢复跟随全局。renderer 选择器只列出已安装、激活成功、区域匹配且契约兼容的候选；已保存但当前不可用的选择必须单独显示 ID、来源插件和原因。

## 12. 一期范围外

一期不包含：

- 运行时安装、卸载或热切换插件；
- 任意拖放区域、自由布局 DSL 或多套命名工作台；
- 插件通过优先级或加载顺序抢占区域；
- 导航数据贡献携带任意 React 节点；
- 跨 UI 插件导入实现；
- iframe、Worker 或独立进程形式的不可信 UI 插件；
- 将 Slot、受限输入或 ErrorBoundary 描述为恶意代码隔离；
- 复制 URL 活动状态到 store；
- 为尚不存在的变化点预建通用区域接口。

## 13. 验证方案

### 13.1 静态架构守卫

- `web-runtime` 禁止依赖 React、Router、Shell、具体区域和功能模块。
- UI 模块禁止导入其他 UI 模块的实现。
- 功能模块只允许依赖 UI contracts、runtime facade、生成 contracts 和 `IChannel`。
- 只有 composition root 可以聚合具体插件。
- UI 业务禁止直接访问 WebSocket、宿主全局变量或浏览器持久化。
- Slot、renderer、container 和 View ID 必须通过格式与重复检查。

### 13.2 runtime 单元测试

- Slot 所有权与“声明即占有”；
- `single / list / keyed` 基数；
- 父子 Slot 生命周期级联；
- 插件激活失败事务回滚；
- freeze 后注册失败；
- 确定性排序；
- 四层绑定解析和工作区稀疏覆盖；
- 显式无效绑定不得回退；
- 配置 revision 冲突。

### 13.3 React 组件测试

- 导航 renderer 可以返回任意 React 节点；
- 不同 renderer 消费同一结构化导航快照；
- renderer 可以声明并渲染自己的子 Slot；
- 单个 renderer 异常只替换对应区域；
- View 异常不影响导航和其他区域。

### 13.4 集成与 E2E

1. A、B 功能模块同时安装并分别使用不同次侧栏 renderer。
2. URL 从 A 容器切到 B 容器时，只切换对应区域与内容。
3. 插件 C 向 A 容器贡献导航项和 View，二者没有实现 import。
4. 用户全局切换 renderer 后，未覆盖工作区继承该选择。
5. 工作区覆盖 renderer 后，其他工作区仍继承全局配置。
6. 用户选择的 renderer 被卸载后显示 `renderer_unavailable`；重新安装后恢复。
7. 可选插件激活失败时工作台仍可使用，并可查看诊断。
8. `workbench.shell` 激活失败时只显示最小启动诊断页。
9. 默认装配还原 `design/main.pen` 的核心骨架。
10. 切换 renderer 不改变导航节点 ID、路由目标、可用状态和持久排序。

## 14. 整体验收标准

1. 默认装配能还原 `design/main.pen` 的核心工作台。
2. 删除任一可选功能插件不需要修改 Shell 或 runtime。
3. 替换整个 `workbench.shell` 不需要修改 Web runtime。
4. 同一 Shell 下，不同容器可以逐区域使用不同 React renderer。
5. 第三方插件可以向其他插件的稳定容器和子 Slot 贡献内容，且不存在实现依赖。
6. 所有选择和冲突由显式 ID、类型契约和配置决定，不依赖加载顺序。
7. 根骨架失败时 Fail-closed；区域和 View 故障不会扩散。
8. 持久偏好跨 Web 与未来宿主共享，URL 始终是导航状态真源。
9. 新机制不扩大一期外部插件的安全承诺。
10. 每项新增 MUST 约束都有自动化测试、静态守卫或明确评审证据。

## 15. 参考实现研究结论

设计期间检查了 DeepSeek Harness 本地源码提交 `c291e7961a515f6d7af9304e7fd1d257929aef26`。其 Web boot kernel 只负责模块加载、Cordis 和最小启动错误页；`ui-layout` 插件占据内建 `root` 并声明 `sidebar`、`main`、`rightbar` 和 `shell.overlay`；槽位具有 `single / list / keyed / chain` 基数，父贡献独占其子槽声明与渲染权，注册作为可逆 effect 随插件卸载撤销。

xTools 借鉴其中“骨架是插件、声明即占有、类型化 Slot 和 Fail-closed 启动”的原则，但不照搬动态热装配、`chain` 竞选或 Cordis 运行模型。一期继续以启动前注册后 freeze、URL 导航真源、统一 `IChannel` 和既有可信插件边界为准。

# Web、CLI 与宿主适配

> **按需读取**：实现 Web runtime、UI 贡献点、IChannel、CLI 命令、进程管理或宿主配置时读取。
>
> **前置文档**：[02-microkernel-and-modules.md](02-microkernel-and-modules.md)。插件信任模型见 [05-plugins-and-security.md](05-plugins-and-security.md)。

## 1. Web runtime 与 IChannel

Web 业务与 UI 只能调用与下列形状等价的端口：

    interface IChannel {
      call<TIn, TOut>(capabilityId: string, input: TIn): Promise<TOut>
      subscribe<T>(eventId: string, handler: (payload: T) => void): () => void
    }

Web-serve、未来 Electron 和 Rust 宿主分别提供 adapter。业务代码中禁止出现 platform 判断、window.__TAURI__ 或直接创建 WebSocket/IPC 等宿主判断。

Web app、runtime、contracts、每个 adapter 和每个内置 UI module 使用独立 pnpm workspace package；apps/web 是唯一 Web composition root。Turborepo 只编排任务和缓存，不改变 IChannel 与模块依赖规则。

IChannel 错误必须保留统一 code、message、traceId，不能被 adapter 压成普通字符串。subscribe 返回的取消函数必须幂等，并在 view 卸载或连接断开时释放服务端订阅。

## 2. UI 贡献物与状态

导航容器、视图、命令与设置分区都是 UI 模块贡献物。导航状态真源是 URL；store 只保存折叠等纯 UI 偏好，不镜像 active route。

每个 view 由 ErrorBoundary 隔离；插件 activate、懒加载或渲染失败只降级该插件，并展示可诊断原因。

UI 插件之间不得 import。跨 UI 插件协作只允许命令 ID、Web event 或共同调用后端 capability。

贡献注册表必须拒绝重复 ID，不采用加载顺序覆盖。排序必须确定：先按显式 order，再按规范化 ID。路由参数引用不存在或不可用的 contribution 时展示可诊断的 Not Found/Unavailable 视图，不静默跳到其他工具。

### 2.1 所有者声明的类型化 Slot 树

Web runtime 只内建 `root`。占据一个 Slot 的贡献可以声明自己的类型化子 Slot；声明者独占子 Slot 的渲染位置、上下文、空态和生命周期，其他插件只能注册符合契约的贡献。子 Slot 必须声明稳定 ID、契约主版本、作用域和基数；一期基数只允许 `single`、`list`、`keyed`。父贡献不可用时，其子树不参与渲染，但必须保留可诊断状态。

`single` 只允许一个有效占据者，`list` 按显式 order 后按规范化 ID 确定性排序，`keyed` 按稳定 key 精确选择。重复声明、重复 ID、重复 key、父子所有权错误或主版本不兼容必须在 freeze 前拒绝，禁止采用加载顺序覆盖。freeze 后所有声明和注册必须失败。

### 2.2 Shell、区域与 renderer

默认 `workbench.shell` 占据 `root`，声明顶部导航、主侧栏、次侧栏、内容区、详情区和全局叠层。Shell 拥有区域间几何、响应式、尺寸与页面级可访问性；每个区域内部由独立的类型化 renderer 契约控制，不建立万能 `RegionRenderer`。

区域 renderer 是 React 组件贡献，可以输出任意 React 节点，也可以在自己的树内声明类型化子 Slot。runtime 把组件视为不透明值，不得解释其 React 树。renderer 输入必须保持类型化，只包含活动容器、不可变贡献快照、区域状态和受限动作；不得暴露可写注册表、其他插件实例或宿主协议。

导航数据与 renderer 分离。导航贡献只使用结构化 `item`、`group`、`hierarchy`，包含稳定 ID、父 ID、标题、图标、order、路由或命令 ID、可用状态及原因；导航贡献不得携带任意 React 节点。不同 renderer 可以把同一快照呈现为图标栏、列表或树。

### 2.3 ViewContainer 与开放贡献

功能插件通过稳定 ID 注册 ViewContainer、View、renderer、命令和导航项。其他插件可以用 `containerId` 向容器贡献内容，但不得 import 容器插件实现。目标容器缺失、停用或不兼容时，贡献保留在诊断快照中并标记不可用，不得转移到其他容器。

每个 ViewContainer 可以逐区域声明默认 renderer。URL 决定活动容器和 View，store 不得复制活动路由。路由不存在或不可用时保留 URL 并在内容区显示诊断。

### 2.4 显式绑定与 RenderPlan

renderer 按区域独立、按 ID 精确选择。解析顺序固定为 Shell 默认 → ViewContainer 默认 → 用户全局选择 → 当前工作区稀疏覆盖。解析器必须先选出最高层显式引用再验证该引用；显式引用缺失、区域不匹配或主版本不兼容时返回 `renderer_unavailable`，不得退回较低层。第三方插件不能通过优先级或注册顺序改变绑定。

冻结贡献快照、URL 解析结果和已解析用户偏好共同生成不可变 RenderPlan。用户修改 renderer、显隐、排序或尺寸只重新生成受影响 RenderPlan，不修改或解冻贡献注册表。区域和 View 分别由 ErrorBoundary 隔离；renderer 异常只降级对应区域。

### 2.5 用户工作台偏好

用户偏好包含逐容器逐区域 renderer、导航固定/隐藏/排序、面板尺寸和显隐。全局层提供用户默认，工作区层只保存稀疏覆盖，并可逐项恢复跟随全局。持久偏好必须通过 IChannel 调用 Go capability，使用 revision compare-and-swap；业务 UI 禁止直接使用 localStorage 等浏览器持久化。

配置中的未知或暂时不可用插件 ID 不得被客户端删除。保存失败时继续使用旧快照；冲突时读取服务端新 revision 后由用户决定是否重试。系统启动配置与用户偏好的职责边界见 [09-operational-policies.md](09-operational-policies.md)。

## 3. CLI 命令模型

| 类型 | 来源 | 执行位置 |
|---|---|---|
| start / stop / status | CLI 手写应用管理命令 | 当前进程 |
| fs read 等能力命令 | 服务的冻结 capability 清单 | 转发到运行中的服务 |

服务未运行时，能力命令必须提示启动服务，不得隐式启动后台服务。若保留显式 --local 模式，它只能复用同一模块装配执行一次性 capability，并明确拒绝订阅型或独占资源型能力。

CLI 机器可读输出使用 stdout，诊断使用 stderr；成功退出码为 0，参数/契约错误、连接失败、授权失败和内部失败必须映射为稳定的非零退出码。对标记为 streaming/subscribe 的能力不得伪装成一次性 JSON 结果。

## 4. 进程与配置

启动锁文件记录 PID、端口和时间。端口占用时明确失败，不静默换端口。

配置启动时一次性加载、运行期只读。一期监听地址与连接准入不可关闭；端口、插件目录、文件根目录和有界资源预算可以配置。配置热重载和后台守护不属于一期。

锁文件创建必须防并发启动并能识别陈旧 PID；status 不能只凭 PID 存在判断服务健康，还必须执行带版本检查的本机探活。stop 只向锁文件中经身份核验的目标进程发信号，不能误杀复用 PID 的其他进程。

## 5. 新宿主接入规则

新增宿主只应新增 channel adapter 与 composition root。业务 UI、capability 模块和 kernel 不得因宿主接入而修改。宿主判断只允许出现在 adapter 与 composition root。

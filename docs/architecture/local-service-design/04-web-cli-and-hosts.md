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

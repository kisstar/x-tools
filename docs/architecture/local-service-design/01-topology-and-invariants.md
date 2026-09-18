# §1–3 拓扑、约束与不变式

## §1 拓扑与形状

### §1.1 运行时拓扑

```
┌────────────────────────────────────────────────────────────────────────┐
│  客户端（都是 client，都无特权）                                          │
│    浏览器里的 web 页面                  xtools CLI / AI Agent / 脚本      │
│        │ HTTP（静态）+ WS（JSON-RPC）           │ WS（JSON-RPC）          │
└────────┼──────────────────────────────────────┼────────────────────────┘
         │        Origin + Host + session token 闸门（§9.4）
┌────────▼──────────────────────────────────────▼────────────────────────┐
│  xtools 本地服务（单 Go 进程）                                            │
│                                                                        │
│  ── L3 Transport 模块（可插拔，不属于内核）───────────────────────────    │
│     transport.http │ transport.ws │ （二期）transport.mcp                │
│              只做协议编解码 + 调 kernel.Invoke，不碰 handler               │
│                              │                                         │
│  ── L1 Kernel（runtime only，无业务、无协议）─────────────────────────    │
│     Invoke 管线（唯一信任边界，§9.3）：                                    │
│       身份绑定 → schema 校验 → 权限闸门 → 可用性 → 配额/超时 → handler      │
│     Registry（激活后 freeze）· DI 容器 · Event Bus · 生命周期编排           │
│                              │                                         │
│  ── L2 能力模块（彼此不 import，只经 capability / DI token / event 交互）── │
│     fs · shell · storage · static · catalog · pluginhost                │
│                                                                        │
│  ── L0 contracts（schema、DI token、错误码；被各层依赖，不依赖任何层）───    │
└────────────────────────────────────────────────────────────────────────┘
         │ pluginhost 扫描 pluginDir
         ▼
    Plugins（外部，一期纯 UI 贡献，只消费能力）
```

依赖方向只许**朝内**：L3 → L1，L2 → L1，全体 → L0；L1 不认识 L2/L3，同层之间零横向依赖（不变式 8、9）。

### §1.2 触达面由 transport 模块承载，清单只有一份

对外触达面**全部从同一份能力注册表派生，不手工维护第二份清单**（不变式 4）。注意区分「服务端 transport」与「客户端」：

| 触达面 | 形态 | 承载 | 消费者 |
|---|---|---|---|
| **WS JSON-RPC** | 服务端 transport 模块 | 全量 capability 调用 | web 页面、CLI（主路径） |
| **HTTP** | 服务端 transport 模块 | 静态资源 + 少数无状态一次性请求 | 浏览器加载 web、健康检查 |
| **CLI 子命令** | **客户端进程** | 应用管理（本地）+ 能力直调（转发到服务） | 终端用户、AI Agent、脚本 |
| **MCP**（二期） | 服务端 transport 模块 | tool 列表由注册表派生（§8.4） | MCP host |

CLI **不是**服务内的第四种 handler，而是与 web 对等的客户端：能力直调走同一条 WS 路径、同一条 Invoke 管线（§22）。这让「单一状态源」成立——不会出现两个进程各持一份 storage / watch 状态。

### §1.3 web 是唯一复杂 UI

CLI 不渲染业务界面；所有工具的交互都在 web 页面完成。web 通过 `IChannel` 抽象把调用发给本地服务，**永不感知自己跑在浏览器、Electron 还是 Rust 渲染进程里**（§18）。

---

## §2 一期约束（已定）

| 约束 | 一期取值 | 可配 | 备注 |
|---|---|---|---|
| 监听地址 | `127.0.0.1` | 否（一期硬编本机） | 仅本机访问，不暴露局域网 |
| 端口 | `10312` | **是** | 配置文件覆盖；被占用时报错退出，不静默换端口 |
| 连接准入 | Origin + Host 白名单 + session token | 否（不可关闭） | 本机监听 ≠ 安全，必须挡住任意网页的跨站连接（§9.4） |
| 主通道 | WebSocket | — | HTTP 仅静态 + 一次性请求 |
| 域名 | 不做自定义域名 | — | 直接 `127.0.0.1:10312`；`x-tools.localhost` 作为零配置可选别名 |
| 插件来源 | 固定本地目录扫描 | **是**（pluginDir） | 无远程安装、无签名校验 |
| 插件能力 | **纯 UI 贡献** | — | 只消费 capability，不提供后端 capability |
| `start` 形态 | 一期前台运行 | — | 后台守护化留到后续（§23） |
| 前端框架 | React 19 + TanStack Router(hash) + Tailwind 4 | — | hash 路由让页面可被任意宿主直接加载 |

---

## §3 核心不变式（改动必须守住）

CI 应逐条断言可断言者。

1. **UI 只认 channel client，永不感知宿主**。`platform === 'electron'` / `window.__TAURI__` 这类判断在 web 业务与 UI 层必须**零出现**；宿主差异只允许存在于 transport 适配器与入口装配层（§18–19）。
2. **内核的 Invoke 管线是唯一信任边界**。所有入参在管线里按 schema 校验、过权限闸门后才进 handler；**transport 只能经 `kernel.Invoke` 入内核，不得持有或直连 handler**，capability handler 内不再重复做边界校验（§9、§12）。
3. **core 内不得出现窗口 / 托盘 / 菜单概念**。CLI 与 serve 形态没有窗口，这些属于未来的 host shell，不属于 Go core。
4. **同一进程内各触达面共用同一份注册表**。WS 方法表、CLI 命令树、HTTP 路由、（未来）MCP tool 清单全部由注册表派生；差异只能来自插件 runtime 支持情况，且必须能由 `capability:list` 查出（§8）。
5. **Go struct 是 schema 唯一真源**。JSON Schema 与 web 的 TS 契约都是**单向生成物**，禁止手改、禁止在 web 侧回写（§10–11）。
6. **契约不承诺实现不支持的能力**。做不到的字段从类型里删掉，或在 capability 的 `limits` / `available` 里显式声明，**禁止静默降级**（§7.3）。
7. **内核代码中不得出现具体业务模块的名字，也不得出现任何协议**。`grep -rn "<业务模块名>" internal/kernel/` 与 `grep -rEn "net/http|websocket|cobra|encoding/json" internal/kernel/` 都必须为空，由 CI 断言。kernel 只认 `Module` / `Transport` 接口与贡献点，既不认具体工具，也不认 HTTP/WS/CLI（§4.2）。
8. **模块之间零直接依赖**。模块不得 import 另一个模块的包；跨模块协作只有三条合法路径：**capability 调用、DI service token、event**。CI 断言 `internal/modules/<a>` 不出现对 `internal/modules/<b>` 的 import（唯一例外是 L0 的 `internal/contracts`）。前端插件同规（§20.6）。
9. **依赖方向单向朝内**。L3 transport → L1 kernel，L2 module → L1 kernel，全体 → L0 contracts；**反向与横向一律禁止**（kernel 不得 import module/transport）。CI 用 import 边界规则断言（Go 侧 depguard / `go list -deps`，web 侧 eslint `no-restricted-imports`）。
10. **未经握手的连接一律拒绝**。任何 WS/HTTP 入口都必须先过 Origin + Host + session token 三重校验，缺一即拒（fail-closed）；`CallerID` 由服务端按连接派生，**不接受连接自报身份**（§9.4）。

> 不变式 1、4、5、7、8、9 是本架构的承重墙——前四条守「可移植 + 单一真源」，后两条守「互不耦合 + 分层」。不变式 2、10 是安全底线，同级不可让。任何"就这一次特事特办"的绕过都会在换宿主、加触达面或加模块时崩塌，评审须一票否决。

# 两条传输 · 三重闸门 · WS 安全基线 · 提权

> 属 [xTools 跨端架构设计方案](../cross-platform-design.md)。章节编号沿用总文，行内 `§N.M` 引用按索引的映射表定位。
>
> 本章取代旧版「四条触达路径 / CLI 分发 / Rust 提权二进制」。只剩两条传输（ipc / ws），提权语言无关。

---

## 6. 两条传输 · 三重闸门 · WS 安全基线 · 提权

### 6.1 三重闸门

每一次 channel 调用，在 handler 执行**之前**顺序过三关 + 一次校验，全部落在 channel server（唯一信任边界）。任何一关失败立即返回对应错误码（§5.5），不进 handler：

```
call(ctx, 'fs:readFile', arg)
      │
  ① channel 白名单   ── 该会话 / 该 pluginId 是否获准访问此 channel？ ──否──► CHANNEL_NOT_ALLOWED
      │ 是
  ② capability 声明  ── 调用方 manifest 是否声明了命令所需 capability？   ──否──► FORBIDDEN
      │              ── 是否申请了禁止项（shell.elevate / unrestricted，§6.5）？──是──► 加载期已拒，到不了这里
      │ 是
  ③ 按会话求值        ── capability 对本会话（ctx.client）是否可用？       ──否──► CAPABILITY_UNAVAILABLE
      │ 是                                                                      （如 desktop-only 命中 ws 会话，§7.3）
  ④ zod 校验          ── args 过 schema？                                  ──否──► INVALID_ARGS
      │ 是
   handler(arg) ──► 成功后 wrapper 按 emits 广播失效事件（§8.4）
```

三关各管一件事、互不兜底：①管「能不能看见这个 channel」，②管「调用方声明够不够」，③管「这台会话的环境够不够」。②③不可合并——②是代码错误（改 manifest 能解决），③是环境结论（浏览器会话就是没有窗口），混成一个码则 UI 无法区分「插件写错了」与「请去客户端打开」。

### 6.2 信任边界只有一处

两条传输、所有入参，校验**只在 channel server 发生一次**。渲染侧（含浏览器）不做校验、也不被信任；preload / ws 客户端只负责搬运字节。这保证：

- **渲染侧零 zod 运行时**（§5.4）：校验不在前端，前端自然不需要 zod。
- **两条传输共用同一张校验表**（不变式 2）：ipc 与 ws 走进同一个 `IServerChannel`，校验规则物理上只有一份，不可能漂移。
- `INTERNAL` 错误的细节（栈、路径）**只写审计日志，不回传前端**（§6.4）——错误信息不泄露内部结构。

### 6.3 WS 安全基线

浏览器会话经 WebSocket 接入主进程。单用户本机场景，但 WS 一旦监听就是一个本机网络面，基线逐条如下，**不可放松**：

- **只绑 `127.0.0.1`，不绑 `0.0.0.0`**。只有本机进程能连，不暴露到局域网。
- **一次性 token**：主进程启动 WS 时生成 token，写入 `~/.xtools/session`（权限 `0600`）。浏览器端启动时由客户端注入该 token，**无 token 的连接一律拒绝**。
- **校验 `Origin` 头**：只接受客户端拉起的本地页面来源，拒绝任意站点的跨源连接。
- **鉴权在 WebSocket 升级之前完成**：token / Origin 不合法则连升级握手都不给过，不存在「先连上再踢」。
- **默认不启用 CORS 通配**，不设 `Access-Control-Allow-Origin: *`。
- **WS server 默认关闭**：不开浏览器端就不监听。这是攻击面最小化——纯客户端用户的机器上根本没有这个网络面。
- **CSP 方向只能收紧不能放开**：渲染端 CSP 不得为迁就某插件而加 `unsafe-inline` / `unsafe-eval` / 放开 `connect-src`。

### 6.4 审计

每次通过闸门的调用（无论成败）写一条审计日志，字段固定：

```
{ ts, sessionId, client, pluginId, command, capability, resultCode, durationMs }
```

即 **`pluginId` + `channel.command` + `capability` + 结果码**，外加时间 / 会话 / 耗时。审计是提权与权限红线的事后可查手段（§6.5），也是 `INTERNAL` 错误细节的唯一落点。日志不含入参内容（可能含敏感数据），只记结构化元信息。

### 6.5 提权（语言无关）

旧版把提权绑在一个 Rust 小二进制 `xtools-elevate` 上。移出 Rust 后，**判据回到本质**：提权与否看「谁以 root 身份执行动作」，与实现语言无关。

**绝不 Node-as-root**：主进程本身永不以 root 运行。需要特权的动作下沉到一个**独立提权通道**，分两期落地：

- **一期**：调用系统提权对话框（macOS Authorization Services / `osascript with administrator privileges`、Linux `pkexec`），执行**固定动作脚本**，不拉起常驻进程。
- **二期**：一个极小的提权 helper（`elevate/`，语言自由），只做白名单内的几个动作。

提权通道的四条要求，**语言无关、逐条不可省**：

1. **不接受任意 shell**：只认固定白名单动作（如「写某个受保护配置」「改 hosts 文件」），不转发用户 / 插件给的命令行。
2. **路径白名单，且不信任调用方传入的 path**：helper 自己持有允许写的路径集合，调用方给的 path 只做匹配、不做拼接。
3. **内容走 stdin，不走 argv**：待写内容经标准输入传入，不出现在命令行参数里（argv 会进 `ps` / 进程表，是泄露面）。
4. **每次动作写审计日志**（§6.4）。

**两条红线**（权限模型的硬边界，§12.3 复述）：

- **红线一**：`shell.elevate` capability **仅内置插件可申请**。第三方插件只要在 manifest 里声明它，**加载期直接拒绝**，不给用户「允许」弹窗——不把提权决定权推给用户。
- **红线二**：`fsScope: unrestricted` **仅内置插件可声明**，由 core 的 path-guard 执行。第三方插件的 fs 访问一律限定在声明的 scope 内。

### 6.6 安装来源

一期插件安装来源**仅本地目录 / zip**，且**未经验证的来源必须显式提示用户**。manifest 保留 `publisher` / `signature` 字段但**一期不校验**（§19 不做远程 registry / 签名校验）。这不是降级，是把「签名校验」明确划到范围外，避免给出「已验证」的虚假安全感。

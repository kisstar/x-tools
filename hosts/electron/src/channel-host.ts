/**
 * Channel host — the Electron main's single backend. Builds one ChannelServer
 * (the sole backend every renderer talks to) and binds a per-window ipc
 * connection to it. Window and OS notification live here, not in core
 * (invariant 3): core has no window concept, and the notification sink is an
 * OS-level primitive the host injects.
 */

import { join } from "node:path"

import { Notification, type BrowserWindow } from "electron"

import type { NotificationShowArgs } from "@x-tools/protocol"

import {
  attachConnection,
  createChannelServer,
  PluginHost,
  type ChannelServer,
  type SessionInfo,
} from "@x-tools/core"

import { createAuditSink } from "./audit-sink"
import { contributeSwitchHost } from "./plugins/switch-host-wiring"
import { createIpcProtocol } from "./transports/ipc-transport"
import { createWsHost, type WsHostHandle } from "./transports/ws-transport"

function showNotification(options: NotificationShowArgs): void {
  if (!Notification.isSupported()) return
  // exactOptionalPropertyTypes: pass only the keys actually set, never an
  // explicit `undefined`.
  new Notification({
    title: options.title,
    ...(options.body !== undefined ? { body: options.body } : {}),
    ...(options.icon !== undefined ? { icon: options.icon } : {}),
    ...(options.silent !== undefined ? { silent: options.silent } : {}),
  }).show()
}

export interface WsServerOptions {
  readonly allowedOrigins: readonly string[]
  readonly port?: number
}

export interface ChannelHost {
  readonly attachWindow: (win: BrowserWindow) => void
  /**
   * 为本机浏览器会话开 WS 入口，复用同一个 server（两条传输共用同一张校验表，
   * 不变式 4）。默认关闭：不开浏览器端就不监听（§6.3）。幂等——已开就复用。
   * ponytail: 开关的触发点（switch-host / 设置项）后续步骤接线，这里只给能力。
   */
  readonly startWsServer: (options: WsServerOptions) => Promise<WsHostHandle>
  readonly stopWsServer: () => void
}

export function createChannelHost(storageBaseDir: string): ChannelHost {
  // The plugin host backs gate ② (§6.2): every plugin-origin call is checked
  // against the capabilities its manifest declared. Empty until a plugin is
  // installed — plugin discovery / install is phase 2 (§20.3), so with no
  // plugins loaded every plugin-origin call still gets FORBIDDEN, which is the
  // honest default.
  const pluginHost = new PluginHost()

  // §6.4: one JSONL line per gate-passing call, under the same base dir as
  // storage. Both transports share this one server, so ipc and ws audit through
  // the same sink. ponytail: fd lives for the process; OS flushes on exit, so
  // no close() wiring until the host grows a real shutdown path.
  const audit = createAuditSink(join(storageBaseDir, "audit.log"))

  const server: ChannelServer = createChannelServer({
    storageBaseDir,
    notify: showNotification,
    declaredCapabilities: (id) => pluginHost.declaredCapabilities(id),
    onAudit: audit.record,
    // switch-host contributes its capabilities + handlers over the shared
    // registries. The closure names the plugin; core never does (invariant 7).
    contribute: contributeSwitchHost(storageBaseDir),
  })

  let wsHandle: WsHostHandle | null = null

  return {
    attachWindow(win) {
      const { protocol, dispose: disposeTransport } = createIpcProtocol(win.webContents)
      const session: SessionInfo = {
        client: "electron-renderer",
        sessionId: `ipc-${win.webContents.id}`,
      }
      const connection = attachConnection({ server, protocol, session, transport: "ipc" })
      win.on("closed", () => {
        connection.dispose()
        disposeTransport()
      })
    },

    async startWsServer(options) {
      if (wsHandle !== null) return wsHandle
      wsHandle = await createWsHost({ server, ...options })
      return wsHandle
    },

    stopWsServer() {
      wsHandle?.dispose()
      wsHandle = null
    },
  }
}

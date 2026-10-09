/**
 * Channel host — the Electron main's single backend. Builds one ChannelServer
 * (the sole backend every renderer talks to) and binds a per-window ipc
 * connection to it. Window and OS notification live here, not in core
 * (invariant 3): core has no window concept, and the notification sink is an
 * OS-level primitive the host injects.
 */

import { Notification, type BrowserWindow } from "electron"

import type { NotificationShowArgs } from "@x-tools/protocol"

import {
  attachConnection,
  createChannelServer,
  type ChannelServer,
  type SessionInfo,
} from "@x-tools/core"

import { createIpcProtocol } from "./transports/ipc-transport"

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

export interface ChannelHost {
  readonly attachWindow: (win: BrowserWindow) => void
}

export function createChannelHost(storageBaseDir: string): ChannelHost {
  const server: ChannelServer = createChannelServer({
    storageBaseDir,
    notify: showNotification,
  })
  // ponytail: no onAudit sink yet — audit log + elevation land in a later step.

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
  }
}

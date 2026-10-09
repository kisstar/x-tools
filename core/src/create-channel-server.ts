/**
 * createChannelServer (§9) — the kernel composition root and core's only public
 * entry. Wires the five kernel pieces, registers the OS-primitive capabilities
 * and their handlers, and hands back the server a transport (ipc / ws) drives.
 * This is a factory, not a barrel: it builds the object graph, it does not
 * re-export modules.
 *
 * Window / tray / menu are deliberately absent — those are host shell, not core
 * (invariant 3). `notification.show` is the one capability whose availability is
 * injected: it needs an OS-level sink the host provides, so when `notify` is
 * omitted the capability honestly reports unavailable rather than silently
 * no-op'ing (invariant 6).
 */

import type { NotificationShowArgs } from "@x-tools/protocol"
import {
  FS_EXISTS,
  FS_MKDIR,
  FS_READ_DIR,
  FS_READ_FILE,
  FS_REMOVE,
  FS_WRITE_FILE,
  NOTIFICATION_SHOW,
  SHELL_ENV,
  SHELL_EXEC,
  STORAGE_CLEAR,
  STORAGE_GET,
  STORAGE_REMOVE,
  STORAGE_SET,
} from "@x-tools/protocol"

import { CapabilityRegistry } from "@x-tools/capabilities/capability-registry"
import { makeFsHandlers } from "@x-tools/capabilities/fs-handlers"
import { makeShellHandlers } from "@x-tools/capabilities/shell-handlers"
import { makeStorageHandlers } from "@x-tools/capabilities/storage-handlers"
import type { AuditEntry } from "@x-tools/channel-server/channel-server"
import { ChannelServer } from "@x-tools/channel-server/channel-server"
import { EventBus } from "@x-tools/kernel/event-bus"
import { SessionRegistry } from "@x-tools/kernel/session-registry"

export type { AuditEntry } from "@x-tools/channel-server/channel-server"
export { ChannelServer } from "@x-tools/channel-server/channel-server"
export { attachConnection } from "@x-tools/channel-server/channel-connection"
export type { ConnectionOptions } from "@x-tools/channel-server/channel-connection"
export type { InvalidationEvent } from "@x-tools/kernel/event-bus"
export type { EventSink, SessionInfo } from "@x-tools/kernel/session-registry"
export type { Capability, CapabilitySnapshot } from "@x-tools/capabilities/capability"

export interface ChannelServerDeps {
  /** Where storage persists `preferences.json`; host injects it (invariant 3). */
  readonly storageBaseDir: string
  /** OS notification sink; when absent, `notification.show` reports unavailable. */
  readonly notify?: (options: NotificationShowArgs) => void | Promise<void>
  /** Gate ②: a plugin's manifest-declared capabilities (§6.2). */
  readonly declaredCapabilities?: (pluginId: string | undefined) => ReadonlySet<string>
  readonly onAudit?: (entry: AuditEntry) => void
}

export function createChannelServer(deps: ChannelServerDeps): ChannelServer {
  const sessions = new SessionRegistry()
  const bus = new EventBus(sessions)
  const capabilities = new CapabilityRegistry()

  const server = new ChannelServer({
    capabilities,
    bus,
    sessions,
    ...(deps.declaredCapabilities !== undefined
      ? { declaredCapabilities: deps.declaredCapabilities }
      : {}),
    ...(deps.onAudit !== undefined ? { onAudit: deps.onAudit } : {}),
  })

  // OS-primitive capabilities. fs/shell/storage are available on both clients;
  // the real cross-session difference lives here, per-session, not in runtime.
  capabilities.register({ id: "fs.read", available: () => true })
  capabilities.register({ id: "fs.write", available: () => true })
  capabilities.register({ id: "shell.exec", available: () => true })
  capabilities.register({ id: "storage.read", available: () => true })
  capabilities.register({ id: "storage.write", available: () => true })
  capabilities.register({
    id: "notification.show",
    available: () => deps.notify !== undefined,
    reason: "not-implemented",
  })

  const fs = makeFsHandlers()
  server.register(FS_READ_FILE, (_ctx, args) => fs.readFile(args))
  server.register(FS_WRITE_FILE, (_ctx, args) => fs.writeFile(args))
  server.register(FS_READ_DIR, (_ctx, args) => fs.readDir(args))
  server.register(FS_EXISTS, (_ctx, args) => fs.exists(args))
  server.register(FS_MKDIR, (_ctx, args) => fs.mkdir(args))
  server.register(FS_REMOVE, (_ctx, args) => fs.remove(args))

  const shell = makeShellHandlers()
  server.register(SHELL_EXEC, (_ctx, args) => shell.exec(args))
  server.register(SHELL_ENV, (_ctx, args) => shell.env(args))

  const storage = makeStorageHandlers(deps.storageBaseDir)
  server.register(STORAGE_GET, (_ctx, args) => storage.get(args))
  server.register(STORAGE_SET, (_ctx, args) => storage.set(args))
  server.register(STORAGE_REMOVE, (_ctx, args) => storage.remove(args))
  server.register(STORAGE_CLEAR, (_ctx, args) => storage.clear(args))

  // notification.show is always registered so the capability gate (gate③), not
  // the channel whitelist (gate①), governs availability — otherwise an absent
  // sink would surface as CHANNEL_NOT_ALLOWED instead of the honest
  // CAPABILITY_UNAVAILABLE (invariant 6). notify is guaranteed present when the
  // handler runs: the capability reports unavailable whenever it is absent.
  server.register(NOTIFICATION_SHOW, async (_ctx, args) => {
    await deps.notify?.(args)
  })

  return server
}

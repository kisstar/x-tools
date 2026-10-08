/**
 * Channel RPC primitives — the typed surface that decouples "what to call"
 * from "how to transport". Borrowed from VSCode `vs/base/parts/ipc` (§5.2).
 *
 * This file is pure TypeScript types + one Error subclass; it carries NO zod
 * import, so the renderer can `import type` from it with zero runtime cost.
 */

export interface Disposable {
  dispose(): void
}

/** The only interface each transport must implement (§5.3). */
export interface IMessagePassingProtocol {
  readonly send: (buffer: Uint8Array) => void
  readonly onMessage: (handler: (buffer: Uint8Array) => void) => Disposable
}

/** Client-side channel: UI calls commands / listens to events (§5.2). */
export interface IChannel {
  readonly call: <TResult>(command: string, arg?: unknown) => Promise<TResult>
  readonly listen: <TEvent>(event: string, arg?: unknown) => AsyncIterable<TEvent>
}

/** Server-side channel: receives a CallContext the client cannot forge (§5.2). */
export interface IServerChannel {
  readonly call: (ctx: CallContext, command: string, arg?: unknown) => Promise<unknown>
  readonly listen: (ctx: CallContext, event: string, arg?: unknown) => AsyncIterable<unknown>
}

/**
 * The only identity info the channel server trusts. `client` + `sessionId`
 * are the sole places the contract admits "two frontends differ" (§5.2):
 * `client` drives per-session capability evaluation (§7.3), `sessionId`
 * addresses event broadcasts (§8.2).
 */
export interface CallContext {
  readonly origin: "kernel" | "plugin"
  readonly pluginId?: string
  readonly transport: "ipc" | "ws" | "in-process"
  readonly client: "electron-renderer" | "browser"
  readonly sessionId: string
}

/**
 * The five stable error codes (§5.5). The channel server throws only these,
 * transport-agnostic and identical on both ends. UI branches on them.
 * 不得新增、不得改名。
 */
export type ChannelErrorCode =
  | "CHANNEL_NOT_ALLOWED"
  | "FORBIDDEN"
  | "CAPABILITY_UNAVAILABLE"
  | "INVALID_ARGS"
  | "INTERNAL"

export interface ChannelError {
  readonly code: ChannelErrorCode
  readonly message: string
  readonly command: string
}

/** The wire-safe exception both the server and the client reconstruct. */
export class ChannelException extends Error {
  readonly code: ChannelErrorCode
  readonly command: string

  constructor(error: ChannelError) {
    super(error.message)
    this.name = "ChannelException"
    this.code = error.code
    this.command = error.command
  }

  toError(): ChannelError {
    return { code: this.code, message: this.message, command: this.command }
  }
}

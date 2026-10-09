/**
 * ChannelServer (§5.2, §6.1) — the single trust boundary. Every call runs the
 * three gates then zod validation, always in this order, before any handler:
 *
 *   ① channel whitelist     → CHANNEL_NOT_ALLOWED  (command isn't registered)
 *   ② declared capability   → FORBIDDEN            (plugin didn't declare it; code error)
 *   ③ per-session eval      → CAPABILITY_UNAVAILABLE (environment conclusion)
 *   ④ zod args              → INVALID_ARGS
 *
 * Gates ② and ③ stay separate on purpose: ② is a static manifest error, ③ is a
 * runtime per-session verdict (§6.2). `origin: 'kernel'` is trusted and skips ②.
 * After the handler resolves, the wrapper broadcasts the command's `emits` —
 * never before (invariant 8), and plugins never get a publish handle.
 */

import type { z } from "zod"

import type {
  CallContext,
  ChannelErrorCode,
  CommandDef,
  Disposable,
  IServerChannel,
} from "@x-tools/protocol"
import { ChannelException, commandId } from "@x-tools/protocol"

import type { CapabilityRegistry } from "../capabilities/capability-registry"
import type { EventBus } from "../kernel/event-bus"
import type { EventSink, SessionInfo, SessionRegistry } from "../kernel/session-registry"

export type Handler = (ctx: CallContext, args: unknown) => Promise<unknown>

export interface AuditEntry {
  readonly ts: number
  readonly sessionId: string
  readonly client: CallContext["client"]
  readonly pluginId?: string
  readonly command: string
  readonly capability: string
  readonly resultCode: "OK" | ChannelErrorCode
  readonly durationMs: number
}

export interface ChannelServerOptions {
  readonly capabilities: CapabilityRegistry
  readonly bus: EventBus
  readonly sessions: SessionRegistry
  /** Gate ②: the capabilities a plugin declared in its manifest (§6.2). */
  readonly declaredCapabilities?: (pluginId: string | undefined) => ReadonlySet<string>
  /** §6.4: one entry per handler-reaching call; detail stays here, never on the wire. */
  readonly onAudit?: (entry: AuditEntry) => void
}

const NO_CAPS: ReadonlySet<string> = new Set()

export class ChannelServer implements IServerChannel {
  readonly #handlers = new Map<string, { readonly def: CommandDef; readonly handler: Handler }>()
  readonly #capabilities: CapabilityRegistry
  readonly #bus: EventBus
  readonly #sessions: SessionRegistry
  readonly #declaredCapabilities: (pluginId: string | undefined) => ReadonlySet<string>
  readonly #onAudit: ((entry: AuditEntry) => void) | undefined

  constructor(options: ChannelServerOptions) {
    this.#capabilities = options.capabilities
    this.#bus = options.bus
    this.#sessions = options.sessions
    this.#declaredCapabilities = options.declaredCapabilities ?? (() => NO_CAPS)
    this.#onAudit = options.onAudit
  }

  register<A extends z.ZodTypeAny, R extends z.ZodTypeAny>(
    def: CommandDef<A, R>,
    handler: (ctx: CallContext, args: z.infer<A>) => Promise<z.infer<R>>,
  ): void {
    const id = commandId(def)
    if (this.#handlers.has(id)) {
      throw new Error(`command already registered: ${id}`)
    }
    this.#handlers.set(id, { def, handler: handler as Handler })
  }

  /** Transports call this on connect; dispose on disconnect (§8.2). */
  registerSession(session: SessionInfo, sink: EventSink): Disposable {
    return this.#sessions.register(session, sink)
  }

  async call(ctx: CallContext, command: string, arg?: unknown): Promise<unknown> {
    const entry = this.#handlers.get(command)

    // Gate ① — channel whitelist.
    if (!entry) {
      throw new ChannelException({
        code: "CHANNEL_NOT_ALLOWED",
        message: `unknown command: ${command}`,
        command,
      })
    }
    const { def, handler } = entry

    // Gate ② — capability declared by the caller. Kernel origin is trusted.
    if (ctx.origin === "plugin") {
      const declared =
        ctx.pluginId !== undefined ? this.#declaredCapabilities(ctx.pluginId) : NO_CAPS
      if (!declared.has(def.capability)) {
        throw new ChannelException({
          code: "FORBIDDEN",
          message: `capability not declared: ${def.capability}`,
          command,
        })
      }
    }

    // Gate ③ — per-session capability evaluation.
    const capability = this.#capabilities.get(def.capability)
    if (!capability) {
      // A registered command references an unregistered capability: server
      // misconfiguration, not a client error. Detail never leaves the server.
      throw new ChannelException({ code: "INTERNAL", message: "internal error", command })
    }
    const session: SessionInfo = { client: ctx.client, sessionId: ctx.sessionId }
    if (!capability.available(session)) {
      const reason = capability.reason !== undefined ? ` (${capability.reason})` : ""
      throw new ChannelException({
        code: "CAPABILITY_UNAVAILABLE",
        message: `capability unavailable: ${def.capability}${reason}`,
        command,
      })
    }

    // Gate ④ — zod validation (the one place args are trusted after, §5).
    const parsed = def.args.safeParse(arg)
    if (!parsed.success) {
      throw new ChannelException({
        code: "INVALID_ARGS",
        message: parsed.error.message,
        command,
      })
    }

    // Handler, then emits-after-resolve (invariant 8).
    const startedAt = Date.now()
    try {
      const result = await handler(ctx, parsed.data)
      for (const topic of def.emits ?? []) {
        this.#bus.publish({ topic })
      }
      this.#audit(ctx, def, "OK", Date.now() - startedAt)
      return result
    } catch (error) {
      if (error instanceof ChannelException) {
        this.#audit(ctx, def, error.code, Date.now() - startedAt)
        throw error
      }
      // Handler threw raw: the frontend only ever sees INTERNAL (§6.2); the real
      // error goes to the audit sink, which carries no arg content.
      this.#audit(ctx, def, "INTERNAL", Date.now() - startedAt)
      throw new ChannelException({ code: "INTERNAL", message: "internal error", command })
    }
  }

  listen(): AsyncIterable<unknown> {
    // ponytail: no streaming command exists yet — cross-session invalidation
    // flows through the EventBus (§8), not channel listen. Add a real stream
    // when a command actually needs server-push over the channel.
    throw new ChannelException({
      code: "CHANNEL_NOT_ALLOWED",
      message: "no listenable channel",
      command: "",
    })
  }

  #audit(
    ctx: CallContext,
    def: CommandDef,
    resultCode: AuditEntry["resultCode"],
    durationMs: number,
  ): void {
    if (!this.#onAudit) return
    this.#onAudit({
      ts: Date.now(),
      sessionId: ctx.sessionId,
      client: ctx.client,
      ...(ctx.pluginId !== undefined ? { pluginId: ctx.pluginId } : {}),
      command: commandId(def),
      capability: def.capability,
      resultCode,
      durationMs,
    })
  }
}

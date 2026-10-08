/**
 * `defineCommand` — the single declaration that ties a channel command to its
 * zod arg/result schemas, the capability gating it, and the events it emits on
 * success (§5.4). schema is the single source of truth; types come from
 * `z.infer`. zod is used only in a type position here, so this file stays
 * runtime-free for the renderer.
 */

import type { z } from "zod"

export interface CommandDef<
  A extends z.ZodTypeAny = z.ZodTypeAny,
  R extends z.ZodTypeAny = z.ZodTypeAny,
> {
  /** '<channel>' — the trust/allow-list unit (§6.1). */
  readonly channel: string
  readonly command: string
  readonly args: A
  readonly result: R
  /** Capability checked at gate 2 (§6.2、§12). */
  readonly capability: string
  /** Invalidation topics the wrapper broadcasts after the handler resolves (§8.4). */
  readonly emits?: readonly string[]
}

export function defineCommand<A extends z.ZodTypeAny, R extends z.ZodTypeAny>(
  def: CommandDef<A, R>,
): CommandDef<A, R> {
  return def
}

/** Fully-qualified command id: '<channel>:<command>'. */
export function commandId(def: Pick<CommandDef, "channel" | "command">): string {
  return `${def.channel}:${def.command}`
}

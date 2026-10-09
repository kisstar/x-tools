/**
 * CapabilityRegistry (§7.2) — the kernel's set of registered capabilities and
 * the per-session evaluator. `evaluate` produces the snapshot list that backs
 * `capability:list` (the channel command lands in Step 4 with its frontend
 * consumer; the registry's evaluator is what it will call).
 */

import type { SessionInfo } from "@x-tools/kernel/session-registry"
import type { Capability, CapabilitySnapshot } from "./capability"

export class CapabilityRegistry {
  readonly #caps = new Map<string, Capability>()

  register(cap: Capability): void {
    if (this.#caps.has(cap.id)) {
      throw new Error(`capability already registered: ${cap.id}`)
    }
    this.#caps.set(cap.id, cap)
  }

  get(id: string): Capability | undefined {
    return this.#caps.get(id)
  }

  evaluate(session: SessionInfo): readonly CapabilitySnapshot[] {
    return [...this.#caps.values()].map((cap) => {
      const available = cap.available(session)
      return {
        id: cap.id,
        available,
        ...(!available && cap.reason !== undefined ? { reason: cap.reason } : {}),
        ...(cap.limits !== undefined ? { limits: cap.limits } : {}),
      }
    })
  }
}

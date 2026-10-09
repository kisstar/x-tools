/**
 * Capability (§7). A capability answers one question per session: "is this
 * action available to THIS caller right now?" — the single place the contract
 * admits the two frontends differ. `available(session)` is the per-session
 * eval (§7.3); `reason` explains an unavailable verdict for `capability:list`;
 * `limits` surfaces honest ceilings instead of silent degradation (invariant 6).
 */

import type { SessionInfo } from "../kernel/session-registry"

export type CapabilityUnavailableReason =
  | "not-implemented"
  | "user-disabled"
  | "permission-denied"
  | "desktop-only"
  | "runtime-unsupported"

export interface Capability {
  readonly id: string
  readonly available: (session: SessionInfo) => boolean
  readonly reason?: CapabilityUnavailableReason
  readonly limits?: Readonly<Record<string, unknown>>
}

/** Per-session view of one capability, returned by `capability:list` (§7.3). */
export interface CapabilitySnapshot {
  readonly id: string
  readonly available: boolean
  readonly reason?: CapabilityUnavailableReason
  readonly limits?: Readonly<Record<string, unknown>>
}

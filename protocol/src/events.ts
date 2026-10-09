/**
 * Event topics (§8). Events are pure invalidation notifications
 * `{ topic, revision, scope? }`; `emits` in a CommandDef references these.
 */

export const FS_CHANGED = "fs.changed"
export const STORAGE_CHANGED = "storage.changed"

export const EVENT_TOPICS = [FS_CHANGED, STORAGE_CHANGED] as const

export type EventTopic = (typeof EVENT_TOPICS)[number]

/**
 * The wire shape of a cross-session invalidation (§8). Pure notification — no
 * payload. `revision` is a monotonic global counter so a reconnecting session
 * can tell with one compare whether it missed an invalidation (§8.3). This is
 * the contract both the server (kernel EventBus) and the client reconstruct.
 */
export interface InvalidationEvent {
  readonly topic: string
  readonly revision: number
  readonly scope?: string
}

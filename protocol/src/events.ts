/**
 * Event topics (§8). Events are pure invalidation notifications
 * `{ topic, revision, scope? }`; `emits` in a CommandDef references these.
 */

export const FS_CHANGED = "fs.changed"
export const STORAGE_CHANGED = "storage.changed"

export const EVENT_TOPICS = [FS_CHANGED, STORAGE_CHANGED] as const

export type EventTopic = (typeof EVENT_TOPICS)[number]

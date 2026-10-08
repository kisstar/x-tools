/**
 * Storage channel commands (§5.4). `get` returns `unknown`; callers narrow.
 * Writes emit `storage.changed` so every connected session invalidates (§8.4).
 */

import { z } from "zod"

import { defineCommand } from "../define-command"
import { STORAGE_CHANGED } from "../events"

export const StorageGetArgs = z.object({ key: z.string().min(1) })
export type StorageGetArgs = z.infer<typeof StorageGetArgs>

export const StorageSetArgs = z.object({
  key: z.string().min(1),
  value: z.unknown(),
})
export type StorageSetArgs = z.infer<typeof StorageSetArgs>

export const StorageRemoveArgs = z.object({ key: z.string().min(1) })
export type StorageRemoveArgs = z.infer<typeof StorageRemoveArgs>

export const StorageClearArgs = z.object({})
export type StorageClearArgs = z.infer<typeof StorageClearArgs>

export const STORAGE_GET = defineCommand({
  channel: "storage",
  command: "get",
  args: StorageGetArgs,
  result: z.unknown(),
  capability: "storage.read",
})

export const STORAGE_SET = defineCommand({
  channel: "storage",
  command: "set",
  args: StorageSetArgs,
  result: z.void(),
  capability: "storage.write",
  emits: [STORAGE_CHANGED],
})

export const STORAGE_REMOVE = defineCommand({
  channel: "storage",
  command: "remove",
  args: StorageRemoveArgs,
  result: z.void(),
  capability: "storage.write",
  emits: [STORAGE_CHANGED],
})

export const STORAGE_CLEAR = defineCommand({
  channel: "storage",
  command: "clear",
  args: StorageClearArgs,
  result: z.void(),
  capability: "storage.write",
  emits: [STORAGE_CHANGED],
})

export const STORAGE_COMMANDS = [
  STORAGE_GET,
  STORAGE_SET,
  STORAGE_REMOVE,
  STORAGE_CLEAR,
] as const

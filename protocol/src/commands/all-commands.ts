/**
 * Single flat registry of every built-in command (§5.4). The channel server
 * builds its validation table from this one array — two transports, one list
 * (invariant 4). Command modules re-export through here so `@x-tools/protocol`
 * exposes the whole contract from its public surface.
 */

export * from "./fs"
export * from "./shell"
export * from "./storage"
export * from "./notification"

import { FS_COMMANDS } from "./fs"
import { NOTIFICATION_COMMANDS } from "./notification"
import { SHELL_COMMANDS } from "./shell"
import { STORAGE_COMMANDS } from "./storage"

export const ALL_COMMANDS = [
  ...FS_COMMANDS,
  ...SHELL_COMMANDS,
  ...STORAGE_COMMANDS,
  ...NOTIFICATION_COMMANDS,
] as const

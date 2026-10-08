/**
 * File-system channel commands (§5.4). Over the channel we standardise byte
 * payloads as a string + encoding, instead of the old `Uint8Array | string`
 * union — one wire shape, no transport-specific branching.
 */

import { z } from "zod"

import { defineCommand } from "../define-command"
import { FS_CHANGED } from "../events"

export const DirEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  isDirectory: z.boolean(),
  isFile: z.boolean(),
  isSymlink: z.boolean(),
})
export type DirEntryData = z.infer<typeof DirEntrySchema>

const Encoding = z.enum(["utf8", "base64"]).default("utf8")

export const FsReadFileArgs = z.object({
  path: z.string().min(1),
  encoding: Encoding,
})
export type FsReadFileArgs = z.infer<typeof FsReadFileArgs>

export const FsWriteFileArgs = z.object({
  path: z.string().min(1),
  data: z.string(),
  encoding: Encoding,
})
export type FsWriteFileArgs = z.infer<typeof FsWriteFileArgs>

export const FsReadDirArgs = z.object({ path: z.string().min(1) })
export type FsReadDirArgs = z.infer<typeof FsReadDirArgs>

export const FsExistsArgs = z.object({ path: z.string().min(1) })
export type FsExistsArgs = z.infer<typeof FsExistsArgs>

export const FsMkdirArgs = z.object({
  path: z.string().min(1),
  recursive: z.boolean().optional(),
})
export type FsMkdirArgs = z.infer<typeof FsMkdirArgs>

export const FsRemoveArgs = z.object({
  path: z.string().min(1),
  recursive: z.boolean().optional(),
})
export type FsRemoveArgs = z.infer<typeof FsRemoveArgs>

export const FS_READ_FILE = defineCommand({
  channel: "fs",
  command: "readFile",
  args: FsReadFileArgs,
  result: z.string(),
  capability: "fs.read",
})

export const FS_WRITE_FILE = defineCommand({
  channel: "fs",
  command: "writeFile",
  args: FsWriteFileArgs,
  result: z.void(),
  capability: "fs.write",
  emits: [FS_CHANGED],
})

export const FS_READ_DIR = defineCommand({
  channel: "fs",
  command: "readDir",
  args: FsReadDirArgs,
  result: z.array(DirEntrySchema),
  capability: "fs.read",
})

export const FS_EXISTS = defineCommand({
  channel: "fs",
  command: "exists",
  args: FsExistsArgs,
  result: z.boolean(),
  capability: "fs.read",
})

export const FS_MKDIR = defineCommand({
  channel: "fs",
  command: "mkdir",
  args: FsMkdirArgs,
  result: z.void(),
  capability: "fs.write",
  emits: [FS_CHANGED],
})

export const FS_REMOVE = defineCommand({
  channel: "fs",
  command: "remove",
  args: FsRemoveArgs,
  result: z.void(),
  capability: "fs.write",
  emits: [FS_CHANGED],
})

export const FS_COMMANDS = [
  FS_READ_FILE,
  FS_WRITE_FILE,
  FS_READ_DIR,
  FS_EXISTS,
  FS_MKDIR,
  FS_REMOVE,
] as const

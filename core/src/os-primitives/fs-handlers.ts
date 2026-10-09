/**
 * fs OS-primitive handlers (§9, OS primitives). Pure node — no electron, so
 * they live in core (invariant 3). The wire payload is a string + encoding;
 * base64 carries bytes, utf8 carries text. Path whitelisting is deferred to the
 * capability/elevation layer (Step 3), not re-checked here.
 */

import { Buffer } from "node:buffer"
import { promises as fsp } from "node:fs"
import { join } from "node:path"

import type {
  DirEntryData,
  FsExistsArgs,
  FsMkdirArgs,
  FsReadDirArgs,
  FsReadFileArgs,
  FsRemoveArgs,
  FsWriteFileArgs,
} from "@x-tools/protocol"

export interface FsHandlers {
  readFile: (args: FsReadFileArgs) => Promise<string>
  writeFile: (args: FsWriteFileArgs) => Promise<void>
  readDir: (args: FsReadDirArgs) => Promise<DirEntryData[]>
  exists: (args: FsExistsArgs) => Promise<boolean>
  mkdir: (args: FsMkdirArgs) => Promise<void>
  remove: (args: FsRemoveArgs) => Promise<void>
}

export function makeFsHandlers(): FsHandlers {
  return {
    async readFile(args) {
      if (args.encoding === "base64") {
        const buffer = await fsp.readFile(args.path)
        return buffer.toString("base64")
      }
      return fsp.readFile(args.path, "utf8")
    },

    async writeFile(args) {
      if (args.encoding === "base64") {
        await fsp.writeFile(args.path, Buffer.from(args.data, "base64"))
        return
      }
      await fsp.writeFile(args.path, args.data, "utf8")
    },

    async readDir(args) {
      const entries = await fsp.readdir(args.path, { withFileTypes: true })
      return entries.map((entry) => ({
        name: entry.name,
        path: join(args.path, entry.name),
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
        isSymlink: entry.isSymbolicLink(),
      }))
    },

    async exists(args) {
      try {
        await fsp.access(args.path)
        return true
      } catch {
        return false
      }
    },

    async mkdir(args) {
      await fsp.mkdir(args.path, { recursive: args.recursive ?? false })
    },

    async remove(args) {
      await fsp.rm(args.path, { recursive: args.recursive ?? false, force: true })
    },
  }
}

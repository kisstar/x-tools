import { promises as fsp, watch as fsWatch } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import type { DirEntry, MkdirOptions, RemoveOptions, FileChangeEvent } from "@x-tools/protocol"

interface WatchEntry {
  close: () => void
}

const watchers = new Map<string, WatchEntry>()

export const fileSystem = {
  async readFile(p: string, encoding?: "utf8" | "binary"): Promise<string | number[]> {
    if (encoding === "binary") {
      const buf = await fsp.readFile(p)
      return Array.from(buf)
    }
    return fsp.readFile(p, "utf8")
  },

  async writeFile(p: string, data: string | number[] | Uint8Array): Promise<void> {
    if (typeof data === "string") return fsp.writeFile(p, data, "utf8")
    const buf = Buffer.from(data instanceof Uint8Array ? data : Uint8Array.from(data))
    return fsp.writeFile(p, buf)
  },

  async readDir(p: string): Promise<DirEntry[]> {
    const entries = await fsp.readdir(p, { withFileTypes: true })
    return entries.map((e) => ({
      name: e.name,
      path: path.join(p, e.name),
      isDirectory: e.isDirectory(),
      isFile: e.isFile(),
      isSymlink: e.isSymbolicLink(),
    }))
  },

  async exists(p: string): Promise<boolean> {
    try {
      await fsp.access(p)
      return true
    } catch {
      return false
    }
  },

  mkdir(p: string, options?: MkdirOptions): Promise<void> {
    return fsp.mkdir(p, { recursive: options?.recursive ?? false }).then(() => undefined)
  },

  remove(p: string, options?: RemoveOptions): Promise<void> {
    return fsp.rm(p, { recursive: options?.recursive ?? false, force: true })
  },

  watch(
    p: string,
    onEvent: (event: { id: string; payload: FileChangeEvent }) => void,
  ): string {
    const id = randomUUID()
    const watcher = fsWatch(p, { recursive: false }, (eventType, filename) => {
      if (!filename) return
      const kind: FileChangeEvent["kind"] = eventType === "rename" ? "create" : "modify"
      onEvent({ id, payload: { path: path.join(p, filename.toString()), kind } })
    })
    watchers.set(id, { close: () => watcher.close() })
    return id
  },

  unwatch(id: string): void {
    watchers.get(id)?.close()
    watchers.delete(id)
  },
}

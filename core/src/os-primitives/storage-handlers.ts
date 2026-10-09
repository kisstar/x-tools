/**
 * storage OS-primitive handlers (§9). A core factory parameterised by baseDir —
 * core knows nothing about electron's userData path; the host injects it
 * (invariant 3). Persists a single flat JSON file:
 *
 *   <baseDir>/preferences.json  →  Record<string, unknown>
 *   e.g. { "theme": "dark", "recentTools": ["a", "b"] }   (2-space pretty, no dates)
 *
 * Updates are immutable: every write builds a new object and flushes it.
 */

import { promises as fsp } from "node:fs"
import { dirname, join } from "node:path"

import type {
  StorageClearArgs,
  StorageGetArgs,
  StorageRemoveArgs,
  StorageSetArgs,
} from "@x-tools/protocol"

export interface StorageHandlers {
  get: (args: StorageGetArgs) => Promise<unknown>
  set: (args: StorageSetArgs) => Promise<void>
  remove: (args: StorageRemoveArgs) => Promise<void>
  clear: (args: StorageClearArgs) => Promise<void>
}

export function makeStorageHandlers(baseDir: string): StorageHandlers {
  const file = join(baseDir, "preferences.json")
  let cache: Record<string, unknown> | null = null

  async function load(): Promise<Record<string, unknown>> {
    if (cache !== null) return cache
    try {
      const raw = await fsp.readFile(file, "utf8")
      cache = JSON.parse(raw) as Record<string, unknown>
    } catch {
      cache = {}
    }
    return cache
  }

  async function flush(data: Record<string, unknown>): Promise<void> {
    cache = data
    await fsp.mkdir(dirname(file), { recursive: true })
    await fsp.writeFile(file, JSON.stringify(data, null, 2), "utf8")
  }

  return {
    async get(args) {
      const data = await load()
      return data[args.key] ?? null
    },

    async set(args) {
      const data = await load()
      await flush({ ...data, [args.key]: args.value })
    },

    async remove(args) {
      const data = await load()
      const next = { ...data }
      delete next[args.key]
      await flush(next)
    },

    async clear() {
      await flush({})
    },
  }
}

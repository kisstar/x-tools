import { app } from "electron"
import { promises as fsp } from "node:fs"
import path from "node:path"

/**
 * Tiny JSON file store for renderer preferences. Wrapped in a single in-memory
 * cache so reads are sync after first load.
 *
 * Future work: swap for `electron-store` once we have validation needs that
 * justify the dependency.
 */

let cache: Record<string, unknown> | null = null
let storeFile: string | null = null

function getStorePath(): string {
  if (!storeFile) {
    storeFile = path.join(app.getPath("userData"), "preferences.json")
  }
  return storeFile
}

async function load(): Promise<Record<string, unknown>> {
  if (cache) return cache
  try {
    const raw = await fsp.readFile(getStorePath(), "utf8")
    cache = JSON.parse(raw) as Record<string, unknown>
  } catch {
    cache = {}
  }
  return cache
}

async function flush(): Promise<void> {
  if (!cache) return
  await fsp.mkdir(path.dirname(getStorePath()), { recursive: true })
  await fsp.writeFile(getStorePath(), JSON.stringify(cache, null, 2), "utf8")
}

export const storage = {
  async get<T>(key: string): Promise<T | null> {
    const data = await load()
    return (data[key] as T | undefined) ?? null
  },
  async set<T>(key: string, value: T): Promise<void> {
    const data = await load()
    data[key] = value
    await flush()
  },
  async remove(key: string): Promise<void> {
    const data = await load()
    delete data[key]
    await flush()
  },
  async clear(): Promise<void> {
    cache = {}
    await flush()
  },
}

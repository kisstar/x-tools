/**
 * switch-host host wiring (§6.5, §9) — the Electron main's half of the plugin:
 * the REAL injected `SwitchHostNodeDeps` and the `contribute` closure that hangs
 * switch-host's two capabilities + two handlers off the shared registries.
 *
 * This is the privileged "HOW" that node/ deliberately left out (node/ decides
 * only WHAT text lands in the hosts file). Core never names switch-host — it
 * exposes the registries and this closure names the plugin, so invariant 7
 * (`grep -rn "switch-host" core/` empty) holds. No electron import here, so the
 * whole file is provable under vitest's node env with a temp hosts path.
 *
 * ponytail: the privileged write is a plain fs write today — correct for a
 * user-writable hosts file, but a real /etc/hosts is root-owned and this will
 * fail with EACCES (surfacing honestly as INTERNAL + an audit line, never a
 * silent no-op). The path-guard, backup, and atomic temp+rename below are the
 * parts that stay correct once elevation lands; swap `writeHostsFileGuarded`'s
 * body for the §6.5 elevate path (fixed whitelist action, content via stdin,
 * path argv checked by this same guard) and nothing above it changes.
 * Also stubbed: the write lock + external-change detection (§6.2) — the backup
 * covers data loss; add the lock when concurrent writers become real.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"

import {
  SWITCH_HOST_LIST_GROUPS,
  SWITCH_HOST_SET_ACTIVE,
} from "@x-tools/protocol"
import type { PluginRegistration } from "@x-tools/core"

import type { HostGroup } from "@x-tools/switch-host/model/host-model"
import {
  createSwitchHostNode,
  type SwitchHostNodeDeps,
} from "@x-tools/switch-host/node/switch-host-node"

const GROUPS_FILE = "switch-host.groups.json"
const HOSTS_BACKUP_FILE = "hosts.backup"
const TMP_SUFFIX = ".xtools.tmp"

/** The one path switch-host is ever allowed to write (§6.1 path whitelist). */
export function hostsFilePathFor(platform: NodeJS.Platform): string {
  return platform === "win32"
    ? "C:\\Windows\\System32\\drivers\\etc\\hosts"
    : "/etc/hosts"
}

/** Write `content` to `path` atomically: temp in the same dir, then rename. */
async function atomicWrite(path: string, content: string): Promise<void> {
  const tmp = `${path}${TMP_SUFFIX}`
  await writeFile(tmp, content, "utf8")
  await rename(tmp, path)
}

/** ENOENT → "" so a first run (no file yet) reads as empty, not a crash. */
async function readOrEmpty(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return ""
    throw error
  }
}

export interface WriteHostsOptions {
  readonly targetPath: string
  /** The sole allowed target; a mismatch is a programming error, not a request. */
  readonly allowedPath: string
  readonly backupDir: string
  readonly content: string
}

/**
 * The privileged write, isolated so its guard is directly testable. Enforces the
 * path whitelist, backs up the current file, then writes atomically. See the
 * file header for what is real now vs. stubbed until elevation lands.
 */
export async function writeHostsFileGuarded(opts: WriteHostsOptions): Promise<void> {
  if (resolve(opts.targetPath) !== resolve(opts.allowedPath)) {
    throw new Error(`refusing to write outside the hosts file: ${opts.targetPath}`)
  }
  await mkdir(opts.backupDir, { recursive: true })
  // Back up the pre-write state before touching the target (§6.2 data integrity).
  const previous = await readOrEmpty(opts.targetPath)
  if (previous !== "") {
    await writeFile(join(opts.backupDir, HOSTS_BACKUP_FILE), previous, "utf8")
  }
  await mkdir(dirname(opts.targetPath), { recursive: true })
  await atomicWrite(opts.targetPath, opts.content)
}

export interface SwitchHostDepsOptions {
  readonly storageBaseDir: string
  /** Overridable so tests point at a temp file instead of the real /etc/hosts. */
  readonly hostsFilePath?: string
}

export function createSwitchHostDeps(options: SwitchHostDepsOptions): SwitchHostNodeDeps {
  const hostsFilePath = options.hostsFilePath ?? hostsFilePathFor(process.platform)
  const groupsPath = join(options.storageBaseDir, GROUPS_FILE)

  return {
    async loadGroups() {
      // ponytail: our own state file, written only by saveGroups — not a trust
      // boundary, so no zod. A hand-corrupted file throws here → INTERNAL +
      // audit, never a silent empty-list that would wipe the user's groups.
      const text = await readOrEmpty(groupsPath)
      if (text === "") return []
      return JSON.parse(text) as readonly HostGroup[]
    },
    async saveGroups(groups) {
      await mkdir(options.storageBaseDir, { recursive: true })
      await atomicWrite(groupsPath, `${JSON.stringify(groups, null, 2)}\n`)
    },
    readHostsFile: () => readOrEmpty(hostsFilePath),
    writeHostsFile: (text) =>
      writeHostsFileGuarded({
        targetPath: hostsFilePath,
        allowedPath: hostsFilePath,
        backupDir: options.storageBaseDir,
        content: text,
      }),
  }
}

/**
 * The `contribute` closure (§9) handed to createChannelServer. Registers the
 * plugin's two capabilities and two handlers over the shared registries — the
 * only place the name "switch-host" appears on the server side.
 *
 * Both capabilities are `available: () => true` on both transports: the backend
 * does the privileged write for whichever frontend asked, so there is no
 * per-session difference to express (this is NOT a desktop-only capability).
 */
export function contributeSwitchHost(
  storageBaseDir: string,
): (reg: PluginRegistration) => void {
  const node = createSwitchHostNode(createSwitchHostDeps({ storageBaseDir }))

  return (reg) => {
    reg.capabilities.register({ id: SWITCH_HOST_LIST_GROUPS.capability, available: () => true })
    reg.capabilities.register({ id: SWITCH_HOST_SET_ACTIVE.capability, available: () => true })

    // listGroups' wire result is a mutable array; node/ returns readonly — copy.
    reg.server.register(SWITCH_HOST_LIST_GROUPS, async () => [...(await node.listGroups())])
    reg.server.register(SWITCH_HOST_SET_ACTIVE, (_ctx, args) => node.setActive(args.activeGroupIds))
  }
}

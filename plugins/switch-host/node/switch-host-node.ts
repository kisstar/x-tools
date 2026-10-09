/**
 * switch-host node/ layer — the SERVER-side handlers for the plugin's two
 * channel commands (§13, §14.1). This is the backend brain: it composes the
 * pure model functions (render / splice / parse) into the read and write flows,
 * and hands back wire shapes for the channel. It owns *what text* lands in
 * /etc/hosts; it does NOT own the privileged *how* — that is injected.
 *
 * All I/O is injected via `SwitchHostNodeDeps` so the whole layer is provable
 * with zero real I/O (same philosophy as `render-hosts-block.ts`). The host
 * (hosts/electron) supplies the real deps and wires these handlers onto the
 * ChannelServer with `server.register(SWITCH_HOST_LIST_GROUPS, …)` — the plugin
 * never imports the channel server (invariant 7 keeps "switch-host" out of
 * core/), and the privileged write lives behind `writeHostsFile`.
 *
 * ponytail: `writeHostsFile` is injected, not implemented here, because the
 * privileged path (§6.5: elevate, atomic temp+rename, backup, lock + external-
 * change detect, content via stdin, core-side path whitelist) is the host-wiring
 * slice. node/ proves the *content* is correct; the host proves the *write* is
 * safe. Upgrade path: implement that dep in hosts/electron, no change here.
 */

import type { HostGroupWire } from "@x-tools/protocol"

import type { HostGroup } from "../model/host-model"
import { parseUnmanagedGroup } from "../model/parse-unmanaged"
import { renderHostsBlock } from "../model/render-hosts-block"
import { spliceHostsFile } from "../model/splice-hosts-file"
import { toHostGroupWire } from "./host-wire"

export interface SwitchHostNodeDeps {
  /** The persisted managed groups (empty array when nothing is stored yet). */
  readonly loadGroups: () => Promise<readonly HostGroup[]>
  /** Persist the managed groups. The host backs this with the storage capability. */
  readonly saveGroups: (groups: readonly HostGroup[]) => Promise<void>
  /** Current /etc/hosts text. */
  readonly readHostsFile: () => Promise<string>
  /**
   * Overwrite /etc/hosts with `text`. The host's impl runs the privileged path
   * (§6.5); see the file header. node/ only decides what `text` is.
   */
  readonly writeHostsFile: (text: string) => Promise<void>
}

export interface SwitchHostNode {
  /** Read flow (§3.3): stored managed groups + the derived read-only unmanaged view. */
  readonly listGroups: () => Promise<readonly HostGroupWire[]>
  /** Write flow: toggle each group's `enabled` by id, persist, re-render /etc/hosts. */
  readonly setActive: (activeGroupIds: readonly string[]) => Promise<void>
}

export function createSwitchHostNode(deps: SwitchHostNodeDeps): SwitchHostNode {
  return {
    async listGroups() {
      const stored = await deps.loadGroups()
      const unmanaged = parseUnmanagedGroup(await deps.readHostsFile())
      const all = unmanaged !== null ? [...stored, unmanaged] : stored
      return all.map(toHostGroupWire)
    },

    async setActive(activeGroupIds) {
      // Only stored (managed) groups are toggled and persisted. The unmanaged
      // group is derived and read-only, so an id that isn't in `stored` (its id,
      // or any stale id) simply never matches — no write, no throw.
      const active = new Set(activeGroupIds)
      const stored = await deps.loadGroups()
      const next = stored.map((group) => ({ ...group, enabled: active.has(group.id) }))
      await deps.saveGroups(next)

      // Render from the just-updated groups, not a re-read — the write reflects
      // exactly what we persisted. splice preserves everything outside the markers
      // (PRD §6.2). The unmanaged group is intentionally absent from `next`, so it
      // is never copied into our managed block.
      const current = await deps.readHostsFile()
      await deps.writeHostsFile(spliceHostsFile(current, renderHostsBlock(next)))
    },
  }
}

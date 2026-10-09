/**
 * switch-host data facade (plugin-data layer, §14.1) — the plugin's only door to
 * the channel. The `ui/` layer calls these methods and never touches the
 * ChannelClient itself (layer rule: plugin-ui must route writes through
 * plugin-data). Each method speaks the typed command id and hands back model
 * types, so the wire never escapes this file.
 *
 * `listGroups` passes `{}` on purpose: the read command's args are `z.object({})`
 * and the server's gate ④ `safeParse`s the request arg, so omitting it (which
 * sends `undefined`) would fail validation. `onProfilesChanged` filters the
 * shared invalidation stream down to this plugin's one topic — other plugins'
 * events flow through the same `subscribe`, so the topic guard is mandatory.
 */

import type { ChannelClient } from "@x-tools/channel-client"
import {
  SWITCH_HOST_LIST_GROUPS,
  SWITCH_HOST_PROFILES_CHANGED,
  SWITCH_HOST_SET_ACTIVE,
  commandId,
} from "@x-tools/protocol"
import type { HostGroupWire } from "@x-tools/protocol"

import type { HostGroup } from "../model/host-model"
import { toHostGroup } from "./host-wire"

export interface SwitchHostData {
  readonly listGroups: () => Promise<readonly HostGroup[]>
  readonly setActive: (activeGroupIds: readonly string[]) => Promise<void>
  /** Run `cb` after each successful write; returns an unsubscribe. */
  readonly onProfilesChanged: (cb: () => void) => () => void
}

export function createSwitchHostData(channel: ChannelClient): SwitchHostData {
  return {
    async listGroups() {
      const wire = await channel.call<readonly HostGroupWire[]>(commandId(SWITCH_HOST_LIST_GROUPS), {})
      return wire.map(toHostGroup)
    },

    async setActive(activeGroupIds) {
      await channel.call<void>(commandId(SWITCH_HOST_SET_ACTIVE), { activeGroupIds })
    },

    onProfilesChanged(cb) {
      return channel.subscribe((event) => {
        if (event.topic === SWITCH_HOST_PROFILES_CHANGED) cb()
      })
    },
  }
}

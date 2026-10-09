/**
 * Wire→model mapping (plugin-data layer, §14.1). The wire shapes are the zod
 * truth in protocol (`HostGroupWire`/`HostEntryWire`); the model shapes are the
 * zod-free domain types in `model/`. This layer is the ONLY place the two meet,
 * so `model/` never learns the wire exists and never imports zod.
 *
 * One direction only: the read path returns groups (wire→model), and the write
 * path (`setActive`) sends ids, not whole groups — so there is no model→wire.
 * ponytail: add the reverse mapper only when a command actually ships a group.
 *
 * Optionals cross via conditional spread, never `x: wire.x`: a wire
 * `z.string().optional()` infers `string | undefined`, and under
 * `exactOptionalPropertyTypes` assigning `undefined` to a `comment?: string`
 * model field is a type error. Absent-stays-absent is also the right data shape.
 */

import type { HostEntryWire, HostGroupWire } from "@x-tools/protocol"

import type { HostEntry, HostGroup } from "../model/host-model"

function toHostEntry(wire: HostEntryWire): HostEntry {
  return {
    id: wire.id,
    ip: wire.ip,
    domain: wire.domain,
    enabled: wire.enabled,
    ...(wire.comment !== undefined ? { comment: wire.comment } : {}),
  }
}

export function toHostGroup(wire: HostGroupWire): HostGroup {
  return {
    id: wire.id,
    name: wire.name,
    entries: wire.entries.map(toHostEntry),
    enabled: wire.enabled,
    pinned: wire.pinned,
    autoEnable: wire.autoEnable,
    readOnly: wire.readOnly,
    createdAt: wire.createdAt,
    updatedAt: wire.updatedAt,
    ...(wire.description !== undefined ? { description: wire.description } : {}),
    ...(wire.color !== undefined ? { color: wire.color } : {}),
  }
}

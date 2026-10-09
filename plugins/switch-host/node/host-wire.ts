/**
 * Model→wire mapping (plugin-node layer) — the mirror of `data/host-wire.ts`.
 * The node/ layer is the SERVER side of the channel: `listGroups`'s result is
 * `z.array(HostGroupWire)` (protocol), so handlers must hand back wire shapes,
 * but all the pure logic (render/splice/parse/detect) speaks the zod-free
 * `model/` types. This file is the one place model becomes wire on the way out,
 * so `model/` still never learns the wire exists (§14.1).
 *
 * Separate from `data/host-wire.ts` on purpose: that one is wire→model for the
 * frontend-facing data/ layer (which imports the channel client); this one is
 * model→wire for the backend node/ layer. Opposite directions, opposite layers
 * — they cannot share without dragging the channel client into node/.
 *
 * Optionals cross via conditional spread, never `x: model.x`: a wire
 * `z.string().optional()` infers `string | undefined`, and under
 * `exactOptionalPropertyTypes` writing `description: undefined` onto the wire
 * object is a type error. Absent-stays-absent is also the right data shape.
 */

import type { HostEntryWire, HostGroupWire } from "@x-tools/protocol"

import type { HostEntry, HostGroup } from "../model/host-model"

function toHostEntryWire(entry: HostEntry): HostEntryWire {
  return {
    id: entry.id,
    ip: entry.ip,
    domain: entry.domain,
    enabled: entry.enabled,
    ...(entry.comment !== undefined ? { comment: entry.comment } : {}),
  }
}

export function toHostGroupWire(group: HostGroup): HostGroupWire {
  return {
    id: group.id,
    name: group.name,
    entries: group.entries.map(toHostEntryWire),
    enabled: group.enabled,
    pinned: group.pinned,
    autoEnable: group.autoEnable,
    readOnly: group.readOnly,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    ...(group.description !== undefined ? { description: group.description } : {}),
    ...(group.color !== undefined ? { color: group.color } : {}),
  }
}

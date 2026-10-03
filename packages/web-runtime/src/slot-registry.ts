import type { Contribution, SlotDefinition, SlotId } from '@xtools/ui-contracts'
import { UiRuntimeError } from './diagnostics.ts'

interface SlotRecord { definition: SlotDefinition, entries: Contribution[] }
export interface UiRegistrySnapshot {
  readonly slots: readonly Readonly<{ definition: SlotDefinition, entries: readonly Contribution[] }>[]
}

export class SlotRegistry {
  private readonly slots = new Map<SlotId, SlotRecord>()
  private frozen = false

  declare(definition: SlotDefinition): () => void {
    this.assertWritable()
    if (this.slots.has(definition.id))
      throw new UiRuntimeError('duplicate_id', `duplicate slot: ${definition.id}`)
    if (definition.id === 'root' && definition.parentId !== undefined)
      throw new UiRuntimeError('invalid_slot', 'root cannot have a parent')
    if (definition.id !== 'root' && definition.parentId !== undefined) {
      const parent = this.slots.get(definition.parentId)
      if (parent === undefined)
        throw new UiRuntimeError('missing_parent', `missing parent slot: ${definition.parentId}`)
      const occupant = parent.entries[0]
      if (occupant === undefined || occupant.ownerId !== definition.ownerId)
        throw new UiRuntimeError('slot_owner', `slot owner ${definition.ownerId} does not own parent ${definition.parentId}`)
    }
    const record: SlotRecord = { definition, entries: [] }
    this.slots.set(definition.id, record)
    return () => {
      if (this.slots.get(definition.id) !== record)
        return
      for (const child of [...this.slots.values()]) {
        if (child.definition.parentId === definition.id)
          this.removeTree(child.definition.id)
      }
      this.slots.delete(definition.id)
    }
  }

  contribute<T>(slotId: SlotId, entry: Contribution<T>): () => void {
    this.assertWritable()
    const slot = this.slots.get(slotId)
    if (slot === undefined)
      throw new UiRuntimeError('missing_slot', `missing slot: ${slotId}`)
    if (slot.entries.some(value => value.id === entry.id))
      throw new UiRuntimeError('duplicate_id', `duplicate contribution: ${entry.id}`)
    if (slot.definition.kind === 'single' && slot.entries.length > 0)
      throw new UiRuntimeError('slot_cardinality', `single slot already occupied: ${slotId}`)
    if (slot.definition.kind === 'keyed') {
      if (entry.key === undefined)
        throw new UiRuntimeError('slot_key', `keyed slot requires key: ${slotId}`)
      if (slot.entries.some(value => value.key === entry.key))
        throw new UiRuntimeError('duplicate_key', `duplicate key: ${entry.key}`)
    }
    slot.entries.push(entry)
    this.sort(slot.entries)
    return () => {
      const index = slot.entries.indexOf(entry)
      if (index >= 0)
        slot.entries.splice(index, 1)
    }
  }

  entries(slotId: SlotId): readonly Contribution[] { return this.slots.get(slotId)?.entries ?? [] }
  freeze(): UiRegistrySnapshot {
    this.frozen = true
    return this.snapshot()
  }

  snapshot(): UiRegistrySnapshot {
    return Object.freeze({
      slots: Object.freeze([...this.slots.values()].map(slot => Object.freeze({
        definition: slot.definition,
        entries: Object.freeze([...slot.entries]),
      }))),
    })
  }

  private assertWritable(): void {
    if (this.frozen)
      throw new UiRuntimeError('registry_frozen', 'registry is frozen')
  }

  private sort(entries: Contribution[]): void {
    entries.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id))
  }

  private removeTree(id: SlotId): void {
    for (const child of [...this.slots.values()]) {
      if (child.definition.parentId === id)
        this.removeTree(child.definition.id)
    }
    this.slots.delete(id)
  }
}

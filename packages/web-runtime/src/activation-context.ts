import type { Contribution, ModuleId, RendererDescriptor, SlotDefinition, SlotId } from '@xtools/ui-contracts'
import type { SlotRegistry } from './slot-registry.ts'

export interface UiActivationContext { declareSlot(definition: SlotDefinition): void; contribute<T>(slotId: SlotId, entry: Contribution<T>): void; registerRenderer(value: RendererDescriptor): void }

export class TransactionalActivationContext implements UiActivationContext {
  readonly disposers: (() => void)[] = []
  readonly renderers: RendererDescriptor[] = []
  constructor(private readonly moduleId: ModuleId, private readonly registry: SlotRegistry) {}
  declareSlot(definition: SlotDefinition): void {
    if (definition.ownerId !== this.moduleId) throw new Error(`module ${this.moduleId} cannot declare for ${definition.ownerId}`)
    this.disposers.push(this.registry.declare(definition))
  }
  contribute<T>(slotId: SlotId, entry: Contribution<T>): void {
    if (entry.ownerId !== this.moduleId) throw new Error(`module ${this.moduleId} cannot contribute for ${entry.ownerId}`)
    this.disposers.push(this.registry.contribute(slotId, entry))
  }
  registerRenderer(value: RendererDescriptor): void {
    if (this.renderers.some(renderer => renderer.id === value.id)) throw new Error(`duplicate renderer: ${value.id}`)
    this.renderers.push(value)
    this.disposers.push(() => { const index = this.renderers.indexOf(value); if (index >= 0) this.renderers.splice(index, 1) })
  }
  rollback(): void { for (const dispose of this.disposers.reverse()) dispose() }
}

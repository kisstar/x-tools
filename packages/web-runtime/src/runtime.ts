import type { ModuleId, RendererDescriptor, UiDiagnostic } from '@xtools/ui-contracts'
import type { UiModule } from './module.ts'
import type { UiRegistrySnapshot } from './slot-registry.ts'
import { TransactionalActivationContext } from './activation-context.ts'
import { SlotRegistry } from './slot-registry.ts'

type RuntimeState = 'created' | 'activating' | 'frozen' | 'serving' | 'stopping' | 'stopped'
interface Activated { readonly module: UiModule, readonly ctx: TransactionalActivationContext }

export class WebRuntime {
  private state: RuntimeState = 'created'
  private readonly registry = new SlotRegistry()
  private readonly activated: Activated[] = []
  private readonly activationDiagnostics: UiDiagnostic[] = []

  async activate(modules: readonly UiModule[], requiredIds: readonly ModuleId[]): Promise<void> {
    if (this.state !== 'created')
      throw new Error(`cannot activate from ${this.state}`)
    const manifests = modules.map(module => ({ module, manifest: module.manifest() }))
    const ids = new Set(manifests.map(value => value.manifest.id))
    const missing = requiredIds.filter(id => !ids.has(id))
    if (missing.length > 0)
      throw new Error(`required modules missing: ${missing.join(', ')}`)
    this.state = 'activating'
    for (const { module, manifest } of manifests) {
      const ctx = new TransactionalActivationContext(manifest.id, this.registry)
      try {
        await module.activate(ctx)
        this.activated.push({ module, ctx })
      }
      catch (error) {
        ctx.rollback()
        if (requiredIds.includes(manifest.id)) {
          await this.rollbackActivated()
          this.state = 'stopped'
          throw error
        }
        this.activationDiagnostics.push(Object.freeze({
          code: 'plugin_activation_failed',
          message: `plugin ${manifest.id} activation failed: ${error instanceof Error ? error.message : String(error)}`,
          sourceId: manifest.id,
        }))
      }
    }
  }

  freeze(): UiRegistrySnapshot {
    if (this.state !== 'activating')
      throw new Error(`cannot freeze from ${this.state}`)
    const snapshot = this.registry.freeze()
    this.state = 'frozen'
    return snapshot
  }

  serve(): void {
    if (this.state !== 'frozen')
      throw new Error(`cannot serve from ${this.state}`)
    this.state = 'serving'
  }

  registrySnapshot(): UiRegistrySnapshot { return this.registry.snapshot() }
  rendererSnapshot(): readonly RendererDescriptor[] {
    return Object.freeze(this.activated.flatMap(entry => [...entry.ctx.renderers]))
  }

  diagnostics(): readonly UiDiagnostic[] { return Object.freeze([...this.activationDiagnostics]) }

  async stop(): Promise<void> {
    if (this.state === 'stopped')
      return
    this.state = 'stopping'
    await this.rollbackActivated()
    this.state = 'stopped'
  }

  private async rollbackActivated(): Promise<void> {
    for (const { module, ctx } of this.activated.reverse()) {
      try {
        await module.deactivate()
      }
      finally {
        ctx.rollback()
      }
    }
    this.activated.length = 0
  }
}

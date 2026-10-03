import type { ModuleId } from '@xtools/ui-contracts'
import type { UiActivationContext } from './activation-context.ts'

export interface UiModuleManifest { readonly id: ModuleId, readonly dependsOn: readonly ModuleId[] }
export interface UiModule {
  manifest: () => UiModuleManifest
  activate: (ctx: UiActivationContext) => void | Promise<void>
  deactivate: () => void | Promise<void>
}

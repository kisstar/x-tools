import type { ModuleId, SlotId } from './ids.ts'

export type SlotKind = 'single' | 'list' | 'keyed'
export type SlotScope = 'root' | 'container' | 'workspace'
export interface SlotDefinition { readonly id: SlotId; readonly ownerId: ModuleId; readonly parentId?: SlotId; readonly kind: SlotKind; readonly scope: SlotScope; readonly major: number }
export interface Contribution<T = unknown> { readonly id: string; readonly ownerId: ModuleId; readonly value: T; readonly key?: string; readonly order?: number }

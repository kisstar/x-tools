type Brand<T, N extends string> = T & { readonly __brand: N }

export type ModuleId = Brand<string, 'ModuleId'>
export type SlotId = Brand<string, 'SlotId'>
export type RendererId = Brand<string, 'RendererId'>
export type ContainerId = Brand<string, 'ContainerId'>
export type ViewId = Brand<string, 'ViewId'>

const ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9-]*)*$/

function createId<T extends string>(value: string): T {
  if (!ID_PATTERN.test(value)) throw new Error(`invalid id: ${value}`)
  return value as T
}

export const createModuleId = (value: string): ModuleId => createId(value)
export const createSlotId = (value: string): SlotId => createId(value)
export const createRendererId = (value: string): RendererId => createId(value)
export const createContainerId = (value: string): ContainerId => createId(value)
export const createViewId = (value: string): ViewId => createId(value)

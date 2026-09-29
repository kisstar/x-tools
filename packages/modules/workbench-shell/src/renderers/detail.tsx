import type { DetailRendererProps } from '@xtools/ui-contracts'
export const DefaultDetail = ({ selectionId }: DetailRendererProps) => selectionId === undefined ? null : <aside data-selection={selectionId} />

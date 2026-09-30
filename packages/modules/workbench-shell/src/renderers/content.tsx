import type { ContentRendererProps } from '@xtools/ui-contracts'
export const DefaultContent = (props: ContentRendererProps) => {
  const View = props.view
  return View === undefined ? <div role="status">view unavailable: {props.viewId}</div> : <View {...props} />
}

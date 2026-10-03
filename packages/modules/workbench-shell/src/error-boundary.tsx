import type { ReactNode } from 'react'
import { Component } from 'react'

interface Props { readonly region: string, readonly children: ReactNode }
interface State { readonly error?: Error }

export class RegionErrorBoundary extends Component<Props, State> {
  state: State = {}
  static getDerivedStateFromError(error: Error): State { return { error } }
  render(): ReactNode {
    if (this.state.error !== undefined) {
      return (
        <div role="alert">
          {this.props.region}
          :
          {' '}
          {this.state.error.message}
        </div>
      )
    }
    return this.props.children
  }
}

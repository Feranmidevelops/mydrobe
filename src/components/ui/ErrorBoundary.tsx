import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  /** Shown once the children have crashed; a function gets a way to try them again. */
  fallback: ReactNode | ((retry: () => void) => ReactNode)
  /** Names what crashed, for the console. */
  label: string
  children: ReactNode
}

/** Catches a crash below it and shows the fallback instead of a blank page. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.label} crashed`, error, info.componentStack)
  }

  retry = () => this.setState({ failed: false })

  render() {
    if (!this.state.failed) return this.props.children
    const { fallback } = this.props
    return typeof fallback === 'function' ? fallback(this.retry) : fallback
  }
}

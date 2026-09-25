import { Component, type ReactNode } from 'react'

import {
  downloadDiagnosticExport,
  recordDiagnostic,
  setDiagnosticStage,
} from '../diagnostics/diagnostics'

type AppErrorBoundaryProps = { children: ReactNode }
type AppErrorBoundaryState = { failed: boolean }

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    setDiagnosticStage('app:render')
    recordDiagnostic('APP_RENDER_FAILURE', error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="fatal-error" role="alert">
        <p className="eyebrow">Error code · APP_RENDER_FAILURE</p>
        <h1>Signum could not render this transmission.</h1>
        <p>
          Reload the page to recover. If it happens again, export the local
          diagnostics file and share it with support; it contains no wallet,
          wager, balance, or signal history.
        </p>
        <div>
          <button type="button" onClick={() => window.location.reload()}>
            Reload Signum
          </button>
          <button type="button" onClick={downloadDiagnosticExport}>
            Export diagnostics
          </button>
        </div>
      </main>
    )
  }
}

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  clearDiagnosticEventsForTest,
  createDiagnosticExport,
} from '../diagnostics/diagnostics'
import { AppErrorBoundary } from './AppErrorBoundary'

afterEach(() => {
  cleanup()
  clearDiagnosticEventsForTest()
  vi.restoreAllMocks()
})

describe('AppErrorBoundary', () => {
  it('shows a recoverable privacy-safe error screen', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(
      <AppErrorBoundary>
        <BrokenComponent />
      </AppErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('APP_RENDER_FAILURE')
    expect(screen.getByRole('button', { name: 'Reload Signum' })).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Export diagnostics' }),
    ).toBeVisible()
    expect(createDiagnosticExport().events[0]).toMatchObject({
      code: 'APP_RENDER_FAILURE',
      stage: 'app:render',
      errorType: 'Error',
    })
  })
})

function BrokenComponent(): never {
  throw new Error('sensitive internal message')
}

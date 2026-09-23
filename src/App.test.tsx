import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import manifest from '../public/game.manifest.json'
import { App } from './App'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('loads directly without a host, wallet, or bridge exception', () => {
    render(<App environment="standalone" />)

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Send a signal. Catch its echo.',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('complementary', { name: 'Standalone preview' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Pulse')).toBeInTheDocument()
    expect(screen.getByText('Carrier')).toBeInTheDocument()
    expect(screen.getByText('Deepwave')).toBeInTheDocument()
  })

  it('shows an accessible loading state while embedded host setup runs', () => {
    render(<App environment="embedded" />)

    expect(screen.getByRole('status')).toHaveTextContent('Connecting to Chain')
  })

  it('reports changing content height without surfacing host errors', async () => {
    let resize: ResizeObserverCallback | undefined
    const disconnect = vi.fn()
    const reportContentSize = vi.fn().mockRejectedValue(new Error('detached'))

    class ResizeObserverStub {
      constructor(callback: ResizeObserverCallback) {
        resize = callback
      }

      observe() {}
      disconnect = disconnect
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    render(<App environment="embedded" reportContentSize={reportContentSize} />)

    await waitFor(() => expect(reportContentSize).toHaveBeenCalledTimes(1))
    resize?.([], {} as ResizeObserver)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})

describe('game manifest', () => {
  it('declares the canonical Signum iframe capabilities', () => {
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      gameId: 'signum',
      apiVersion: 1,
      defaultLocale: 'en',
      presentation: {
        mode: 'full-iframe',
      },
      capabilities: {
        openSession: true,
        submitAction: false,
        forfeitExpiredSession: false,
        cancelStuckRandomness: true,
        resize: true,
      },
    })
  })
})

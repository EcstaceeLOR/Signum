import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { HostSnapshotV1 } from '@chain/casino-sdk/guest'

import manifest from '../public/game.manifest.json'
import { App } from './App'
import type { ChainHostStatus } from './bridge/chainHost'
import type { ChainHostClient } from './bridge/useChainHost'

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
    render(<App environment="embedded" host={hostPresentation()} />)

    expect(
      screen.getByRole('status', { name: 'Chain host status' }),
    ).toHaveTextContent('Connecting to Chain')
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
    render(
      <App
        environment="embedded"
        host={hostPresentation({
          status: 'connected',
          snapshot: hostSnapshot('ready'),
          canPlay: true,
          reportContentSize,
        })}
      />,
    )

    await waitFor(() => expect(reportContentSize).toHaveBeenCalledTimes(1))
    resize?.([], {} as ResizeObserver)
    expect(
      screen.getByRole('status', { name: 'Chain host status' }),
    ).toHaveTextContent('Chain host ready')
  })

  it('keeps play unavailable when the host wallet is disconnected', () => {
    render(
      <App
        environment="embedded"
        host={hostPresentation({
          status: 'connected',
          snapshot: hostSnapshot('disconnected'),
        })}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Wallet disconnected')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'never requests wallet access directly',
    )
  })

  it('offers bridge recovery for session-key and connection failures', () => {
    const retry = vi.fn()
    const { rerender } = render(
      <App
        environment="embedded"
        host={hostPresentation({
          status: 'connected',
          snapshot: hostSnapshot('session-key-mismatch'),
          retry,
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }))
    expect(retry).toHaveBeenCalledTimes(1)

    rerender(
      <App
        environment="embedded"
        host={hostPresentation({
          status: 'error',
          error: 'Handshake timed out.',
          retry,
        })}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalledTimes(2)
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

type HostPresentation = {
  status: ChainHostStatus
  snapshot: HostSnapshotV1 | null
  error: string | null
  canPlay: boolean
  openSession: ChainHostClient['openSession']
  cancelStuckRandomness: ChainHostClient['cancelStuckRandomness']
  revealOutcome: ChainHostClient['revealOutcome']
  reportContentSize: (input: { minHeight: number }) => Promise<void>
  retry: () => void
}

function hostPresentation(
  overrides: Partial<HostPresentation> = {},
): HostPresentation {
  return {
    status: 'connecting',
    snapshot: null,
    error: null,
    canPlay: false,
    openSession: vi.fn(async () => ({
      sessionKey: 'session-key',
      transactionHash: '0x1234' as const,
    })),
    cancelStuckRandomness: vi.fn(async () => ({
      transactionHash: '0x5678' as const,
    })),
    revealOutcome: vi.fn(async () => undefined),
    reportContentSize: vi.fn(async () => undefined),
    retry: vi.fn(),
    ...overrides,
  }
}

function hostSnapshot(
  walletStatus: HostSnapshotV1['wallet']['status'],
): HostSnapshotV1 {
  return {
    apiVersion: 1,
    integration: {
      chainId: 31337,
      slug: 'signum',
      gameAddress: '0x0000000000000000000000000000000000000001',
      manifest: {
        schemaVersion: 1,
        gameId: 'signum',
        apiVersion: 1,
        defaultLocale: 'en',
        locales: { en: { name: 'Signum' } },
      },
    },
    wallet: { status: walletStatus },
    token: { symbol: 'chUSD', decimals: 18 },
    balances: { smartVaultBalance: '1000000000000000000' },
    sessions: { items: [] },
    ui: { locale: 'en', theme: 'dark' },
  }
}

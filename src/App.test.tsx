import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { HostSnapshotV1 } from '@chain/casino-sdk/guest'

import manifest from '../public/game.manifest.json'
import { App } from './App'
import type { ChainHostStatus } from './bridge/chainHost'
import type { ChainHostClient } from './bridge/useChainHost'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
})

describe('App', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/play/pulse')
    vi.stubGlobal('scrollTo', vi.fn())
  })

  it('loads the play route as a clearly labelled playable demo', () => {
    render(<App environment="standalone" />)

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Send a signal. Catch its echo.',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('complementary', {
        name: 'DEMO · No real wager or on-chain settlement',
      }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Demo balance')).toHaveTextContent(
      '1000 credits',
    )
    expect(
      screen.getByRole('button', { name: 'Transmit demo wager' }),
    ).toBeEnabled()
    expect(
      screen.queryByLabelText('Smart Vault balance'),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Pulse')).toBeInTheDocument()
    expect(screen.getByText('Carrier')).toBeInTheDocument()
    expect(screen.getByText('Deepwave')).toBeInTheDocument()
  })

  it('offers a replayable keyboard-accessible first-run guide', () => {
    render(<App environment="standalone" />)

    expect(
      screen.getByRole('heading', {
        name: 'Compose. Transmit. Match the echo.',
      }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Skip guide' }))
    expect(readSavedPreferences()).toMatchObject({ tutorialComplete: true })
    expect(
      screen.queryByRole('heading', {
        name: 'Compose. Transmit. Match the echo.',
      }),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'How to play' }))
    expect(
      screen.getByRole('heading', {
        name: 'Compose. Transmit. Match the echo.',
      }),
    ).toBeInTheDocument()
  })

  it('labels the deterministic showcase separately from normal demo play', async () => {
    vi.useFakeTimers()
    const random = vi.spyOn(globalThis.crypto, 'getRandomValues')
    render(<App environment="standalone" showcase />)

    expect(
      screen.getByRole('complementary', {
        name: 'SHOWCASE · Deterministic perfect echo · No real wager',
      }),
    ).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Transmit demo wager' }),
      )
      await Promise.resolve()
    })
    expect(random).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(700))
    fireEvent.click(screen.getByRole('button', { name: 'Skip reveal' }))
    expect(
      screen.getByRole('heading', { name: 'Perfect echo' }),
    ).toBeInTheDocument()
  })

  it('plays and resets a local demo without wallet or on-chain claims', async () => {
    vi.useFakeTimers()
    const random = vi
      .spyOn(globalThis.crypto, 'getRandomValues')
      .mockImplementation((array) => {
        const bytes = new Uint8Array(
          array.buffer,
          array.byteOffset,
          array.byteLength,
        )
        bytes.fill(0)
        bytes[bytes.length - 1] = 5
        return array
      })
    render(<App environment="standalone" />)

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Transmit demo wager' }),
      )
      await Promise.resolve()
    })
    expect(random).toHaveBeenCalledOnce()
    expect(
      screen.getByText('Demo transmission opened. Generating a local echo…'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Transaction/)).not.toBeInTheDocument()

    act(() => vi.advanceTimersByTime(700))
    expect(
      screen.getByRole('heading', { name: 'Receiving the local echo' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Skip reveal' }))

    expect(
      screen.getByRole('heading', { name: 'Perfect echo' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Settled payout')).toHaveTextContent(
      '7.4 credits',
    )
    expect(
      screen.getAllByText('DEMO · No real wager or on-chain settlement'),
    ).toHaveLength(2)
    expect(screen.queryByText(/settled on Chain/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }))
    expect(screen.getByLabelText('Demo balance')).toHaveTextContent(
      '1000 credits',
    )
    expect(
      screen.getByRole('button', { name: 'Transmit demo wager' }),
    ).toBeEnabled()
    expect(screen.queryByLabelText('Settled result')).not.toBeInTheDocument()
  })

  it('returns the demo stake when secure local simulation fails', async () => {
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(() => {
      throw new Error('randomness unavailable')
    })
    render(<App environment="standalone" />)

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Transmit demo wager' }),
      )
      await Promise.resolve()
    })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Demo round could not be simulated',
    )
    expect(screen.getByLabelText('Demo balance')).toHaveTextContent(
      '1000 credits',
    )
  })

  it('shows an accessible loading state while embedded host setup runs', () => {
    render(<App environment="embedded" host={hostPresentation()} />)

    expect(
      screen.getByRole('status', { name: 'Chain host status' }),
    ).toHaveTextContent('Connecting to Chain')
  })

  it('requires eligibility acknowledgement before real Chain play', () => {
    render(
      <App
        environment="embedded"
        host={hostPresentation({
          status: 'connected',
          snapshot: hostSnapshot('ready'),
          canPlay: true,
        })}
      />,
    )

    const acknowledgement = screen.getByRole('checkbox', {
      name: /I confirm I meet the legal gambling age/,
    })
    expect(
      screen.getByRole('button', { name: 'Transmit 1 chUSD' }),
    ).toBeDisabled()
    fireEvent.click(acknowledgement)
    expect(
      screen.getByRole('button', { name: 'Transmit 1 chUSD' }),
    ).toBeEnabled()
    expect(readSavedPreferences()).toMatchObject({
      eligibilityAccepted: true,
    })
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
  getRandomnessVerification: ChainHostClient['getRandomnessVerification']
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
    getRandomnessVerification: vi.fn(async () => ({
      supported: false,
      chainId: 31337,
      requests: [],
    })),
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
    casino: {
      maxBetAmount: '1000000000000000000',
      maxAllowedReservedProfit: '100000000000000000000',
    },
    sessions: { items: [] },
    ui: { locale: 'en', theme: 'dark' },
  }
}

function readSavedPreferences(): Record<string, unknown> {
  const raw = window.localStorage.getItem('signum.preferences')
  expect(raw).not.toBeNull()
  return (
    (JSON.parse(raw ?? '{}') as { data?: Record<string, unknown> }).data ?? {}
  )
}

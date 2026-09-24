import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { HostSnapshotV1 } from '@chain/casino-sdk/guest'

import type { ChainHostClient } from '../bridge/useChainHost'
import { SignalWorkbench } from './SignalWorkbench'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('WagerControls', () => {
  it('shows authoritative wallet data and submits base units with gameData', async () => {
    const openSession = successfulOpenSession()
    renderWorkbench(openSession)

    expect(screen.getByLabelText('Smart Vault balance')).toHaveTextContent(
      '5 USDC',
    )
    expect(screen.getByText('Allowed 1–10 USDC')).toBeInTheDocument()
    expect(
      screen.getByText('Maximum return 7.4 USDC at 7.40×'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Transmit 1 USDC' }))

    await waitFor(() =>
      expect(openSession).toHaveBeenCalledWith({
        wager: '1000000',
        gameData: '0x01000500',
      }),
    )
    expect(
      await screen.findByText('Transmission opened. Awaiting a verified echo…'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Awaiting Chain…' }),
    ).toBeDisabled()
    expect(screen.getByRole('radio', { name: /Pulse/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Beat 1: Tap' })).toBeDisabled()
  })

  it('blocks malformed, below-minimum, above-limit, and unfunded wagers', () => {
    const openSession = successfulOpenSession()
    renderWorkbench(openSession)
    const input = screen.getByLabelText('Wager amount')

    fireEvent.change(input, { target: { value: '1.0000001' } })
    expect(screen.getByText(/up to 6 decimal places/)).toBeInTheDocument()

    fireEvent.change(input, { target: { value: '0.5' } })
    expect(
      screen.getByText('Wager must be at least 1 USDC.'),
    ).toBeInTheDocument()

    fireEvent.change(input, { target: { value: '11' } })
    expect(
      screen.getByText('Wager must be no more than 10 USDC for this receiver.'),
    ).toBeInTheDocument()

    fireEvent.change(input, { target: { value: '6' } })
    expect(
      screen.getByText('Your balance is below this wager.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Transmit' })).toBeDisabled()
    expect(openSession).not.toHaveBeenCalled()
  })

  it('locks synchronously so repeated clicks create only one session', () => {
    let resolveSession: ((value: SessionResult) => void) | undefined
    const openSession = vi.fn(
      () =>
        new Promise<SessionResult>((resolve) => {
          resolveSession = resolve
        }),
    )
    renderWorkbench(openSession)

    const transmit = screen.getByRole('button', { name: 'Transmit 1 USDC' })
    fireEvent.click(transmit)
    fireEvent.click(transmit)

    expect(openSession).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/Do not close this window/)).toBeInTheDocument()

    resolveSession?.({ sessionKey: 'session-1', transactionHash: '0x1234' })
  })

  it('unlocks with actionable guidance when the host rejects before creation', async () => {
    const openSession = vi
      .fn<ChainHostClient['openSession']>()
      .mockRejectedValueOnce(new Error('Host rejected the request.'))
      .mockResolvedValueOnce({
        sessionKey: 'session-2',
        transactionHash: '0x5678',
      })
    renderWorkbench(openSession)

    fireEvent.click(screen.getByRole('button', { name: 'Transmit 1 USDC' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Host rejected the request.',
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your signal is still here.',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Transmit 1 USDC' }))
    await waitFor(() => expect(openSession).toHaveBeenCalledTimes(2))
  })

  it('recovers the committed draft and offers cancellation only after a delay', async () => {
    const cancelStuckRandomness = successfulCancellation()
    const recovered = hostSnapshot([
      sessionRow({
        wager: '2000000',
        raw: { gameData: '0x0102ff00', openTransactionHash: '0x1234' },
        openedAt: Date.now() - 21_000,
      }),
    ])
    render(
      <SignalWorkbench
        host={{
          snapshot: recovered,
          openSession: successfulOpenSession(),
          cancelStuckRandomness,
        }}
      />,
    )

    expect(screen.getByRole('radio', { name: /Deepwave/ })).toBeChecked()
    expect(screen.getAllByRole('button', { name: /^Beat/ })).toHaveLength(8)
    expect(screen.getByRole('button', { name: 'Beat 8: Tap' })).toBeDisabled()
    expect(screen.getByLabelText('Wager amount')).toHaveValue('2')
    expect(
      screen.getByText(/still producing your verified echo/),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Cancel delayed request' }),
    )
    await waitFor(() =>
      expect(cancelStuckRandomness).toHaveBeenCalledWith({ sessionId: '1' }),
    )
    expect(
      screen.getByText('Cancellation requested. Waiting for Chain to confirm.'),
    ).toBeInTheDocument()
  })

  it('does not regress a settled session when a stale snapshot arrives', () => {
    vi.useFakeTimers()
    const settled = sessionRow({
      phase: 3,
      phaseName: 'SETTLED',
      payout: '7400000',
      isSettled: true,
      raw: {
        gameData: '0x01000500',
        gameState: '0x010005050403',
        openTransactionHash: '0x1234',
      },
    })
    const openSession = successfulOpenSession()
    const cancelStuckRandomness = successfulCancellation()
    const { rerender } = render(
      <SignalWorkbench
        host={{
          snapshot: hostSnapshot([settled]),
          openSession,
          cancelStuckRandomness,
        }}
      />,
    )

    expect(screen.getByText(/Preparing the settled reveal/)).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(600))
    expect(screen.getByText('Echo settled on Chain.')).toBeInTheDocument()

    rerender(
      <SignalWorkbench
        host={{
          snapshot: hostSnapshot([sessionRow()]),
          openSession,
          cancelStuckRandomness,
        }}
      />,
    )
    expect(screen.getByText('Echo settled on Chain.')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Compose another signal' }),
    )
    expect(
      screen.getByRole('button', { name: 'Transmit 1 USDC' }),
    ).toBeEnabled()
  })

  it('disables wagering rather than guessing absent token or limit data', () => {
    const openSession = successfulOpenSession()
    const missingMetadata = hostSnapshot()
    missingMetadata.token = {}
    missingMetadata.casino = undefined

    render(
      <SignalWorkbench
        host={{
          snapshot: missingMetadata,
          openSession,
          cancelStuckRandomness: successfulCancellation(),
        }}
      />,
    )

    expect(screen.getByLabelText('Smart Vault balance')).toHaveTextContent(
      'Unavailable',
    )
    expect(screen.getByText(/complete token details/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Transmit' })).toBeDisabled()
    expect(openSession).not.toHaveBeenCalled()
  })
})

type SessionResult = Awaited<ReturnType<ChainHostClient['openSession']>>

function successfulOpenSession() {
  return vi.fn<ChainHostClient['openSession']>(async () => ({
    sessionKey: 'session-1',
    transactionHash: '0x1234',
  }))
}

function renderWorkbench(openSession: ChainHostClient['openSession']) {
  return render(
    <SignalWorkbench
      host={{
        snapshot: hostSnapshot(),
        openSession,
        cancelStuckRandomness: successfulCancellation(),
      }}
    />,
  )
}

function successfulCancellation() {
  return vi.fn<ChainHostClient['cancelStuckRandomness']>(async () => ({
    transactionHash: '0x5678',
  }))
}

type HostSession = HostSnapshotV1['sessions']['items'][number]

function sessionRow(overrides: Partial<HostSession> = {}): HostSession {
  return {
    sessionId: '1',
    sessionKey: 'session-1',
    gameAddress: '0x0000000000000000000000000000000000000001',
    phase: 1,
    phaseName: 'WAITING_RANDOMNESS',
    wager: '1000000',
    isSettled: false,
    openedAt: Date.now(),
    lastEventTimestamp: Date.now(),
    raw: { gameData: '0x01000500' },
    ...overrides,
  }
}

function hostSnapshot(items: HostSession[] = []): HostSnapshotV1 {
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
    wallet: { status: 'ready' },
    token: { symbol: 'USDC', decimals: 6 },
    balances: { smartVaultBalance: '5000000' },
    casino: {
      maxBetAmount: '10000000',
      maxAllowedReservedProfit: '1000000000000',
    },
    sessions: { items },
    ui: { locale: 'en', theme: 'dark' },
  }
}

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ReceiverMode } from '../game/encoding'
import type { SignumSessionState } from '../game/sessionMachine'
import { SignalReveal } from './SignalReveal'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('SignalReveal', () => {
  it.each([
    [0, 0, 'Signal faded'],
    [1, 4, 'Faint echo'],
    [2, 5, 'Echo held'],
    [3, 6, 'Strong resonance'],
    [4, 7, 'Deep resonance'],
    [5, 8, 'Perfect echo'],
  ])(
    'renders payout tier %i with its own finish',
    (payoutTier, matchCount, heading) => {
      const { container } = render(
        <SignalReveal
          state={settledState(payoutTier, matchCount)}
          onComplete={vi.fn()}
          onPlayAgain={vi.fn()}
        />,
      )

      expect(container.querySelector('.signal-reveal')).toHaveAttribute(
        'data-payout-tier',
        String(payoutTier),
      )
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
      expect(screen.getAllByRole('listitem')).toHaveLength(8)
    },
  )

  it('moves focus to the result heading when settlement completes', () => {
    render(
      <SignalReveal
        state={settledState(3, 6)}
        onComplete={vi.fn()}
        onPlayAgain={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Strong resonance' }),
    ).toHaveFocus()
  })
})

type SettledState = Extract<SignumSessionState, { status: 'SETTLED' }>

function settledState(payoutTier: number, matchCount: number): SettledState {
  return {
    status: 'SETTLED',
    wager: '1000000',
    gameData: '0x0102aa00',
    startedAt: 1,
    sessionKey: `session-${payoutTier}`,
    sessionId: String(payoutTier + 1),
    openedAt: 1,
    outcome: {
      mode: ReceiverMode.Deepwave,
      signalLength: 8,
      playerSignal: 0xaa,
      ghostSignal: 0xaa,
      matchCount,
      payoutTier,
      payoutBps: payoutTier * 10_000,
      payout: BigInt(payoutTier) * 1_000_000n,
      gameState: '0x0102aaaa0805',
    },
  }
}

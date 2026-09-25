import { afterEach, describe, expect, it } from 'vitest'

import { ReceiverMode } from './encoding'
import type { SignumSessionState } from './sessionMachine'
import { appendSettledRound, readSignalJournal } from './useSignalJournal'

afterEach(() => window.localStorage.clear())

describe('Signal Journal', () => {
  it('records a settled round once without predictive data', () => {
    const state = settledState()
    const rounds = appendSettledRound([], state, 'demo', 123)

    expect(rounds).toEqual([
      {
        id: 'demo:round-1',
        completedAt: 123,
        experience: 'demo',
        mode: ReceiverMode.Pulse,
        signalLength: 4,
        playerSignal: 5,
        matchCount: 3,
        payoutBps: 14_000,
      },
    ])
    expect(appendSettledRound(rounds, state, 'demo', 456)).toBe(rounds)
  })

  it('rejects malformed persisted history', () => {
    window.localStorage.setItem('signum.signal-journal.v1', '{bad json')
    expect(readSignalJournal()).toEqual([])
    window.localStorage.setItem(
      'signum.signal-journal.v1',
      JSON.stringify([{ id: 'unsafe' }]),
    )
    expect(readSignalJournal()).toEqual([])
  })
})

function settledState(): Extract<SignumSessionState, { status: 'SETTLED' }> {
  return {
    status: 'SETTLED',
    wager: '10000',
    gameData: '0x01000500',
    startedAt: 1,
    sessionKey: 'round-1',
    sessionId: '1',
    openedAt: 1,
    outcome: {
      mode: ReceiverMode.Pulse,
      signalLength: 4,
      playerSignal: 5,
      ghostSignal: 1,
      matchCount: 3,
      payoutTier: 2,
      payoutBps: 14_000,
      payout: 14_000n,
      gameState: '0x010005010302',
    },
  }
}

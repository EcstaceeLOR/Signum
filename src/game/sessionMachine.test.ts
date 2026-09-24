import { describe, expect, it } from 'vitest'

import { SessionPhase, type HostSnapshotV1 } from '@chain/casino-sdk/guest'

import {
  INITIAL_SESSION_STATE,
  RANDOMNESS_DELAY_MS,
  canOpenSession,
  isRandomnessDelayed,
  isSessionLocked,
  transitionSession,
  type SignumSessionState,
} from './sessionMachine'

const NOW = 2_000_000_000_000
const GAME_DATA = '0x01000500' as const

describe('Signum session state machine', () => {
  it('moves from idle through one locked optimistic opening', () => {
    const ready = snapshotEvent(INITIAL_SESSION_STATE, snapshot())
    expect(ready).toEqual({ status: 'READY', ignoredSessionKey: undefined })

    const opening = transitionSession(ready, {
      type: 'OPEN',
      wager: '1000000',
      gameData: GAME_DATA,
      now: NOW,
    })
    expect(opening.status).toBe('OPENING_SESSION')
    expect(isSessionLocked(opening)).toBe(true)

    expect(
      transitionSession(opening, {
        type: 'OPEN',
        wager: '2000000',
        gameData: GAME_DATA,
        now: NOW,
      }),
    ).toBe(opening)

    const waiting = transitionSession(opening, {
      type: 'OPENED',
      sessionKey: 'session-1',
      transactionHash: '0x1234',
      now: NOW + 100,
    })
    expect(waiting).toMatchObject({
      status: 'WAITING_RANDOMNESS',
      sessionKey: 'session-1',
      transactionHash: '0x1234',
    })
    expect(canOpenSession(waiting)).toBe(false)
  })

  it('adopts an optimistic host row before openSession resolves', () => {
    const opening = openingState()
    const adopted = snapshotEvent(opening, snapshot({ items: [waitingRow()] }))

    expect(adopted).toMatchObject({
      status: 'WAITING_RANDOMNESS',
      sessionKey: 'session-1',
      sessionId: '1',
    })
    expect(
      transitionSession(adopted, {
        type: 'OPEN_FAILED',
        message: 'late rejection',
      }),
    ).toBe(adopted)
  })

  it('stays coherent while the session row and settlement fields are delayed', () => {
    const waiting = waitingState()
    expect(snapshotEvent(waiting, snapshot())).toBe(waiting)

    const settlementPending = snapshotEvent(
      waiting,
      snapshot({
        items: [
          waitingRow({
            phase: SessionPhase.SETTLED,
            phaseName: 'SETTLED',
            isSettled: true,
          }),
        ],
      }),
    )
    expect(settlementPending).toMatchObject({
      status: 'WAITING_RANDOMNESS',
      settlementPending: true,
    })
  })

  it('reveals only a complete valid outcome and never regresses after settlement', () => {
    const waiting = waitingState()
    const revealing = snapshotEvent(
      waiting,
      snapshot({ items: [settledRow()] }),
    )
    expect(revealing).toMatchObject({
      status: 'REVEALING',
      outcome: { matchCount: 4, payout: 7400000n },
    })

    expect(snapshotEvent(revealing, snapshot({ items: [waitingRow()] }))).toBe(
      revealing,
    )

    const settled = transitionSession(revealing, { type: 'REVEAL_COMPLETE' })
    expect(settled.status).toBe('SETTLED')
    expect(snapshotEvent(settled, snapshot())).toBe(settled)

    const ready = transitionSession(settled, { type: 'PLAY_AGAIN' })
    expect(ready).toEqual({
      status: 'READY',
      ignoredSessionKey: 'session-1',
    })
    expect(snapshotEvent(ready, snapshot({ items: [settledRow()] }))).toEqual(
      ready,
    )
  })

  it('recovers waiting and settled sessions directly from a reload snapshot', () => {
    expect(
      snapshotEvent(INITIAL_SESSION_STATE, snapshot({ items: [waitingRow()] })),
    ).toMatchObject({ status: 'WAITING_RANDOMNESS', sessionKey: 'session-1' })

    expect(
      snapshotEvent(INITIAL_SESSION_STATE, snapshot({ items: [settledRow()] })),
    ).toMatchObject({ status: 'REVEALING', sessionKey: 'session-1' })
  })

  it('rejects malformed settled data instead of inventing a result', () => {
    const invalid = settledRow()
    invalid.raw.gameState = '0x010005050303'

    expect(
      snapshotEvent(waitingState(), snapshot({ items: [invalid] })),
    ).toMatchObject({
      status: 'ERROR',
      liveSession: false,
      message: expect.stringContaining('invalid Signum outcome'),
    })
  })

  it('exposes delayed randomness and cancellation transitions only while waiting', () => {
    const waiting = waitingState()
    expect(isRandomnessDelayed(waiting, NOW + RANDOMNESS_DELAY_MS - 1)).toBe(
      false,
    )
    expect(isRandomnessDelayed(waiting, NOW + RANDOMNESS_DELAY_MS + 100)).toBe(
      true,
    )

    const cancelling = transitionSession(waiting, { type: 'CANCEL_STARTED' })
    expect(cancelling).toMatchObject({ cancelStatus: 'pending' })
    const failed = transitionSession(cancelling, {
      type: 'CANCEL_FAILED',
      message: 'Not eligible yet.',
    })
    expect(failed).toMatchObject({
      status: 'WAITING_RANDOMNESS',
      cancelStatus: 'error',
      cancelError: 'Not eligible yet.',
    })
  })

  it('turns a terminal cancellation into a recoverable error', () => {
    const cancelled = snapshotEvent(
      waitingState(),
      snapshot({
        items: [
          waitingRow({
            phase: SessionPhase.CANCELLED,
            phaseName: 'CANCELLED',
          }),
        ],
      }),
    )
    expect(cancelled).toMatchObject({
      status: 'ERROR',
      liveSession: false,
      sessionKey: 'session-1',
    })
    expect(canOpenSession(cancelled)).toBe(true)
  })
})

function snapshotEvent(
  state: SignumSessionState,
  hostSnapshot: HostSnapshotV1 | null,
) {
  return transitionSession(state, {
    type: 'SNAPSHOT',
    snapshot: hostSnapshot,
    now: NOW,
  })
}

function openingState(): SignumSessionState {
  return transitionSession(snapshotEvent(INITIAL_SESSION_STATE, snapshot()), {
    type: 'OPEN',
    wager: '1000000',
    gameData: GAME_DATA,
    now: NOW,
  })
}

function waitingState(): SignumSessionState {
  return transitionSession(openingState(), {
    type: 'OPENED',
    sessionKey: 'session-1',
    transactionHash: '0x1234',
    now: NOW,
  })
}

function waitingRow(overrides: Partial<HostSession> = {}): HostSession {
  return {
    sessionId: '1',
    sessionKey: 'session-1',
    gameAddress: '0x0000000000000000000000000000000000000001',
    phase: SessionPhase.WAITING_RANDOMNESS,
    phaseName: 'WAITING_RANDOMNESS',
    wager: '1000000',
    isSettled: false,
    openedAt: NOW,
    lastEventTimestamp: NOW,
    raw: { gameData: GAME_DATA, openTransactionHash: '0x1234' },
    ...overrides,
  }
}

function settledRow(): HostSession {
  return waitingRow({
    phase: SessionPhase.SETTLED,
    phaseName: 'SETTLED',
    payout: '7400000',
    isSettled: true,
    raw: {
      gameData: GAME_DATA,
      gameState: '0x010005050403',
      openTransactionHash: '0x1234',
      settleTransactionHash: '0x5678',
    },
  })
}

type HostSession = HostSnapshotV1['sessions']['items'][number]

function snapshot({
  items = [],
}: { items?: HostSession[] } = {}): HostSnapshotV1 {
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
    sessions: { items },
    ui: { locale: 'en', theme: 'dark' },
  }
}

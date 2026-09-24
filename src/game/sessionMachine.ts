import { SessionPhase, type HostSnapshotV1 } from '@chain/casino-sdk/guest'

import { decodeGameData, encodeGameData, type GameDataHex } from './encoding'
import { decodeSettledOutcome, type SettledOutcome } from './math'

export const RANDOMNESS_DELAY_MS = 20_000

export type SessionCommitment = {
  wager: string
  gameData: GameDataHex
  startedAt: number
}

type TrackedSession = SessionCommitment & {
  sessionKey: string
  transactionHash?: GameDataHex
  sessionId?: string
  openedAt: number
  ignoredSessionKey?: string
}

export type SignumSessionState =
  | { status: 'IDLE' }
  | { status: 'READY'; ignoredSessionKey?: string }
  | ({
      status: 'OPENING_SESSION'
      ignoredSessionKey?: string
    } & SessionCommitment)
  | ({
      status: 'WAITING_RANDOMNESS'
      settlementPending: boolean
      cancelStatus: 'idle' | 'pending' | 'requested' | 'error'
      cancelError?: string
    } & TrackedSession)
  | ({ status: 'REVEALING'; outcome: SettledOutcome } & TrackedSession)
  | ({ status: 'SETTLED'; outcome: SettledOutcome } & TrackedSession)
  | {
      status: 'ERROR'
      message: string
      liveSession: boolean
      sessionKey?: string
      commitment?: SessionCommitment
    }

export type SessionEvent =
  | { type: 'SNAPSHOT'; snapshot: HostSnapshotV1 | null; now: number }
  | { type: 'OPEN'; wager: string; gameData: GameDataHex; now: number }
  | {
      type: 'OPENED'
      sessionKey: string
      transactionHash: GameDataHex
      now: number
    }
  | { type: 'OPEN_FAILED'; message: string }
  | { type: 'CANCEL_STARTED' }
  | { type: 'CANCEL_REQUESTED' }
  | { type: 'CANCEL_FAILED'; message: string }
  | { type: 'REVEAL_COMPLETE' }
  | { type: 'PLAY_AGAIN' }

type HostSession = HostSnapshotV1['sessions']['items'][number]

export const INITIAL_SESSION_STATE: SignumSessionState = { status: 'IDLE' }

export function transitionSession(
  state: SignumSessionState,
  event: SessionEvent,
): SignumSessionState {
  switch (event.type) {
    case 'SNAPSHOT':
      return reconcileSnapshot(state, event.snapshot, event.now)
    case 'OPEN':
      if (!canOpenSession(state)) return state
      return {
        status: 'OPENING_SESSION',
        wager: event.wager,
        gameData: event.gameData,
        startedAt: event.now,
        ignoredSessionKey:
          state.status === 'READY' ? state.ignoredSessionKey : undefined,
      }
    case 'OPENED':
      if (state.status !== 'OPENING_SESSION') return state
      return waitingState(state, {
        sessionKey: event.sessionKey,
        transactionHash: event.transactionHash,
        openedAt: event.now,
        ignoredSessionKey: state.ignoredSessionKey,
      })
    case 'OPEN_FAILED':
      if (state.status !== 'OPENING_SESSION') return state
      return {
        status: 'ERROR',
        message: event.message,
        liveSession: false,
        commitment: state,
      }
    case 'CANCEL_STARTED':
      return state.status === 'WAITING_RANDOMNESS'
        ? { ...state, cancelStatus: 'pending', cancelError: undefined }
        : state
    case 'CANCEL_REQUESTED':
      return state.status === 'WAITING_RANDOMNESS'
        ? { ...state, cancelStatus: 'requested', cancelError: undefined }
        : state
    case 'CANCEL_FAILED':
      return state.status === 'WAITING_RANDOMNESS'
        ? {
            ...state,
            cancelStatus: 'error',
            cancelError: event.message,
          }
        : state
    case 'REVEAL_COMPLETE':
      return state.status === 'REVEALING'
        ? { ...state, status: 'SETTLED' }
        : state
    case 'PLAY_AGAIN': {
      const sessionKey = sessionKeyFrom(state)
      if (
        state.status !== 'SETTLED' &&
        !(state.status === 'ERROR' && !state.liveSession)
      ) {
        return state
      }
      return { status: 'READY', ignoredSessionKey: sessionKey }
    }
  }
}

export function canOpenSession(state: SignumSessionState): boolean {
  return (
    state.status === 'READY' || (state.status === 'ERROR' && !state.liveSession)
  )
}

export function sessionCommitment(
  state: SignumSessionState,
): SessionCommitment | undefined {
  return commitmentFrom(state)
}

export function isSessionLocked(state: SignumSessionState): boolean {
  return (
    state.status === 'OPENING_SESSION' ||
    state.status === 'WAITING_RANDOMNESS' ||
    state.status === 'REVEALING' ||
    state.status === 'SETTLED' ||
    (state.status === 'ERROR' && state.liveSession)
  )
}

export function isRandomnessDelayed(
  state: SignumSessionState,
  now: number,
): boolean {
  return (
    state.status === 'WAITING_RANDOMNESS' &&
    now - state.openedAt >= RANDOMNESS_DELAY_MS
  )
}

function reconcileSnapshot(
  state: SignumSessionState,
  snapshot: HostSnapshotV1 | null,
  now: number,
): SignumSessionState {
  if (state.status === 'REVEALING' || state.status === 'SETTLED') return state
  if (!snapshot) {
    return isSessionLocked(state) || state.status === 'OPENING_SESSION'
      ? state
      : { status: 'IDLE' }
  }

  const row = selectSession(snapshot, state)
  if (!row) {
    if (
      state.status === 'OPENING_SESSION' ||
      state.status === 'WAITING_RANDOMNESS' ||
      (state.status === 'ERROR' && state.liveSession)
    ) {
      return state
    }
    if (state.status === 'ERROR') return state
    return snapshot.wallet.status === 'ready'
      ? {
          status: 'READY',
          ignoredSessionKey:
            state.status === 'READY' ? state.ignoredSessionKey : undefined,
        }
      : { status: 'IDLE' }
  }

  return stateFromRow(state, row, now)
}

function selectSession(
  snapshot: HostSnapshotV1,
  state: SignumSessionState,
): HostSession | undefined {
  const gameAddress = snapshot.integration.gameAddress.toLowerCase()
  const rows = snapshot.sessions.items.filter(
    (item) => item.gameAddress.toLowerCase() === gameAddress,
  )
  const trackedKey = sessionKeyFrom(state)
  if (trackedKey) {
    const exact = rows.find((item) => item.sessionKey === trackedKey)
    if (exact) return exact
  }

  const commitment =
    state.status === 'ERROR' && !state.liveSession
      ? undefined
      : commitmentFrom(state)
  if (commitment) {
    const ignoredSessionKey =
      state.status === 'OPENING_SESSION' ||
      state.status === 'WAITING_RANDOMNESS'
        ? state.ignoredSessionKey
        : undefined
    const matching = rows
      .filter(
        (item) =>
          item.sessionKey !== ignoredSessionKey &&
          item.wager === commitment.wager &&
          item.raw.gameData?.toLowerCase() ===
            commitment.gameData.toLowerCase(),
      )
      .sort((left, right) => sessionTimestamp(right) - sessionTimestamp(left))
    if (matching[0]) return matching[0]
  }

  if (
    state.status !== 'IDLE' &&
    state.status !== 'READY' &&
    !(state.status === 'ERROR' && !state.liveSession)
  ) {
    return undefined
  }

  const ignoredKey =
    state.status === 'READY' ? state.ignoredSessionKey : undefined
  return rows
    .filter((item) => item.sessionKey !== ignoredKey && rowCommitment(item))
    .sort((left, right) => {
      const activeDifference =
        Number(isTerminal(left)) - Number(isTerminal(right))
      return (
        activeDifference || sessionTimestamp(right) - sessionTimestamp(left)
      )
    })[0]
}

function stateFromRow(
  current: SignumSessionState,
  row: HostSession,
  now: number,
): SignumSessionState {
  const commitment = rowCommitment(row) ?? commitmentFrom(current)
  if (!commitment) return current
  const tracked: TrackedSession = {
    ...commitment,
    sessionKey: row.sessionKey,
    transactionHash:
      row.raw.openTransactionHash ?? transactionHashFrom(current),
    sessionId: row.sessionId,
    openedAt:
      locallyObservedOpenTime(current) ||
      sessionTimestamp(row) ||
      commitment.startedAt ||
      now,
    ignoredSessionKey:
      current.status === 'OPENING_SESSION' ||
      current.status === 'WAITING_RANDOMNESS'
        ? current.ignoredSessionKey
        : undefined,
  }

  if (
    row.phase === SessionPhase.CANCELLED ||
    row.phase === SessionPhase.FORFEITED
  ) {
    return {
      status: 'ERROR',
      message:
        row.phase === SessionPhase.CANCELLED
          ? 'The delayed transmission was cancelled by Chain. No result was created.'
          : 'The transmission ended without a settled result.',
      liveSession: false,
      sessionKey: row.sessionKey,
      commitment,
    }
  }

  if (row.isSettled || row.phase === SessionPhase.SETTLED) {
    const gameState = row.raw.gameState
    const payout = row.payout
    const wager = row.wager ?? commitment.wager
    if (!gameState || payout === undefined || !wager) {
      return waitingState(commitment, {
        ...tracked,
        settlementPending: true,
      })
    }

    try {
      const outcome = decodeSettledOutcome(
        gameState,
        BigInt(wager),
        BigInt(payout),
      )
      const committed = decodeGameData(commitment.gameData)
      if (
        outcome.mode !== committed.mode ||
        outcome.playerSignal !== committed.playerSignal
      ) {
        throw new Error('The settled signal does not match the commitment.')
      }
      return { status: 'REVEALING', ...tracked, outcome }
    } catch {
      return {
        status: 'ERROR',
        message:
          'Chain returned an invalid Signum outcome. No result was displayed.',
        liveSession: false,
        sessionKey: row.sessionKey,
        commitment,
      }
    }
  }

  return waitingState(commitment, tracked)
}

function waitingState(
  commitment: SessionCommitment,
  session: Partial<TrackedSession> &
    Pick<TrackedSession, 'sessionKey' | 'openedAt'> & {
      settlementPending?: boolean
    },
): Extract<SignumSessionState, { status: 'WAITING_RANDOMNESS' }> {
  return {
    wager: commitment.wager,
    gameData: commitment.gameData,
    startedAt: commitment.startedAt,
    sessionKey: session.sessionKey,
    transactionHash: session.transactionHash,
    sessionId: session.sessionId,
    openedAt: session.openedAt,
    ignoredSessionKey: session.ignoredSessionKey,
    settlementPending: session.settlementPending ?? false,
    cancelStatus: 'idle',
    status: 'WAITING_RANDOMNESS',
  }
}

function rowCommitment(row: HostSession): SessionCommitment | undefined {
  const wager = row.wager
  let gameData = row.raw.gameData
  if (
    !gameData &&
    row.raw.gameState &&
    /^0x[0-9a-fA-F]{12}$/.test(row.raw.gameState)
  ) {
    gameData = `${row.raw.gameState.slice(0, 8)}00` as GameDataHex
  }
  if (!wager || !gameData) return undefined
  try {
    const decoded = decodeGameData(gameData)
    return {
      wager,
      gameData: encodeGameData({
        mode: decoded.mode,
        playerSignal: decoded.playerSignal,
      }),
      startedAt: sessionTimestamp(row),
    }
  } catch {
    return undefined
  }
}

function commitmentFrom(
  state: SignumSessionState,
): SessionCommitment | undefined {
  if (
    state.status === 'OPENING_SESSION' ||
    state.status === 'WAITING_RANDOMNESS' ||
    state.status === 'REVEALING' ||
    state.status === 'SETTLED'
  ) {
    return state
  }
  return state.status === 'ERROR' ? state.commitment : undefined
}

function sessionKeyFrom(state: SignumSessionState): string | undefined {
  if (
    state.status === 'WAITING_RANDOMNESS' ||
    state.status === 'REVEALING' ||
    state.status === 'SETTLED'
  ) {
    return state.sessionKey
  }
  return state.status === 'ERROR' ? state.sessionKey : undefined
}

function transactionHashFrom(
  state: SignumSessionState,
): GameDataHex | undefined {
  if (
    state.status === 'WAITING_RANDOMNESS' ||
    state.status === 'REVEALING' ||
    state.status === 'SETTLED'
  ) {
    return state.transactionHash
  }
  return undefined
}

function locallyObservedOpenTime(
  state: SignumSessionState,
): number | undefined {
  if (state.status === 'OPENING_SESSION') return state.startedAt
  if (
    state.status === 'WAITING_RANDOMNESS' ||
    state.status === 'REVEALING' ||
    state.status === 'SETTLED'
  ) {
    return state.openedAt
  }
  return undefined
}

function isTerminal(row: HostSession): boolean {
  return (
    row.isSettled ||
    row.phase === SessionPhase.SETTLED ||
    row.phase === SessionPhase.FORFEITED ||
    row.phase === SessionPhase.CANCELLED
  )
}

function sessionTimestamp(row: HostSession): number {
  const value = row.openedAt ?? row.lastEventTimestamp
  return value < 1_000_000_000_000 ? value * 1000 : value
}

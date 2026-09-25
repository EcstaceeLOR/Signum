import type { GameDataHex } from './encoding'
import type { SignumSessionState } from './sessionMachine'
import {
  readPersistent,
  removePersistent,
  writePersistent,
  type PersistentSchema,
} from '../state/persistence'

export type SignumExperience = 'chain' | 'demo'

export function readPersistedSession(
  experience: SignumExperience,
): SignumSessionState {
  return readPersistent(sessionSchema(experience))
}

export function persistSession(
  experience: SignumExperience,
  state: SignumSessionState,
) {
  if (
    state.status === 'IDLE' ||
    state.status === 'REVEALING' ||
    state.status === 'SETTLED'
  ) {
    removePersistent(sessionSchema(experience).key)
    return
  }
  writePersistent(sessionSchema(experience), state)
}

export function sessionSchema(
  experience: SignumExperience,
): PersistentSchema<SignumSessionState> {
  return {
    key: `signum.session.${experience}`,
    version: 2,
    fallback: () => ({ status: 'IDLE' }),
    validate: isSessionState,
  }
}

function isSessionState(value: unknown): value is SignumSessionState {
  if (!value || typeof value !== 'object') return false
  const state = value as Record<string, unknown>
  if (state.status === 'IDLE') return true
  if (state.status === 'READY') return optionalString(state.ignoredSessionKey)
  if (state.status === 'ERROR') {
    return (
      typeof state.message === 'string' &&
      typeof state.liveSession === 'boolean' &&
      optionalString(state.sessionKey) &&
      (state.commitment === undefined || isCommitment(state.commitment))
    )
  }
  if (!isCommitment(state)) return false
  if (state.status === 'OPENING_SESSION') return true
  if (
    state.status !== 'WAITING_RANDOMNESS' &&
    state.status !== 'REVEALING' &&
    state.status !== 'SETTLED'
  ) {
    return false
  }
  if (
    typeof state.sessionKey !== 'string' ||
    !Number.isFinite(state.openedAt) ||
    !optionalHex(state.transactionHash) ||
    !optionalString(state.sessionId)
  ) {
    return false
  }
  if (state.status === 'WAITING_RANDOMNESS') {
    return (
      typeof state.settlementPending === 'boolean' &&
      ['idle', 'pending', 'requested', 'error'].includes(
        String(state.cancelStatus),
      )
    )
  }
  return isOutcome(state.outcome)
}

function isCommitment(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const commitment = value as Record<string, unknown>
  return (
    typeof commitment.wager === 'string' &&
    isHex(commitment.gameData) &&
    Number.isFinite(commitment.startedAt)
  )
}

function isOutcome(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const outcome = value as Record<string, unknown>
  return (
    Number.isInteger(outcome.mode) &&
    Number.isInteger(outcome.signalLength) &&
    Number.isInteger(outcome.playerSignal) &&
    Number.isInteger(outcome.matchCount) &&
    Number.isInteger(outcome.payoutBps) &&
    typeof outcome.payout === 'bigint' &&
    isHex(outcome.gameState)
  )
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}

function optionalHex(value: unknown): boolean {
  return value === undefined || isHex(value)
}

function isHex(value: unknown): value is GameDataHex {
  return typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value)
}

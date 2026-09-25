import { useCallback, useEffect, useState } from 'react'

import type { ReceiverMode } from './encoding'
import type { SignumSessionState } from './sessionMachine'
import {
  readPersistent,
  removePersistent,
  subscribePersistent,
  writePersistent,
  type PersistentSchema,
} from '../state/persistence'

const STORAGE_KEY = 'signum.signal-journal.v1'
const MAX_ROUNDS = 20

export type SignalJournalRound = {
  id: string
  completedAt: number
  experience: 'chain' | 'demo'
  mode: ReceiverMode
  signalLength: number
  playerSignal: number
  matchCount: number
  payoutBps: number
  ghostSignal?: number
  wager?: string
  payout?: string
  sessionId?: string
  transactionHash?: string
}

export const journalSchema: PersistentSchema<SignalJournalRound[]> = {
  key: STORAGE_KEY,
  version: 3,
  fallback: () => [],
  validate: isJournal,
  migrate: (value, version) =>
    version === 0 && Array.isArray(value)
      ? value.filter(isJournalRound).slice(0, MAX_ROUNDS)
      : undefined,
}

export function useSignalJournal(experience: 'chain' | 'demo') {
  const [rounds, setRounds] = useState(readSignalJournal)

  useEffect(() => subscribePersistent(journalSchema, setRounds), [])

  const record = useCallback(
    (session: CompletedSessionState) => {
      setRounds((current) => {
        const next = appendSettledRound(
          current,
          session,
          experience,
          Date.now(),
        )
        if (next === current) return current
        persistSignalJournal(next)
        return next
      })
    },
    [experience],
  )

  const clear = useCallback(() => {
    setRounds([])
    removePersistent(STORAGE_KEY)
  }, [])

  return { rounds, record, clear }
}

type CompletedSessionState = Extract<
  SignumSessionState,
  { status: 'REVEALING' | 'SETTLED' }
>

export function appendSettledRound(
  rounds: SignalJournalRound[],
  state: CompletedSessionState,
  experience: 'chain' | 'demo',
  completedAt: number,
): SignalJournalRound[] {
  const id = `${experience}:${state.sessionKey}`
  if (rounds.some((round) => round.id === id)) return rounds
  return [
    {
      id,
      completedAt,
      experience,
      mode: state.outcome.mode,
      signalLength: state.outcome.signalLength,
      playerSignal: state.outcome.playerSignal,
      matchCount: state.outcome.matchCount,
      payoutBps: state.outcome.payoutBps,
      ghostSignal: state.outcome.ghostSignal,
      wager: state.wager,
      payout: state.outcome.payout.toString(),
      sessionId: state.sessionId,
      transactionHash: state.transactionHash,
    },
    ...rounds,
  ].slice(0, MAX_ROUNDS)
}

export function readSignalJournal(): SignalJournalRound[] {
  return readPersistent(journalSchema)
}

function persistSignalJournal(rounds: readonly SignalJournalRound[]) {
  writePersistent(journalSchema, [...rounds])
}

function isJournal(value: unknown): value is SignalJournalRound[] {
  return Array.isArray(value) && value.every(isJournalRound)
}

function isJournalRound(value: unknown): value is SignalJournalRound {
  if (!value || typeof value !== 'object') return false
  const round = value as Partial<SignalJournalRound>
  return (
    typeof round.id === 'string' &&
    Number.isFinite(round.completedAt) &&
    (round.experience === 'chain' || round.experience === 'demo') &&
    (round.mode === 0 || round.mode === 1 || round.mode === 2) &&
    (round.signalLength === 4 ||
      round.signalLength === 6 ||
      round.signalLength === 8) &&
    Number.isInteger(round.playerSignal) &&
    Number.isInteger(round.matchCount) &&
    Number.isInteger(round.payoutBps)
  )
}

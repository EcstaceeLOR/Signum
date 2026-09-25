import { useCallback, useState } from 'react'

import type { ReceiverMode } from './encoding'
import type { SignumSessionState } from './sessionMachine'

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
}

export function useSignalJournal(experience: 'chain' | 'demo') {
  const [rounds, setRounds] = useState(readSignalJournal)

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
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Restricted/sandboxed storage degrades to an in-memory journal.
    }
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
    },
    ...rounds,
  ].slice(0, MAX_ROUNDS)
}

export function readSignalJournal(): SignalJournalRound[] {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? '[]',
    )
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isJournalRound).slice(0, MAX_ROUNDS)
  } catch {
    return []
  }
}

function persistSignalJournal(rounds: readonly SignalJournalRound[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rounds))
  } catch {
    // The current page session still works when persistence is unavailable.
  }
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

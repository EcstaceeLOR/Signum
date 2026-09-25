import { afterEach, describe, expect, it } from 'vitest'

import {
  persistSession,
  readPersistedSession,
  sessionSchema,
} from './sessionPersistence'

afterEach(() => window.localStorage.clear())

describe('session persistence', () => {
  it('keeps Chain and demo recovery records strictly separate', () => {
    persistSession('chain', {
      status: 'OPENING_SESSION',
      wager: '100',
      gameData: '0x000000000000',
      startedAt: 1000,
    })

    expect(readPersistedSession('chain')).toMatchObject({
      status: 'OPENING_SESSION',
      wager: '100',
    })
    expect(readPersistedSession('demo')).toEqual({ status: 'IDLE' })
    expect(sessionSchema('chain').key).not.toBe(sessionSchema('demo').key)
  })

  it('restores a pending session without persisting wallet identity or secrets', () => {
    persistSession('chain', {
      status: 'WAITING_RANDOMNESS',
      wager: '100',
      gameData: '0x000000000000',
      startedAt: 1000,
      sessionKey: 'safe-session-key',
      sessionId: '12',
      openedAt: 1100,
      settlementPending: false,
      cancelStatus: 'idle',
    })

    const raw = window.localStorage.getItem(sessionSchema('chain').key) ?? ''
    expect(readPersistedSession('chain')).toMatchObject({
      status: 'WAITING_RANDOMNESS',
      sessionId: '12',
    })
    expect(raw).not.toMatch(/wallet|private|secret|signature/i)
  })
})

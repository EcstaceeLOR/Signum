import { useCallback, useEffect, useReducer, useRef, useState } from 'react'

import type { ChainHostClient } from '../bridge/useChainHost'
import {
  INITIAL_SESSION_STATE,
  RANDOMNESS_DELAY_MS,
  canOpenSession,
  isRandomnessDelayed,
  isSessionLocked,
  transitionSession,
  type SignumSessionState,
} from './sessionMachine'

type SessionHost = Pick<
  ChainHostClient,
  'snapshot' | 'openSession' | 'cancelStuckRandomness'
>
type OpenSessionInput = Parameters<ChainHostClient['openSession']>[0]

const REVEAL_HANDOFF_MS = 600

export type SignumSessionController = {
  state: SignumSessionState
  isLocked: boolean
  canOpen: boolean
  isDelayed: boolean
  canCancel: boolean
  submit(input: OpenSessionInput): Promise<void>
  cancelStuckRandomness(): Promise<void>
  playAgain(): void
}

export function useSignumSession(
  host: SessionHost | undefined,
): SignumSessionController {
  const [state, dispatch] = useReducer(
    transitionSession,
    host?.snapshot ?? null,
    (snapshot) =>
      transitionSession(INITIAL_SESSION_STATE, {
        type: 'SNAPSHOT',
        snapshot,
        now: Date.now(),
      }),
  )
  const [clock, setClock] = useState(Date.now)
  const openingLock = useRef(false)
  const cancellationLock = useRef(false)

  useEffect(() => {
    dispatch({
      type: 'SNAPSHOT',
      snapshot: host?.snapshot ?? null,
      now: Date.now(),
    })
  }, [host?.snapshot])

  useEffect(() => {
    if (state.status !== 'WAITING_RANDOMNESS') return
    const remaining = Math.max(
      0,
      state.openedAt + RANDOMNESS_DELAY_MS - Date.now(),
    )
    const timer = setTimeout(() => setClock(Date.now()), remaining)
    return () => clearTimeout(timer)
  }, [state])

  useEffect(() => {
    if (state.status !== 'REVEALING') return
    const timer = setTimeout(
      () => dispatch({ type: 'REVEAL_COMPLETE' }),
      REVEAL_HANDOFF_MS,
    )
    return () => clearTimeout(timer)
  }, [state.status])

  const submit = useCallback(
    async (input: OpenSessionInput) => {
      if (openingLock.current || !canOpenSession(state)) return
      if (!host) {
        dispatch({
          type: 'OPEN_FAILED',
          message: 'Chain connection is unavailable. Retry to reconnect.',
        })
        return
      }

      openingLock.current = true
      dispatch({ type: 'OPEN', ...input, now: Date.now() })
      try {
        const result = await host.openSession(input)
        dispatch({ type: 'OPENED', ...result, now: Date.now() })
      } catch (error) {
        openingLock.current = false
        dispatch({
          type: 'OPEN_FAILED',
          message:
            error instanceof Error && error.message.trim()
              ? error.message
              : 'Transmission was not opened. Nothing was wagered.',
        })
      }
    },
    [host, state],
  )

  const delayed = isRandomnessDelayed(state, clock)
  const canCancel =
    delayed &&
    state.status === 'WAITING_RANDOMNESS' &&
    Boolean(state.sessionId) &&
    state.cancelStatus !== 'pending' &&
    state.cancelStatus !== 'requested'

  const cancelStuckRandomness = useCallback(async () => {
    if (
      cancellationLock.current ||
      !host ||
      state.status !== 'WAITING_RANDOMNESS' ||
      !state.sessionId ||
      !isRandomnessDelayed(state, Date.now())
    ) {
      return
    }

    cancellationLock.current = true
    dispatch({ type: 'CANCEL_STARTED' })
    try {
      await host.cancelStuckRandomness({ sessionId: state.sessionId })
      dispatch({ type: 'CANCEL_REQUESTED' })
    } catch (error) {
      cancellationLock.current = false
      dispatch({
        type: 'CANCEL_FAILED',
        message:
          error instanceof Error && error.message.trim()
            ? error.message
            : 'Chain could not cancel the delayed randomness request.',
      })
    }
  }, [host, state])

  const playAgain = useCallback(() => {
    openingLock.current = false
    cancellationLock.current = false
    dispatch({ type: 'PLAY_AGAIN' })
  }, [])

  return {
    state,
    isLocked: isSessionLocked(state),
    canOpen: canOpenSession(state),
    isDelayed: delayed,
    canCancel,
    submit,
    cancelStuckRandomness,
    playAgain,
  }
}

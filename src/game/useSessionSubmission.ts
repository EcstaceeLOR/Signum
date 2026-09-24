import { useCallback, useRef, useState } from 'react'

import type { ChainHostClient } from '../bridge/useChainHost'

type OpenSession = ChainHostClient['openSession']
type OpenSessionInput = Parameters<OpenSession>[0]
type OpenSessionResult = Awaited<ReturnType<OpenSession>>

export type SessionSubmissionState =
  | { status: 'idle' }
  | { status: 'opening' }
  | ({ status: 'opened' } & OpenSessionResult)
  | { status: 'error'; message: string }

export type SessionSubmissionController = {
  state: SessionSubmissionState
  isLocked: boolean
  submit(input: OpenSessionInput): Promise<void>
}

export function useSessionSubmission(
  openSession: OpenSession | undefined,
): SessionSubmissionController {
  const [state, setState] = useState<SessionSubmissionState>({ status: 'idle' })
  const submissionLock = useRef(false)

  const submit = useCallback(
    async (input: OpenSessionInput) => {
      if (submissionLock.current) return
      if (!openSession) {
        setState({
          status: 'error',
          message: 'Chain connection is unavailable. Retry to reconnect.',
        })
        return
      }

      submissionLock.current = true
      setState({ status: 'opening' })
      try {
        const result = await openSession(input)
        setState({ status: 'opened', ...result })
      } catch (error) {
        submissionLock.current = false
        setState({
          status: 'error',
          message:
            error instanceof Error && error.message.trim()
              ? error.message
              : 'Transmission was not opened. Nothing was wagered.',
        })
      }
    },
    [openSession],
  )

  return {
    state,
    isLocked: state.status === 'opening' || state.status === 'opened',
    submit,
  }
}

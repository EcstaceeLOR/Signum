import {
  connectGameToHost,
  type GuestApiV1,
  type GuestBridgeConnection,
  type HostApiV1,
  type HostSnapshotV1,
  type RandomnessVerificationV1,
} from '@chain/casino-sdk/guest'

const HOST_HANDSHAKE_TIMEOUT_MS = 12_000

export type ChainHostConnector = (methods: GuestApiV1) => GuestBridgeConnection

export type ChainHostStatus = 'disabled' | 'connecting' | 'connected' | 'error'

export type ChainHostState = {
  status: ChainHostStatus
  snapshot: HostSnapshotV1 | null
  error: string | null
  canPlay: boolean
}

export type OpenSessionInput = Parameters<HostApiV1['openSession']>[0]
export type CancelRandomnessInput = Parameters<
  HostApiV1['cancelStuckRandomness']
>[0]
export type RevealOutcomeInput = Parameters<HostApiV1['revealOutcome']>[0]
export type RandomnessVerificationInput = { sessionId: string }

export type ChainHostBridge = {
  getState(): ChainHostState
  subscribe(listener: () => void): () => void
  openSession(input: OpenSessionInput): ReturnType<HostApiV1['openSession']>
  cancelStuckRandomness(
    input: CancelRandomnessInput,
  ): ReturnType<HostApiV1['cancelStuckRandomness']>
  revealOutcome(
    input: RevealOutcomeInput,
  ): ReturnType<HostApiV1['revealOutcome']>
  getRandomnessVerification(
    input: RandomnessVerificationInput,
  ): Promise<RandomnessVerificationV1>
  reportContentSize(input: { minHeight: number }): Promise<void>
  retry(): void
  destroy(): void
}

export const DISABLED_CHAIN_HOST_STATE: ChainHostState = {
  status: 'disabled',
  snapshot: null,
  error: null,
  canPlay: false,
}

export const CONNECTING_CHAIN_HOST_STATE: ChainHostState = {
  status: 'connecting',
  snapshot: null,
  error: null,
  canPlay: false,
}

export function createChainHostBridge(
  connector: ChainHostConnector = connectGameToHost,
): ChainHostBridge {
  let state = CONNECTING_CHAIN_HOST_STATE
  let connection: GuestBridgeConnection | undefined
  let handshakeTimer: ReturnType<typeof setTimeout> | undefined
  let hostApi: HostApiV1 | undefined
  let generation = 0
  let destroyed = false
  const listeners = new Set<() => void>()

  const publish = (next: Omit<ChainHostState, 'canPlay'>) => {
    state = {
      ...next,
      canPlay:
        next.status === 'connected' && next.snapshot?.wallet.status === 'ready',
    }
    listeners.forEach((listener) => listener())
  }

  const connect = () => {
    const activeGeneration = ++generation
    clearTimeout(handshakeTimer)
    connection?.destroy()
    hostApi = undefined
    publish({ status: 'connecting', snapshot: null, error: null })

    try {
      connection = connector({
        async setState(snapshot) {
          if (destroyed || activeGeneration !== generation) return
          publish({
            status: state.status,
            snapshot,
            error: state.error,
          })
        },
      })
    } catch (error) {
      publish({
        status: 'error',
        snapshot: null,
        error: connectionError(error),
      })
      return
    }

    handshakeTimer = setTimeout(() => {
      if (destroyed || activeGeneration !== generation) return
      generation++
      connection?.destroy()
      connection = undefined
      hostApi = undefined
      publish({
        status: 'error',
        snapshot: state.snapshot,
        error:
          'Could not connect to the Chain host. The host did not respond in time.',
      })
    }, HOST_HANDSHAKE_TIMEOUT_MS)

    void connection.promise
      .then((connectedHostApi) => {
        if (destroyed || activeGeneration !== generation) return
        clearTimeout(handshakeTimer)
        hostApi = connectedHostApi
        publish({
          status: 'connected',
          snapshot: state.snapshot,
          error: null,
        })
      })
      .catch((error: unknown) => {
        if (destroyed || activeGeneration !== generation) return
        clearTimeout(handshakeTimer)
        publish({
          status: 'error',
          snapshot: state.snapshot,
          error: connectionError(error),
        })
      })
  }

  const invoke = async <Result>(
    label: string,
    requiresReadyWallet: boolean,
    action: (api: HostApiV1) => Promise<Result>,
  ): Promise<Result> => {
    if (!hostApi || state.status !== 'connected') {
      const error = new Error('The Chain host is not connected.')
      publish({ ...state, error: error.message })
      throw error
    }
    if (requiresReadyWallet && state.snapshot?.wallet.status !== 'ready') {
      const error = new Error('The Chain wallet is not ready.')
      publish({ ...state, error: error.message })
      throw error
    }

    try {
      const result = await action(hostApi)
      if (state.error) publish({ ...state, error: null })
      return result
    } catch (error) {
      publish({
        ...state,
        error: `${label} failed. ${errorMessage(error)}`,
      })
      throw error
    }
  }

  const bridge: ChainHostBridge = {
    getState() {
      return state
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    openSession(input) {
      return invoke('Opening the session', true, (api) =>
        api.openSession(input),
      )
    },
    cancelStuckRandomness(input) {
      return invoke('Randomness recovery', true, (api) =>
        api.cancelStuckRandomness(input),
      )
    },
    revealOutcome(input) {
      return invoke('Outcome reveal', false, (api) => api.revealOutcome(input))
    },
    getRandomnessVerification(input) {
      if (!hostApi?.getRandomnessVerification) {
        return Promise.resolve({
          supported: false,
          chainId: state.snapshot?.integration.chainId ?? 0,
          requests: [],
        })
      }
      return hostApi.getRandomnessVerification(input)
    },
    async reportContentSize(input) {
      if (!hostApi?.reportContentSize) return
      await hostApi.reportContentSize(input)
    },
    retry() {
      if (destroyed) return
      connect()
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      generation++
      clearTimeout(handshakeTimer)
      connection?.destroy()
      connection = undefined
      hostApi = undefined
      listeners.clear()
    },
  }

  connect()
  return bridge
}

function connectionError(error: unknown): string {
  return `Could not connect to the Chain host. ${errorMessage(error)}`
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return 'Please try again.'
}

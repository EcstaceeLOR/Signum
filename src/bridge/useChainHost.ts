import { useCallback, useSyncExternalStore } from 'react'

import {
  CONNECTING_CHAIN_HOST_STATE,
  createChainHostBridge,
  DISABLED_CHAIN_HOST_STATE,
  type CancelRandomnessInput,
  type ChainHostBridge,
  type ChainHostConnector,
  type ChainHostState,
  type OpenSessionInput,
  type RevealOutcomeInput,
} from './chainHost'

type SharedBridge = {
  bridge: ChainHostBridge
  connector: ChainHostConnector | undefined
  references: number
  destroyTimer?: ReturnType<typeof setTimeout>
}

let sharedBridge: SharedBridge | undefined

export type ChainHostClient = ChainHostState & {
  openSession: ChainHostBridge['openSession']
  cancelStuckRandomness: ChainHostBridge['cancelStuckRandomness']
  revealOutcome: ChainHostBridge['revealOutcome']
  reportContentSize: ChainHostBridge['reportContentSize']
  retry(): void
}

export function useChainHost(
  enabled: boolean,
  connector?: ChainHostConnector,
): ChainHostClient {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!enabled) return () => undefined
      const bridge = acquireBridge(connector)
      const unsubscribe = bridge.subscribe(listener)
      return () => {
        unsubscribe()
        releaseBridge(bridge)
      }
    },
    [connector, enabled],
  )
  const getSnapshot = useCallback(
    () => sharedState(enabled, connector),
    [connector, enabled],
  )
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const openSession = useCallback(
    (input: OpenSessionInput) => requiredBridge(connector).openSession(input),
    [connector],
  )
  const cancelStuckRandomness = useCallback(
    (input: CancelRandomnessInput) =>
      requiredBridge(connector).cancelStuckRandomness(input),
    [connector],
  )
  const revealOutcome = useCallback(
    (input: RevealOutcomeInput) =>
      requiredBridge(connector).revealOutcome(input),
    [connector],
  )
  const reportContentSize = useCallback(
    (input: { minHeight: number }) => {
      const bridge = activeBridge(connector)
      return bridge ? bridge.reportContentSize(input) : Promise.resolve()
    },
    [connector],
  )
  const retry = useCallback(() => activeBridge(connector)?.retry(), [connector])

  return {
    ...state,
    openSession,
    cancelStuckRandomness,
    revealOutcome,
    reportContentSize,
    retry,
  }
}

function sharedState(
  enabled: boolean,
  connector?: ChainHostConnector,
): ChainHostState {
  if (!enabled) return DISABLED_CHAIN_HOST_STATE
  return activeBridge(connector)?.getState() ?? CONNECTING_CHAIN_HOST_STATE
}

function acquireBridge(connector?: ChainHostConnector): ChainHostBridge {
  if (
    sharedBridge &&
    sharedBridge.connector !== connector &&
    sharedBridge.references === 0
  ) {
    sharedBridge.bridge.destroy()
    sharedBridge = undefined
  }
  if (sharedBridge && sharedBridge.connector !== connector) {
    throw new Error('A different Chain host connector is already active.')
  }
  if (!sharedBridge) {
    sharedBridge = {
      bridge: createChainHostBridge(connector),
      connector,
      references: 0,
    }
  }

  if (sharedBridge.destroyTimer) {
    clearTimeout(sharedBridge.destroyTimer)
    sharedBridge.destroyTimer = undefined
  }
  sharedBridge.references++
  return sharedBridge.bridge
}

function releaseBridge(bridge: ChainHostBridge) {
  const current = sharedBridge
  if (!current || current.bridge !== bridge) return
  current.references = Math.max(0, current.references - 1)
  if (current.references !== 0) return

  current.destroyTimer = setTimeout(() => {
    if (sharedBridge !== current || current.references !== 0) return
    current.bridge.destroy()
    sharedBridge = undefined
  }, 0)
}

function activeBridge(
  connector?: ChainHostConnector,
): ChainHostBridge | undefined {
  const current = sharedBridge
  if (!current || current.connector !== connector) return undefined
  return current.bridge
}

function requiredBridge(connector?: ChainHostConnector): ChainHostBridge {
  const bridge = activeBridge(connector)
  if (bridge) return bridge
  throw new Error('The Chain host is not connected.')
}

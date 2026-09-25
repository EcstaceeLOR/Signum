import { useCallback, useEffect, useRef, useState } from 'react'

import { SessionPhase, type HostSnapshotV1 } from '@chain/casino-sdk/guest'

import manifest from '../../public/game.manifest.json'
import type { ChainHostClient } from '../bridge/useChainHost'
import { decodeGameData, type GameDataHex } from '../game/encoding'
import { resolveOutcome } from '../game/math'

export const DEMO_SETTLEMENT_MS = 700

const DEMO_GAME_ADDRESS = '0x000000000000000000000000000000000000dE00' as const
const DEMO_STARTING_BALANCE = 100_000n
const DEMO_DECIMALS = 2

type DemoHost = Pick<
  ChainHostClient,
  'snapshot' | 'openSession' | 'cancelStuckRandomness' | 'revealOutcome'
> & {
  revision: number
  reset(): void
}

type DemoSession = HostSnapshotV1['sessions']['items'][number]

export function useDemoHost(showcase = false): DemoHost {
  const [snapshot, setSnapshot] = useState(createDemoSnapshot)
  const [revision, setRevision] = useState(0)
  const roundNumber = useRef(0)
  const settlementTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  const clearSettlementTimers = useCallback(() => {
    settlementTimers.current.forEach(clearTimeout)
    settlementTimers.current.clear()
  }, [])

  useEffect(() => clearSettlementTimers, [clearSettlementTimers])

  const openSession = useCallback<ChainHostClient['openSession']>(
    async ({ wager, gameData }) => {
      let stake: bigint
      let outcome: ReturnType<typeof resolveOutcome>
      try {
        stake = BigInt(wager)
        const randomness = showcase
          ? BigInt(decodeGameData(gameData as GameDataHex).playerSignal)
          : localRandomness()
        outcome = resolveOutcome(gameData, randomness, stake)
      } catch {
        throw new Error('Demo round could not be simulated')
      }

      const round = ++roundNumber.current
      const sessionId = String(round)
      const sessionKey = `demo-round-${round}`
      const openedAt = Date.now()
      const waitingSession: DemoSession = {
        sessionId,
        sessionKey,
        gameAddress: DEMO_GAME_ADDRESS,
        phase: SessionPhase.WAITING_RANDOMNESS,
        phaseName: 'WAITING_RANDOMNESS',
        wager,
        stake: wager,
        isSettled: false,
        openedAt,
        lastEventTimestamp: openedAt,
        raw: { gameData },
      }

      setSnapshot((current) => ({
        ...current,
        balances: {
          smartVaultBalance: (
            BigInt(current.balances.smartVaultBalance ?? '0') - stake
          ).toString(),
        },
        sessions: { items: [waitingSession] },
      }))

      const timer = setTimeout(() => {
        settlementTimers.current.delete(timer)
        setSnapshot((current) => {
          const active = current.sessions.items.find(
            (item) => item.sessionKey === sessionKey,
          )
          if (!active) return current

          const settledAt = Date.now()
          return {
            ...current,
            balances: {
              smartVaultBalance: (
                BigInt(current.balances.smartVaultBalance ?? '0') +
                outcome.payout
              ).toString(),
            },
            sessions: {
              items: [
                {
                  ...active,
                  phase: SessionPhase.SETTLED,
                  phaseName: 'SETTLED',
                  payout: outcome.payout.toString(),
                  isSettled: true,
                  settledAt,
                  lastEventTimestamp: settledAt,
                  raw: {
                    ...active.raw,
                    gameState: outcome.gameState,
                  },
                },
              ],
            },
          }
        })
      }, DEMO_SETTLEMENT_MS)
      settlementTimers.current.add(timer)

      return {
        sessionKey,
        transactionHash: syntheticTransactionHash(round),
      }
    },
    [showcase],
  )

  const cancelStuckRandomness = useCallback<
    ChainHostClient['cancelStuckRandomness']
  >(async () => ({ transactionHash: syntheticTransactionHash(0) }), [])

  const revealOutcome = useCallback<ChainHostClient['revealOutcome']>(
    async () => undefined,
    [],
  )

  const reset = useCallback(() => {
    clearSettlementTimers()
    roundNumber.current = 0
    setSnapshot(createDemoSnapshot())
    setRevision((current) => current + 1)
  }, [clearSettlementTimers])

  return {
    snapshot,
    openSession,
    cancelStuckRandomness,
    revealOutcome,
    revision,
    reset,
  }
}

function createDemoSnapshot(): HostSnapshotV1 {
  return {
    apiVersion: 1,
    integration: {
      chainId: 0,
      slug: 'signum-demo',
      gameAddress: DEMO_GAME_ADDRESS,
      manifest: manifest as HostSnapshotV1['integration']['manifest'],
    },
    wallet: { status: 'ready' },
    token: { symbol: 'credits', decimals: DEMO_DECIMALS },
    balances: { smartVaultBalance: DEMO_STARTING_BALANCE.toString() },
    casino: {
      maxBetAmount: '10000',
      maxAllowedReservedProfit: '100000000',
    },
    sessions: { items: [] },
    ui: { locale: 'en', theme: 'dark' },
  }
}

function localRandomness(): bigint {
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
    throw new Error('Secure browser randomness is unavailable.')
  }

  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return bytes.reduce(
    (randomness, byte) => (randomness << 8n) | BigInt(byte),
    0n,
  )
}

function syntheticTransactionHash(round: number): `0x${string}` {
  return `0x${round.toString(16).padStart(64, '0')}`
}

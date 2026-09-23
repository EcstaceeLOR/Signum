import { decodeGameData, type GameDataHex, ReceiverMode } from './encoding'

export type ResolvedOutcome = {
  ghostSignal: number
  matchCount: number
  payoutTier: number
  payoutBps: number
  payout: bigint
  gameState: GameDataHex
}

export function resolveOutcome(
  gameData: GameDataHex,
  randomness: bigint,
  wager: bigint,
): ResolvedOutcome {
  const decoded = decodeGameData(gameData)
  const mask = (1 << decoded.signalLength) - 1
  const ghostSignal = Number(randomness & BigInt(mask))
  const mismatchCount = popcount(decoded.playerSignal ^ ghostSignal)
  const matchCount = decoded.signalLength - mismatchCount
  const { payoutBps, payoutTier } = payoutFor(decoded.mode, matchCount)
  const gameState = bytesToHex([
    1,
    decoded.mode,
    decoded.playerSignal,
    ghostSignal,
    matchCount,
    payoutTier,
  ])

  return {
    ghostSignal,
    matchCount,
    payoutTier,
    payoutBps,
    payout: (wager * BigInt(payoutBps)) / 10_000n,
    gameState,
  }
}

function payoutFor(
  mode: ReceiverMode,
  matches: number,
): { payoutBps: number; payoutTier: number } {
  if (mode === ReceiverMode.Pulse) {
    if (matches < 2) return { payoutBps: 0, payoutTier: 0 }
    if (matches === 2) return { payoutBps: 4_000, payoutTier: 1 }
    if (matches === 3) return { payoutBps: 14_000, payoutTier: 2 }
    return { payoutBps: 74_000, payoutTier: 3 }
  }
  if (mode === ReceiverMode.Carrier) {
    if (matches < 3) return { payoutBps: 0, payoutTier: 0 }
    if (matches === 3) return { payoutBps: 2_000, payoutTier: 1 }
    if (matches === 4) return { payoutBps: 10_000, payoutTier: 2 }
    if (matches === 5) return { payoutBps: 35_000, payoutTier: 3 }
    return { payoutBps: 215_000, payoutTier: 4 }
  }
  if (matches < 4) return { payoutBps: 0, payoutTier: 0 }
  if (matches === 4) return { payoutBps: 2_000, payoutTier: 1 }
  if (matches === 5) return { payoutBps: 10_000, payoutTier: 2 }
  if (matches === 6) return { payoutBps: 30_000, payoutTier: 3 }
  if (matches === 7) return { payoutBps: 65_000, payoutTier: 4 }
  return { payoutBps: 400_000, payoutTier: 5 }
}

function popcount(value: number): number {
  let remaining = value
  let count = 0
  while (remaining !== 0) {
    remaining &= remaining - 1
    count++
  }
  return count
}

function bytesToHex(bytes: readonly number[]): GameDataHex {
  return `0x${bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

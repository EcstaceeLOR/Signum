import { decodeGameData, type GameDataHex, ReceiverMode } from './encoding'

export type ResolvedOutcome = {
  ghostSignal: number
  matchCount: number
  payoutTier: number
  payoutBps: number
  payout: bigint
  gameState: GameDataHex
}

export type SettledOutcome = ResolvedOutcome & {
  mode: ReceiverMode
  signalLength: 4 | 6 | 8
  playerSignal: number
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

export function decodeSettledOutcome(
  gameState: GameDataHex,
  wager: bigint,
  payout: bigint,
): SettledOutcome {
  const bytes = outcomeBytes(gameState)
  const [version, mode, playerSignal, ghostSignal, matchCount, payoutTier] =
    bytes
  const decoded = decodeGameData(bytesToHex([version, mode, playerSignal, 0]))
  if (ghostSignal >= 2 ** decoded.signalLength) {
    throw new Error('The ghost signal is outside the receiver range.')
  }

  const expectedMatches =
    decoded.signalLength - popcount(decoded.playerSignal ^ ghostSignal)
  const expectedPayout = payoutFor(decoded.mode, expectedMatches)
  if (
    matchCount !== expectedMatches ||
    payoutTier !== expectedPayout.payoutTier
  ) {
    throw new Error('The settled outcome is internally inconsistent.')
  }

  const calculatedPayout = (wager * BigInt(expectedPayout.payoutBps)) / 10_000n
  if (payout !== calculatedPayout) {
    throw new Error('The settled payout does not match the Signum paytable.')
  }

  return {
    mode: decoded.mode,
    signalLength: decoded.signalLength,
    playerSignal: decoded.playerSignal,
    ghostSignal,
    matchCount,
    payoutTier,
    payoutBps: expectedPayout.payoutBps,
    payout,
    gameState,
  }
}

export function payoutFor(
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

function outcomeBytes(gameState: string): readonly number[] {
  if (!/^0x[0-9a-fA-F]{12}$/.test(gameState)) {
    throw new Error('A Signum settled outcome must be exactly six bytes.')
  }
  return Array.from({ length: 6 }, (_, index) =>
    Number.parseInt(gameState.slice(2 + index * 2, 4 + index * 2), 16),
  )
}

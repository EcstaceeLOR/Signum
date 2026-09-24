import { describe, expect, it } from 'vitest'

import fixtures from '../../fixtures/outcome-v1.json'
import { encodeGameData, ReceiverMode } from './encoding'
import { decodeSettledOutcome, resolveOutcome } from './math'

describe('Signum settlement math', () => {
  it.each(fixtures.vectors)('matches the $name golden vector', (fixture) => {
    const result = resolveOutcome(
      fixture.gameData as `0x${string}`,
      BigInt(fixture.ghostSignal),
      BigInt(fixtures.wager),
    )

    expect(result).toEqual({
      ghostSignal: fixture.ghostSignal,
      matchCount: fixture.matchCount,
      payoutTier: fixture.payoutTier,
      payoutBps: fixture.payoutBps,
      payout: BigInt(fixture.payoutBps),
      gameState: fixture.outcome,
    })

    expect(
      decodeSettledOutcome(
        fixture.outcome as `0x${string}`,
        BigInt(fixtures.wager),
        BigInt(fixture.payoutBps),
      ),
    ).toMatchObject({
      playerSignal: Number.parseInt(fixture.gameData.slice(6, 8), 16),
      ghostSignal: fixture.ghostSignal,
      matchCount: fixture.matchCount,
      payoutTier: fixture.payoutTier,
      payoutBps: fixture.payoutBps,
    })
  })

  it.each([
    '0x0100000004',
    '0x010000100403',
    '0x010000000303',
    '0x010000000402',
  ])('rejects malformed or inconsistent settled state %s', (gameState) => {
    expect(() =>
      decodeSettledOutcome(gameState as `0x${string}`, 10_000n, 74_000n),
    ).toThrow()
  })

  it('rejects a payout that does not match the committed wager', () => {
    expect(() =>
      decodeSettledOutcome('0x010000000403', 10_000n, 73_999n),
    ).toThrow('payout')
  })

  it.each([
    [ReceiverMode.Pulse, 4],
    [ReceiverMode.Carrier, 6],
    [ReceiverMode.Deepwave, 8],
  ] as const)(
    'exhaustively preserves the binomial distribution for mode %i',
    (mode, signalLength) => {
      const signalCount = 2 ** signalLength
      const distribution = Array<number>(signalLength + 1).fill(0)

      for (let playerSignal = 0; playerSignal < signalCount; playerSignal++) {
        const gameData = encodeGameData({ mode, playerSignal })
        for (let ghostSignal = 0; ghostSignal < signalCount; ghostSignal++) {
          const result = resolveOutcome(gameData, BigInt(ghostSignal), 10_000n)
          distribution[result.matchCount]++
        }
      }

      expect(distribution).toEqual(
        Array.from(
          { length: signalLength + 1 },
          (_, matches) => signalCount * binomial(signalLength, matches),
        ),
      )
    },
  )
})

function binomial(n: number, k: number): number {
  const reducedK = Math.min(k, n - k)
  let result = 1
  for (let index = 1; index <= reducedK; index++) {
    result = (result * (n - reducedK + index)) / index
  }
  return result
}

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const expected = JSON.parse(
  readFileSync(resolve(root, 'fixtures/math-report-v1.json'), 'utf8'),
)
const modes = [
  { name: 'Pulse', signalLength: 4, payouts: [0, 0, 4_000, 14_000, 74_000] },
  {
    name: 'Carrier',
    signalLength: 6,
    payouts: [0, 0, 0, 2_000, 10_000, 35_000, 215_000],
  },
  {
    name: 'Deepwave',
    signalLength: 8,
    payouts: [0, 0, 0, 0, 2_000, 10_000, 30_000, 65_000, 400_000],
  },
]

const modeReports = modes.map(({ name, signalLength, payouts }) => {
  const signalCount = 2 ** signalLength
  const distribution = Array(signalLength + 1).fill(0)

  for (let player = 0; player < signalCount; player++) {
    for (let ghost = 0; ghost < signalCount; ghost++) {
      const matches = signalLength - popcount(player ^ ghost)
      distribution[matches]++
    }
  }

  const combinations = signalCount ** 2
  const expectedPayoutBpsNumerator = distribution.reduce(
    (sum, outcomes, matches) => sum + outcomes * payouts[matches],
    0,
  )

  return {
    name,
    signalLength,
    playerSignals: signalCount,
    ghostSignals: signalCount,
    combinations,
    distribution,
    payoutBps: payouts,
    expectedPayoutBpsNumerator,
    expectedPayoutBpsDenominator: combinations,
  }
})
const report = {
  schemaVersion: 1,
  totalCombinations: modeReports.reduce(
    (total, mode) => total + mode.combinations,
    0,
  ),
  modes: modeReports,
}

assert.deepEqual(report, expected, 'Committed exhaustive math report drifted.')
assert.equal(report.totalCombinations, 69_888)
console.log(
  'Verified committed math report across all 69,888 player/ghost combinations.',
)

function popcount(value) {
  let remaining = value
  let count = 0
  while (remaining !== 0) {
    remaining &= remaining - 1
    count++
  }
  return count
}

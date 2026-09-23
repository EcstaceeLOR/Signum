import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { network } from 'hardhat'
import solc from 'solc'
import {
  createPublicClient,
  createWalletClient,
  custom,
  toHex,
  zeroAddress,
} from 'viem'
import { hardhat } from 'viem/chains'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const localInterfacePath = resolve(root, 'contracts/ICasinoGameV2.sol')
const canonicalInterfacePath = resolve(
  root,
  'vendor/chain-casino-sdk/simulator/contracts/ICasinoGameV2.sol',
)
const importProbePath = resolve(
  root,
  'contracts/test/ICasinoGameV2ImportProbe.sol',
)
const gameDataPath = resolve(root, 'contracts/SignumGameData.sol')
const signumGamePath = resolve(root, 'contracts/SignumGame.sol')
const gameDataHarnessPath = resolve(
  root,
  'contracts/test/SignumGameDataHarness.sol',
)
const outcomeHarnessPath = resolve(
  root,
  'contracts/test/SignumGameOutcomeHarness.sol',
)
const gameDataFixturesPath = resolve(root, 'fixtures/game-data-v1.json')
const outcomeFixturesPath = resolve(root, 'fixtures/outcome-v1.json')

const normalize = (source) => source.replaceAll('\r\n', '\n')
const localInterface = normalize(readFileSync(localInterfacePath, 'utf8'))
const canonicalInterface = normalize(
  readFileSync(canonicalInterfacePath, 'utf8'),
)

if (localInterface !== canonicalInterface) {
  console.error(
    'contracts/ICasinoGameV2.sol differs from the canonical Chain SDK interface. ' +
      'Replace it from vendor/chain-casino-sdk/simulator/contracts/ICasinoGameV2.sol.',
  )
  process.exit(1)
}

const compilerVersion = solc.version()
if (!compilerVersion.startsWith('0.8.30+')) {
  console.error(`Expected Solidity 0.8.30, received ${compilerVersion}.`)
  process.exit(1)
}

const sourcePaths = [
  localInterfacePath,
  importProbePath,
  gameDataPath,
  signumGamePath,
  gameDataHarnessPath,
  outcomeHarnessPath,
]
const sources = Object.fromEntries(
  sourcePaths.map((path) => [
    relative(root, path).replaceAll('\\', '/'),
    { content: readFileSync(path, 'utf8') },
  ]),
)

const input = {
  language: 'Solidity',
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object'],
      },
    },
  },
}

const output = JSON.parse(solc.compile(JSON.stringify(input)))
const errors = (output.errors ?? []).filter(
  (error) => error.severity === 'error',
)

if (errors.length > 0) {
  for (const error of errors) console.error(error.formattedMessage)
  process.exit(1)
}

const interfaceArtifact =
  output.contracts?.['contracts/ICasinoGameV2.sol']?.ICasinoGameV2
const probeArtifact =
  output.contracts?.['contracts/test/ICasinoGameV2ImportProbe.sol']
    ?.ICasinoGameV2ImportProbe
const gameDataHarnessArtifact =
  output.contracts?.['contracts/test/SignumGameDataHarness.sol']
    ?.SignumGameDataHarness
const signumGameArtifact =
  output.contracts?.['contracts/SignumGame.sol']?.SignumGame
const outcomeHarnessArtifact =
  output.contracts?.['contracts/test/SignumGameOutcomeHarness.sol']
    ?.SignumGameOutcomeHarness

if (
  !interfaceArtifact ||
  !probeArtifact?.evm.bytecode.object ||
  !gameDataHarnessArtifact?.evm.bytecode.object ||
  !signumGameArtifact?.evm.bytecode.object ||
  !outcomeHarnessArtifact?.evm.bytecode.object
) {
  console.error(
    'Solidity compilation did not produce the expected interface, import probe, codec harness, and SignumGame artifacts.',
  )
  process.exit(1)
}

await verifyGameDataRuntime(gameDataHarnessArtifact)
await verifySignumGameRuntime(outcomeHarnessArtifact)

const sourceHash = createHash('sha256').update(localInterface).digest('hex')
console.log(`Canonical ICasinoGameV2 source verified: sha256:${sourceHash}`)
console.log(
  `Compiled with solc ${compilerVersion}; optimizer runs=200; viaIR=true.`,
)

async function verifyGameDataRuntime(artifact) {
  const fixtures = JSON.parse(readFileSync(gameDataFixturesPath, 'utf8'))
  const connection = await network.connect()

  try {
    const transport = custom(connection.provider)
    const publicClient = createPublicClient({ chain: hardhat, transport })
    const accounts = await publicClient.request({ method: 'eth_accounts' })
    const account = accounts[0]

    assert.ok(account, 'Hardhat did not expose a deployment account.')

    const walletClient = createWalletClient({
      account,
      chain: hardhat,
      transport,
    })
    const deploymentHash = await walletClient.deployContract({
      abi: artifact.abi,
      bytecode: `0x${artifact.evm.bytecode.object}`,
    })
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: deploymentHash,
    })
    const address = receipt.contractAddress

    assert.ok(
      address,
      'Game-data harness deployment did not return an address.',
    )

    for (const fixture of fixtures.valid) {
      const decoded = await publicClient.readContract({
        address,
        abi: artifact.abi,
        functionName: 'decode',
        args: [fixture.payload],
      })

      assert.deepEqual(
        decoded.map(Number),
        [1, fixture.mode, fixture.signalLength, fixture.playerSignal, 0],
        `Solidity decode drifted for ${fixture.name}.`,
      )

      const encoded = await publicClient.readContract({
        address,
        abi: artifact.abi,
        functionName: 'encode',
        args: [fixture.mode, fixture.playerSignal],
      })

      assert.equal(
        encoded,
        fixture.payload,
        `Solidity encode drifted for ${fixture.name}.`,
      )
    }

    const checked = await publicClient.readContract({
      address,
      abi: artifact.abi,
      functionName: 'assertAllRoundTrips',
    })
    assert.equal(checked, 336n, 'Solidity did not round-trip all 336 signals.')

    for (const fixture of fixtures.invalid) {
      await assert.rejects(
        publicClient.readContract({
          address,
          abi: artifact.abi,
          functionName: 'decode',
          args: [fixture.payload],
        }),
        undefined,
        `Solidity accepted invalid fixture: ${fixture.name}.`,
      )
      await assert.rejects(
        publicClient.readContract({
          address,
          abi: artifact.abi,
          functionName: 'settlementGuard',
          args: [fixture.payload],
        }),
        undefined,
        `Invalid fixture reached the settlement guard: ${fixture.name}.`,
      )
    }

    console.log(
      `Executed ${fixtures.valid.length} shared vectors, ${fixtures.invalid.length} rejection vectors, and all 336 valid signals in Solidity.`,
    )
  } finally {
    await connection.close()
  }
}

async function verifySignumGameRuntime(artifact) {
  const fixtures = JSON.parse(readFileSync(gameDataFixturesPath, 'utf8'))
  const outcomeFixtures = JSON.parse(readFileSync(outcomeFixturesPath, 'utf8'))
  const connection = await network.connect()

  try {
    const transport = custom(connection.provider)
    const publicClient = createPublicClient({ chain: hardhat, transport })
    const accounts = await publicClient.request({ method: 'eth_accounts' })
    const account = accounts[0]
    assert.ok(account, 'Hardhat did not expose a deployment account.')

    const walletClient = createWalletClient({
      account,
      chain: hardhat,
      transport,
    })
    const deploymentHash = await walletClient.deployContract({
      abi: artifact.abi,
      bytecode: `0x${artifact.evm.bytecode.object}`,
    })
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: deploymentHash,
    })
    const address = receipt.contractAddress
    assert.ok(address, 'SignumGame deployment did not return an address.')

    const cases = [
      {
        name: 'Pulse perfect resonance',
        gameData: '0x01000d00',
        mode: 0,
        playerSignal: 13,
        ghostSignal: 13,
        signalLength: 4,
        maxPayoutBps: 74_000n,
        matchCount: 4,
        payoutTier: 3,
        payoutBps: 74_000n,
      },
      {
        name: 'Carrier perfect resonance',
        gameData: '0x01012500',
        mode: 1,
        playerSignal: 37,
        ghostSignal: 37,
        signalLength: 6,
        maxPayoutBps: 215_000n,
        matchCount: 6,
        payoutTier: 4,
        payoutBps: 215_000n,
      },
      {
        name: 'Deepwave perfect resonance',
        gameData: '0x0102a500',
        mode: 2,
        playerSignal: 165,
        ghostSignal: 165,
        signalLength: 8,
        maxPayoutBps: 400_000n,
        matchCount: 8,
        payoutTier: 5,
        payoutBps: 400_000n,
      },
      {
        name: 'Pulse partial floor-rounded return',
        gameData: '0x01000d00',
        mode: 0,
        playerSignal: 13,
        ghostSignal: 12,
        signalLength: 4,
        maxPayoutBps: 74_000n,
        matchCount: 3,
        payoutTier: 2,
        payoutBps: 14_000n,
      },
    ]

    const riskCases = [
      {
        name: 'Pulse',
        gameData: '0x01000000',
        maxPayoutBps: 74_000n,
        topWeight: 1n,
        totalWeight: 16n,
        rtpNumerator: 77n,
        rtpDenominator: 80n,
        tiers: [
          { payoutBps: 4_000n, weight: 6n },
          { payoutBps: 14_000n, weight: 4n },
          { payoutBps: 74_000n, weight: 1n },
        ],
      },
      {
        name: 'Carrier',
        gameData: '0x01010000',
        maxPayoutBps: 215_000n,
        topWeight: 1n,
        totalWeight: 64n,
        rtpNumerator: 123n,
        rtpDenominator: 128n,
        tiers: [
          { payoutBps: 2_000n, weight: 20n },
          { payoutBps: 10_000n, weight: 15n },
          { payoutBps: 35_000n, weight: 6n },
          { payoutBps: 215_000n, weight: 1n },
        ],
      },
      {
        name: 'Deepwave',
        gameData: '0x01020000',
        maxPayoutBps: 400_000n,
        topWeight: 1n,
        totalWeight: 256n,
        rtpNumerator: 123n,
        rtpDenominator: 128n,
        tiers: [
          { payoutBps: 2_000n, weight: 70n },
          { payoutBps: 10_000n, weight: 56n },
          { payoutBps: 30_000n, weight: 28n },
          { payoutBps: 65_000n, weight: 8n },
          { payoutBps: 400_000n, weight: 1n },
        ],
      },
    ]

    for (const riskCase of riskCases) {
      const probabilityWad = ceilDivide(
        riskCase.topWeight * 10n ** 18n,
        riskCase.totalWeight,
      )
      const bodyVarianceWad = deriveBodyVarianceWad(riskCase)

      for (const wager of [
        0n,
        1n,
        79n,
        80n,
        127n,
        128n,
        9_999n,
        10_000n,
        10_001n,
        10n ** 18n,
      ]) {
        const maxPayout = multiplyByBasisPoints(wager, riskCase.maxPayoutBps)
        const expectedPayout =
          (wager * riskCase.rtpNumerator) / riskCase.rtpDenominator
        const quote = await publicClient.readContract({
          address,
          abi: artifact.abi,
          functionName: 'quoteRiskParams',
          args: [wager, riskCase.gameData],
        })

        assert.deepEqual(
          quote,
          [
            maxPayout,
            probabilityWad,
            expectedPayout,
            wager * wager * bodyVarianceWad,
          ],
          `${riskCase.name} risk quote drifted at wager ${wager}.`,
        )

        const caps = await publicClient.readContract({
          address,
          abi: artifact.abi,
          functionName: 'quoteCaps',
          args: [wager, riskCase.gameData],
        })
        assert.deepEqual(caps, [wager, maxPayout - wager])
      }
    }

    const simulatorLiquidity = 500_000_000n * 10n ** 18n
    const simulatorReserveCap = simulatorLiquidity / 100n
    for (const riskCase of riskCases) {
      const reservedProfitBps = riskCase.maxPayoutBps - 10_000n
      const maxWager = (simulatorReserveCap * 10_000n) / reservedProfitBps
      const atLimit = await publicClient.readContract({
        address,
        abi: artifact.abi,
        functionName: 'quoteCaps',
        args: [maxWager, riskCase.gameData],
      })
      const overLimit = await publicClient.readContract({
        address,
        abi: artifact.abi,
        functionName: 'quoteCaps',
        args: [maxWager + 1n, riskCase.gameData],
      })
      assert.ok(atLimit[1] <= simulatorReserveCap)
      assert.ok(overLimit[1] > simulatorReserveCap)
    }

    let exhaustiveChecks = 0n
    for (const { mode, signalCount } of [
      { mode: 0, signalCount: 16 },
      { mode: 1, signalCount: 64 },
      { mode: 2, signalCount: 256 },
    ]) {
      const chunkSize = 16
      for (
        let startPlayer = 0;
        startPlayer < signalCount;
        startPlayer += chunkSize
      ) {
        const endPlayer = Math.min(startPlayer + chunkSize, signalCount)
        exhaustiveChecks += await publicClient.readContract({
          address,
          abi: artifact.abi,
          functionName: 'assertExhaustiveRange',
          args: [mode, startPlayer, endPlayer],
        })
      }
    }
    assert.equal(
      exhaustiveChecks,
      69_888n,
      'Exhaustive player/ghost coverage count drifted.',
    )

    for (const [index, testCase] of cases.entries()) {
      const wager = index === cases.length - 1 ? 10_001n : 10_000n
      const maxPayout = multiplyByBasisPoints(wager, testCase.maxPayoutBps)
      const reservedProfit = maxPayout - wager
      const caps = await publicClient.readContract({
        address,
        abi: artifact.abi,
        functionName: 'quoteCaps',
        args: [wager, testCase.gameData],
      })
      assert.deepEqual(
        caps,
        [wager, reservedProfit],
        `${testCase.name} caps drifted.`,
      )

      const initialContext = sessionContext({
        wager,
        gameData: testCase.gameData,
      })
      const started = await publicClient.readContract({
        address,
        abi: artifact.abi,
        functionName: 'onSessionStart',
        args: [initialContext],
      })
      assert.deepEqual(
        started,
        {
          newGameState: testCase.gameData,
          escrowDelta: 0n,
          reservedProfitDelta: reservedProfit,
          nextPhase: 1,
          requestRandomnessNow: true,
          payout: 0n,
        },
        `${testCase.name} did not enter WAITING_RANDOMNESS correctly.`,
      )

      const pendingContext = sessionContext({
        wager,
        gameData: '0x01000000',
        gameState: started.newGameState,
        reservedProfit,
        step: 1,
      })
      const settled = await publicClient.readContract({
        address,
        abi: artifact.abi,
        functionName: 'onRandomness',
        args: [
          pendingContext,
          toHex(BigInt(testCase.ghostSignal), { size: 32 }),
        ],
      })
      const expectedState = packedBytes([
        1,
        testCase.mode,
        testCase.playerSignal,
        testCase.ghostSignal,
        testCase.matchCount,
        testCase.payoutTier,
      ])
      assert.deepEqual(
        settled,
        {
          newGameState: expectedState,
          escrowDelta: 0n,
          reservedProfitDelta: 0n,
          nextPhase: 3,
          requestRandomnessNow: false,
          payout: multiplyByBasisPoints(wager, testCase.payoutBps),
        },
        `${testCase.name} did not settle correctly.`,
      )
    }

    const sharedVectorWager = BigInt(outcomeFixtures.wager)
    for (const fixture of outcomeFixtures.vectors) {
      const caps = await publicClient.readContract({
        address,
        abi: artifact.abi,
        functionName: 'quoteCaps',
        args: [sharedVectorWager, fixture.gameData],
      })
      const settled = await publicClient.readContract({
        address,
        abi: artifact.abi,
        functionName: 'onRandomness',
        args: [
          sessionContext({
            wager: sharedVectorWager,
            gameData: fixture.gameData,
            gameState: fixture.gameData,
            reservedProfit: caps[1],
            step: 1,
          }),
          toHex(BigInt(fixture.ghostSignal), { size: 32 }),
        ],
      })
      assert.deepEqual(
        settled,
        {
          newGameState: fixture.outcome,
          escrowDelta: 0n,
          reservedProfitDelta: 0n,
          nextPhase: 3,
          requestRandomnessNow: false,
          payout: multiplyByBasisPoints(
            sharedVectorWager,
            BigInt(fixture.payoutBps),
          ),
        },
        `${fixture.name} shared settlement vector drifted.`,
      )
    }

    const validContext = sessionContext({
      wager: 10_000n,
      gameData: '0x01000d00',
    })
    const pendingContext = sessionContext({
      wager: 10_000n,
      gameData: '0x01000d00',
      gameState: '0x01000d00',
      reservedProfit: 64_000n,
      step: 1,
    })

    for (const fixture of fixtures.invalid) {
      await assert.rejects(
        publicClient.readContract({
          address,
          abi: artifact.abi,
          functionName: 'quoteCaps',
          args: [10_000n, fixture.payload],
        }),
      )
      await assert.rejects(
        publicClient.readContract({
          address,
          abi: artifact.abi,
          functionName: 'quoteRiskParams',
          args: [10_000n, fixture.payload],
        }),
      )
    }

    for (const context of [
      { ...validContext, step: 1 },
      { ...validContext, gameState: '0x00' },
      { ...validContext, reservedProfit: 1n },
      { ...validContext, escrowedStake: 9_999n },
      { ...validContext, gameData: '0x' },
    ]) {
      await assert.rejects(
        publicClient.readContract({
          address,
          abi: artifact.abi,
          functionName: 'onSessionStart',
          args: [context],
        }),
      )
    }

    for (const context of [
      { ...pendingContext, step: 0 },
      { ...pendingContext, gameState: '0x01000d' },
      { ...pendingContext, gameState: '0x02000d00' },
      { ...pendingContext, reservedProfit: 63_999n },
      { ...pendingContext, escrowedStake: 9_999n },
    ]) {
      await assert.rejects(
        publicClient.readContract({
          address,
          abi: artifact.abi,
          functionName: 'onRandomness',
          args: [context, toHex(13n, { size: 32 })],
        }),
      )
    }

    await assert.rejects(
      publicClient.readContract({
        address,
        abi: artifact.abi,
        functionName: 'onPlayerAction',
        args: [pendingContext, '0x'],
      }),
    )
    assert.equal(
      await publicClient.readContract({
        address,
        abi: artifact.abi,
        functionName: 'quoteForfeitPayout',
        args: [pendingContext],
      }),
      0n,
    )

    console.log(
      'Executed SignumGame NONE -> WAITING_RANDOMNESS -> SETTLED lifecycle and invalid-context checks.',
    )
    console.log(
      'Verified exact risk quotes and current simulator reserve limits for all receiver modes.',
    )
    console.log(
      'Exhaustively verified all 69,888 player-signal and ghost-signal combinations in Solidity.',
    )
    console.log(
      `Verified ${outcomeFixtures.vectors.length} shared Solidity/TypeScript settlement vectors across every payout tier.`,
    )
  } finally {
    await connection.close()
  }
}

function sessionContext({
  wager,
  gameData,
  gameState = '0x',
  reservedProfit = 0n,
  step = 0,
}) {
  return {
    sessionId: 1n,
    player: zeroAddress,
    vault: zeroAddress,
    wagerBase: wager,
    escrowedStake: wager,
    reservedProfit,
    step,
    gameData,
    gameState,
  }
}

function multiplyByBasisPoints(value, multiplierBps) {
  return (value * multiplierBps) / 10_000n
}

function deriveBodyVarianceWad({ tiers, totalWeight }) {
  const bodyTiers = tiers.slice(0, -1)
  const bodyPrizeSum = bodyTiers.reduce(
    (sum, tier) => sum + tier.payoutBps * tier.weight,
    0n,
  )
  const bodySquaredPrizeSum = bodyTiers.reduce(
    (sum, tier) => sum + tier.payoutBps * tier.payoutBps * tier.weight,
    0n,
  )
  const numerator =
    (bodySquaredPrizeSum * totalWeight - bodyPrizeSum * bodyPrizeSum) *
    10n ** 18n
  const denominator = 10_000n * 10_000n * totalWeight * totalWeight
  return ceilDivide(numerator, denominator)
}

function ceilDivide(numerator, denominator) {
  return (numerator + denominator - 1n) / denominator
}

function packedBytes(values) {
  return `0x${values.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

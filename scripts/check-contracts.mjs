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
const gameDataFixturesPath = resolve(root, 'fixtures/game-data-v1.json')

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

if (
  !interfaceArtifact ||
  !probeArtifact?.evm.bytecode.object ||
  !gameDataHarnessArtifact?.evm.bytecode.object ||
  !signumGameArtifact?.evm.bytecode.object
) {
  console.error(
    'Solidity compilation did not produce the expected interface, import probe, codec harness, and SignumGame artifacts.',
  )
  process.exit(1)
}

await verifyGameDataRuntime(gameDataHarnessArtifact)
await verifySignumGameRuntime(signumGameArtifact)

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
    await assert.rejects(
      publicClient.readContract({
        address,
        abi: artifact.abi,
        functionName: 'quoteRiskParams',
        args: [10_000n, validContext.gameData],
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

function packedBytes(values) {
  return `0x${values.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

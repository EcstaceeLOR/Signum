import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { network } from 'hardhat'
import solc from 'solc'
import { createPublicClient, createWalletClient, custom } from 'viem'
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

if (
  !interfaceArtifact ||
  !probeArtifact?.evm.bytecode.object ||
  !gameDataHarnessArtifact?.evm.bytecode.object
) {
  console.error(
    'Solidity compilation did not produce the expected interface, import probe, and game-data harness artifacts.',
  )
  process.exit(1)
}

await verifyGameDataRuntime(gameDataHarnessArtifact)

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

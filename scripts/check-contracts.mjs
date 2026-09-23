import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import solc from 'solc'

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

const sourcePaths = [localInterfacePath, importProbePath]
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

if (!interfaceArtifact || !probeArtifact?.evm.bytecode.object) {
  console.error(
    'Solidity compilation did not produce the expected interface and import probe artifacts.',
  )
  process.exit(1)
}

const sourceHash = createHash('sha256').update(localInterface).digest('hex')
console.log(`Canonical ICasinoGameV2 source verified: sha256:${sourceHash}`)
console.log(
  `Compiled with solc ${compilerVersion}; optimizer runs=200; viaIR=true.`,
)

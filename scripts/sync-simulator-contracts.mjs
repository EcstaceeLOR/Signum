import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = resolve(root, 'contracts')
const simulatorDir = resolve(
  root,
  'vendor/chain-casino-sdk/simulator/contracts',
)

const files = ['SignumGame.sol', 'SignumGameData.sol']

await mkdir(simulatorDir, { recursive: true })

const rootInterface = await readFile(
  resolve(sourceDir, 'ICasinoGameV2.sol'),
  'utf8',
)
const simulatorInterface = await readFile(
  resolve(simulatorDir, 'ICasinoGameV2.sol'),
  'utf8',
)

if (rootInterface !== simulatorInterface) {
  throw new Error(
    'The root and simulator ICasinoGameV2.sol files differ. Reconcile the canonical Chain interface before running Signum.',
  )
}

for (const file of files) {
  const source = await readFile(resolve(sourceDir, file), 'utf8')
  const destination = resolve(simulatorDir, file)
  let current = ''

  try {
    current = await readFile(destination, 'utf8')
  } catch {
    // The generated simulator copy does not exist on a clean checkout yet.
  }

  if (current !== source) {
    await writeFile(destination, source, 'utf8')
    console.log(`[simulator-sync] ${file} -> ${destination}`)
  }
}

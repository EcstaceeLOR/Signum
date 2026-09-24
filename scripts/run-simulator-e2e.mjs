import { spawn, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sdkRoot = resolve(root, 'vendor/chain-casino-sdk')
const simulatorRoot = resolve(sdkRoot, 'simulator')
const simulatorContracts = resolve(simulatorRoot, 'contracts')
const deployedFile = resolve(simulatorRoot, 'local-node/deployed.json')
const playwrightCli = resolve(root, 'node_modules/@playwright/test/cli.js')
const tsxCli = resolve(sdkRoot, 'node_modules/tsx/dist/cli.mjs')
const hardhatCli = resolve(
  simulatorRoot,
  'node_modules/hardhat/dist/src/cli.js',
)
const signumViteCli = resolve(root, 'node_modules/vite/bin/vite.js')
const simulatorViteCli = resolve(sdkRoot, 'node_modules/vite/bin/vite.js')
const stagedContracts = []
const processes = []
const previousBootId = readDeployment()?.bootId
const logDirectory = resolve(root, 'test-results', `stack-${Date.now()}`)

await Promise.all([3300, 5173, 8545].map(assertPortAvailable))
mkdirSync(logDirectory, { recursive: true })

try {
  stageContract('SignumGame.sol')
  stageContract('SignumGameData.sol')
  runCommand(
    'Signum production build',
    process.execPath,
    [signumViteCli, 'build'],
    root,
  )
  runCommand(
    'simulator production build',
    process.execPath,
    [simulatorViteCli, 'build'],
    simulatorRoot,
  )

  startProcess(
    'hardhat',
    process.execPath,
    [hardhatCli, 'node', '--hostname', '127.0.0.1', '--port', '8545'],
    simulatorRoot,
    { HARDHAT_DISABLE_TELEMETRY_PROMPT: 'true', DO_NOT_TRACK: '1' },
  )
  await waitForRpc()

  startProcess(
    'local-node',
    process.execPath,
    [tsxCli, 'local-node/index.ts'],
    simulatorRoot,
    {
      LOCAL_VRF_DELAY_AFTER_REQUESTS: '1',
      LOCAL_VRF_FULFILLMENT_DELAY_MS: '60000',
    },
  )

  const deployment = await waitForDeployment(previousBootId)
  const signum = deployment.games.find((game) => game.name === 'SignumGame')
  if (!signum) throw new Error('The local node did not deploy SignumGame.')

  startProcess(
    'signum',
    process.execPath,
    [
      signumViteCli,
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      '5173',
      '--strictPort',
    ],
    root,
  )
  startProcess(
    'simulator',
    process.execPath,
    [
      simulatorViteCli,
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      '3300',
      '--strictPort',
    ],
    simulatorRoot,
  )
  await Promise.all([
    waitForUrl('http://127.0.0.1:5173/game.manifest.json'),
    waitForUrl('http://127.0.0.1:3300'),
  ])

  const browserEnvironment = {
    ...process.env,
    SIGNUM_GAME_ADDRESS: signum.address,
  }
  const localEdge =
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  if (
    process.platform === 'win32' &&
    !browserEnvironment.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH &&
    existsSync(localEdge)
  ) {
    browserEnvironment.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = localEdge
  }

  const test = spawnSync(
    process.execPath,
    [playwrightCli, 'test', '--config=playwright.simulator.config.ts'],
    {
      cwd: root,
      env: browserEnvironment,
      stdio: 'inherit',
      windowsHide: true,
    },
  )
  if (test.error) throw test.error
  if (test.status !== 0) {
    throw new Error(
      `Playwright exited with status ${test.status ?? 'unknown'}.`,
    )
  }
} finally {
  await stopServices()
  for (const contract of stagedContracts) unlinkSync(contract)
}

function stageContract(file) {
  const source = resolve(root, 'contracts', file)
  const destination = resolve(simulatorContracts, file)
  if (dirname(destination) !== simulatorContracts) {
    throw new Error(`Refusing to stage contract outside ${simulatorContracts}`)
  }
  if (existsSync(destination)) {
    if (readFileSync(source, 'utf8') !== readFileSync(destination, 'utf8')) {
      throw new Error(`${destination} differs from the canonical contract.`)
    }
    return
  }
  copyFileSync(source, destination)
  stagedContracts.push(destination)
}

function runCommand(label, command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `${label} exited with status ${result.status ?? 'unknown'}.`,
    )
  }
}

function startProcess(name, command, args, cwd, extraEnvironment = {}) {
  const log = createWriteStream(resolve(logDirectory, `${name}.log`), {
    flags: 'wx',
  })
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...extraEnvironment },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
    windowsHide: true,
  })
  child.stdout.pipe(log)
  child.stderr.pipe(log)
  processes.push({ name, child, log })
  return child
}

async function waitForDeployment(oldBootId) {
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    ensureServicesRunning()
    const deployment = readDeployment()
    if (
      deployment?.bootId &&
      deployment.bootId !== oldBootId &&
      deployment.games?.some((game) => game.name === 'SignumGame')
    ) {
      return deployment
    }
    await delay(500)
  }
  throw new Error('Timed out waiting for the fresh local deployment.')
}

async function waitForUrl(url) {
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    ensureServicesRunning()
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // The service is still starting.
    }
    await delay(250)
  }
  throw new Error(`Timed out waiting for ${url}.`)
}

async function waitForRpc() {
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    ensureServicesRunning()
    try {
      const response = await fetch('http://127.0.0.1:8545', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_chainId',
          params: [],
        }),
      })
      const payload = await response.json()
      if (response.ok && payload.result === '0x7a69') return
    } catch {
      // Hardhat is still starting.
    }
    await delay(250)
  }
  throw new Error('Timed out waiting for the local Hardhat JSON-RPC server.')
}

function readDeployment() {
  try {
    return JSON.parse(readFileSync(deployedFile, 'utf8'))
  } catch {
    return undefined
  }
}

function ensureServicesRunning() {
  const stopped = processes.find(({ child }) => child.exitCode !== null)
  if (stopped) {
    throw new Error(
      `${stopped.name} exited early with code ${stopped.child.exitCode}. See ${logDirectory}.`,
    )
  }
}

async function stopServices() {
  if (process.platform === 'win32') {
    for (const { child } of processes) {
      if (child.pid === undefined) continue
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      })
    }
  } else {
    for (const { child } of processes) {
      if (child.pid === undefined) continue
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch {
        // The process group has already exited.
      }
    }
  }
  await delay(1_000)
  if (process.platform !== 'win32') {
    for (const { child } of processes) {
      if (child.pid === undefined) continue
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        // The process group exited after SIGTERM.
      }
    }
  }
  for (const { log } of processes) log.end()
}

function delay(milliseconds) {
  return new Promise((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds),
  )
}

function assertPortAvailable(port) {
  return new Promise((resolvePromise, reject) => {
    const server = createServer()
    server.once('error', (error) => {
      reject(
        new Error(
          `Port ${port} is unavailable. Stop the existing local service before running the simulator E2E test.`,
          { cause: error },
        ),
      )
    })
    server.listen(port, '127.0.0.1', () => {
      server.close(resolvePromise)
    })
  })
}

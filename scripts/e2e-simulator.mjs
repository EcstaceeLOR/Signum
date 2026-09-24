import { spawn, spawnSync } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const root = process.cwd()
const artifactsDir = resolve(root, 'artifacts/e2e')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const guestOrigin = 'http://127.0.0.1:5173'
const simulatorOrigin = 'http://127.0.0.1:3300'
const serviceProcesses = []
const browserEntries = []
let browserProcess
let chromeProfile
let pausedLocalNodePid

const guestSnapshotExpression = `(() => {
  const workbench = document.querySelector('.workbench')
  const transmit = document.querySelector('.transmit-button')
  const result = document.querySelector('.signal-reveal__result')
  const entries = result
    ? Object.fromEntries([...result.querySelectorAll(':scope > div')].map((row) => [
        row.querySelector('dt')?.textContent?.trim() ?? '',
        row.querySelector('dd')?.textContent?.trim() ?? '',
      ]))
    : null
  return {
    ready: document.body?.innerText.includes('Chain host ready') ?? false,
    canTransmit: Boolean(transmit && !transmit.disabled),
    state: workbench?.dataset.sessionState ?? null,
    hasCancel: [...document.querySelectorAll('button')].some((button) =>
      button.textContent?.includes('Cancel delayed request'),
    ),
    matchBeats: document.querySelectorAll('.signal-reveal__beat[data-result="match"]').length,
    result: entries,
    text: document.body?.innerText ?? '',
  }
})()`

await mkdir(artifactsDir, { recursive: true })

try {
  await runCommand(process.execPath, ['scripts/sync-simulator-contracts.mjs'])

  serviceProcesses.push(
    startLoggedProcess(
      'signum-vite',
      npmCommand,
      ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
      resolve(artifactsDir, 'signum-vite.log'),
    ),
  )
  await waitForHttp(`${guestOrigin}/game.manifest.json`, 60_000)

  serviceProcesses.push(
    startLoggedProcess(
      'chain-simulator',
      npmCommand,
      ['start', '--prefix', './vendor/chain-casino-sdk'],
      resolve(artifactsDir, 'chain-simulator.log'),
    ),
  )

  const deployment = await waitForJson(
    `${simulatorOrigin}/__local-contracts.json`,
    (value) =>
      Array.isArray(value?.games) &&
      value.games.some((game) => game?.name === 'SignumGame'),
    120_000,
  )
  const signum = deployment.games.find((game) => game.name === 'SignumGame')
  assert(signum?.address, 'SignumGame was not deployed by the simulator.')

  // The official local-node process also owns the auto-fulfilling VRF watcher,
  // while its spawned Hardhat child owns the chain. Pausing only local-node
  // leaves the real chain alive and lets this test deterministically exercise
  // both manual fulfillment and the stuck-randomness deadline without adding a
  // fake randomness path to production or guest code.
  pausedLocalNodePid = pauseLocalVerifyNetworkProcess()

  const debugPort = await getFreePort()
  chromeProfile = await mkdtemp(resolve(tmpdir(), 'signum-e2e-chrome-'))
  const chrome = findChrome()
  browserProcess = startLoggedProcess(
    'chrome',
    chrome,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${chromeProfile}`,
      'about:blank',
    ],
    resolve(artifactsDir, 'chrome-process.log'),
  )

  const version = await waitForJson(
    `http://127.0.0.1:${debugPort}/json/version`,
    (value) => Boolean(value?.webSocketDebuggerUrl),
    30_000,
  )

  const contexts = new Map()
  const attachedTargets = new Map()
  const cdp = new CdpClient(version.webSocketDebuggerUrl, recordBrowserEvent)
  cdp.addEventListener(async (message) => {
    if (message.method === 'Target.attachedToTarget') {
      const childSession = message.params?.sessionId
      const targetId = message.params?.targetInfo?.targetId
      if (targetId && childSession) attachedTargets.set(targetId, childSession)
      if (childSession) await enableSession(cdp, childSession)
      return
    }
    if (message.method === 'Target.detachedFromTarget') {
      const childSession = message.params?.sessionId
      for (const [targetId, sessionId] of attachedTargets) {
        if (sessionId === childSession) attachedTargets.delete(targetId)
      }
      return
    }
    if (message.method === 'Runtime.executionContextCreated') {
      const context = message.params?.context
      if (context?.id && message.sessionId) {
        contexts.set(`${message.sessionId}:${context.id}`, {
          sessionId: message.sessionId,
          ...context,
        })
      }
      return
    }
    if (message.method === 'Runtime.executionContextDestroyed') {
      const contextId = message.params?.executionContextId
      for (const [key, context] of contexts) {
        if (context.sessionId === message.sessionId && context.id === contextId) {
          contexts.delete(key)
        }
      }
      return
    }
    if (message.method === 'Runtime.executionContextsCleared' && message.sessionId) {
      for (const [key, context] of contexts) {
        if (context.sessionId === message.sessionId) contexts.delete(key)
      }
    }
  })
  await cdp.connect()

  const gameUrl = `${simulatorOrigin}/?game=${encodeURIComponent(
    guestOrigin,
  )}&gameAddress=${encodeURIComponent(signum.address)}`
  const { targetId } = await cdp.send('Target.createTarget', { url: gameUrl })
  const { sessionId: pageSession } = await cdp.send('Target.attachToTarget', {
    targetId,
    flatten: true,
  })
  attachedTargets.set(targetId, pageSession)
  await enableSession(cdp, pageSession)
  await cdp.send(
    'Target.setAutoAttach',
    {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
    },
    pageSession,
  )

  const evaluateGuest = async (expression) => {
    const deadline = Date.now() + 15_000
    let lastError
    while (Date.now() < deadline) {
      await attachGuestTargets(cdp, attachedTargets)
      const context = selectGuestContext(contexts)
      if (!context) {
        await sleep(100)
        continue
      }
      try {
        const result = await cdp.send(
          'Runtime.evaluate',
          {
            expression,
            contextId: context.id,
            awaitPromise: true,
            returnByValue: true,
            userGesture: true,
          },
          context.sessionId,
        )
        if (result.exceptionDetails) {
          throw new Error(result.exceptionDetails.text ?? 'Guest evaluation failed.')
        }
        return result.result?.value
      } catch (error) {
        lastError = error
        await sleep(100)
      }
    }
    throw lastError ?? new Error('The Signum iframe execution context was not available.')
  }

  const waitForGuest = async (label, predicate, timeoutMs = 30_000) => {
    const deadline = Date.now() + timeoutMs
    let latest
    while (Date.now() < deadline) {
      latest = await evaluateGuest(guestSnapshotExpression)
      if (predicate(latest)) return latest
      await sleep(150)
    }
    throw new Error(
      `Timed out waiting for ${label}. Latest guest snapshot: ${JSON.stringify(latest)}`,
    )
  }

  await waitForGuest(
    'Chain host readiness',
    (snapshot) => snapshot.ready && snapshot.canTransmit,
    60_000,
  )

  await evaluateGuest(`document.querySelector('.transmit-button')?.click()`)
  const firstWaiting = await waitForGuest(
    'WAITING_RANDOMNESS after the first wager',
    (snapshot) => snapshot.state === 'waiting_randomness',
    30_000,
  )
  assert(
    firstWaiting.text.includes('Awaiting a verified echo'),
    'The guest did not present the verified-randomness waiting state.',
  )

  await fulfillLatestRandomness()
  let firstResult = await waitForGuest(
    'the first settled/revealing outcome',
    (snapshot) => snapshot.state === 'revealing' || snapshot.state === 'settled',
    30_000,
  )
  if (firstResult.state === 'revealing') {
    await evaluateGuest(
      `[...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Skip reveal'))?.click()`,
    )
  }
  firstResult = await waitForGuest(
    'the first settled result',
    (snapshot) => snapshot.state === 'settled' && Boolean(snapshot.result?.Matches),
    15_000,
  )
  verifyPulseResult(firstResult)

  await evaluateGuest(
    `[...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Compose another signal'))?.click()`,
  )
  await waitForGuest(
    'a ready second round',
    (snapshot) => snapshot.state === 'ready' && snapshot.canTransmit,
    15_000,
  )

  await evaluateGuest(`document.querySelector('.transmit-button')?.click()`)
  await waitForGuest(
    'WAITING_RANDOMNESS after the second wager',
    (snapshot) => snapshot.state === 'waiting_randomness',
    30_000,
  )

  await mineBlocks(20)
  const delayed = await waitForGuest(
    'the delayed-randomness cancellation control',
    (snapshot) => snapshot.hasCancel,
    30_000,
  )
  assert(
    delayed.text.includes('Chain is still producing your verified echo'),
    'The delayed randomness state was not presented to the player.',
  )

  await evaluateGuest(
    `[...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Cancel delayed request'))?.click()`,
  )
  const cancelled = await waitForGuest(
    'cancel-stuck-randomness completion',
    (snapshot) =>
      snapshot.state === 'error' &&
      snapshot.text.includes('The delayed transmission was cancelled by Chain'),
    30_000,
  )
  assert(
    cancelled.text.includes('No result was created'),
    'Cancellation did not end in the expected safe no-result state.',
  )

  const fatalBrowserEntries = browserEntries.filter((entry) => entry.fatal === true)
  if (fatalBrowserEntries.length > 0) {
    throw new Error(
      `Browser-level errors were captured:\n${fatalBrowserEntries
        .map((entry) => `${entry.kind}: ${entry.message}`)
        .join('\n')}`,
    )
  }

  console.log(
    `[e2e] PASS SignumGame ${signum.address}: real session settled, payout agreed with the Pulse paytable, and delayed randomness cancelled safely.`,
  )
} catch (error) {
  await writeFile(
    resolve(artifactsDir, 'failure.txt'),
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  )
  throw error
} finally {
  await writeFile(
    resolve(artifactsDir, 'browser.log'),
    `${browserEntries
      .map((entry) => `[${entry.kind}] ${entry.message}`)
      .join('\n')}\n`,
  )
  if (pausedLocalNodePid && process.platform !== 'win32') {
    try {
      process.kill(pausedLocalNodePid, 'SIGCONT')
    } catch {
      // It may already have exited with the parent simulator process.
    }
  }
  if (browserProcess) stopProcess(browserProcess)
  for (const child of serviceProcesses.reverse()) stopProcess(child)
  if (chromeProfile) await rm(chromeProfile, { recursive: true, force: true })
}

function verifyPulseResult(snapshot) {
  const matches = snapshot.result?.Matches
  const multiplier = snapshot.result?.Multiplier
  const payout = snapshot.result?.Payout
  assert(matches && multiplier && payout, 'Settled result fields are incomplete.')

  const [matchCountText, lengthText] = matches.split('/')
  const matchCount = Number(matchCountText)
  const signalLength = Number(lengthText)
  assert(signalLength === 4, `Expected Pulse to use 4 beats, received ${matches}.`)
  assert(
    snapshot.matchBeats === matchCount,
    `Rendered match beats (${snapshot.matchBeats}) disagree with Matches (${matches}).`,
  )

  const payoutBpsByMatches = [0, 0, 4_000, 14_000, 74_000]
  const expectedBps = payoutBpsByMatches[matchCount]
  assert(expectedBps !== undefined, `Unexpected Pulse match count ${matchCount}.`)

  const displayedMultiplier = Number(multiplier.replace('×', ''))
  const expectedMultiplier = expectedBps / 10_000
  assert(
    Math.abs(displayedMultiplier - expectedMultiplier) < 0.000_001,
    `Multiplier ${multiplier} disagrees with the Pulse paytable (${expectedMultiplier.toFixed(2)}×).`,
  )

  const displayedPayout = Number(payout.split(/\s+/)[0])
  assert(
    Math.abs(displayedPayout - expectedMultiplier) < 0.000_001,
    `Payout ${payout} disagrees with a 1-token wager at ${multiplier}.`,
  )
}

async function fulfillLatestRandomness() {
  const binary = resolve(
    root,
    'vendor/chain-casino-sdk/node_modules/.bin',
    process.platform === 'win32' ? 'tsx.cmd' : 'tsx',
  )
  await runCommand(binary, ['scripts/e2e-vrf-control.ts', 'fulfill-latest'])
}

async function mineBlocks(count) {
  for (let index = 0; index < count; index += 1) {
    const response = await fetch('http://127.0.0.1:8545', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: index + 1,
        method: 'evm_mine',
        params: [],
      }),
    })
    const result = await response.json()
    if (result.error) {
      throw new Error(`evm_mine failed: ${JSON.stringify(result.error)}`)
    }
  }
}

function pauseLocalVerifyNetworkProcess() {
  if (process.platform === 'win32') {
    throw new Error(
      'The deterministic stuck-randomness E2E scenario currently requires Linux, macOS, or WSL so the local VRF watcher can be suspended without stopping Hardhat.',
    )
  }

  const probe = spawnSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' })
  if (probe.status !== 0) {
    throw new Error(`Could not inspect the local simulator process tree: ${probe.stderr}`)
  }
  const candidate = probe.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.*)$/)
      return match ? { pid: Number(match[1]), command: match[2] } : null
    })
    .filter(Boolean)
    .find(
      (processInfo) =>
        processInfo.command.includes('local-node/index.ts') &&
        !processInfo.command.includes('e2e-simulator.mjs'),
    )

  if (!candidate) {
    throw new Error('Could not locate the casino simulator local-node process.')
  }

  process.kill(candidate.pid, 'SIGSTOP')
  console.log(`[e2e] paused local VRF watcher process ${candidate.pid}`)
  return candidate.pid
}

async function attachGuestTargets(cdp, attachedTargets) {
  const { targetInfos = [] } = await cdp.send('Target.getTargets')
  for (const target of targetInfos) {
    if (!target.url?.startsWith(guestOrigin) || attachedTargets.has(target.targetId)) {
      continue
    }
    try {
      const { sessionId } = await cdp.send('Target.attachToTarget', {
        targetId: target.targetId,
        flatten: true,
      })
      attachedTargets.set(target.targetId, sessionId)
      await enableSession(cdp, sessionId)
    } catch {
      // Auto-attach may have won the race. Its event will register the session.
    }
  }
}

function findChrome() {
  const configured = process.env.CHROME_BIN
  if (configured) return configured

  const paths = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]
  for (const path of paths) {
    if (existsSync(path)) return path
  }

  for (const command of [
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
  ]) {
    const probe = spawnSync(command, ['--version'], { stdio: 'ignore' })
    if (probe.status === 0) return command
  }

  throw new Error(
    'Chrome/Chromium was not found. Install Chrome or set CHROME_BIN to its executable.',
  )
}

function startLoggedProcess(label, command, args, logPath, env = process.env) {
  const output = createWriteStream(logPath, { flags: 'w' })
  const child = spawn(command, args, {
    cwd: root,
    env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.pipe(output)
  child.stderr.pipe(output)
  child.on('error', (error) => {
    output.write(`\n[${label}] process error: ${error.stack ?? error.message}\n`)
  })
  child.on('exit', (code, signal) => {
    output.write(`\n[${label}] exited code=${String(code)} signal=${String(signal)}\n`)
    output.end()
  })
  return child
}

function stopProcess(child) {
  if (!child.pid || child.exitCode !== null) return
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' })
    } else {
      process.kill(-child.pid, 'SIGTERM')
    }
  } catch {
    // Best-effort cleanup; the parent process is already exiting.
  }
}

async function runCommand(command, args) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
    })
  })
}

async function waitForHttp(url, timeoutMs) {
  return waitForJson(url, () => true, timeoutMs, false)
}

async function waitForJson(url, predicate, timeoutMs, parseJson = true) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        const value = parseJson ? await response.json() : await response.text()
        if (predicate(value)) return value
      }
    } catch (error) {
      lastError = error
    }
    await sleep(250)
  }
  throw new Error(
    `Timed out waiting for ${url}${lastError ? `: ${String(lastError)}` : ''}`,
  )
}

function getFreePort() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : undefined
      server.close(() => {
        if (port) resolvePromise(port)
        else reject(new Error('Could not allocate a Chrome debugging port.'))
      })
    })
  })
}

function selectGuestContext(contexts) {
  return [...contexts.values()]
    .filter((context) => {
      const origin = String(context.origin ?? '')
      return (
        (origin === guestOrigin || origin === 'http://localhost:5173') &&
        context.auxData?.type === 'default'
      )
    })
    .at(-1)
}

async function enableSession(cdp, sessionId) {
  if (cdp.enabledSessions.has(sessionId)) return
  cdp.enabledSessions.add(sessionId)
  for (const method of ['Runtime.enable', 'Log.enable', 'Page.enable']) {
    try {
      await cdp.send(method, {}, sessionId)
    } catch {
      // Some attached target types do not expose every domain.
    }
  }
}

function recordBrowserEvent(message) {
  if (message.method === 'Runtime.consoleAPICalled') {
    const type = message.params?.type ?? 'log'
    const values = (message.params?.args ?? []).map(
      (argument) => argument.value ?? argument.description ?? argument.type,
    )
    browserEntries.push({
      kind: `console.${type}`,
      message: values.map(String).join(' '),
      fatal: type === 'error' || type === 'assert',
    })
    return
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const details = message.params?.exceptionDetails
    browserEntries.push({
      kind: 'exception',
      message:
        details?.exception?.description ?? details?.text ?? 'Unhandled browser exception',
      fatal: true,
    })
    return
  }
  if (message.method === 'Log.entryAdded') {
    const entry = message.params?.entry
    browserEntries.push({
      kind: `browser.${entry?.level ?? 'log'}`,
      message: entry?.text ?? '',
      fatal: false,
    })
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

class CdpClient {
  constructor(url, onEvent) {
    this.url = url
    this.onEvent = onEvent
    this.nextId = 1
    this.pending = new Map()
    this.listeners = new Set()
    this.enabledSessions = new Set()
  }

  async connect() {
    await new Promise((resolvePromise, reject) => {
      this.socket = new WebSocket(this.url)
      this.socket.addEventListener('open', resolvePromise, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
      this.socket.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data))
        if (message.id) {
          const pending = this.pending.get(message.id)
          if (!pending) return
          this.pending.delete(message.id)
          if (message.error) pending.reject(new Error(message.error.message))
          else pending.resolve(message.result ?? {})
          return
        }
        this.onEvent(message)
        for (const listener of this.listeners) {
          Promise.resolve(listener(message)).catch(() => undefined)
        }
      })
    })
  }

  addEventListener(listener) {
    this.listeners.add(listener)
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject })
      this.socket.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        }),
      )
    })
  }
}

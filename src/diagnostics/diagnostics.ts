const MAX_EVENTS = 25

type DiagnosticEvent = {
  occurredAt: string
  code: string
  stage: string
  errorType?: string
}

const events: DiagnosticEvent[] = []
let currentStage = 'app:boot'

export function setDiagnosticStage(stage: string) {
  currentStage = stage.slice(0, 80)
}

export function recordDiagnostic(code: string, error?: unknown) {
  events.push({
    occurredAt: new Date().toISOString(),
    code: code.slice(0, 80),
    stage: currentStage,
    errorType: error instanceof Error ? error.name.slice(0, 80) : undefined,
  })
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS)
}

export function createDiagnosticExport() {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    buildSha: import.meta.env.VITE_BUILD_SHA || 'development',
    location: {
      embedded: isEmbedded(),
      protocol: window.location.protocol,
    },
    capabilities: {
      secureContext: window.isSecureContext,
      cryptoRandomness:
        typeof globalThis.crypto?.getRandomValues === 'function',
      webAudio: typeof globalThis.AudioContext === 'function',
      localStorage: storageAvailable(),
      reducedMotion:
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
        false,
    },
    currentStage,
    events: [...events],
    privacy:
      'No wallet address, private key, wager amount, balance, raw provider payload, or signal history is collected.',
  }
}

export function downloadDiagnosticExport() {
  const blob = new Blob([JSON.stringify(createDiagnosticExport(), null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `signum-diagnostics-${Date.now()}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function clearDiagnosticEventsForTest() {
  events.length = 0
  currentStage = 'app:boot'
}

function storageAvailable(): boolean {
  try {
    const key = '__signum_diagnostics_probe__'
    window.localStorage.setItem(key, '1')
    window.localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

function isEmbedded(): boolean {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

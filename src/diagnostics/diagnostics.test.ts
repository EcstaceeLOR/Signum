import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  clearDiagnosticEventsForTest,
  createDiagnosticExport,
  recordDiagnostic,
  setDiagnosticStage,
} from './diagnostics'

afterEach(() => {
  clearDiagnosticEventsForTest()
  vi.restoreAllMocks()
})

describe('local diagnostics', () => {
  it('exports capability, stage, build, and code data without sensitive fields', () => {
    setDiagnosticStage('bridge:error')
    recordDiagnostic('BRIDGE_HANDSHAKE_FAILED', new TypeError('secret payload'))

    const diagnostics = createDiagnosticExport()
    const serialized = JSON.stringify(diagnostics)
    expect(diagnostics).toMatchObject({
      schemaVersion: 1,
      currentStage: 'bridge:error',
      events: [
        {
          code: 'BRIDGE_HANDSHAKE_FAILED',
          stage: 'bridge:error',
          errorType: 'TypeError',
        },
      ],
    })
    expect(serialized).not.toContain('secret payload')
    expect(Object.keys(diagnostics)).not.toContain('walletAddress')
    expect(Object.keys(diagnostics)).not.toContain('wager')
  })

  it('keeps only the newest 25 in-memory events', () => {
    for (let index = 0; index < 30; index++) {
      recordDiagnostic(`ERROR_${index}`)
    }
    const diagnostics = createDiagnosticExport()
    expect(diagnostics.events).toHaveLength(25)
    expect(diagnostics.events[0].code).toBe('ERROR_5')
  })
})

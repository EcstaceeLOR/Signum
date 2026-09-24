import { afterEach, describe, expect, it, vi } from 'vitest'

import { ReceiverMode } from './encoding'
import { SignumSoundEngine } from './useSignumSound'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('SignumSoundEngine', () => {
  it('synthesizes distinct mode ambience and every gameplay cue', () => {
    const frequencies: number[] = []
    const types: OscillatorType[] = []
    const close = vi.fn(async () => undefined)

    class AudioContextStub {
      state: AudioContextState = 'running'
      currentTime = 0
      destination = {}
      resume = vi.fn(async () => undefined)
      close = close

      createOscillator() {
        const oscillator = {
          type: 'sine' as OscillatorType,
          frequency: { value: 0 },
          connect: vi.fn(),
          start: () => {
            frequencies.push(oscillator.frequency.value)
            types.push(oscillator.type)
          },
          stop: vi.fn(),
        }
        return oscillator
      }

      createGain() {
        return {
          gain: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        }
      }
    }

    vi.stubGlobal('AudioContext', AudioContextStub)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false }) as MediaQueryList),
    )

    const engine = new SignumSoundEngine()
    engine.configure(ReceiverMode.Pulse, 'READY', false)
    engine.play('tap')
    expect(frequencies).toEqual([98, 620])

    engine.configure(ReceiverMode.Carrier, 'WAITING_RANDOMNESS', false)
    engine.play('match')
    engine.play('miss')
    engine.play('win')
    expect(frequencies).toEqual([98, 620, 390, 520, 141.12, 520, 650, 780])
    expect(types).toContain('sawtooth')

    engine.configure(ReceiverMode.Deepwave, 'SETTLED', true)
    engine.play('win')
    expect(frequencies).toHaveLength(8)

    engine.destroy()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('suppresses the continuous layer for reduced-motion users', () => {
    const starts = vi.fn()
    class AudioContextStub {
      state: AudioContextState = 'running'
      currentTime = 0
      destination = {}
      resume = vi.fn(async () => undefined)
      close = vi.fn(async () => undefined)
      createOscillator() {
        return {
          type: 'sine' as OscillatorType,
          frequency: { value: 0 },
          connect: vi.fn(),
          start: starts,
          stop: vi.fn(),
        }
      }
      createGain() {
        return {
          gain: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        }
      }
    }
    vi.stubGlobal('AudioContext', AudioContextStub)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true }) as MediaQueryList),
    )

    const engine = new SignumSoundEngine()
    engine.configure(ReceiverMode.Deepwave, 'WAITING_RANDOMNESS', false)
    engine.play('rest')

    expect(starts).toHaveBeenCalledTimes(1)
  })
})

import { useCallback, useEffect, useRef, useState } from 'react'

import type { ReceiverMode, SignalBeat } from './encoding'
import type { SignumSessionState } from './sessionMachine'

const MUTE_STORAGE_KEY = 'signum.sound-muted.v1'

type SoundCue = 'tap' | 'rest' | 'match' | 'miss' | 'win'

const MODE_SOUND = {
  0: { tap: 620, rest: 240, drone: 98 },
  1: { tap: 520, rest: 196, drone: 73.42 },
  2: { tap: 420, rest: 146.83, drone: 55 },
} as const

export function useSignumSound(
  mode: ReceiverMode,
  session: SignumSessionState,
) {
  const [muted, setMuted] = useState(loadMuted)
  const [engine] = useState(() => new SignumSoundEngine())
  const previousStatus = useRef(session.status)

  useEffect(() => {
    engine.configure(mode, session.status, muted)
  }, [engine, mode, muted, session.status])

  const playCue = useCallback((cue: SoundCue) => engine.play(cue), [engine])
  const playBeat = useCallback(
    (beat: SignalBeat) => playCue(beat === 1 ? 'tap' : 'rest'),
    [playCue],
  )
  const toggleMuted = useCallback(() => {
    setMuted((current) => {
      const next = !current
      try {
        window.localStorage.setItem(MUTE_STORAGE_KEY, next ? '1' : '0')
      } catch {
        // Storage can be unavailable in sandboxed game iframes.
      }
      if (!next) engine.activate()
      return next
    })
  }, [engine])

  useEffect(() => {
    const previous = previousStatus.current
    previousStatus.current = session.status
    if (previous === session.status) return

    if (session.status === 'REVEALING') engine.play('match', false)
    if (session.status === 'SETTLED') {
      engine.play(session.outcome.payoutBps > 10_000 ? 'win' : 'match', false)
    }
    if (session.status === 'ERROR') engine.play('miss', false)
  }, [engine, session])

  useEffect(() => () => engine.destroy(), [engine])

  return { muted, playBeat, playCue, toggleMuted }
}

export class SignumSoundEngine {
  private context?: AudioContext
  private mode: ReceiverMode = 0
  private phase: SignumSessionState['status'] = 'IDLE'
  private muted = false
  private drone?: OscillatorNode
  private droneGain?: GainNode

  configure(
    mode: ReceiverMode,
    phase: SignumSessionState['status'],
    muted: boolean,
  ) {
    this.mode = mode
    this.phase = phase
    this.muted = muted
    this.syncSoundtrack()
  }

  activate() {
    if (this.muted) return
    const context = this.audioContext()
    if (!context) return
    void context.resume()
    this.syncSoundtrack()
  }

  play(cue: SoundCue, allowActivation = true) {
    if (this.muted) return
    const context =
      this.context ?? (allowActivation ? this.audioContext() : undefined)
    if (!context) return
    void context.resume()
    this.syncSoundtrack()

    const profile = MODE_SOUND[this.mode]
    if (cue === 'win') {
      ;[profile.tap, profile.tap * 1.25, profile.tap * 1.5].forEach(
        (frequency, index) => this.tone(frequency, 'sine', 0.16, index * 0.08),
      )
      return
    }
    if (cue === 'match') {
      this.tone(profile.tap * 0.75, 'sine', 0.14)
      this.tone(profile.tap, 'sine', 0.12, 0.06)
      return
    }
    if (cue === 'miss') {
      this.tone(profile.rest * 0.72, 'sawtooth', 0.18)
      return
    }
    this.tone(
      cue === 'tap' ? profile.tap : profile.rest,
      cue === 'tap' ? 'sine' : 'triangle',
      0.12,
    )
  }

  destroy() {
    this.drone?.stop()
    this.drone = undefined
    this.droneGain = undefined
    if (this.context?.state !== 'closed') void this.context?.close()
    this.context = undefined
  }

  private audioContext(): AudioContext | undefined {
    if (this.context) return this.context
    if (typeof AudioContext === 'undefined') return undefined
    try {
      this.context = new AudioContext()
      return this.context
    } catch {
      return undefined
    }
  }

  private tone(
    frequency: number,
    type: OscillatorType,
    duration: number,
    delay = 0,
  ) {
    const context = this.context
    if (!context) return
    const start = context.currentTime + delay
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = type
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.075, start + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(start)
    oscillator.stop(start + duration)
  }

  private syncSoundtrack() {
    const context = this.context
    if (!context) return

    if (this.prefersQuietSoundtrack()) {
      this.droneGain?.gain.setValueAtTime(0, context.currentTime)
      return
    }

    if (!this.drone) {
      this.drone = context.createOscillator()
      this.droneGain = context.createGain()
      this.drone.type = 'sine'
      this.drone.frequency.value = MODE_SOUND[this.mode].drone
      this.drone.connect(this.droneGain)
      this.droneGain.connect(context.destination)
      this.drone.start()
    }

    this.drone.frequency.value = MODE_SOUND[this.mode].drone
    const level = this.muted ? 0 : soundtrackLevel(this.phase)
    this.droneGain?.gain.setValueAtTime(level, context.currentTime)
  }

  private prefersQuietSoundtrack(): boolean {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
    )
  }
}

function soundtrackLevel(phase: SignumSessionState['status']): number {
  if (phase === 'OPENING_SESSION') return 0.004
  if (phase === 'WAITING_RANDOMNESS') return 0.006
  if (phase === 'REVEALING') return 0.009
  if (phase === 'SETTLED') return 0.003
  return 0.0015
}

function loadMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

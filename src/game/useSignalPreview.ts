import { useCallback, useEffect, useRef, useState } from 'react'

import type { SignalBeat } from './encoding'

const BEAT_INTERVAL_MS = 210
const TONE_DURATION_SECONDS = 0.12

export function useSignalPreview(bits: readonly SignalBeat[]) {
  const [previewIndex, setPreviewIndex] = useState<number>()
  const [isPreviewing, setIsPreviewing] = useState(false)
  const timers = useRef<number[]>([])
  const audioContext = useRef<AudioContext | undefined>(undefined)

  const clearTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer))
    timers.current = []
  }, [])

  const stop = useCallback(() => {
    clearTimers()
    setPreviewIndex(undefined)
    setIsPreviewing(false)
  }, [clearTimers])

  const preview = useCallback(() => {
    clearTimers()
    setIsPreviewing(true)
    setPreviewIndex(undefined)

    bits.forEach((beat, index) => {
      timers.current.push(
        window.setTimeout(() => {
          setPreviewIndex(index)
          playTone(audioContext, beat)
        }, index * BEAT_INTERVAL_MS),
      )
    })
    timers.current.push(
      window.setTimeout(() => {
        setPreviewIndex(undefined)
        setIsPreviewing(false)
        timers.current = []
      }, bits.length * BEAT_INTERVAL_MS),
    )
  }, [bits, clearTimers])

  useEffect(
    () => () => {
      clearTimers()
      if (audioContext.current?.state !== 'closed') {
        void audioContext.current?.close()
      }
    },
    [clearTimers],
  )

  return { isPreviewing, preview, previewIndex, stop }
}

function playTone(contextRef: { current?: AudioContext }, beat: SignalBeat) {
  if (typeof AudioContext === 'undefined') return

  try {
    const context = contextRef.current ?? new AudioContext()
    contextRef.current = context
    void context.resume()

    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = beat === 1 ? 'sine' : 'triangle'
    oscillator.frequency.value = beat === 1 ? 620 : 240
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      context.currentTime + TONE_DURATION_SECONDS,
    )
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + TONE_DURATION_SECONDS)
  } catch {
    // Visual preview remains available when audio is blocked or unsupported.
  }
}

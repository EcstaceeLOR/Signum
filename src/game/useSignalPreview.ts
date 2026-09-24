import { useCallback, useEffect, useRef, useState } from 'react'

import type { SignalBeat } from './encoding'

const BEAT_INTERVAL_MS = 210

export function useSignalPreview(
  bits: readonly SignalBeat[],
  playBeat?: (beat: SignalBeat) => void,
) {
  const [previewIndex, setPreviewIndex] = useState<number>()
  const [isPreviewing, setIsPreviewing] = useState(false)
  const timers = useRef<number[]>([])

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
          playBeat?.(beat)
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
  }, [bits, clearTimers, playBeat])

  useEffect(
    () => () => {
      clearTimers()
    },
    [clearTimers],
  )

  return { isPreviewing, preview, previewIndex, stop }
}

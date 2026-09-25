import { useRef, type KeyboardEvent } from 'react'

import type { SignalBeat } from '../game/encoding'

type SignalComposerProps = {
  bits: readonly SignalBeat[]
  disabled?: boolean
  isPreviewing: boolean
  previewIndex?: number
  muted: boolean
  onToggle(index: number): void
  onReset(): void
  onRandomize(): void
  onPreview(): void
  onToggleMuted(): void
}

export function SignalComposer({
  bits,
  disabled = false,
  isPreviewing,
  previewIndex,
  muted,
  onToggle,
  onReset,
  onRandomize,
  onPreview,
  onToggleMuted,
}: SignalComposerProps) {
  const controlsDisabled = disabled || isPreviewing
  const beatButtons = useRef<Array<HTMLButtonElement | null>>([])

  const moveBeatFocus = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const lastIndex = bits.length - 1
    let nextIndex: number | undefined

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = index === lastIndex ? 0 : index + 1
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = index === 0 ? lastIndex : index - 1
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = lastIndex
    }

    if (nextIndex === undefined) return
    event.preventDefault()
    beatButtons.current[nextIndex]?.focus()
  }

  return (
    <div className="signal-composer">
      <div className="signal-composer__guide">
        <span>
          <b>Tap</b> sends a pulse
        </span>
        <span>
          <b>Rest</b> leaves silence
        </span>
      </div>

      <ol className="beat-grid" aria-label="Player signal">
        {bits.map((beat, index) => {
          const isTap = beat === 1
          const isPlaying = previewIndex === index
          return (
            <li key={index}>
              <button
                ref={(element) => {
                  beatButtons.current[index] = element
                }}
                className={`beat-cell beat-cell--${isTap ? 'tap' : 'rest'}${isPlaying ? ' beat-cell--playing' : ''}`}
                type="button"
                aria-label={`Beat ${index + 1}: ${isTap ? 'Tap' : 'Rest'}`}
                aria-pressed={isTap}
                disabled={controlsDisabled}
                onClick={() => onToggle(index)}
                onKeyDown={(event) => moveBeatFocus(event, index)}
              >
                <span className="beat-cell__number">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="beat-cell__wave" aria-hidden="true" />
                <strong>{isTap ? 'Tap' : 'Rest'}</strong>
                <span className="beat-cell__value">{beat}</span>
              </button>
            </li>
          )
        })}
      </ol>

      <div className="signal-composer__controls">
        <button type="button" disabled={controlsDisabled} onClick={onReset}>
          Reset
        </button>
        <button type="button" disabled={controlsDisabled} onClick={onRandomize}>
          Randomize
        </button>
        <button
          className="signal-composer__preview"
          type="button"
          disabled={controlsDisabled}
          onClick={onPreview}
        >
          <span aria-hidden="true">▶</span>
          {isPreviewing ? 'Listening…' : 'Preview signal'}
        </button>
        <button
          className="signal-composer__sound"
          type="button"
          aria-label={muted ? 'Enable sound' : 'Mute sound'}
          aria-pressed={muted}
          onClick={onToggleMuted}
        >
          <span aria-hidden="true">{muted ? '◌' : '◉'}</span>
          {muted ? 'Sound off' : 'Sound on'}
        </button>
      </div>
      <span className="sr-only" aria-live="polite">
        {isPreviewing ? 'Playing signal preview.' : ''}
      </span>
    </div>
  )
}

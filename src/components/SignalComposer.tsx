import type { SignalBeat } from '../game/encoding'

type SignalComposerProps = {
  bits: readonly SignalBeat[]
  disabled?: boolean
  isPreviewing: boolean
  previewIndex?: number
  onToggle(index: number): void
  onReset(): void
  onRandomize(): void
  onPreview(): void
}

export function SignalComposer({
  bits,
  disabled = false,
  isPreviewing,
  previewIndex,
  onToggle,
  onReset,
  onRandomize,
  onPreview,
}: SignalComposerProps) {
  const controlsDisabled = disabled || isPreviewing

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
                className={`beat-cell beat-cell--${isTap ? 'tap' : 'rest'}${isPlaying ? ' beat-cell--playing' : ''}`}
                type="button"
                aria-label={`Beat ${index + 1}: ${isTap ? 'Tap' : 'Rest'}`}
                aria-pressed={isTap}
                disabled={controlsDisabled}
                onClick={() => onToggle(index)}
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
      </div>
      <span className="sr-only" aria-live="polite">
        {isPreviewing ? 'Playing signal preview.' : ''}
      </span>
    </div>
  )
}

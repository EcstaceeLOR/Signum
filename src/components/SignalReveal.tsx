import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { signalMaskToBits } from '../game/encoding'
import type { SignumSessionState } from '../game/sessionMachine'
import { formatTokenAmount } from '../game/wager'

export const REVEAL_HOLD_MS = 300
export const REVEAL_BEAT_MS = 240
export const REVEAL_FINISH_MS = 350
export const REDUCED_REVEAL_MS = 120

type RevealState = Extract<
  SignumSessionState,
  { status: 'REVEALING' | 'SETTLED' }
>

type SignalRevealProps = {
  state: RevealState
  token?: { decimals: number; symbol: string }
  onBeatReveal?(matches: boolean): void
  onComplete(): void | Promise<void>
  onPlayAgain(): void
  experience?: 'chain' | 'demo'
}

const TIER_LABELS = [
  'Signal faded',
  'Faint echo',
  'Echo held',
  'Strong resonance',
  'Deep resonance',
  'Perfect frequency',
] as const

export function SignalReveal({
  state,
  token,
  onBeatReveal,
  onComplete,
  onPlayAgain,
  experience = 'chain',
}: SignalRevealProps) {
  const { outcome } = state
  const [revealedCount, setRevealedCount] = useState(() =>
    state.status === 'SETTLED' ? outcome.signalLength : 0,
  )
  const completed = useRef(state.status === 'SETTLED')
  const playerBits = useMemo(
    () => signalMaskToBits(outcome.playerSignal, outcome.signalLength),
    [outcome.playerSignal, outcome.signalLength],
  )
  const ghostBits = useMemo(
    () => signalMaskToBits(outcome.ghostSignal, outcome.signalLength),
    [outcome.ghostSignal, outcome.signalLength],
  )

  const finishReveal = useCallback(() => {
    if (completed.current) return
    completed.current = true
    setRevealedCount(outcome.signalLength)
    void onComplete()
  }, [onComplete, outcome.signalLength])

  useEffect(() => {
    if (state.status === 'SETTLED') {
      completed.current = true
      return
    }

    completed.current = false
    const timers: ReturnType<typeof setTimeout>[] = []
    const reducedMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

    if (reducedMotion) {
      timers.push(setTimeout(finishReveal, REDUCED_REVEAL_MS))
    } else {
      ghostBits.forEach((ghostBeat, index) => {
        timers.push(
          setTimeout(
            () => {
              setRevealedCount(index + 1)
              onBeatReveal?.(ghostBeat === playerBits[index])
            },
            REVEAL_HOLD_MS + index * REVEAL_BEAT_MS,
          ),
        )
      })
      timers.push(
        setTimeout(
          finishReveal,
          REVEAL_HOLD_MS +
            (outcome.signalLength - 1) * REVEAL_BEAT_MS +
            REVEAL_FINISH_MS,
        ),
      )
    }

    return () => timers.forEach(clearTimeout)
  }, [
    finishReveal,
    ghostBits,
    onBeatReveal,
    outcome.signalLength,
    playerBits,
    state.sessionKey,
    state.status,
  ])

  const settled = state.status === 'SETTLED'
  const perfect = outcome.matchCount === outcome.signalLength
  const tierLabel = perfect
    ? 'Perfect echo'
    : (TIER_LABELS[outcome.payoutTier] ?? 'Verified echo')

  return (
    <section
      className="signal-reveal"
      id="wager-feedback"
      aria-labelledby="signal-reveal-title"
      data-phase={state.status.toLowerCase()}
      data-experience={experience}
      data-payout-tier={settled ? outcome.payoutTier : undefined}
      data-perfect={settled && perfect ? 'true' : undefined}
    >
      <header className="signal-reveal__heading">
        <div>
          {experience === 'demo' ? (
            <span className="demo-badge">
              DEMO · No real wager or on-chain settlement
            </span>
          ) : null}
          <p className="eyebrow">
            {settled
              ? `Payout tier ${outcome.payoutTier}`
              : experience === 'demo'
                ? 'Local demo echo'
                : 'Verified echo'}
          </p>
          <h4 id="signal-reveal-title">
            {settled
              ? tierLabel
              : experience === 'demo'
                ? 'Receiving the local echo'
                : 'Receiving the ghost signal'}
          </h4>
        </div>
        {!settled ? (
          <button
            className="signal-reveal__skip"
            type="button"
            onClick={finishReveal}
          >
            Skip reveal
          </button>
        ) : null}
      </header>

      <ol className="signal-reveal__beats" aria-label="Signal comparison">
        {playerBits.map((playerBeat, index) => {
          const revealed = settled || index < revealedCount
          const ghostBeat = ghostBits[index]
          const matches = playerBeat === ghostBeat
          const playerLabel = beatLabel(playerBeat)
          const ghostLabel = beatLabel(ghostBeat)

          return (
            <li
              key={index}
              className="signal-reveal__beat"
              data-result={revealed ? (matches ? 'match' : 'miss') : 'pending'}
              aria-label={
                revealed
                  ? `Beat ${index + 1}: player ${playerLabel}, echo ${ghostLabel}, ${matches ? 'match' : 'miss'}.`
                  : `Beat ${index + 1}: player ${playerLabel}, echo pending.`
              }
            >
              <span className="signal-reveal__beat-number" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="signal-reveal__comparison" aria-hidden="true">
                <SignalGlyph beat={playerBeat} />
                <i />
                {revealed ? <SignalGlyph beat={ghostBeat} /> : <b>?</b>}
              </span>
              <strong aria-hidden="true">
                {revealed ? (matches ? 'Match' : 'Miss') : 'Listening'}
              </strong>
            </li>
          )
        })}
      </ol>

      {!settled ? (
        <p className="signal-reveal__progress" role="status" aria-live="polite">
          {revealedCount} of {outcome.signalLength} ghost beats received
        </p>
      ) : (
        <SettledResult state={state} token={token} experience={experience} />
      )}

      {settled ? (
        <button
          className="signal-reveal__again"
          type="button"
          onClick={onPlayAgain}
        >
          Compose another signal
        </button>
      ) : null}
    </section>
  )
}

function SignalGlyph({ beat }: { beat: 0 | 1 }) {
  return (
    <span className={`signal-glyph signal-glyph--${beat ? 'tap' : 'rest'}`}>
      {beat ? 'Tap' : 'Rest'}
    </span>
  )
}

function SettledResult({
  state,
  token,
  experience,
}: {
  state: Extract<SignumSessionState, { status: 'SETTLED' }>
  token?: { decimals: number; symbol: string }
  experience: 'chain' | 'demo'
}) {
  const { outcome } = state
  const payout = token
    ? `${formatTokenAmount(outcome.payout, token.decimals)} ${token.symbol}`
    : `${outcome.payout.toString()} base units`

  return (
    <dl className="signal-reveal__result" aria-label="Settled result">
      <div>
        <dt>Matches</dt>
        <dd>
          {outcome.matchCount}/{outcome.signalLength}
        </dd>
      </div>
      <div>
        <dt>Multiplier</dt>
        <dd>{formatMultiplier(outcome.payoutBps)}</dd>
      </div>
      <div>
        <dt>Payout</dt>
        <dd aria-label="Settled payout">{payout}</dd>
      </div>
      <div>
        <dt>{experience === 'demo' ? 'Demo round' : 'Session ID'}</dt>
        <dd>{state.sessionId ?? state.sessionKey}</dd>
      </div>
    </dl>
  )
}

function beatLabel(beat: 0 | 1): 'Tap' | 'Rest' {
  return beat ? 'Tap' : 'Rest'
}

function formatMultiplier(payoutBps: number): string {
  return `${(payoutBps / 10_000).toFixed(2)}×`
}

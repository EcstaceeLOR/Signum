import { receiverDefinition } from '../game/receivers'
import type { SignalJournalRound } from '../game/useSignalJournal'
import { routes } from '../app/routes'

type SignalJournalProps = {
  rounds: readonly SignalJournalRound[]
  onClear(): void
}

export function SignalJournal({ rounds, onClear }: SignalJournalProps) {
  const best = bestRound(rounds)
  const energy = sessionEnergy(rounds.length)

  return (
    <details className="signal-journal">
      <summary>
        <span>
          <small>Local signal journal</small>
          <strong>
            {rounds.length === 0
              ? 'Your completed echoes appear here'
              : `${rounds.length} recent ${rounds.length === 1 ? 'echo' : 'echoes'} · ${energy}`}
          </strong>
        </span>
        <span aria-hidden="true">+</span>
      </summary>

      <div className="signal-journal__content">
        <p className="signal-journal__notice">
          History is cosmetic and stored only in this browser. Every round is
          independent; past signals and results never predict or change future
          odds.
        </p>

        {rounds.length === 0 ? (
          <p>Complete a practice or Chain round to begin your local journal.</p>
        ) : (
          <>
            <dl className="signal-journal__stats">
              <div>
                <dt>Session energy</dt>
                <dd>{energy}</dd>
              </div>
              <div>
                <dt>Personal best</dt>
                <dd>
                  {best?.matchCount}/{best?.signalLength} matches
                </dd>
              </div>
              <div>
                <dt>Most used</dt>
                <dd>{mostUsedReceiver(rounds)}</dd>
              </div>
            </dl>

            <ol className="signal-journal__rounds">
              {rounds.slice(0, 8).map((round) => (
                <li key={round.id}>
                  <span>
                    <strong>{receiverDefinition(round.mode).name}</strong>
                    <small>
                      {round.experience === 'demo' ? 'Practice' : 'Chain'}
                    </small>
                  </span>
                  <code aria-label="Player signal">
                    {signalLabel(round.playerSignal, round.signalLength)}
                  </code>
                  <span>
                    <strong>
                      {round.matchCount}/{round.signalLength}
                    </strong>
                    <small>{(round.payoutBps / 10_000).toFixed(2)}x</small>
                  </span>
                  <a href={`${routes.results}/${encodeURIComponent(round.id)}`}>
                    Receipt
                  </a>
                </li>
              ))}
            </ol>

            <button type="button" onClick={onClear}>
              Clear local history
            </button>
          </>
        )}
      </div>
    </details>
  )
}

function bestRound(rounds: readonly SignalJournalRound[]) {
  let best: SignalJournalRound | undefined
  for (const round of rounds) {
    if (
      !best ||
      round.matchCount / round.signalLength >
        best.matchCount / best.signalLength
    ) {
      best = round
    }
  }
  return best
}

function mostUsedReceiver(rounds: readonly SignalJournalRound[]): string {
  const counts = [0, 0, 0]
  for (const round of rounds) counts[round.mode]++
  let mode = 0
  for (let index = 1; index < counts.length; index++) {
    if (counts[index] > counts[mode]) mode = index
  }
  return receiverDefinition(mode as SignalJournalRound['mode']).name
}

function signalLabel(playerSignal: number, signalLength: number): string {
  return Array.from({ length: signalLength }, (_, index) =>
    playerSignal & (1 << index) ? 'T' : 'R',
  ).join(' ')
}

function sessionEnergy(rounds: number): string {
  if (rounds >= 8) return 'Peak resonance'
  if (rounds >= 4) return 'Resonant'
  if (rounds >= 2) return 'Building'
  return 'Quiet'
}

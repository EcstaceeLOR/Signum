import { Link, useParams } from 'react-router'

import { routes } from '../app/routes'
import { usePageMetadata } from '../app/usePageMetadata'
import { signalMaskToBits } from '../game/encoding'
import { payoutFor } from '../game/math'
import { receiverDefinition } from '../game/receivers'
import {
  readSignalJournal,
  type SignalJournalRound,
} from '../game/useSignalJournal'

export function ResultPage() {
  const { roundId } = useParams()
  const round = readSignalJournal().find((item) => item.id === roundId)
  usePageMetadata(
    'Round receipt',
    'A locally stored Signum round receipt.',
    `${routes.results}/${roundId}`,
  )

  if (!round) return <ReceiptRecovery />
  if (!isCompleteReceipt(round)) return <ReceiptRecovery legacy />

  const receiver = receiverDefinition(round.mode)
  const payout = payoutFor(round.mode, round.matchCount)
  const signalLength = round.signalLength as 4 | 6 | 8
  const player = signalMaskToBits(round.playerSignal, signalLength)
  const ghost = signalMaskToBits(round.ghostSignal, signalLength)
  const multiplier = (payout.payoutBps / 10_000).toFixed(2)

  return (
    <article
      className="guest-shell receipt-page"
      aria-labelledby="receipt-title"
    >
      <p className="eyebrow">
        {round.experience === 'demo'
          ? 'Practice receipt · no real funds'
          : 'Chain receipt'}
      </p>
      <h1 id="receipt-title" data-page-heading tabIndex={-1}>
        Transmission receipt
      </h1>
      <p className="subtitle">
        Reconstructed from Signum’s canonical receiver rules and your locally
        indexed round data.
      </p>
      <dl className="receipt-summary">
        <div>
          <dt>Receiver</dt>
          <dd>{receiver.name}</dd>
        </div>
        <div>
          <dt>Matches</dt>
          <dd>
            {round.matchCount}/{round.signalLength}
          </dd>
        </div>
        <div>
          <dt>Multiplier</dt>
          <dd>{multiplier}×</dd>
        </div>
        <div>
          <dt>Return</dt>
          <dd>{round.payout}</dd>
        </div>
        <div>
          <dt>Wager</dt>
          <dd>{round.wager}</dd>
        </div>
        <div>
          <dt>Completed</dt>
          <dd>{new Date(round.completedAt).toLocaleString()}</dd>
        </div>
      </dl>
      <section className="receipt-signals" aria-label="Signal comparison">
        <h2>Signal comparison</h2>
        <ol>
          {player.map((bit, index) => (
            <li key={index}>
              <strong>Beat {index + 1}</strong>
              <span>You: {bit ? 'Tap' : 'Rest'}</span>
              <span>Echo: {ghost[index] ? 'Tap' : 'Rest'}</span>
              <b>{bit === ghost[index] ? 'Match' : 'Miss'}</b>
            </li>
          ))}
        </ol>
      </section>
      <p className="receipt-proof">
        {round.experience === 'demo'
          ? 'Practice outcomes are local and have no Chain transaction or VRF proof.'
          : round.transactionHash
            ? `Chain transaction: ${round.transactionHash}`
            : 'Chain proof is unavailable in this local receipt.'}
      </p>
      <div className="receipt-actions">
        <Link to={`${routes.play}/${receiver.name.toLowerCase()}`}>
          Play again
        </Link>
        <Link to={routes.history}>View history</Link>
        <Link to={routes.fairness}>Inspect fairness</Link>
        <CopyReceipt round={round} multiplier={multiplier} />
      </div>
    </article>
  )
}

function CopyReceipt({
  round,
  multiplier,
}: {
  round: SignalJournalRound
  multiplier: string
}) {
  return (
    <button
      type="button"
      onClick={() =>
        void navigator.clipboard?.writeText(
          `Signum ${round.experience} receipt\nReceiver: ${receiverDefinition(round.mode).name}\nMatches: ${round.matchCount}/${round.signalLength}\nMultiplier: ${multiplier}x\nReturn: ${round.payout}\nCompleted: ${new Date(round.completedAt).toISOString()}`,
        )
      }
    >
      Copy receipt
    </button>
  )
}

function ReceiptRecovery({ legacy = false }: { legacy?: boolean }) {
  return (
    <article
      className="guest-shell receipt-page"
      aria-labelledby="receipt-title"
    >
      <p className="eyebrow">Receipt unavailable</p>
      <h1 id="receipt-title" data-page-heading tabIndex={-1}>
        This receipt cannot be reconstructed.
      </h1>
      <p>
        {legacy
          ? 'This older local journal entry did not retain enough data for a trustworthy receipt.'
          : 'The receipt may have expired, been cleared, or belong to another browser profile.'}
      </p>
      <Link to={routes.history}>View local history</Link>
    </article>
  )
}

function isCompleteReceipt(
  round: SignalJournalRound,
): round is SignalJournalRound & {
  ghostSignal: number
  wager: string
  payout: string
} {
  return (
    Number.isInteger(round.ghostSignal) &&
    typeof round.wager === 'string' &&
    typeof round.payout === 'string'
  )
}

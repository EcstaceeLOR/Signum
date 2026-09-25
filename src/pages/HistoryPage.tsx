import { useState } from 'react'
import { Link } from 'react-router'

import { routes } from '../app/routes'
import { usePageMetadata } from '../app/usePageMetadata'
import { receiverDefinition } from '../game/receivers'
import { useSignalJournal } from '../game/useSignalJournal'

export function HistoryPage() {
  const [environment, setEnvironment] = useState<'all' | 'demo' | 'chain'>(
    'all',
  )
  const journal = useSignalJournal('demo')
  usePageMetadata(
    'History',
    'Your locally indexed Signum receipts.',
    routes.history,
  )
  const rounds = journal.rounds.filter(
    (round) => environment === 'all' || round.experience === environment,
  )

  return (
    <article
      className="guest-shell history-page"
      aria-labelledby="history-title"
    >
      <p className="eyebrow">Local round index</p>
      <h1 id="history-title" data-page-heading tabIndex={-1}>
        Your signal history
      </h1>
      <p className="subtitle">
        Up to 20 completed rounds stored in this browser only. This is not your
        full wallet or Chain history.
      </p>
      <fieldset>
        <legend>Show rounds from</legend>
        {(['all', 'demo', 'chain'] as const).map((value) => (
          <label key={value}>
            <input
              type="radio"
              name="history-environment"
              checked={environment === value}
              onChange={() => setEnvironment(value)}
            />
            {value === 'all'
              ? 'All environments'
              : value === 'demo'
                ? 'Practice only'
                : 'Chain only'}
          </label>
        ))}
      </fieldset>
      {rounds.length === 0 ? (
        <p role="status">
          No matching local receipts yet. Complete a round to see it here.
        </p>
      ) : (
        <ol className="history-list">
          {rounds.map((round) => (
            <li key={round.id}>
              <Link to={`${routes.history}/${encodeURIComponent(round.id)}`}>
                <strong>{receiverDefinition(round.mode).name}</strong> ·{' '}
                {round.experience === 'demo' ? 'Practice' : 'Chain'} ·{' '}
                {round.matchCount}/{round.signalLength} matches ·{' '}
                {(round.payoutBps / 10_000).toFixed(2)}×
              </Link>
              <time dateTime={new Date(round.completedAt).toISOString()}>
                {new Date(round.completedAt).toLocaleString()}
              </time>
            </li>
          ))}
        </ol>
      )}
      {journal.rounds.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            if (
              window.confirm(
                'Clear all locally stored Signum history? This cannot be undone.',
              )
            )
              journal.clear()
          }}
        >
          Clear local history
        </button>
      ) : null}
    </article>
  )
}

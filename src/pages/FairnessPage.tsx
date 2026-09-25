import { Link } from 'react-router'
import { routes } from '../app/routes'
import { usePageMetadata } from '../app/usePageMetadata'
import { RECEIVERS } from '../game/receivers'
import { payoutFor } from '../game/math'

export function FairnessPage() {
  usePageMetadata(
    'Fairness',
    'Inspect Signum receiver RTP, maximum payouts, and verification model.',
    routes.fairness,
  )
  return (
    <article className="information-page">
      <p className="eyebrow">Public rules</p>
      <h1 data-page-heading tabIndex={-1}>
        Fairness you can reconstruct.
      </h1>
      <p>
        Every possible complete player pattern has identical odds. Echo beats
        are independent, and payout depends only on match count under a fixed
        receiver table.
      </p>
      <div className="home-receiver-grid">
        {RECEIVERS.map((receiver) => (
          <section key={receiver.mode}>
            <h2>{receiver.name}</h2>
            <p>
              {receiver.signalLength} beats · {receiver.rtp} RTP ·{' '}
              {receiver.maximumPayout} maximum
            </p>
          </section>
        ))}
      </div>
      <section aria-labelledby="paytable-title">
        <h2 id="paytable-title">Canonical paytables</h2>
        {RECEIVERS.map((receiver) => (
          <section
            key={receiver.mode}
            aria-labelledby={`${receiver.name}-table`}
          >
            <h3 id={`${receiver.name}-table`}>{receiver.name}</h3>
            <table>
              <thead>
                <tr>
                  <th>Matches</th>
                  <th>Return</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(
                  { length: receiver.signalLength + 1 },
                  (_, matches) => (
                    <tr key={matches}>
                      <td>
                        {matches}/{receiver.signalLength}
                      </td>
                      <td>
                        {(
                          payoutFor(receiver.mode, matches).payoutBps / 10_000
                        ).toFixed(2)}
                        ×
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </section>
        ))}
      </section>
      <p>
        In Chain mode, the host owns the wallet and authoritative settlement.
        Signum verifies and presents the returned session data; it never
        fabricates a successful result.
      </p>
      <Link className="primary-link" to={routes.play}>
        Start a round
      </Link>
    </article>
  )
}

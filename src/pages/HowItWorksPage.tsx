import { Link } from 'react-router'

import { routes } from '../app/routes'
import { usePageMetadata } from '../app/usePageMetadata'
import { RECEIVERS } from '../game/receivers'

export function HowItWorksPage() {
  usePageMetadata(
    'How to play',
    'Learn Signum with a concrete four-beat example, then play a practice round.',
    routes.howItWorks,
  )

  return (
    <article className="information-page how-to-play-page">
      <p className="eyebrow">60-second game guide</p>
      <h1 data-page-heading tabIndex={-1}>
        How to play Signum
      </h1>
      <p className="subtitle">
        You create a short Tap/Rest pattern. Signum creates a separate random
        echo. Compare both patterns beat by beat: more same-position matches
        means a higher payout.
      </p>

      <section className="plain-rule" aria-labelledby="plain-rule-title">
        <p className="eyebrow">The whole rule</p>
        <h2 id="plain-rule-title">Same position + same beat = one match</h2>
        <p>
          Your chosen pattern is locked before the echo is generated. Choosing
          more Taps, more Rests, or a clever-looking pattern never improves the
          odds. Only the number of matches matters.
        </p>
      </section>

      <section aria-labelledby="worked-example-title">
        <p className="eyebrow">Worked Pulse example</p>
        <h2 id="worked-example-title">See one round before you play</h2>
        <div className="worked-example" aria-label="Four beat example">
          <div>
            <strong>Your signal</strong>
            <span>Tap</span>
            <span>Rest</span>
            <span>Tap</span>
            <span>Rest</span>
          </div>
          <div>
            <strong>Random echo</strong>
            <span>Tap</span>
            <span>Tap</span>
            <span>Rest</span>
            <span>Rest</span>
          </div>
          <div className="worked-example__result">
            <strong>Comparison</strong>
            <span>Match</span>
            <span>Miss</span>
            <span>Miss</span>
            <span>Match</span>
          </div>
        </div>
        <p>
          Result: <strong>2 matches out of 4</strong>. On Pulse, that pays
          <strong> 0.40×</strong>. A 1-credit wager returns 0.40 credits. A
          perfect 4/4 match returns 7.40×.
        </p>
      </section>

      <section aria-labelledby="round-steps-title">
        <p className="eyebrow">Play in four steps</p>
        <h2 id="round-steps-title">What you actually click</h2>
        <ol className="how-to-steps">
          <li>
            <strong>Choose Pulse first.</strong> It has four beats and is the
            easiest receiver to understand.
          </li>
          <li>
            <strong>Set the wager.</strong> Practice credits are free; Chain
            live play uses the balance and limits supplied by its host.
          </li>
          <li>
            <strong>Set every beat.</strong> Click a beat card to switch between
            Tap and Rest, then press Play practice round or Transmit.
          </li>
          <li>
            <strong>Read the comparison.</strong> Signum marks every beat Match
            or Miss, totals the matches, and applies the published paytable.
          </li>
        </ol>
      </section>

      <section aria-labelledby="receiver-comparison">
        <p className="eyebrow">Difficulty and volatility</p>
        <h2 id="receiver-comparison">Choose a receiver</h2>
        <div className="receiver-explainer-grid">
          {RECEIVERS.map((receiver, index) => (
            <section key={receiver.mode}>
              <span>{index === 0 ? 'Start here' : receiver.volatility}</span>
              <h3>{receiver.name}</h3>
              <p>
                {receiver.signalLength} beats · {receiver.rtp} RTP · up to{' '}
                {receiver.maximumPayout}
              </p>
            </section>
          ))}
        </div>
      </section>

      <aside className="mode-explainer" aria-labelledby="mode-explainer-title">
        <h2 id="mode-explainer-title">
          Why the public link says Practice mode
        </h2>
        <p>
          The standalone site cannot access a wallet and never pretends to make
          a real wager. It lets anyone learn the finished game with free local
          credits. Real Chain wagering activates only when this same app is
          launched inside the Chain host.
        </p>
      </aside>

      <div className="home-hero__actions">
        <Link className="primary-link" to={routes.play}>
          Start with Pulse
        </Link>
        <Link className="secondary-link" to={routes.fairness}>
          View every payout
        </Link>
      </div>
    </article>
  )
}

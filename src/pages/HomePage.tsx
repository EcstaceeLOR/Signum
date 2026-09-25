import { Link } from 'react-router'

import { routes } from '../app/routes'
import { usePageMetadata } from '../app/usePageMetadata'
import type { GuestEnvironment } from '../App'
import { SignalPreview } from '../components/SignalPreview'
import { RECEIVERS } from '../game/receivers'

export function HomePage({ environment }: { environment: GuestEnvironment }) {
  const isDemo = environment === 'standalone'
  usePageMetadata(
    'Home',
    'Compose a Tap/Rest signal and match the independently generated echo in Signum.',
    routes.home,
  )

  return (
    <div className="home-page">
      <section className="home-hero" aria-labelledby="home-title">
        <p className="eyebrow">Provably fair call and response</p>
        <h1 id="home-title" data-page-heading tabIndex={-1}>
          Send a signal. Hear the unknown answer.
        </h1>
        <p className="subtitle">
          Build a Tap/Rest rhythm. Signum generates an independent echo. More
          matching beats unlock higher fixed payouts.
        </p>
        <SignalPreview />
        <div className="home-hero__actions">
          <Link className="primary-link" to={routes.play}>
            {isDemo ? 'Start a practice round' : 'Continue to Chain play'}
          </Link>
          <Link className="secondary-link" to={routes.howItWorks}>
            How it works
          </Link>
        </div>
        <p className="home-hero__disclosure">
          {isDemo
            ? 'This public link opens Practice mode with free credits. Real wagering activates only when Signum is launched inside the Chain host.'
            : 'Wallet access, randomness, and settlement remain controlled by the Chain host.'}
        </p>
      </section>

      <section className="home-steps" aria-labelledby="home-steps-title">
        <p className="eyebrow">One round · three clear moments</p>
        <h2 id="home-steps-title">Compose. Commit. Compare.</h2>
        <ol>
          <li>
            <strong>01</strong>
            <span>Choose a receiver and build every Tap/Rest beat.</span>
          </li>
          <li>
            <strong>02</strong>
            <span>
              Transmit once; the echo is generated independently afterward.
            </span>
          </li>
          <li>
            <strong>03</strong>
            <span>Match count selects the receiver’s fixed public payout.</span>
          </li>
        </ol>
        <Link className="secondary-link" to={routes.howItWorks}>
          See the complete round
        </Link>
      </section>

      <section
        className="home-section"
        aria-labelledby="receiver-preview-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Three receivers · one transparent rule</p>
            <h2 id="receiver-preview-title">Choose how deep to listen.</h2>
          </div>
          <p>
            Signal length changes volatility, never the odds of your pattern.
          </p>
        </div>
        <div className="home-receiver-grid">
          {RECEIVERS.map((receiver) => (
            <article key={receiver.mode}>
              <span>{receiver.signalLength} beats</span>
              <h3>{receiver.name}</h3>
              <p>{receiver.description}</p>
              <dl>
                <div>
                  <dt>RTP</dt>
                  <dd>{receiver.rtp}</dd>
                </div>
                <div>
                  <dt>Maximum</dt>
                  <dd>{receiver.maximumPayout}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="home-principles" aria-labelledby="principles-title">
        <p className="eyebrow">No hidden strategy claim</p>
        <h2 id="principles-title">
          Every complete pattern has identical odds.
        </h2>
        <p>
          Your signal is expressive, not predictive. Each echo beat is generated
          independently, and the result is reconstructed from fixed public
          rules.
        </p>
        <div className="home-hero__actions">
          <Link className="primary-link" to={routes.fairness}>
            Inspect fairness
          </Link>
          <Link className="secondary-link" to={routes.play}>
            Choose a receiver
          </Link>
        </div>
      </section>

      <aside
        className="home-responsible"
        aria-labelledby="home-responsible-title"
      >
        <p className="eyebrow">Play with limits</p>
        <h2 id="home-responsible-title">
          The next echo never owes you a result.
        </h2>
        <p>
          Rounds are independent. Standalone credits have no value; real play is
          available only through the Chain host. Never chase losses or wager
          funds you cannot afford to lose.
        </p>
      </aside>

      <section className="home-final" aria-labelledby="home-final-title">
        <p className="eyebrow">Ready to transmit?</p>
        <h2 id="home-final-title">Choose your receiver.</h2>
        <Link className="primary-link" to={routes.play}>
          {isDemo ? 'Start a practice round' : 'Continue to Chain play'}
        </Link>
      </section>
    </div>
  )
}

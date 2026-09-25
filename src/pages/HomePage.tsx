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
            {isDemo ? 'Play the no-money demo' : 'Continue to Chain play'}
          </Link>
          <Link className="secondary-link" to={`${routes.play}?guide=1`}>
            Learn the round
          </Link>
        </div>
        <p className="home-hero__disclosure">
          {isDemo
            ? 'Standalone mode uses local demo credits and never settles on-chain.'
            : 'Wallet access, randomness, and settlement remain controlled by the Chain host.'}
        </p>
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
        <Link className="primary-link" to={routes.play}>
          Choose a receiver
        </Link>
      </section>
    </div>
  )
}

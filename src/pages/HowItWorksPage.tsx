import { Link } from 'react-router'
import { routes } from '../app/routes'
import { usePageMetadata } from '../app/usePageMetadata'

export function HowItWorksPage() {
  usePageMetadata(
    'How it works',
    'Learn how a complete Signum signal round works.',
    routes.howItWorks,
  )
  return (
    <article className="information-page">
      <p className="eyebrow">Round guide</p>
      <h1 data-page-heading tabIndex={-1}>
        How Signum works.
      </h1>
      <p>
        Pick a receiver, compose every Tap/Rest beat, and choose a wager. After
        you commit, an independent echo is generated. Your exact match count
        selects a fixed payout from the receiver’s published table.
      </p>
      <ol>
        <li>
          <strong>Compose:</strong> your pattern expresses a choice but does not
          change its odds.
        </li>
        <li>
          <strong>Transmit:</strong> Chain hosts wallet access, limits,
          randomness, and settlement in real play.
        </li>
        <li>
          <strong>Verify:</strong> Signum decodes the settled result and shows
          the matching beats.
        </li>
      </ol>
      <p>
        Standalone mode uses local credits only and never claims an on-chain
        settlement.
      </p>
      <Link className="primary-link" to={routes.play}>
        Choose a receiver
      </Link>
    </article>
  )
}

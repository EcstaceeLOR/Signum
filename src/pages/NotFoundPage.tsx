import { Link } from 'react-router'

import { routes } from '../app/routes'
import { usePageMetadata } from '../app/usePageMetadata'

export function NotFoundPage() {
  usePageMetadata(
    'Page not found',
    'The requested Signum page does not exist.',
    '/404',
  )

  return (
    <section className="not-found" aria-labelledby="not-found-title">
      <p className="eyebrow">Signal lost · 404</p>
      <h1 id="not-found-title" data-page-heading tabIndex={-1}>
        This frequency is silent.
      </h1>
      <p>
        The address does not match a Signum page. Return home or start a new
        transmission.
      </p>
      <div>
        <Link className="primary-link" to={routes.home}>
          Return home
        </Link>
        <Link className="secondary-link" to={routes.play}>
          Go to Play
        </Link>
      </div>
    </section>
  )
}

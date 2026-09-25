import { routes } from '../app/routes'
import { usePageMetadata } from '../app/usePageMetadata'
import { downloadDiagnosticExport } from '../diagnostics/diagnostics'

export function SupportPage() {
  usePageMetadata(
    'Support',
    'Recovery steps and privacy-safe Signum diagnostics.',
    routes.support,
  )
  return (
    <article className="information-page" aria-labelledby="support-title">
      <p className="eyebrow">Recovery guide</p>
      <h1 id="support-title" data-page-heading tabIndex={-1}>
        Support and diagnostics
      </h1>
      <p>
        Signum has no live support chat. These recovery steps keep wallet and
        game responsibilities clear.
      </p>
      <dl>
        <div>
          <dt>Wallet or Smart Vault</dt>
          <dd>
            Reconnect or finish vault setup in the Chain host; Signum never
            requests wallet credentials.
          </dd>
        </div>
        <div>
          <dt>Bridge or iframe</dt>
          <dd>
            Use Retry, then reload the Chain host if the secure iframe
            connection remains interrupted.
          </dd>
        </div>
        <div>
          <dt>Delayed randomness</dt>
          <dd>
            Keep the round open until cancellation becomes available; never
            submit a duplicate wager.
          </dd>
        </div>
        <div>
          <dt>Malformed result</dt>
          <dd>
            Do not trust the display. Export diagnostics and preserve the
            authoritative Chain session identifier.
          </dd>
        </div>
        <div>
          <dt>Demo mode</dt>
          <dd>
            Demo credits and outcomes are browser-local and have no monetary or
            Chain value.
          </dd>
        </div>
      </dl>
      <button type="button" onClick={downloadDiagnosticExport}>
        Export privacy-safe diagnostics
      </button>
      <p>
        Build 0.1.0 · <a href="/game.manifest.json">Game manifest</a> ·{' '}
        <a
          href="https://github.com/EcstaceeLOR/Signum"
          target="_blank"
          rel="noreferrer"
        >
          Source code (opens externally)
        </a>
      </p>
    </article>
  )
}

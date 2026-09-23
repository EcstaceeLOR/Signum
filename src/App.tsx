import { useContentResize } from './app/useContentResize'
import { useChainHost, type ChainHostClient } from './bridge/useChainHost'

const receiverModes = [
  { name: 'Pulse', beats: 4, maximum: '7.4×', tone: 'Steady' },
  { name: 'Carrier', beats: 6, maximum: '21.5×', tone: 'Charged' },
  { name: 'Deepwave', beats: 8, maximum: '40×', tone: 'Volatile' },
] as const

export type GuestEnvironment = 'embedded' | 'standalone'

type AppProps = {
  environment?: GuestEnvironment
  host?: ChainHostPresentation
}

export function App({
  environment: environmentOverride,
  host: hostOverride,
}: AppProps) {
  const environment = environmentOverride ?? detectGuestEnvironment()
  const connectedHost = useChainHost(
    environment === 'embedded' && hostOverride === undefined,
  )
  const host = hostOverride ?? connectedHost
  useContentResize(
    environment === 'embedded' && host.status === 'connected'
      ? host.reportContentSize
      : undefined,
  )

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Signum home">
          <span className="brand__mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>Signum</span>
        </a>
        <span className="network-pill">
          <span className="network-pill__light" aria-hidden="true" />
          Chain native
        </span>
      </header>

      <main className="guest-shell">
        <section className="hero" aria-labelledby="signum-title">
          <p className="eyebrow">Tune the unknown</p>
          <h1 id="signum-title">Send a signal. Catch its echo.</h1>
          <p className="subtitle">
            Compose a binary transmission, choose how deep to listen, and let
            verifiable randomness answer from the dark.
          </p>

          <SignalPreview />

          {environment === 'embedded' ? (
            <ChainHostScreen host={host} />
          ) : (
            <UnsupportedHostScreen />
          )}
        </section>

        <section className="receiver-section" aria-labelledby="receiver-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Three depths</p>
              <h2 id="receiver-title">Choose your receiver</h2>
            </div>
            <p>More beats make a perfect echo rarer—and louder.</p>
          </div>

          <div className="receiver-grid">
            {receiverModes.map((receiver, index) => (
              <article className="receiver-card" key={receiver.name}>
                <div className="receiver-card__index">0{index + 1}</div>
                <div>
                  <span>{receiver.beats} beats</span>
                  <h3>{receiver.name}</h3>
                </div>
                <dl>
                  <div>
                    <dt>Character</dt>
                    <dd>{receiver.tone}</dd>
                  </div>
                  <div>
                    <dt>Maximum</dt>
                    <dd>{receiver.maximum}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="footer">
        <span>Provably fair by design</span>
        <span>Built for Chain Jam Vol. 1</span>
      </footer>
    </div>
  )
}

function SignalPreview() {
  return (
    <div
      className="signal-preview"
      aria-label="Example signal: tap, rest, tap, tap"
    >
      <span className="signal-preview__label">TX–01</span>
      <div className="signal-preview__track" aria-hidden="true">
        <i className="signal-preview__beat signal-preview__beat--active" />
        <i className="signal-preview__beat" />
        <i className="signal-preview__beat signal-preview__beat--active" />
        <i className="signal-preview__beat signal-preview__beat--active" />
      </div>
      <span className="signal-preview__status">Armed</span>
    </div>
  )
}

type ChainHostPresentation = Pick<
  ChainHostClient,
  'status' | 'snapshot' | 'error' | 'canPlay' | 'reportContentSize' | 'retry'
>

function ChainHostScreen({ host }: { host: ChainHostPresentation }) {
  if (host.error) {
    return (
      <div className="host-state host-state--error" role="alert">
        <span className="host-state__icon" aria-hidden="true">
          !
        </span>
        <span>
          <strong>Chain connection interrupted</strong>
          {host.error}
        </span>
        <button
          className="host-state__action"
          type="button"
          onClick={host.retry}
        >
          Retry
        </button>
      </div>
    )
  }

  if (host.status === 'connecting') {
    return (
      <div
        className="host-state host-state--loading"
        role="status"
        aria-live="polite"
      >
        <span className="host-state__spinner" aria-hidden="true" />
        <span>
          <strong>Connecting to Chain</strong>
          Waiting for the secure game host…
        </span>
      </div>
    )
  }

  if (host.status !== 'connected' || !host.snapshot) {
    return (
      <div className="host-state host-state--loading" role="status">
        <span className="host-state__spinner" aria-hidden="true" />
        <span>
          <strong>Syncing game state</strong>
          The host is connected. Waiting for the latest account snapshot…
        </span>
      </div>
    )
  }

  const walletStatus = host.snapshot.wallet.status
  if (walletStatus === 'disconnected') {
    return (
      <HostNotice
        title="Wallet disconnected"
        message="Connect your wallet in the Chain host to enable play. Signum never requests wallet access directly."
      />
    )
  }
  if (walletStatus === 'setup-required') {
    return (
      <HostNotice
        title="Smart Vault setup required"
        message="Finish account setup in Chain, then return here to transmit a signal."
      />
    )
  }
  if (walletStatus === 'session-key-mismatch') {
    return (
      <div className="host-state host-state--error" role="alert">
        <span className="host-state__icon" aria-hidden="true">
          !
        </span>
        <span>
          <strong>Session key needs attention</strong>
          Reconnect the game after repairing the session key in Chain.
        </span>
        <button
          className="host-state__action"
          type="button"
          onClick={host.retry}
        >
          Reconnect
        </button>
      </div>
    )
  }

  return (
    <div
      className="host-state host-state--ready"
      role="status"
      aria-live="polite"
    >
      <span className="host-state__ready" aria-hidden="true">
        ✓
      </span>
      <span>
        <strong>Chain host ready</strong>
        {host.canPlay
          ? `Secure play enabled${host.snapshot.token.symbol ? ` with ${host.snapshot.token.symbol}` : ''}.`
          : 'Waiting for account readiness…'}
      </span>
    </div>
  )
}

function HostNotice({ title, message }: { title: string; message: string }) {
  return (
    <div className="host-state host-state--error" role="alert">
      <span className="host-state__icon" aria-hidden="true">
        !
      </span>
      <span>
        <strong>{title}</strong>
        {message}
      </span>
    </div>
  )
}

function UnsupportedHostScreen() {
  return (
    <aside className="host-state" aria-labelledby="standalone-title">
      <span className="host-state__icon" aria-hidden="true">
        ↗
      </span>
      <span>
        <strong id="standalone-title">Standalone preview</strong>
        No Chain host was detected. Explore the receiver modes while the demo
        connection is prepared.
      </span>
    </aside>
  )
}

function detectGuestEnvironment(): GuestEnvironment {
  if (typeof window === 'undefined') return 'standalone'

  try {
    return window.self === window.top ? 'standalone' : 'embedded'
  } catch {
    return 'embedded'
  }
}

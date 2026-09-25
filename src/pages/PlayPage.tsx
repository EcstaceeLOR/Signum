import { useState } from 'react'
import { useSearchParams } from 'react-router'

import { routes } from '../app/routes'
import { usePageMetadata } from '../app/usePageMetadata'
import type { GuestEnvironment } from '../App'
import type { ChainHostClient } from '../bridge/useChainHost'
import { ResponsiblePlayPanel } from '../components/ResponsiblePlayPanel'
import { SignalPreview } from '../components/SignalPreview'
import { SignalWorkbench } from '../components/SignalWorkbench'
import type { useDemoHost } from '../demo/useDemoHost'
import { usePreferences } from '../state/preferences'

export type ChainHostPresentation = Pick<
  ChainHostClient,
  | 'status'
  | 'snapshot'
  | 'error'
  | 'canPlay'
  | 'openSession'
  | 'cancelStuckRandomness'
  | 'revealOutcome'
  | 'getRandomnessVerification'
  | 'reportContentSize'
  | 'retry'
>

type PlayPageProps = {
  environment: GuestEnvironment
  host: ChainHostPresentation
  demoHost: ReturnType<typeof useDemoHost>
  showcase: boolean
}

export function PlayPage({
  environment,
  host,
  demoHost,
  showcase,
}: PlayPageProps) {
  const [searchParams] = useSearchParams()
  const guideRequested = searchParams.get('guide') === '1'
  const isDemo = environment === 'standalone'
  const preferences = usePreferences()
  const [guideOpen, setGuideOpen] = useState(
    () => guideRequested || !preferences.tutorialComplete,
  )

  usePageMetadata(
    'Play',
    'Choose a receiver, compose a Tap/Rest signal, and match the independently generated echo.',
    routes.play,
  )

  return (
    <div className="guest-shell play-page">
      <section className="hero" aria-labelledby="signum-title">
        <p className="eyebrow">Tune the unknown</p>
        <h1 id="signum-title" data-page-heading tabIndex={-1}>
          Send a signal. Catch its echo.
        </h1>
        <p className="subtitle">
          {isDemo
            ? 'Compose a signal. Receive a locally generated demo echo.'
            : "Compose a signal. Receive Chain's independently generated echo."}
        </p>

        <SignalPreview />

        {environment === 'embedded' ? (
          <ChainHostScreen host={host} />
        ) : (
          <DemoModeScreen onReset={demoHost.reset} showcase={showcase} />
        )}

        <button
          className="guide-replay"
          type="button"
          onClick={() => setGuideOpen(true)}
        >
          How to play
        </button>
      </section>

      {guideOpen ? (
        <FirstRunGuide
          onDismiss={() => {
            preferences.update({ tutorialComplete: true })
            setGuideOpen(false)
          }}
        />
      ) : null}

      <ResponsiblePlayPanel
        realPlay={!isDemo}
        eligibilityAccepted={preferences.eligibilityAccepted}
        onEligibilityChange={(accepted) =>
          preferences.update({ eligibilityAccepted: accepted })
        }
      />

      <SignalWorkbench
        key={isDemo ? demoHost.revision : 'chain'}
        disabled={
          environment === 'embedded' &&
          (!host.canPlay || !preferences.eligibilityAccepted)
        }
        host={isDemo ? demoHost : host}
        experience={isDemo ? 'demo' : 'chain'}
      />
    </div>
  )
}

function ChainHostScreen({ host }: { host: ChainHostPresentation }) {
  if (host.status === 'error') {
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
        aria-label="Chain host status"
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
      <div
        className="host-state host-state--loading"
        role="status"
        aria-label="Chain host status"
      >
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
      aria-label="Chain host status"
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

function DemoModeScreen({
  onReset,
  showcase,
}: {
  onReset(): void
  showcase: boolean
}) {
  return (
    <aside
      className="host-state host-state--demo"
      aria-labelledby="standalone-title"
    >
      <span className="host-state__icon" aria-hidden="true">
        D
      </span>
      <span>
        <strong id="standalone-title">
          {showcase
            ? 'SHOWCASE · Deterministic perfect echo · No real wager'
            : 'DEMO · No real wager or on-chain settlement'}
        </strong>
        {showcase
          ? 'This screenshot/test fixture is intentionally deterministic and never runs inside Chain.'
          : 'This demo result was generated locally. Play through Chain for a VRF-settled, on-chain-verifiable round.'}
      </span>
      <button className="host-state__action" type="button" onClick={onReset}>
        Reset demo
      </button>
    </aside>
  )
}

function FirstRunGuide({ onDismiss }: { onDismiss(): void }) {
  return (
    <section className="first-run-guide" aria-labelledby="guide-title">
      <div>
        <p className="eyebrow">Your first transmission · under 20 seconds</p>
        <h2 id="guide-title">Compose. Transmit. Match the echo.</h2>
      </div>
      <ol>
        <li>
          <b>1</b>
          <span>
            <strong>Choose a receiver</strong>
            Pulse, Carrier, or Deepwave sets length and volatility.
          </span>
        </li>
        <li>
          <b>2</b>
          <span>
            <strong>Set Tap or Rest</strong>
            Every complete pattern has exactly the same odds.
          </span>
        </li>
        <li>
          <b>3</b>
          <span>
            <strong>Transmit and hear the echo</strong>
            Chain generates an independent signal; more matching beats pay more.
          </span>
        </li>
      </ol>
      <div className="first-run-guide__actions">
        <button type="button" onClick={onDismiss}>
          Start composing
        </button>
        <button type="button" onClick={onDismiss}>
          Skip guide
        </button>
      </div>
    </section>
  )
}

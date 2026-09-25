import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { ReceiverSelector } from '../components/ReceiverSelector'
import { ResponsiblePlayPanel } from '../components/ResponsiblePlayPanel'
import { receiverDefinition, receiverSlug } from '../game/receivers'
import { ReceiverMode } from '../game/encoding'
import { readPlaySetup, savePlaySetup } from '../game/playSetup'
import {
  formatTokenAmount,
  validateWagerInput,
  wagerContext,
} from '../game/wager'
import { routes } from '../app/routes'
import { usePageMetadata } from '../app/usePageMetadata'
import type { GuestEnvironment } from '../App'
import type { ChainHostPresentation } from './PlayPage'
import type { useDemoHost } from '../demo/useDemoHost'
import { usePreferences } from '../state/preferences'

type PlaySetupPageProps = {
  environment: GuestEnvironment
  host: ChainHostPresentation
  demoHost: ReturnType<typeof useDemoHost>
}

export function PlaySetupPage({
  environment,
  host,
  demoHost,
}: PlaySetupPageProps) {
  const isDemo = environment === 'standalone'
  const experience = isDemo ? 'demo' : 'chain'
  const [saved] = useState(readPlaySetup)
  const [mode, setMode] = useState<ReceiverMode>(() =>
    saved.experience === experience
      ? modeForSavedReceiver(saved.receiver)
      : ReceiverMode.Pulse,
  )
  const [wager, setWager] = useState(() =>
    saved.experience === experience ? saved.wager : '1',
  )
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const preferences = usePreferences()
  const activeHost = isDemo ? demoHost : host
  const receiver = receiverDefinition(mode)
  const context = wagerContext(activeHost.snapshot, receiver)
  const validation = validateWagerInput(wager, context)
  const hostReady = isDemo || (host.status === 'connected' && host.canPlay)
  const eligibilityReady = isDemo || preferences.eligibilityAccepted
  const canContinue = hostReady && eligibilityReady && validation.ok

  usePageMetadata(
    'Play setup',
    'Choose a Signum receiver and validate a practice or Chain wager before composing a signal.',
    routes.play,
  )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canContinue) return
    const slug = receiverSlug(mode)
    savePlaySetup({ receiver: slug, wager, experience })
    void navigate(`${routes.play}/${slug}`)
  }

  const blocker = !hostReady
    ? hostReadinessMessage(host)
    : !eligibilityReady
      ? 'Confirm the eligibility statement below before continuing to real play.'
      : validation.ok
        ? undefined
        : validation.message

  return (
    <div className="guest-shell play-setup-page">
      <header className="play-setup-hero">
        <p className="eyebrow">Set up one transmission</p>
        <h1 data-page-heading tabIndex={-1}>
          Choose how deep to listen.
        </h1>
        <p className="subtitle">
          Compare the complete receiver rules, confirm your wager, then compose
          the signal.
        </p>
        <div className="setup-environment" data-demo={isDemo || undefined}>
          <strong>{isDemo ? 'Practice mode' : 'Chain-hosted play'}</strong>
          <span>
            {isDemo
              ? 'Free practice credits · no wallet · no real funds'
              : hostReadinessMessage(host)}
          </span>
        </div>
        {searchParams.get('error') === 'invalid-receiver' ? (
          <p className="setup-error" role="alert">
            That receiver link is invalid. Choose one of the three published
            receivers.
          </p>
        ) : null}
      </header>

      <form className="play-setup-form" onSubmit={submit} noValidate>
        <section aria-labelledby="setup-receiver-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Step 1</p>
              <h2 id="setup-receiver-title">Select a receiver</h2>
            </div>
            <p>
              Length changes volatility and maximum payout, not the odds of your
              chosen pattern.
            </p>
          </div>
          <ReceiverSelector value={mode} onChange={setMode} />
        </section>

        <section className="setup-wager" aria-labelledby="setup-wager-title">
          <div>
            <p className="eyebrow">Step 2</p>
            <h2 id="setup-wager-title">Confirm the wager</h2>
          </div>
          <label htmlFor="setup-wager-input">Wager amount</label>
          <div className="setup-wager__input">
            <input
              id="setup-wager-input"
              aria-describedby="setup-wager-guidance"
              inputMode="decimal"
              autoComplete="off"
              value={wager}
              onChange={(event) => setWager(event.target.value)}
            />
            <span>{context.kind === 'ready' ? context.symbol : '—'}</span>
          </div>
          <div id="setup-wager-guidance">
            {context.kind === 'ready' ? (
              <>
                <span
                  className="setup-balance"
                  aria-label={
                    isDemo ? 'Practice balance' : 'Smart Vault balance'
                  }
                >
                  {isDemo ? 'Practice balance' : 'Smart Vault balance'}:{' '}
                  <strong>
                    {formatTokenAmount(context.balance, context.decimals)}{' '}
                    {context.symbol}
                  </strong>
                </span>
                <span>
                  Allowed {formatTokenAmount(context.minimum, context.decimals)}
                  –{formatTokenAmount(context.maximum, context.decimals)}{' '}
                  {context.symbol}
                </span>
              </>
            ) : (
              <span>{context.reason}</span>
            )}
          </div>
        </section>

        <ResponsiblePlayPanel
          realPlay={!isDemo}
          eligibilityAccepted={preferences.eligibilityAccepted}
          onEligibilityChange={(accepted) =>
            preferences.update({ eligibilityAccepted: accepted })
          }
        />

        <div className="setup-action">
          {blocker ? (
            <p role="status">{blocker}</p>
          ) : (
            <p>{receiver.name} selected · wager validated.</p>
          )}
          <button
            className="transmit-button"
            type="submit"
            disabled={!canContinue}
          >
            Continue to compose
          </button>
          <Link to={routes.howItWorks}>Review how a round works</Link>
        </div>
      </form>
    </div>
  )
}

function modeForSavedReceiver(receiver: string): ReceiverMode {
  if (receiver === 'carrier') return ReceiverMode.Carrier
  if (receiver === 'deepwave') return ReceiverMode.Deepwave
  return ReceiverMode.Pulse
}

function hostReadinessMessage(host: ChainHostPresentation): string {
  if (host.status === 'error')
    return (
      host.error ||
      'Chain connection is unavailable. Use Retry on the play screen.'
    )
  if (host.status !== 'connected') return 'Waiting for the secure Chain host.'
  if (!host.snapshot) return 'Waiting for the latest Chain account snapshot.'
  if (host.snapshot.wallet.status === 'disconnected')
    return 'Connect your wallet in the Chain host.'
  if (host.snapshot.wallet.status === 'setup-required')
    return 'Finish Smart Vault setup in the Chain host.'
  if (host.snapshot.wallet.status === 'session-key-mismatch')
    return 'Repair the session key in the Chain host.'
  return host.canPlay
    ? 'Chain host ready · limits and balance verified'
    : 'Chain play is not ready yet. Refresh the host state.'
}

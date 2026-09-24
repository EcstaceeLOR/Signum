import { useState, type FormEvent } from 'react'

import type { HostSnapshotV1 } from '@chain/casino-sdk/guest'

import type { SignumSessionController } from '../game/useSignumSession'
import type { ReceiverDefinition } from '../game/receivers'
import { sessionCommitment } from '../game/sessionMachine'
import {
  formatTokenAmount,
  validateWagerInput,
  wagerContext,
} from '../game/wager'
import { SignalReveal } from './SignalReveal'

type WagerControlsProps = {
  snapshot: HostSnapshotV1 | null
  receiver: ReceiverDefinition
  gameData: `0x${string}`
  disabled?: boolean
  submission: SignumSessionController
  onRevealBeat?(matches: boolean): void
}

export function WagerControls({
  snapshot,
  receiver,
  gameData,
  disabled = false,
  submission,
  onRevealBeat,
}: WagerControlsProps) {
  const [input, setInput] = useState('1')
  const context = wagerContext(snapshot, receiver)
  const commitment = sessionCommitment(submission.state)
  const displayedInput =
    submission.isLocked && commitment && context.kind === 'ready'
      ? formatTokenAmount(BigInt(commitment.wager), context.decimals)
      : input
  const validation = validateWagerInput(displayedInput, context)
  const unavailable = context.kind === 'unavailable'
  const controlsDisabled =
    disabled || submission.isLocked || unavailable || !submission.canOpen
  const canSubmit =
    !disabled && !unavailable && submission.canOpen && validation.ok

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit || !validation.ok) return
    void submission.submit({
      wager: validation.amount.toString(),
      gameData,
    })
  }

  const formattedWager =
    validation.ok && context.kind === 'ready'
      ? `${formatTokenAmount(validation.amount, context.decimals)} ${context.symbol}`
      : null
  const maximumReturn =
    validation.ok && context.kind === 'ready'
      ? formatTokenAmount(
          (validation.amount * BigInt(receiver.maximumPayoutBps)) / 10_000n,
          context.decimals,
        )
      : null

  return (
    <form className="wager-panel" onSubmit={submit} noValidate>
      <div className="wager-panel__heading">
        <div>
          <p className="eyebrow">Commit your signal</p>
          <h3>Choose a wager</h3>
        </div>
        <Balance context={context} />
      </div>

      <div className="wager-panel__controls">
        <label className="wager-field" htmlFor="wager-amount">
          <span>Wager amount</span>
          <span className="wager-field__input">
            <input
              id="wager-amount"
              name="wager"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={displayedInput}
              disabled={controlsDisabled}
              aria-label="Wager amount"
              aria-invalid={!unavailable && !validation.ok}
              aria-describedby="wager-guidance wager-feedback"
              onChange={(event) => setInput(event.target.value)}
            />
            <span aria-hidden="true">
              {context.kind === 'ready' ? context.symbol : '—'}
            </span>
          </span>
        </label>

        <button className="transmit-button" type="submit" disabled={!canSubmit}>
          <span aria-hidden="true">↗</span>
          {submission.state.status === 'OPENING_SESSION'
            ? 'Locking your transmission…'
            : submission.state.status === 'WAITING_RANDOMNESS' ||
                submission.state.status === 'REVEALING'
              ? 'Awaiting Chain…'
              : submission.state.status === 'SETTLED'
                ? 'Transmission settled'
                : formattedWager
                  ? `Transmit ${formattedWager}`
                  : 'Transmit'}
        </button>
      </div>

      <div className="wager-panel__details" id="wager-guidance">
        {context.kind === 'ready' ? (
          <>
            <span>
              Allowed {formatTokenAmount(context.minimum, context.decimals)}–
              {formatTokenAmount(context.maximum, context.decimals)}{' '}
              {context.symbol}
            </span>
            {maximumReturn ? (
              <span>
                Maximum return {maximumReturn} {context.symbol} at{' '}
                {receiver.maximumPayout}
              </span>
            ) : null}
          </>
        ) : (
          <span>Wager limits unavailable</span>
        )}
      </div>

      <WagerFeedback
        unavailableReason={unavailable ? context.reason : null}
        validationMessage={
          !unavailable && !validation.ok ? validation.message : null
        }
        submission={submission}
        token={
          context.kind === 'ready'
            ? { decimals: context.decimals, symbol: context.symbol }
            : undefined
        }
        onRevealBeat={onRevealBeat}
      />
    </form>
  )
}

function Balance({ context }: { context: ReturnType<typeof wagerContext> }) {
  return (
    <div className="vault-balance" aria-label="Smart Vault balance">
      <span>Smart Vault balance</span>
      <strong>
        {context.kind === 'ready'
          ? `${formatTokenAmount(context.balance, context.decimals)} ${context.symbol}`
          : 'Unavailable'}
      </strong>
    </div>
  )
}

function WagerFeedback({
  unavailableReason,
  validationMessage,
  submission,
  token,
  onRevealBeat,
}: {
  unavailableReason: string | null
  validationMessage: string | null
  submission: SignumSessionController
  token?: { decimals: number; symbol: string }
  onRevealBeat?(matches: boolean): void
}) {
  if (submission.state.status === 'OPENING_SESSION') {
    return (
      <p
        className="wager-feedback wager-feedback--pending"
        id="wager-feedback"
        role="status"
      >
        Locking your transmission… Do not close this window or submit again.
      </p>
    )
  }

  if (submission.state.status === 'WAITING_RANDOMNESS') {
    const state = submission.state
    return (
      <div
        className="wager-feedback wager-feedback--pending"
        id="wager-feedback"
        role="status"
      >
        <strong>
          {state.settlementPending
            ? 'Settlement confirmed. Syncing the complete outcome…'
            : submission.isDelayed
              ? 'Chain is still producing your verified echo.'
              : 'Transmission opened. Awaiting a verified echo…'}
        </strong>
        <span>
          Session {shortIdentifier(state.sessionKey)}
          {state.transactionHash
            ? ` · Transaction ${shortIdentifier(state.transactionHash)}`
            : ' · Waiting for the transaction index'}
        </span>
        {submission.isDelayed ? (
          <span>
            Your signal and wager are locked while randomness is pending.
          </span>
        ) : null}
        {submission.canCancel ? (
          <button
            className="wager-feedback__action"
            type="button"
            onClick={() => void submission.cancelStuckRandomness()}
          >
            Cancel delayed request
          </button>
        ) : null}
        {state.cancelStatus === 'pending' ? (
          <span>Requesting safe cancellation…</span>
        ) : null}
        {state.cancelStatus === 'requested' ? (
          <span>Cancellation requested. Waiting for Chain to confirm.</span>
        ) : null}
        {state.cancelStatus === 'error' ? (
          <span role="alert">
            {state.cancelError ?? 'The cancellation request failed.'} Retry when
            Chain allows it.
          </span>
        ) : null}
      </div>
    )
  }

  if (
    submission.state.status === 'REVEALING' ||
    submission.state.status === 'SETTLED'
  ) {
    return (
      <SignalReveal
        state={submission.state}
        token={token}
        onBeatReveal={onRevealBeat}
        onComplete={submission.completeReveal}
        onPlayAgain={submission.playAgain}
      />
    )
  }

  if (submission.state.status === 'ERROR') {
    return (
      <div
        className="wager-feedback wager-feedback--error"
        id="wager-feedback"
        role="alert"
      >
        <strong>{submission.state.message}</strong>
        <span>
          {submission.state.liveSession
            ? 'This transmission remains locked while Chain resolves it.'
            : 'Check your Chain connection and balance, then retry. Your signal is still here.'}
        </span>
        {submission.state.sessionKey ? (
          <button
            className="wager-feedback__action"
            type="button"
            onClick={submission.playAgain}
          >
            Return to composer
          </button>
        ) : null}
      </div>
    )
  }

  const message = unavailableReason ?? validationMessage
  return (
    <p
      className={`wager-feedback${message ? ' wager-feedback--error' : ''}`}
      id="wager-feedback"
      aria-live="polite"
    >
      {message ?? 'Your wager and complete signal will be committed together.'}
    </p>
  )
}

function shortIdentifier(value: string): string {
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value
}

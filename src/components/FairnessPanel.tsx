import { useState, type SyntheticEvent } from 'react'

import type {
  HostSnapshotV1,
  RandomnessVerificationV1,
} from '@chain/casino-sdk/guest'

import { signalMaskToBits, type ReceiverMode } from '../game/encoding'
import { payoutFor } from '../game/math'
import { receiverDefinition } from '../game/receivers'
import type { SignumSessionState } from '../game/sessionMachine'

type VerificationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; result: RandomnessVerificationV1 }
  | { status: 'error'; message: string }

type FairnessPanelProps = {
  mode: ReceiverMode
  experience: 'chain' | 'demo'
  snapshot: HostSnapshotV1 | null
  session: SignumSessionState
  getRandomnessVerification?(input: {
    sessionId: string
  }): Promise<RandomnessVerificationV1>
}

export function FairnessPanel({
  mode,
  experience,
  snapshot,
  session,
  getRandomnessVerification,
}: FairnessPanelProps) {
  const [verification, setVerification] = useState<VerificationState>({
    status: 'idle',
  })
  const receiver = receiverDefinition(mode)
  const settled = session.status === 'SETTLED' ? session : undefined
  const sessionRow = settled
    ? snapshot?.sessions.items.find(
        (item) => item.sessionKey === settled.sessionKey,
      )
    : undefined

  const verify = async () => {
    if (
      experience !== 'chain' ||
      !settled?.sessionId ||
      !getRandomnessVerification ||
      verification.status === 'loading'
    ) {
      return
    }

    setVerification({ status: 'loading' })
    try {
      const result = await getRandomnessVerification({
        sessionId: settled.sessionId,
      })
      setVerification({ status: 'ready', result })
    } catch (error) {
      setVerification({
        status: 'error',
        message:
          error instanceof Error && error.message.trim()
            ? error.message
            : 'Chain could not verify this randomness right now.',
      })
    }
  }

  const onToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (event.currentTarget.open && settled && verification.status === 'idle') {
      void verify()
    }
  }

  return (
    <details className="fairness-panel" onToggle={onToggle}>
      <summary>
        <span>
          <small>Fairness &amp; verification</small>
          <strong>See the fixed rules behind every echo</strong>
        </span>
        <span aria-hidden="true">+</span>
      </summary>

      <div className="fairness-panel__content">
        <section aria-labelledby="fairness-rule-title">
          <p className="eyebrow">The rule</p>
          <h3 id="fairness-rule-title">
            The echo is compared beat-for-beat with your committed signal.
          </h3>
          <p>
            Every {receiver.signalLength}-beat pattern has the same outcome
            distribution. More matching beats move up the fixed paytable; a
            clever-looking pattern cannot improve the odds.
          </p>
          <p className="fairness-panel__caution">
            Verifiable outcome integrity does not mean positive expected value.
            The {receiver.rtp} RTP includes a house edge and describes the
            long-run average, not one round.
          </p>
        </section>

        <Paytable mode={mode} />

        {experience === 'demo' ? (
          <section
            className="fairness-panel__notice"
            aria-label="Practice fairness"
          >
            <strong>Practice mode only</strong>
            <p>
              This practice result uses secure browser randomness. It has no
              transaction, Chain VRF proof, or on-chain settlement. Play through
              Chain for a verifiable round.
            </p>
          </section>
        ) : null}

        {settled ? (
          <SettledVerification
            state={settled}
            snapshot={snapshot}
            sessionRow={sessionRow}
            verification={verification}
            onRetry={() => void verify()}
          />
        ) : (
          <p className="fairness-panel__pending">
            {experience === 'demo'
              ? 'Complete a practice round to inspect its locally derived signal.'
              : 'Complete a round to inspect its session, transactions, decoded signals, and VRF verdict.'}
          </p>
        )}
      </div>
    </details>
  )
}

function Paytable({ mode }: { mode: ReceiverMode }) {
  const receiver = receiverDefinition(mode)
  const denominator = 2 ** receiver.signalLength

  return (
    <section aria-labelledby="fairness-paytable-title">
      <div className="fairness-panel__section-heading">
        <div>
          <p className="eyebrow">Selected receiver</p>
          <h3 id="fairness-paytable-title">{receiver.name} paytable</h3>
        </div>
        <dl>
          <div>
            <dt>RTP</dt>
            <dd>{receiver.rtp}</dd>
          </div>
          <div>
            <dt>Maximum</dt>
            <dd>{receiver.maximumPayout}</dd>
          </div>
          <div>
            <dt>Perfect echo</dt>
            <dd>1 in {denominator}</dd>
          </div>
        </dl>
      </div>

      <div className="fairness-panel__table-wrap">
        <table>
          <caption className="sr-only">
            Exact {receiver.name} total-payout table
          </caption>
          <thead>
            <tr>
              <th scope="col">Matches</th>
              <th scope="col">Combinations</th>
              <th scope="col">Total payout</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: receiver.signalLength + 1 }, (_, matches) => {
              const quote = payoutFor(mode, matches)
              return (
                <tr key={matches}>
                  <th scope="row">
                    {matches}/{receiver.signalLength}
                  </th>
                  <td>
                    {binomial(receiver.signalLength, matches)}/{denominator}
                  </td>
                  <td>{formatMultiplier(quote.payoutBps)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="fairness-panel__definition">
        “Total payout” includes the returned stake. Payouts use integer base
        units and round down: floor(wager × payout basis points ÷ 10,000).
      </p>
    </section>
  )
}

type SettledState = Extract<SignumSessionState, { status: 'SETTLED' }>
type SessionRow = HostSnapshotV1['sessions']['items'][number]

function SettledVerification({
  state,
  snapshot,
  sessionRow,
  verification,
  onRetry,
}: {
  state: SettledState
  snapshot: HostSnapshotV1 | null
  sessionRow?: SessionRow
  verification: VerificationState
  onRetry(): void
}) {
  const receiver = receiverDefinition(state.outcome.mode)
  const playerBits = signalMaskToBits(
    state.outcome.playerSignal,
    state.outcome.signalLength,
  )
  const ghostBits = signalMaskToBits(
    state.outcome.ghostSignal,
    state.outcome.signalLength,
  )
  const raw = sessionRow?.raw
  const chainId = snapshot?.integration.chainId
  const gameAddress = snapshot?.integration.gameAddress
  const openHash = raw?.openTransactionHash ?? state.transactionHash
  const fulfillmentHash = raw?.randomnessRequests?.find(
    (request) => request.fulfilled,
  )?.transactionHash

  return (
    <section
      className="fairness-panel__round"
      aria-labelledby="fairness-round-title"
    >
      <p className="eyebrow">Settled round</p>
      <h3 id="fairness-round-title">Reconstruct this echo</h3>

      <dl className="fairness-panel__identifiers">
        <Identifier label="Receiver" value={`${receiver.name} · v1`} />
        <Identifier
          label="Session ID"
          value={state.sessionId ?? state.sessionKey}
        />
        <AddressIdentifier
          label="Game address"
          address={gameAddress}
          chainId={chainId}
        />
        <TransactionIdentifier
          label="Open transaction"
          hash={openHash}
          chainId={chainId}
        />
        <TransactionIdentifier
          label="VRF fulfillment"
          hash={fulfillmentHash}
          chainId={chainId}
        />
        <TransactionIdentifier
          label="Settlement transaction"
          hash={raw?.settleTransactionHash}
          chainId={chainId}
        />
      </dl>

      <div className="fairness-panel__signals">
        <SignalLine label="Your committed signal" bits={playerBits} />
        <SignalLine label="Ghost signal" bits={ghostBits} />
      </div>

      <p className="fairness-panel__calculation">
        XOR marks different beats; popcount found{' '}
        {state.outcome.signalLength - state.outcome.matchCount} differences, so{' '}
        {state.outcome.matchCount} of {state.outcome.signalLength} beats match.
        The {receiver.name} table assigns{' '}
        {state.outcome.payoutBps.toLocaleString()} basis points, giving floor(
        {state.wager} × {state.outcome.payoutBps} ÷ 10,000) ={' '}
        {state.outcome.payout.toString()} base units.
      </p>

      <VerificationResult state={verification} onRetry={onRetry} />
    </section>
  )
}

function VerificationResult({
  state,
  onRetry,
}: {
  state: VerificationState
  onRetry(): void
}) {
  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <p className="fairness-panel__verification" role="status">
        <span className="fairness-panel__status-dot" aria-hidden="true" />
        {state.status === 'loading'
          ? 'Checking the on-chain VRF proof in your browser…'
          : 'Open this panel to check the Chain VRF proof.'}
      </p>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="fairness-panel__verification" role="alert">
        <span className="fairness-panel__status-dot" aria-hidden="true" />
        <span>Could not verify: {state.message}</span>
        <button type="button" onClick={onRetry}>
          Retry verification
        </button>
      </div>
    )
  }

  if (!state.result.supported) {
    return (
      <p className="fairness-panel__verification" role="status">
        <span className="fairness-panel__status-dot" aria-hidden="true" />
        Cryptographic verification is not available on this network.
      </p>
    )
  }

  const verified =
    state.result.requests.length > 0 &&
    state.result.requests.every((request) => request.valid === true)
  const invalid = state.result.requests.some(
    (request) => request.valid === false,
  )

  return (
    <div
      className="fairness-panel__verification"
      data-verdict={verified ? 'valid' : invalid ? 'invalid' : 'unknown'}
      role={invalid ? 'alert' : 'status'}
    >
      <span className="fairness-panel__status-dot" aria-hidden="true" />
      <span>
        <strong>
          {verified
            ? 'VRF proof verified'
            : invalid
              ? 'VRF verification failed'
              : 'VRF proof could not be confirmed'}
        </strong>
        {verified
          ? ' The assigned enclave proof, random word, signature, and fulfiller all agree with the on-chain artifacts.'
          : invalid
            ? ' One or more cryptographic checks did not match the on-chain artifacts.'
            : ' The host did not return complete checks. This is not proof of failure.'}
      </span>
      {!verified ? (
        <button type="button" onClick={onRetry}>
          Retry verification
        </button>
      ) : null}
    </div>
  )
}

function Identifier({
  label,
  value,
  code = false,
}: {
  label: string
  value?: string
  code?: boolean
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value ? code ? <code>{value}</code> : value : 'Not supplied'}</dd>
    </div>
  )
}

function TransactionIdentifier({
  label,
  hash,
  chainId,
}: {
  label: string
  hash?: string
  chainId?: number
}) {
  const href = hash ? explorerUrl(chainId, 'tx', hash) : undefined
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {hash ? (
          href ? (
            <a href={href} target="_blank" rel="noreferrer">
              {shortHex(hash)} <span className="sr-only">(opens explorer)</span>
            </a>
          ) : (
            <code>{shortHex(hash)}</code>
          )
        ) : (
          'Not supplied'
        )}
      </dd>
    </div>
  )
}

function AddressIdentifier({
  label,
  address,
  chainId,
}: {
  label: string
  address?: string
  chainId?: number
}) {
  const href = address ? explorerUrl(chainId, 'address', address) : undefined
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {address ? (
          href ? (
            <a href={href} target="_blank" rel="noreferrer">
              {address} <span className="sr-only">(opens explorer)</span>
            </a>
          ) : (
            <code>{address}</code>
          )
        ) : (
          'Not supplied'
        )}
      </dd>
    </div>
  )
}

function SignalLine({
  label,
  bits,
}: {
  label: string
  bits: readonly (0 | 1)[]
}) {
  return (
    <div>
      <strong>{label}</strong>
      <span>{bits.map((beat) => (beat ? 'Tap' : 'Rest')).join(' · ')}</span>
      <code>{bits.join('')} (beat 1 first)</code>
    </div>
  )
}

function binomial(total: number, selected: number): number {
  const k = Math.min(selected, total - selected)
  let result = 1
  for (let index = 1; index <= k; index++) {
    result = (result * (total - index + 1)) / index
  }
  return result
}

function formatMultiplier(payoutBps: number): string {
  return `${(payoutBps / 10_000).toFixed(2)}×`
}

function shortHex(value: string): string {
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value
}

function explorerUrl(
  chainId: number | undefined,
  kind: 'tx' | 'address',
  value: string,
): string | undefined {
  const configured = import.meta.env.VITE_BLOCK_EXPLORER_URL?.replace(/\/$/, '')
  const base =
    configured ||
    (chainId === 1
      ? 'https://etherscan.io'
      : chainId === 11155111
        ? 'https://sepolia.etherscan.io'
        : chainId === 8453
          ? 'https://basescan.org'
          : chainId === 84532
            ? 'https://sepolia.basescan.org'
            : undefined)
  return base ? `${base}/${kind}/${value}` : undefined
}

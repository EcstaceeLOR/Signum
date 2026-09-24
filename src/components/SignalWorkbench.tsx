import { useCallback, useState } from 'react'

import {
  encodeGameData,
  ReceiverMode,
  decodeGameData,
  signalBitsToMask,
  signalMaskToBits,
  type SignalBeat,
} from '../game/encoding'
import {
  defaultSignal,
  randomSignal,
  receiverDefinition,
} from '../game/receivers'
import { useSignumSession } from '../game/useSignumSession'
import { useSignumSound } from '../game/useSignumSound'
import { sessionCommitment } from '../game/sessionMachine'
import type { ChainHostClient } from '../bridge/useChainHost'
import { useSignalPreview } from '../game/useSignalPreview'
import { ReceiverSelector } from './ReceiverSelector'
import { SignalComposer } from './SignalComposer'
import { WagerControls } from './WagerControls'

type SignalWorkbenchProps = {
  disabled?: boolean
  experience?: 'chain' | 'demo'
  host?: Pick<
    ChainHostClient,
    'snapshot' | 'openSession' | 'cancelStuckRandomness' | 'revealOutcome'
  >
}

type SignalDrafts = Record<ReceiverMode, SignalBeat[]>

export function SignalWorkbench({
  disabled = false,
  experience = 'chain',
  host,
}: SignalWorkbenchProps) {
  const [mode, setMode] = useState<ReceiverMode>(ReceiverMode.Pulse)
  const [drafts, setDrafts] = useState<SignalDrafts>(initialDrafts)
  const submission = useSignumSession(host)
  const commitment = sessionCommitment(submission.state)
  const committedData = commitment
    ? decodeGameData(commitment.gameData)
    : undefined
  const activeMode = committedData?.mode ?? mode
  const bits = committedData
    ? signalMaskToBits(committedData.playerSignal, committedData.signalLength)
    : drafts[mode]
  const receiver = receiverDefinition(activeMode)
  const playerSignal = signalBitsToMask(bits)
  const gameData =
    commitment?.gameData ?? encodeGameData({ mode, playerSignal })
  const sound = useSignumSound(activeMode, submission.state)
  const preview = useSignalPreview(bits, sound.playBeat)
  const playRevealCue = sound.playRevealCue
  const playRevealBeat = useCallback(
    (matches: boolean) => playRevealCue(matches ? 'match' : 'miss'),
    [playRevealCue],
  )
  const editingDisabled =
    disabled || preview.isPreviewing || submission.isLocked

  const updateSignal = (next: SignalBeat[]) => {
    preview.stop()
    setDrafts((current) => ({ ...current, [mode]: next }))
  }

  const changeMode = (nextMode: ReceiverMode) => {
    preview.stop()
    setMode(nextMode)
  }

  return (
    <section
      className="workbench"
      aria-labelledby="workbench-title"
      data-experience={experience}
      data-receiver={receiver.name.toLowerCase()}
      data-session-state={submission.state.status.toLowerCase()}
      data-result={
        submission.state.status === 'SETTLED' &&
        submission.state.outcome.matchCount ===
          submission.state.outcome.signalLength
          ? 'jackpot'
          : undefined
      }
    >
      <div className="signal-room-ambience" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Build your transmission</p>
          <h2 id="workbench-title">Choose a receiver. Set every beat.</h2>
        </div>
        <p>Build a Tap/Rest signal. More matching beats pay more.</p>
      </div>

      <ReceiverSelector
        value={activeMode}
        disabled={editingDisabled}
        onChange={changeMode}
      />

      <div className="composer-panel">
        <div className="composer-panel__heading">
          <div>
            <p className="eyebrow">{receiver.name} signal</p>
            <h3>{receiver.signalLength} beats ready to compose</h3>
          </div>
          <output className="game-data" aria-label="Encoded game data">
            <span>gameData</span>
            <code>{gameData}</code>
          </output>
        </div>

        <SignalComposer
          bits={bits}
          disabled={disabled || submission.isLocked}
          isPreviewing={preview.isPreviewing}
          previewIndex={preview.previewIndex}
          muted={sound.muted}
          onToggle={(index) => {
            const nextBeat = (1 - bits[index]) as SignalBeat
            sound.playBeat(nextBeat)
            updateSignal(
              bits.map((beat, beatIndex) =>
                beatIndex === index ? nextBeat : beat,
              ),
            )
          }}
          onReset={() => updateSignal(defaultSignal(receiver.signalLength))}
          onRandomize={() => updateSignal(randomSignal(receiver.signalLength))}
          onPreview={preview.preview}
          onToggleMuted={sound.toggleMuted}
        />

        <p className="odds-note">
          <span aria-hidden="true">◎</span>
          {experience === 'demo'
            ? 'Every pattern has the same odds. This demo uses local secure browser randomness.'
            : 'Every pattern has the same odds. Chain generates an independent echo after you transmit.'}
        </p>
      </div>

      <WagerControls
        snapshot={host?.snapshot ?? null}
        receiver={receiver}
        gameData={gameData}
        disabled={disabled}
        submission={submission}
        onRevealBeat={playRevealBeat}
        experience={experience}
      />
    </section>
  )
}

function initialDrafts(): SignalDrafts {
  return {
    [ReceiverMode.Pulse]: defaultSignal(4),
    [ReceiverMode.Carrier]: defaultSignal(6),
    [ReceiverMode.Deepwave]: defaultSignal(8),
  }
}

import { useState } from 'react'

import {
  encodeGameData,
  ReceiverMode,
  signalBitsToMask,
  type SignalBeat,
} from '../game/encoding'
import {
  defaultSignal,
  randomSignal,
  receiverDefinition,
} from '../game/receivers'
import { useSignalPreview } from '../game/useSignalPreview'
import { ReceiverSelector } from './ReceiverSelector'
import { SignalComposer } from './SignalComposer'

type SignalWorkbenchProps = {
  disabled?: boolean
}

type SignalDrafts = Record<ReceiverMode, SignalBeat[]>

export function SignalWorkbench({ disabled = false }: SignalWorkbenchProps) {
  const [mode, setMode] = useState<ReceiverMode>(ReceiverMode.Pulse)
  const [drafts, setDrafts] = useState<SignalDrafts>(initialDrafts)
  const bits = drafts[mode]
  const receiver = receiverDefinition(mode)
  const playerSignal = signalBitsToMask(bits)
  const gameData = encodeGameData({ mode, playerSignal })
  const preview = useSignalPreview(bits)
  const editingDisabled = disabled || preview.isPreviewing

  const updateSignal = (next: SignalBeat[]) => {
    preview.stop()
    setDrafts((current) => ({ ...current, [mode]: next }))
  }

  const changeMode = (nextMode: ReceiverMode) => {
    preview.stop()
    setMode(nextMode)
  }

  return (
    <section className="workbench" aria-labelledby="workbench-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Build your transmission</p>
          <h2 id="workbench-title">Choose a receiver. Set every beat.</h2>
        </div>
        <p>Build a Tap/Rest signal. More matching beats pay more.</p>
      </div>

      <ReceiverSelector
        value={mode}
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
          disabled={disabled}
          isPreviewing={preview.isPreviewing}
          previewIndex={preview.previewIndex}
          onToggle={(index) =>
            updateSignal(
              bits.map((beat, beatIndex) =>
                beatIndex === index ? ((1 - beat) as SignalBeat) : beat,
              ),
            )
          }
          onReset={() => updateSignal(defaultSignal(receiver.signalLength))}
          onRandomize={() => updateSignal(randomSignal(receiver.signalLength))}
          onPreview={preview.preview}
        />

        <p className="odds-note">
          <span aria-hidden="true">◎</span>
          Every pattern has the same odds. Chain generates an independent echo
          after you transmit.
        </p>
      </div>
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

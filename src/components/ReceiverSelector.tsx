import type { ReceiverMode } from '../game/encoding'
import { RECEIVERS } from '../game/receivers'

type ReceiverSelectorProps = {
  value: ReceiverMode
  disabled?: boolean
  onChange(mode: ReceiverMode): void
}

export function ReceiverSelector({
  value,
  disabled = false,
  onChange,
}: ReceiverSelectorProps) {
  return (
    <fieldset className="receiver-selector" disabled={disabled}>
      <legend className="sr-only">Receiver mode</legend>
      <div className="receiver-grid">
        {RECEIVERS.map((receiver, index) => {
          const inputId = `receiver-${receiver.name.toLowerCase()}`
          return (
            <div className="receiver-choice" key={receiver.mode}>
              <input
                className="sr-only receiver-choice__input"
                id={inputId}
                type="radio"
                name="receiver-mode"
                value={receiver.mode}
                checked={value === receiver.mode}
                onChange={() => onChange(receiver.mode)}
              />
              <label className="receiver-card" htmlFor={inputId}>
                <span className="receiver-card__index">0{index + 1}</span>
                <span className="receiver-card__heading">
                  <span>{receiver.signalLength} beats</span>
                  <strong>{receiver.name}</strong>
                </span>
                <span className="receiver-card__description">
                  {receiver.description}
                </span>
                <span className="receiver-card__stats">
                  <span>
                    <small>Volatility</small>
                    <b>{receiver.volatility}</b>
                  </span>
                  <span>
                    <small>RTP</small>
                    <b>{receiver.rtp}</b>
                  </span>
                  <span>
                    <small>Maximum</small>
                    <b>{receiver.maximumPayout}</b>
                  </span>
                </span>
              </label>
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}

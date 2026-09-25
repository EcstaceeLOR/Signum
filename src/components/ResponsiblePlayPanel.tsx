import { useEffect, useState } from 'react'

type ResponsiblePlayPanelProps = {
  realPlay: boolean
  eligibilityAccepted: boolean
  onEligibilityChange(accepted: boolean): void
}

export function ResponsiblePlayPanel({
  realPlay,
  eligibilityAccepted,
  onEligibilityChange,
}: ResponsiblePlayPanelProps) {
  const [reminderEnabled, setReminderEnabled] = useState(false)
  const [reminderDue, setReminderDue] = useState(false)

  useEffect(() => {
    if (!reminderEnabled) return
    const timer = window.setTimeout(() => setReminderDue(true), 15 * 60 * 1000)
    return () => window.clearTimeout(timer)
  }, [reminderEnabled])

  return (
    <aside className="responsible-play" aria-labelledby="responsible-title">
      <div>
        <p className="eyebrow">Play with limits</p>
        <h2 id="responsible-title">Every echo is independent.</h2>
        <p>
          Signum has a house edge. Past signals, wins, losses, and journal
          entries never improve the next round. Never chase losses or wager
          funds you cannot afford to lose.
        </p>
      </div>

      <div className="responsible-play__controls">
        {realPlay ? (
          <label>
            <input
              type="checkbox"
              checked={eligibilityAccepted}
              onChange={(event) => onEligibilityChange(event.target.checked)}
            />
            <span>
              I confirm I meet the legal gambling age and may participate in my
              jurisdiction.
            </span>
          </label>
        ) : (
          <p>
            Standalone mode uses local demo credits only. They have no monetary
            value and never settle on Chain.
          </p>
        )}

        <label>
          <input
            type="checkbox"
            checked={reminderEnabled}
            onChange={(event) => {
              setReminderEnabled(event.target.checked)
              setReminderDue(false)
            }}
          />
          <span>Remind me to take a break after 15 minutes.</span>
        </label>

        {reminderDue ? (
          <p className="responsible-play__reminder" role="alert">
            Fifteen minutes have passed. Pause, review your time and spending,
            and consider ending the session.
          </p>
        ) : null}

        <nav aria-label="Player protection resources">
          <a
            href="https://jam.chain.wtf/#/terms"
            target="_blank"
            rel="noreferrer"
          >
            Chain Jam terms
          </a>
          <a
            href="https://gamblingtherapy.org/information/where-can-i-get-help/"
            target="_blank"
            rel="noreferrer"
          >
            Global gambling support
          </a>
        </nav>
      </div>
    </aside>
  )
}

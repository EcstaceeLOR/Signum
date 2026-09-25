import { routes } from '../app/routes'
import { usePageMetadata } from '../app/usePageMetadata'
import { usePreferences } from '../state/preferences'

export function ResponsiblePlayPage() {
  const preferences = usePreferences()
  usePageMetadata(
    'Responsible play',
    'Limits, eligibility, and independent gambling support.',
    routes.responsiblePlay,
  )
  return (
    <article className="information-page" aria-labelledby="responsible-title">
      <p className="eyebrow">Play with limits</p>
      <h1 id="responsible-title" data-page-heading tabIndex={-1}>
        Responsible play
      </h1>
      <p>
        Every echo is independent. Past wins, losses, or patterns never improve
        the next round. Never chase losses or wager funds you cannot afford to
        lose.
      </p>
      <h2>Eligibility</h2>
      <p>
        Real play requires you to meet the legal gambling age and rules in your
        location. Signum cannot determine your jurisdiction for you.
      </p>
      <label>
        <input
          type="checkbox"
          checked={preferences.eligibilityAccepted}
          onChange={(event) =>
            preferences.update({ eligibilityAccepted: event.target.checked })
          }
        />
        I confirm I meet the legal gambling age and requirements where I live.
      </label>
      <h2>Practical limits</h2>
      <ul>
        <li>Set a spending and time limit before playing.</li>
        <li>Take regular breaks and stop when play is no longer enjoyable.</li>
        <li>Do not borrow money or use essential funds.</li>
      </ul>
      <p>
        <a
          href="https://jam.chain.wtf/#/terms"
          target="_blank"
          rel="noreferrer"
        >
          Chain Jam terms (opens externally)
        </a>
      </p>
      <p>
        <a
          href="https://gamblingtherapy.org/information/where-can-i-get-help/"
          target="_blank"
          rel="noreferrer"
        >
          Global gambling support (opens externally)
        </a>
      </p>
    </article>
  )
}

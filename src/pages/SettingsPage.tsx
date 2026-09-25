import { routes } from '../app/routes'
import { usePageMetadata } from '../app/usePageMetadata'
import { downloadDiagnosticExport } from '../diagnostics/diagnostics'
import { usePreferences } from '../state/preferences'

export function SettingsPage() {
  const preferences = usePreferences()
  usePageMetadata(
    'Settings',
    'Control Signum preferences and local data.',
    routes.settings,
  )
  const resetPreferences = () => {
    if (!window.confirm('Reset Signum preferences in this browser?')) return
    preferences.update({
      tutorialComplete: false,
      eligibilityAccepted: false,
      muted: false,
      diagnosticsConsent: false,
    })
  }
  const resetDemo = () => {
    if (
      !window.confirm('Reset the practice balance and any open practice round?')
    )
      return
    window.localStorage.removeItem('signum.demo')
    window.location.reload()
  }
  return (
    <article
      className="guest-shell settings-page"
      aria-labelledby="settings-title"
    >
      <p className="eyebrow">Local controls</p>
      <h1 id="settings-title" data-page-heading tabIndex={-1}>
        Settings
      </h1>
      <p>
        These controls change only this browser. They never affect Signum math,
        randomness, or Chain-authoritative state.
      </p>
      <label>
        <input
          type="checkbox"
          checked={preferences.muted}
          onChange={(event) =>
            preferences.update({ muted: event.target.checked })
          }
        />
        Mute sound
      </label>
      <label>
        <input
          type="checkbox"
          checked={preferences.diagnosticsConsent}
          onChange={(event) =>
            preferences.update({ diagnosticsConsent: event.target.checked })
          }
        />
        Include local diagnostics when I export them
      </label>
      <button
        type="button"
        onClick={() => preferences.update({ tutorialComplete: false })}
      >
        Replay tutorial on the next round
      </button>
      <button type="button" onClick={downloadDiagnosticExport}>
        Export diagnostics
      </button>
      <button type="button" onClick={resetPreferences}>
        Reset preferences
      </button>
      <button type="button" onClick={resetDemo}>
        Reset practice balance
      </button>
    </article>
  )
}

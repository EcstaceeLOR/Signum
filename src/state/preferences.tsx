import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  readPersistent,
  subscribePersistent,
  writePersistent,
  type PersistentSchema,
} from './persistence'

export type PlayerPreferences = {
  tutorialComplete: boolean
  eligibilityAccepted: boolean
  muted: boolean
  diagnosticsConsent: boolean
}

const defaultPreferences: PlayerPreferences = {
  tutorialComplete: false,
  eligibilityAccepted: false,
  muted: false,
  diagnosticsConsent: false,
}

export const preferencesSchema: PersistentSchema<PlayerPreferences> = {
  key: 'signum.preferences',
  version: 2,
  fallback: () => ({ ...defaultPreferences }),
  validate: isPreferences,
  migrate: migratePreferences,
}

type PreferencesContextValue = PlayerPreferences & {
  update(changes: Partial<PlayerPreferences>): void
}

const PreferencesContext = createContext<PreferencesContextValue | undefined>(
  undefined,
)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(loadPreferences)

  useEffect(() => subscribePersistent(preferencesSchema, setPreferences), [])

  const update = useCallback((changes: Partial<PlayerPreferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...changes }
      writePersistent(preferencesSchema, next)
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ ...preferences, update }),
    [preferences, update],
  )
  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext)
  if (!value) throw new Error('usePreferences requires PreferencesProvider')
  return value
}

export function useOptionalPreferences(): PreferencesContextValue | undefined {
  return useContext(PreferencesContext)
}

function loadPreferences(): PlayerPreferences {
  const hasCurrentPreferences =
    typeof window !== 'undefined' &&
    safeLegacyRead(preferencesSchema.key) !== null
  const preferences = readPersistent(preferencesSchema)
  if (typeof window === 'undefined' || hasCurrentPreferences) return preferences
  const migrated = {
    ...preferences,
    tutorialComplete:
      preferences.tutorialComplete ||
      safeLegacyRead('signum.tutorial-complete.v1') === '1',
    eligibilityAccepted:
      preferences.eligibilityAccepted ||
      safeLegacyRead('signum.eligibility-confirmed.v1') === '1',
    muted: preferences.muted || safeLegacyRead('signum.sound-muted.v1') === '1',
  }
  if (!isSamePreferences(preferences, migrated)) {
    writePersistent(preferencesSchema, migrated)
    removeLegacyPreferences()
  }
  return migrated
}

function removeLegacyPreferences() {
  try {
    window.localStorage.removeItem('signum.tutorial-complete.v1')
    window.localStorage.removeItem('signum.eligibility-confirmed.v1')
    window.localStorage.removeItem('signum.sound-muted.v1')
  } catch {
    // The current envelope is already written when legacy cleanup is denied.
  }
}

function migratePreferences(value: unknown): PlayerPreferences | undefined {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Partial<PlayerPreferences>
  return {
    tutorialComplete: source.tutorialComplete === true,
    eligibilityAccepted: source.eligibilityAccepted === true,
    muted: source.muted === true,
    diagnosticsConsent: source.diagnosticsConsent === true,
  }
}

function isPreferences(value: unknown): value is PlayerPreferences {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<PlayerPreferences>
  return (
    typeof candidate.tutorialComplete === 'boolean' &&
    typeof candidate.eligibilityAccepted === 'boolean' &&
    typeof candidate.muted === 'boolean' &&
    typeof candidate.diagnosticsConsent === 'boolean'
  )
}

function safeLegacyRead(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function isSamePreferences(
  left: PlayerPreferences,
  right: PlayerPreferences,
): boolean {
  return Object.keys(left).every(
    (key) =>
      left[key as keyof PlayerPreferences] ===
      right[key as keyof PlayerPreferences],
  )
}

export type PersistenceNotice = {
  kind: 'migrated' | 'reset' | 'unavailable'
  message: string
}

export type PersistentSchema<T> = {
  key: string
  version: number
  fallback(): T
  validate(value: unknown): value is T
  migrate?(value: unknown, version: number): T | undefined
}

type Envelope = {
  version: number
  updatedAt: number
  data: unknown
}

const noticeEvent = 'signum:persistence-notice'
let latestNotice: PersistenceNotice | undefined

export function readPersistent<T>(schema: PersistentSchema<T>): T {
  const storage = localStorageOrUndefined()
  if (!storage) {
    emitNotice({
      kind: 'unavailable',
      message:
        'Local storage is unavailable. Signum will keep this session in memory.',
    })
    return schema.fallback()
  }

  let raw: string | null
  try {
    raw = storage.getItem(schema.key)
  } catch {
    emitNotice({
      kind: 'unavailable',
      message:
        'Local storage could not be read. Signum will keep this session in memory.',
    })
    return schema.fallback()
  }
  if (raw === null) return schema.fallback()

  try {
    const parsed = JSON.parse(raw) as unknown
    const envelope = isEnvelope(parsed) ? parsed : undefined
    const version = envelope?.version ?? 0
    const data = envelope?.data ?? parsed
    if (version === schema.version && schema.validate(data)) return data

    const migrated = schema.migrate?.(data, version)
    if (migrated && schema.validate(migrated)) {
      writePersistent(schema, migrated)
      emitNotice({
        kind: 'migrated',
        message: 'Your saved Signum data was upgraded to the current format.',
      })
      return migrated
    }
  } catch {
    // Recovery below preserves the unreadable payload when storage permits.
  }

  preserveUnreadableValue(storage, schema.key, raw)
  try {
    storage.removeItem(schema.key)
  } catch {
    // The in-memory fallback still keeps the product usable.
  }
  emitNotice({
    kind: 'reset',
    message:
      'Unreadable saved data was set aside and this local section was reset.',
  })
  return schema.fallback()
}

export function writePersistent<T>(
  schema: PersistentSchema<T>,
  value: T,
): boolean {
  const storage = localStorageOrUndefined()
  if (!storage) return false
  try {
    storage.setItem(
      schema.key,
      JSON.stringify({
        version: schema.version,
        updatedAt: Date.now(),
        data: value,
      }),
    )
    return true
  } catch {
    emitNotice({
      kind: 'unavailable',
      message:
        'Changes are safe for this visit but could not be saved on this device.',
    })
    return false
  }
}

export function removePersistent(key: string): boolean {
  const storage = localStorageOrUndefined()
  if (!storage) return false
  try {
    storage.removeItem(key)
    return true
  } catch {
    return false
  }
}

export function subscribePersistent<T>(
  schema: PersistentSchema<T>,
  listener: (value: T) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined
  const onStorage = (event: StorageEvent) => {
    if (event.key !== schema.key || event.newValue === null) return
    try {
      const parsed = JSON.parse(event.newValue) as unknown
      if (!isEnvelope(parsed) || parsed.version !== schema.version) return
      if (schema.validate(parsed.data)) listener(parsed.data)
    } catch {
      // A malformed update from another tab cannot replace valid memory state.
    }
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}

export function subscribePersistenceNotices(
  listener: (notice: PersistenceNotice) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined
  if (latestNotice) listener(latestNotice)
  const onNotice = (event: Event) =>
    listener((event as CustomEvent<PersistenceNotice>).detail)
  window.addEventListener(noticeEvent, onNotice)
  return () => window.removeEventListener(noticeEvent, onNotice)
}

function emitNotice(notice: PersistenceNotice) {
  latestNotice = notice
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(noticeEvent, { detail: notice }))
}

function localStorageOrUndefined(): Storage | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function isEnvelope(value: unknown): value is Envelope {
  if (!value || typeof value !== 'object') return false
  const envelope = value as Partial<Envelope>
  return (
    Number.isInteger(envelope.version) &&
    Number.isFinite(envelope.updatedAt) &&
    'data' in envelope
  )
}

function preserveUnreadableValue(storage: Storage, key: string, raw: string) {
  try {
    storage.setItem(`${key}.recovery.${Date.now()}`, raw)
  } catch {
    // Quota or policy may prevent a recovery copy; resetting remains safe.
  }
}

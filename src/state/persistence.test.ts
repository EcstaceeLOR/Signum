import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  readPersistent,
  subscribePersistenceNotices,
  subscribePersistent,
  writePersistent,
  type PersistenceNotice,
  type PersistentSchema,
} from './persistence'

type Fixture = { count: number }

const schema: PersistentSchema<Fixture> = {
  key: 'signum.test.fixture',
  version: 2,
  fallback: () => ({ count: 0 }),
  validate: (value): value is Fixture =>
    Boolean(
      value &&
      typeof value === 'object' &&
      Number.isInteger((value as Fixture).count),
    ),
  migrate: (value, version) =>
    version === 0 && typeof value === 'number' ? { count: value } : undefined,
}

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('versioned persistence', () => {
  it('migrates a legacy value into a current envelope', () => {
    window.localStorage.setItem(schema.key, '4')

    expect(readPersistent(schema)).toEqual({ count: 4 })
    expect(
      JSON.parse(window.localStorage.getItem(schema.key) ?? '{}'),
    ).toMatchObject({
      version: 2,
      data: { count: 4 },
    })
  })

  it('sets corrupt data aside and safely resets the section', () => {
    window.localStorage.setItem(schema.key, '{broken')

    expect(readPersistent(schema)).toEqual({ count: 0 })
    expect(window.localStorage.getItem(schema.key)).toBeNull()
    expect(
      Object.keys(window.localStorage).some((key) =>
        key.startsWith(`${schema.key}.recovery.`),
      ),
    ).toBe(true)
  })

  it('keeps working in memory and announces quota denial', () => {
    const notices: PersistenceNotice[] = []
    const unsubscribe = subscribePersistenceNotices((notice) =>
      notices.push(notice),
    )
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })

    expect(writePersistent(schema, { count: 8 })).toBe(false)
    expect(notices.at(-1)).toMatchObject({ kind: 'unavailable' })
    unsubscribe()
  })

  it('accepts valid updates from another tab and ignores malformed ones', () => {
    const listener = vi.fn()
    const unsubscribe = subscribePersistent(schema, listener)
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: schema.key,
        newValue: JSON.stringify({
          version: 2,
          updatedAt: Date.now(),
          data: { count: 9 },
        }),
      }),
    )
    window.dispatchEvent(
      new StorageEvent('storage', { key: schema.key, newValue: '{broken' }),
    )

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith({ count: 9 })
    unsubscribe()
  })
})

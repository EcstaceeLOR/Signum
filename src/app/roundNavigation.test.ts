import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  hasActiveRoundNavigationGuard,
  setActiveRoundNavigationGuard,
  subscribeRoundNavigationGuard,
} from './roundNavigation'

afterEach(() => setActiveRoundNavigationGuard(false))

describe('round navigation guard', () => {
  it('notifies the shell only when unresolved-round protection changes', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeRoundNavigationGuard(listener)

    setActiveRoundNavigationGuard(true)
    setActiveRoundNavigationGuard(true)
    expect(hasActiveRoundNavigationGuard()).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)

    setActiveRoundNavigationGuard(false)
    expect(hasActiveRoundNavigationGuard()).toBe(false)
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
  })
})

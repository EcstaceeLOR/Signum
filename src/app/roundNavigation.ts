type Listener = () => void

let activeRound = false
const listeners = new Set<Listener>()

export function setActiveRoundNavigationGuard(active: boolean) {
  if (activeRound === active) return
  activeRound = active
  listeners.forEach((listener) => listener())
}

export function subscribeRoundNavigationGuard(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function hasActiveRoundNavigationGuard() {
  return activeRound
}

export const activeRoundNavigationMessage =
  'A transmission is still in progress. Leave this page and keep the round recoverable?'

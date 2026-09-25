export function subscribeConnectivity(listener: () => void) {
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}

export function isOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

import { useEffect } from 'react'
import { useLocation } from 'react-router'

export function RouteEffects() {
  const location = useLocation()

  useEffect(() => {
    let observer: MutationObserver | undefined
    let observerTimeout: number | undefined

    const focusRouteTarget = () => {
      const target = location.hash
        ? document.getElementById(location.hash.slice(1))
        : document.querySelector<HTMLElement>('[data-page-heading]')
      if (!target) return false

      if (location.hash) target.scrollIntoView()
      target.focus({ preventScroll: true })
      return true
    }

    const frame = window.requestAnimationFrame(() => {
      if (!location.hash) window.scrollTo({ top: 0, behavior: 'instant' })
      if (focusRouteTarget()) return

      observer = new MutationObserver(() => {
        if (focusRouteTarget()) observer?.disconnect()
      })
      observer.observe(
        document.getElementById('main-content') ?? document.body,
        {
          childList: true,
          subtree: true,
        },
      )
      observerTimeout = window.setTimeout(() => observer?.disconnect(), 2_000)
    })

    return () => {
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
      if (observerTimeout !== undefined) window.clearTimeout(observerTimeout)
    }
  }, [location.hash, location.pathname])

  return null
}

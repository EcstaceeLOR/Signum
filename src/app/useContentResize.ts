import { useEffect } from 'react'

export type ContentSizeReporter = (input: {
  minHeight: number
}) => void | Promise<void>

export function useContentResize(reportContentSize?: ContentSizeReporter) {
  useEffect(() => {
    if (!reportContentSize || typeof document === 'undefined') return

    let animationFrame = 0
    let active = true
    let lastHeight = -1

    const report = () => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(() => {
        if (!active) return

        const minHeight = documentHeight()
        if (minHeight === lastHeight) return
        lastHeight = minHeight

        try {
          void Promise.resolve(reportContentSize({ minHeight })).catch(() => {
            // The parent may navigate away between measurement and delivery.
          })
        } catch {
          // A detached host must not crash the standalone guest.
        }
      })
    }

    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(report)
    observer?.observe(document.documentElement)
    if (document.body) observer?.observe(document.body)
    window.addEventListener('load', report)
    report()

    return () => {
      active = false
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('load', report)
      observer?.disconnect()
    }
  }, [reportContentSize])
}

function documentHeight(): number {
  const body = document.body
  const root = document.documentElement

  return Math.ceil(
    Math.max(
      body?.scrollHeight ?? 0,
      body?.offsetHeight ?? 0,
      root.scrollHeight,
      root.offsetHeight,
    ),
  )
}

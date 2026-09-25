import {
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import { NavLink, Outlet } from 'react-router'

import { downloadDiagnosticExport } from '../diagnostics/diagnostics'
import type { GuestEnvironment } from '../App'
import { routes } from '../app/routes'
import { RouteEffects } from '../app/RouteEffects'
import {
  activeRoundNavigationMessage,
  hasActiveRoundNavigationGuard,
  subscribeRoundNavigationGuard,
} from '../app/roundNavigation'
import {
  subscribePersistenceNotices,
  type PersistenceNotice,
} from '../state/persistence'

type AppShellProps = {
  environment: GuestEnvironment
}

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function AppShell({ environment }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [persistenceNotice, setPersistenceNotice] =
    useState<PersistenceNotice>()
  const menuRef = useRef<HTMLElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const isDemo = environment === 'standalone'
  const hasActiveRound = useSyncExternalStore(
    subscribeRoundNavigationGuard,
    hasActiveRoundNavigationGuard,
    hasActiveRoundNavigationGuard,
  )

  useEffect(() => subscribePersistenceNotices(setPersistenceNotice), [])

  useEffect(() => {
    if (!menuOpen) return

    menuRef.current?.querySelector<HTMLElement>(focusableSelector)?.focus()
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (
        !menuRef.current?.contains(target) &&
        !menuButtonRef.current?.contains(target)
      ) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setMenuOpen(false)
      menuButtonRef.current?.focus()
      return
    }
    if (event.key !== 'Tab') return

    const focusable = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const confirmNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
    if (hasActiveRound && !window.confirm(activeRoundNavigationMessage)) {
      event.preventDefault()
      return
    }
    setMenuOpen(false)
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="topbar">
        <NavLink
          className="brand"
          to={routes.home}
          aria-label="Signum home"
          onClick={confirmNavigation}
        >
          <span className="brand__mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>Signum</span>
        </NavLink>

        <span className="network-pill" data-demo={isDemo || undefined}>
          <span className="network-pill__light" aria-hidden="true" />
          {isDemo ? 'Local demo' : 'Chain native'}
        </span>

        <button
          ref={menuButtonRef}
          className="menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          onClick={() => setMenuOpen((current) => !current)}
        >
          <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
          <span>{menuOpen ? 'Close' : 'Menu'}</span>
        </button>

        <nav
          ref={menuRef}
          id="primary-navigation"
          className="primary-navigation"
          aria-label="Primary navigation"
          data-open={menuOpen || undefined}
          onKeyDown={handleMenuKeyDown}
        >
          <NavLink
            to={routes.home}
            end
            className={({ isActive }) => (isActive ? 'is-active' : undefined)}
            onClick={confirmNavigation}
          >
            Home
          </NavLink>
          <NavLink
            to={routes.play}
            className={({ isActive }) => (isActive ? 'is-active' : undefined)}
            onClick={confirmNavigation}
          >
            Play
          </NavLink>
        </nav>
      </header>

      {persistenceNotice ? (
        <div className="persistence-notice" role="status">
          <span>{persistenceNotice.message}</span>
          <button type="button" onClick={() => setPersistenceNotice(undefined)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <RouteEffects />
      <main id="main-content" className="route-content">
        <Suspense fallback={<RouteLoading />}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="footer">
        <span>
          {isDemo ? 'Local demo · no real funds' : 'Provably fair by design'}
        </span>
        <span>Built for Chain Jam Vol. 1</span>
        <button type="button" onClick={downloadDiagnosticExport}>
          Export diagnostics
        </button>
      </footer>
    </div>
  )
}

function RouteLoading() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <span className="host-state__spinner" aria-hidden="true" />
      Loading Signum…
    </div>
  )
}

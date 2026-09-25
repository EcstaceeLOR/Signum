import { lazy, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'

import { routes } from './app/routes'
import { useContentResize } from './app/useContentResize'
import { useChainHost } from './bridge/useChainHost'
import { AppShell } from './components/AppShell'
import { useDemoHost } from './demo/useDemoHost'
import { setDiagnosticStage } from './diagnostics/diagnostics'
import { PlayPage, type ChainHostPresentation } from './pages/PlayPage'
import { PreferencesProvider } from './state/preferences'

const HomePage = lazy(() =>
  import('./pages/HomePage').then((module) => ({ default: module.HomePage })),
)
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((module) => ({
    default: module.NotFoundPage,
  })),
)

export type GuestEnvironment = 'embedded' | 'standalone'

type AppProps = {
  environment?: GuestEnvironment
  host?: ChainHostPresentation
  showcase?: boolean
}

export function App({
  environment: environmentOverride,
  host: hostOverride,
  showcase: showcaseOverride,
}: AppProps) {
  const environment = environmentOverride ?? detectGuestEnvironment()
  const isDemo = environment === 'standalone'
  const showcase = isDemo && (showcaseOverride ?? detectShowcaseEnvironment())
  const connectedHost = useChainHost(
    environment === 'embedded' && hostOverride === undefined,
  )
  const host = hostOverride ?? connectedHost
  const demoHost = useDemoHost(showcase)

  useContentResize(
    environment === 'embedded' && host.status === 'connected'
      ? host.reportContentSize
      : undefined,
  )

  useEffect(() => {
    setDiagnosticStage(
      isDemo
        ? showcase
          ? 'demo:showcase'
          : 'demo:ready'
        : `bridge:${host.status}`,
    )
  }, [host.status, isDemo, showcase])

  return (
    <PreferencesProvider>
      <BrowserRouter basename={routerBaseName()}>
        <Routes>
          <Route element={<AppShell environment={environment} />}>
            <Route
              index
              element={
                environment === 'embedded' ? (
                  <Navigate replace to={routes.play} />
                ) : (
                  <HomePage environment={environment} />
                )
              }
            />
            <Route
              path={routes.play}
              element={
                <PlayPage
                  environment={environment}
                  host={host}
                  demoHost={demoHost}
                  showcase={showcase}
                />
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </PreferencesProvider>
  )
}

function routerBaseName(): string | undefined {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return base || undefined
}

function detectGuestEnvironment(): GuestEnvironment {
  if (typeof window === 'undefined') return 'standalone'

  try {
    return window.self === window.top ? 'standalone' : 'embedded'
  } catch {
    return 'embedded'
  }
}

function detectShowcaseEnvironment(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('showcase') === '1'
  } catch {
    return false
  }
}

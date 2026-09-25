import { lazy, useEffect } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'

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
const HowItWorksPage = lazy(() =>
  import('./pages/HowItWorksPage').then((module) => ({
    default: module.HowItWorksPage,
  })),
)
const FairnessPage = lazy(() =>
  import('./pages/FairnessPage').then((module) => ({
    default: module.FairnessPage,
  })),
)
const PlaySetupPage = lazy(() =>
  import('./pages/PlaySetupPage').then((module) => ({
    default: module.PlaySetupPage,
  })),
)
const ResultPage = lazy(() =>
  import('./pages/ResultPage').then((module) => ({
    default: module.ResultPage,
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
                  <PlayPage
                    environment={environment}
                    host={host}
                    demoHost={demoHost}
                    showcase={showcase}
                    defaultReceiver="pulse"
                  />
                ) : (
                  <HomePage environment={environment} />
                )
              }
            />
            <Route
              path={routes.play}
              element={
                <PlaySetupPage
                  environment={environment}
                  host={host}
                  demoHost={demoHost}
                />
              }
            />
            <Route
              path={`${routes.play}/:receiver`}
              element={
                <PlayPage
                  environment={environment}
                  host={host}
                  demoHost={demoHost}
                  showcase={showcase}
                />
              }
            />
            <Route
              path={`${routes.results}/:roundId`}
              element={<ResultPage />}
            />
            <Route path={routes.howItWorks} element={<HowItWorksPage />} />
            <Route path={routes.fairness} element={<FairnessPage />} />
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

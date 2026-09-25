export const routes = {
  home: '/',
  play: '/play',
  results: '/results',
  history: '/history',
  settings: '/settings',
  howItWorks: '/how-it-works',
  fairness: '/fairness',
} as const

export type AppRoute = (typeof routes)[keyof typeof routes]

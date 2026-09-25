export const routes = {
  home: '/',
  play: '/play',
  results: '/results',
  history: '/history',
  settings: '/settings',
  responsiblePlay: '/responsible-play',
  support: '/support',
  howItWorks: '/how-it-works',
  fairness: '/fairness',
} as const

export type AppRoute = (typeof routes)[keyof typeof routes]

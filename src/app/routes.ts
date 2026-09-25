export const routes = {
  home: '/',
  play: '/play',
  howItWorks: '/how-it-works',
  fairness: '/fairness',
} as const

export type AppRoute = (typeof routes)[keyof typeof routes]

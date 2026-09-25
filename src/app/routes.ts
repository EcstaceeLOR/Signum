export const routes = {
  home: '/',
  play: '/play',
} as const

export type AppRoute = (typeof routes)[keyof typeof routes]

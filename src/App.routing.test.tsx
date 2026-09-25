import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  vi.stubGlobal('scrollTo', vi.fn())
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
})

describe('routed product shell', () => {
  it('opens on Home and navigates into the playable product', async () => {
    render(<App environment="standalone" />)

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Send a signal. Hear the unknown answer.',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(document.title).toBe('Home · Signum')

    fireEvent.click(screen.getByRole('link', { name: 'Play' }))

    expect(window.location.pathname).toBe('/play')
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Send a signal. Catch its echo.',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Play' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await waitFor(() => expect(document.title).toBe('Play · Signum'))
  })

  it('routes an embedded launch directly to Chain play', () => {
    render(<App environment="embedded" />)

    expect(window.location.pathname).toBe('/play')
    expect(
      screen.getByRole('status', { name: 'Chain host status' }),
    ).toHaveTextContent('Connecting to Chain')
  })

  it('connects Home to complete learning and fairness pages', async () => {
    render(<App environment="standalone" />)
    await screen.findByRole('heading', {
      name: 'Send a signal. Hear the unknown answer.',
    })

    fireEvent.click(screen.getByRole('link', { name: 'How it works' }))
    expect(
      await screen.findByRole('heading', { name: 'How Signum works.' }),
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe('/how-it-works')

    fireEvent.click(screen.getByRole('link', { name: 'Signum home' }))
    await screen.findByRole('heading', {
      name: 'Send a signal. Hear the unknown answer.',
    })
    fireEvent.click(screen.getByRole('link', { name: 'Inspect fairness' }))
    expect(
      await screen.findByRole('heading', {
        name: 'Fairness you can reconstruct.',
      }),
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe('/fairness')
  })

  it('renders a useful 404 and recovers through its navigation', async () => {
    window.history.replaceState({}, '', '/frequency-that-does-not-exist')
    render(<App environment="standalone" />)

    expect(
      await screen.findByRole('heading', { name: 'This frequency is silent.' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Return home' }))
    expect(window.location.pathname).toBe('/')
    expect(
      await screen.findByRole('heading', {
        name: 'Send a signal. Hear the unknown answer.',
      }),
    ).toBeInTheDocument()
  })

  it('opens, closes, and restores focus for the mobile menu', async () => {
    render(<App environment="standalone" />)
    await screen.findByRole('heading', {
      name: 'Send a signal. Hear the unknown answer.',
    })
    const menuButton = screen.getByRole('button', { name: 'Menu' })

    fireEvent.click(menuButton)
    expect(screen.getByRole('button', { name: 'Close' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )

    fireEvent.keyDown(screen.getByRole('navigation'), { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })
})

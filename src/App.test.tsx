import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { App } from './App'

describe('App', () => {
  it('introduces Signum and its receiver modes', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Signum' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Pulse')).toBeInTheDocument()
    expect(screen.getByText('Carrier')).toBeInTheDocument()
    expect(screen.getByText('Deepwave')).toBeInTheDocument()
  })
})

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SignalWorkbench } from './SignalWorkbench'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  window.localStorage.clear()
})

describe('SignalWorkbench', () => {
  it('discloses the volatility, RTP, maximum payout, and independent odds', () => {
    render(<SignalWorkbench />)

    expect(screen.getAllByText('96.25%')).toHaveLength(2)
    expect(screen.getAllByText('96.09375%')).toHaveLength(2)
    expect(screen.getAllByText('7.40×')).toHaveLength(3)
    expect(screen.getByText('21.50×')).toBeInTheDocument()
    expect(screen.getByText('40.00×')).toBeInTheDocument()
    expect(screen.getByText('Low')).toBeInTheDocument()
    expect(screen.getByText('Medium')).toBeInTheDocument()
    expect(screen.getByText('High')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Every pattern has the same odds. Chain generates an independent echo after you transmit.',
      ),
    ).toBeInTheDocument()
  })

  it('starts with the specified Pulse draft and encodes every toggle', () => {
    render(<SignalWorkbench />)

    expect(screen.getAllByRole('button', { name: /^Beat/ })).toHaveLength(4)
    expect(screen.getByLabelText('Encoded game data')).toHaveTextContent(
      '0x01000500',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Beat 2: Rest' }))
    expect(screen.getByRole('button', { name: 'Beat 2: Tap' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByLabelText('Encoded game data')).toHaveTextContent(
      '0x01000700',
    )
  })

  it('keeps a separate draft per receiver without leaking high bits', () => {
    render(<SignalWorkbench />)

    fireEvent.click(screen.getByRole('radio', { name: /Deepwave/ }))
    expect(screen.getAllByRole('button', { name: /^Beat/ })).toHaveLength(8)
    expect(screen.getByLabelText('Encoded game data')).toHaveTextContent(
      '0x01025500',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Beat 8: Rest' }))
    expect(screen.getByLabelText('Encoded game data')).toHaveTextContent(
      '0x0102d500',
    )

    fireEvent.click(screen.getByRole('radio', { name: /Pulse/ }))
    expect(screen.getByLabelText('Encoded game data')).toHaveTextContent(
      '0x01000500',
    )

    fireEvent.click(screen.getByRole('radio', { name: /Deepwave/ }))
    expect(screen.getByLabelText('Encoded game data')).toHaveTextContent(
      '0x0102d500',
    )
  })

  it('randomizes and resets only the selected receiver draft', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    render(<SignalWorkbench />)

    fireEvent.click(screen.getByRole('radio', { name: /Carrier/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Randomize' }))
    expect(screen.getByLabelText('Encoded game data')).toHaveTextContent(
      '0x01013f00',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.getByLabelText('Encoded game data')).toHaveTextContent(
      '0x01011500',
    )
  })

  it('defines disabled states for receiver and beat controls', () => {
    render(<SignalWorkbench disabled />)

    expect(screen.getByRole('radio', { name: /Pulse/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Beat 1: Tap' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Randomize' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Preview signal' }),
    ).toBeDisabled()
  })

  it('offers an accessible persistent mute control', () => {
    render(<SignalWorkbench />)

    const mute = screen.getByRole('button', { name: 'Mute sound' })
    expect(mute).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(mute)

    expect(
      screen.getByRole('button', { name: 'Enable sound' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(window.localStorage.getItem('signum.sound-muted.v1')).toBe('1')
  })

  it('plays Tap and Rest tones while advancing the live preview', () => {
    vi.useFakeTimers()
    const frequencies: number[] = []

    class AudioContextStub {
      state: AudioContextState = 'running'
      currentTime = 0
      destination = {}
      resume = vi.fn(async () => undefined)
      close = vi.fn(async () => undefined)

      createOscillator() {
        const frequency = { value: 0 }
        return {
          type: 'sine',
          frequency,
          connect: vi.fn(),
          start: () => frequencies.push(frequency.value),
          stop: vi.fn(),
        }
      }

      createGain() {
        return {
          gain: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        }
      }
    }

    vi.stubGlobal('AudioContext', AudioContextStub)
    render(<SignalWorkbench />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview signal' }))

    act(() => vi.advanceTimersByTime(0))
    expect(frequencies).toEqual([98, 620])
    expect(screen.getByRole('button', { name: 'Beat 1: Tap' })).toHaveClass(
      'beat-cell--playing',
    )

    act(() => vi.advanceTimersByTime(210))
    expect(frequencies).toEqual([98, 620, 240])
    expect(screen.getByRole('button', { name: 'Beat 2: Rest' })).toHaveClass(
      'beat-cell--playing',
    )

    act(() => vi.runAllTimers())
    expect(screen.getByRole('button', { name: 'Preview signal' })).toBeEnabled()
  })
})

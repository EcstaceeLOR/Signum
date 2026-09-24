import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  HostSnapshotV1,
  RandomnessVerificationV1,
} from '@chain/casino-sdk/guest'

import { ReceiverMode } from '../game/encoding'
import type { SignumSessionState } from '../game/sessionMachine'
import { FairnessPanel } from './FairnessPanel'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('FairnessPanel', () => {
  it('discloses the selected receiver rules before a wager', () => {
    render(
      <FairnessPanel
        mode={ReceiverMode.Pulse}
        experience="demo"
        snapshot={null}
        session={{ status: 'READY' }}
      />,
    )

    openPanel()

    expect(
      screen.getByRole('heading', { name: 'Pulse paytable' }),
    ).toBeInTheDocument()
    expect(screen.getByText('96.25%')).toBeInTheDocument()
    expect(screen.getByText('1 in 16')).toBeInTheDocument()
    expect(
      screen.getByRole('row', { name: '4/4 1/16 7.40×' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/round down/)).toHaveTextContent(
      'floor(wager × payout basis points ÷ 10,000)',
    )
    expect(screen.getByLabelText('Demo fairness')).toHaveTextContent(
      'no transaction, Chain VRF proof, or on-chain settlement',
    )
    expect(screen.queryByText(/VRF proof verified/)).not.toBeInTheDocument()
  })

  it('reconstructs a settled round and verifies its VRF artifacts on demand', async () => {
    const getRandomnessVerification = vi.fn(
      async (): Promise<RandomnessVerificationV1> => ({
        supported: true,
        chainId: 8453,
        routerAddress: '0x00000000000000000000000000000000000000aa',
        requests: [
          {
            nonce: '1',
            requestId: '0xrequest',
            randomness: '0x05',
            fulfilled: true,
            transactionHash: '0xfulfill',
            valid: true,
          },
        ],
      }),
    )

    render(
      <FairnessPanel
        mode={ReceiverMode.Pulse}
        experience="chain"
        snapshot={settledSnapshot()}
        session={settledState()}
        getRandomnessVerification={getRandomnessVerification}
      />,
    )

    openPanel()

    await waitFor(() =>
      expect(getRandomnessVerification).toHaveBeenCalledWith({
        sessionId: '7',
      }),
    )
    expect(getRandomnessVerification).toHaveBeenCalledTimes(1)
    expect(screen.getByText('VRF proof verified')).toBeInTheDocument()
    expect(screen.getByText(/3 of 4 beats match/)).toHaveTextContent(
      'floor(100 × 14000 ÷ 10,000) = 140 base units',
    )
    expect(screen.getByText('1010 (beat 1 first)')).toBeInTheDocument()
    expect(screen.getByText('1110 (beat 1 first)')).toBeInTheDocument()
    expect(
      screen.getByText('0x0000000000000000000000000000000000000001'),
    ).toBeInTheDocument()

    const explorerLinks = screen.getAllByRole('link')
    expect(explorerLinks).toHaveLength(4)
    expect(explorerLinks[0]).toHaveAttribute(
      'href',
      'https://basescan.org/address/0x0000000000000000000000000000000000000001',
    )
    expect(explorerLinks[1]).toHaveAttribute(
      'href',
      'https://basescan.org/tx/0xopen',
    )
    expect(explorerLinks[2]).toHaveAttribute(
      'href',
      'https://basescan.org/tx/0xfulfill',
    )
    expect(explorerLinks[3]).toHaveAttribute(
      'href',
      'https://basescan.org/tx/0xsettle',
    )
  })

  it('does not describe an unavailable verification as invalid', async () => {
    const getRandomnessVerification = vi.fn(async () => ({
      supported: false,
      chainId: 31337,
      requests: [],
    }))
    render(
      <FairnessPanel
        mode={ReceiverMode.Pulse}
        experience="chain"
        snapshot={settledSnapshot(31337)}
        session={settledState()}
        getRandomnessVerification={getRandomnessVerification}
      />,
    )

    openPanel()

    expect(
      await screen.findByText(
        'Cryptographic verification is not available on this network.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/verification failed/i)).not.toBeInTheDocument()
  })
})

function openPanel() {
  const summary = screen.getByText('See the fixed rules behind every echo')
  const details = summary.closest('details')
  if (!details) throw new Error('Fairness details element was not rendered')
  details.open = true
  fireEvent(details, new Event('toggle'))
}

function settledState(): SignumSessionState {
  return {
    status: 'SETTLED',
    wager: '100',
    gameData: '0x01000500',
    startedAt: 1,
    sessionKey: '8453:7',
    transactionHash: '0xopen',
    sessionId: '7',
    openedAt: 2,
    outcome: {
      mode: ReceiverMode.Pulse,
      signalLength: 4,
      playerSignal: 5,
      ghostSignal: 7,
      matchCount: 3,
      payoutTier: 2,
      payoutBps: 14_000,
      payout: 140n,
      gameState: '0x010005070302',
    },
  }
}

function settledSnapshot(chainId = 8453): HostSnapshotV1 {
  return {
    apiVersion: 1,
    integration: {
      chainId,
      slug: 'signum',
      gameAddress: '0x0000000000000000000000000000000000000001',
      manifest: {
        schemaVersion: 1,
        gameId: 'signum',
        apiVersion: 1,
        defaultLocale: 'en',
        locales: { en: { name: 'Signum' } },
      },
    },
    wallet: { status: 'ready' },
    token: { symbol: 'chUSD', decimals: 18 },
    balances: {},
    sessions: {
      items: [
        {
          sessionId: '7',
          sessionKey: '8453:7',
          gameAddress: '0x0000000000000000000000000000000000000001',
          wager: '100',
          payout: '140',
          isSettled: true,
          lastEventTimestamp: 3,
          raw: {
            gameData: '0x01000500',
            gameState: '0x010005070302',
            openTransactionHash: '0xopen',
            settleTransactionHash: '0xsettle',
            randomnessRequests: [
              {
                nonce: '1',
                requestId: '0xrequest',
                randomness: '0x05',
                fulfilled: true,
                transactionHash: '0xfulfill',
              },
            ],
          },
        },
      ],
    },
    ui: { locale: 'en', theme: 'dark' },
  }
}

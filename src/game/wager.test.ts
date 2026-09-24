import { describe, expect, it } from 'vitest'

import type { HostSnapshotV1 } from '@chain/casino-sdk/guest'

import { ReceiverMode } from './encoding'
import { receiverDefinition } from './receivers'
import { formatTokenAmount, validateWagerInput, wagerContext } from './wager'

describe('wagerContext', () => {
  it('uses host token metadata, balance, and receiver-specific live limits', () => {
    const context = wagerContext(
      snapshot({
        balance: '250000000',
        decimals: 6,
        symbol: 'USDC',
        maxBetAmount: '10000000',
      }),
      receiverDefinition(ReceiverMode.Deepwave),
    )

    expect(context).toEqual({
      kind: 'ready',
      symbol: 'USDC',
      decimals: 6,
      balance: 250000000n,
      minimum: 1000000n,
      maximum: 10000000n,
    })
  })

  it('recalculates the risk-bound maximum for each receiver multiplier', () => {
    const liveSnapshot = snapshot({
      balance: '250000000',
      decimals: 6,
      symbol: 'USDC',
      casino: {
        maxBetAmount: '0',
        maxAllowedReservedProfit: '64000000',
      },
    })

    expect(
      wagerContext(liveSnapshot, receiverDefinition(ReceiverMode.Pulse)),
    ).toMatchObject({ kind: 'ready', maximum: 10000000n })
    expect(
      wagerContext(liveSnapshot, receiverDefinition(ReceiverMode.Deepwave)),
    ).toMatchObject({ kind: 'ready', maximum: 1641025n })
  })

  it('refuses to guess missing token or risk-limit data', () => {
    const missingToken = snapshot({ symbol: undefined })
    expect(
      wagerContext(missingToken, receiverDefinition(ReceiverMode.Pulse)),
    ).toMatchObject({
      kind: 'unavailable',
      reason: expect.stringContaining('token'),
    })

    const missingLimit = snapshot({ casino: undefined })
    expect(
      wagerContext(missingLimit, receiverDefinition(ReceiverMode.Pulse)),
    ).toMatchObject({
      kind: 'unavailable',
      reason: expect.stringContaining('safe wager limit'),
    })

    const impossiblePrecision = snapshot({ decimals: 78 })
    expect(
      wagerContext(impossiblePrecision, receiverDefinition(ReceiverMode.Pulse)),
    ).toMatchObject({
      kind: 'unavailable',
      reason: expect.stringContaining('token'),
    })

    const oversizedBalance = snapshot({ balance: (2n ** 256n).toString() })
    expect(
      wagerContext(oversizedBalance, receiverDefinition(ReceiverMode.Pulse)),
    ).toMatchObject({
      kind: 'unavailable',
      reason: expect.stringContaining('balance'),
    })
  })
})

describe('validateWagerInput', () => {
  const context = wagerContext(
    snapshot({
      balance: '5000000',
      decimals: 6,
      symbol: 'USDC',
      maxBetAmount: '10000000',
    }),
    receiverDefinition(ReceiverMode.Pulse),
  )

  it('parses valid decimal input into token base units', () => {
    expect(validateWagerInput('2.5', context)).toEqual({
      ok: true,
      amount: 2500000n,
    })
  })

  it('accepts exact minimum and live maximum boundaries', () => {
    expect(validateWagerInput('1', context)).toEqual({
      ok: true,
      amount: 1_000_000n,
    })

    const fundedMaximum = wagerContext(
      snapshot({
        balance: '10000000',
        decimals: 6,
        symbol: 'USDC',
        maxBetAmount: '10000000',
      }),
      receiverDefinition(ReceiverMode.Pulse),
    )
    expect(validateWagerInput('10', fundedMaximum)).toEqual({
      ok: true,
      amount: 10_000_000n,
    })
  })

  it('rejects malformed, below-minimum, above-limit, and unfunded wagers', () => {
    expect(validateWagerInput('1.0000001', context)).toMatchObject({
      ok: false,
    })
    expect(validateWagerInput('0.5', context)).toMatchObject({
      ok: false,
      message: 'Wager must be at least 1 USDC.',
    })
    expect(validateWagerInput('11', context)).toMatchObject({
      ok: false,
      message: 'Wager must be no more than 10 USDC for this receiver.',
    })
    expect(validateWagerInput('6', context)).toEqual({
      ok: false,
      message: 'Your balance is below this wager.',
    })
    expect(validateWagerInput('9'.repeat(257), context)).toMatchObject({
      ok: false,
    })
    expect(validateWagerInput((2n ** 256n).toString(), context)).toMatchObject({
      ok: false,
    })
  })

  it.each([
    '0x10',
    '1e3',
    '+1',
    '-1',
    'NaN',
    'Infinity',
    '1,000',
    '1_000',
    '1\u00002',
  ])('rejects adversarial numeric input %j', (input) => {
    expect(validateWagerInput(input, context)).toMatchObject({ ok: false })
  })

  it('formats host base units without substituting token precision', () => {
    expect(formatTokenAmount(1234567n, 6)).toBe('1.234567')
  })
})

type SnapshotOptions = {
  balance?: string
  decimals?: number
  symbol?: string
  maxBetAmount?: string
  casino?: HostSnapshotV1['casino']
}

function snapshot(options: SnapshotOptions = {}): HostSnapshotV1 {
  const casino =
    'casino' in options
      ? options.casino
      : {
          maxBetAmount: options.maxBetAmount ?? '100000000000000000000',
          maxAllowedReservedProfit: '1000000000000000000000000',
        }

  return {
    apiVersion: 1,
    integration: {
      chainId: 31337,
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
    token: {
      symbol: 'symbol' in options ? options.symbol : 'chUSD',
      decimals: options.decimals ?? 18,
    },
    balances: {
      smartVaultBalance: options.balance ?? '1000000000000000000000000000000',
    },
    casino,
    sessions: { items: [] },
    ui: { locale: 'en', theme: 'dark' },
  }
}

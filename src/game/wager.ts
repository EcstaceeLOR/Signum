import { computeMaxWager, type HostSnapshotV1 } from '@chain/casino-sdk/guest'
import { formatUnits, parseUnits } from 'viem'

import type { ReceiverDefinition } from './receivers'

const DECIMAL_AMOUNT = /^(?:\d+\.?\d*|\.\d+)$/

export type WagerContext =
  | {
      kind: 'ready'
      symbol: string
      decimals: number
      balance: bigint
      minimum: bigint
      maximum: bigint
    }
  | {
      kind: 'unavailable'
      reason: string
    }

export type WagerValidation =
  { ok: true; amount: bigint } | { ok: false; message: string }

export function wagerContext(
  snapshot: HostSnapshotV1 | null | undefined,
  receiver: Pick<ReceiverDefinition, 'maximumPayoutX'>,
): WagerContext {
  if (!snapshot) {
    return unavailable('Waiting for the latest Chain account snapshot.')
  }

  const symbol = snapshot.token.symbol?.trim()
  const decimals = snapshot.token.decimals
  if (
    !symbol ||
    decimals === undefined ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 255
  ) {
    return unavailable(
      'Chain did not provide complete token details. Wagering is disabled.',
    )
  }

  const balance = parseBaseUnits(snapshot.balances.smartVaultBalance)
  if (balance === undefined) {
    return unavailable(
      'Chain did not provide a valid Smart Vault balance. Wagering is disabled.',
    )
  }

  const minimum = 10n ** BigInt(decimals)
  const platformLimit = computeMaxWager(snapshot, {
    maxMultiplierX: receiver.maximumPayoutX,
  })
  if (platformLimit.kind === 'unknown') {
    return unavailable(
      'Chain did not provide a safe wager limit for this receiver. Try again after the host refreshes.',
    )
  }

  const maximum =
    platformLimit.kind === 'limit' ? platformLimit.maxWager : balance
  if (maximum < minimum) {
    return unavailable(
      `No wager is currently available for this receiver. The minimum is ${formatTokenAmount(minimum, decimals)} ${symbol}.`,
    )
  }

  return {
    kind: 'ready',
    symbol,
    decimals,
    balance,
    minimum,
    maximum,
  }
}

export function validateWagerInput(
  input: string,
  context: WagerContext,
): WagerValidation {
  if (context.kind === 'unavailable') {
    return { ok: false, message: context.reason }
  }

  const value = input.trim()
  if (!value) return { ok: false, message: 'Enter a wager.' }

  const fractionLength = value.split('.')[1]?.length ?? 0
  if (!DECIMAL_AMOUNT.test(value) || fractionLength > context.decimals) {
    return invalidAmount(context)
  }

  let amount: bigint
  try {
    amount = parseUnits(value, context.decimals)
  } catch {
    return invalidAmount(context)
  }

  if (amount < context.minimum) {
    return {
      ok: false,
      message: `Wager must be at least ${formatTokenAmount(context.minimum, context.decimals)} ${context.symbol}.`,
    }
  }
  if (amount > context.maximum) {
    return {
      ok: false,
      message: `Wager must be no more than ${formatTokenAmount(context.maximum, context.decimals)} ${context.symbol} for this receiver.`,
    }
  }
  if (amount > context.balance) {
    return { ok: false, message: 'Your balance is below this wager.' }
  }

  return { ok: true, amount }
}

export function formatTokenAmount(amount: bigint, decimals: number): string {
  return formatUnits(amount, decimals)
}

function parseBaseUnits(value: string | undefined): bigint | undefined {
  if (value === undefined) return undefined
  try {
    const amount = BigInt(value)
    return amount >= 0n ? amount : undefined
  } catch {
    return undefined
  }
}

function unavailable(reason: string): WagerContext {
  return { kind: 'unavailable', reason }
}

function invalidAmount(
  context: Extract<WagerContext, { kind: 'ready' }>,
): WagerValidation {
  return {
    ok: false,
    message: `Enter a valid ${context.symbol} amount with up to ${context.decimals} decimal places.`,
  }
}

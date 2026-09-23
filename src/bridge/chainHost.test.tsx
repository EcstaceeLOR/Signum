import { StrictMode, type PropsWithChildren } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  GuestApiV1,
  GuestBridgeConnection,
  HostApiV1,
  HostSnapshotV1,
} from '@chain/casino-sdk/guest'

import { createChainHostBridge, type ChainHostConnector } from './chainHost'
import { useChainHost } from './useChainHost'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Chain host bridge', () => {
  it('stores host snapshots and delegates typed host actions', async () => {
    const fixture = bridgeFixture()
    const snapshot = hostSnapshot('ready')

    await fixture.methods.setState(snapshot)
    fixture.host.resolve(fixture.api)
    await fixture.host.promise

    expect(fixture.bridge.getState()).toEqual({
      status: 'connected',
      snapshot,
      error: null,
      canPlay: true,
    })

    await fixture.bridge.openSession({ wager: '1000', gameData: '0x01000000' })
    await fixture.bridge.cancelStuckRandomness({ sessionId: '7' })
    await fixture.bridge.revealOutcome({ sessionId: '7' })
    await fixture.bridge.reportContentSize({ minHeight: 720 })

    expect(fixture.api.openSession).toHaveBeenCalledWith({
      wager: '1000',
      gameData: '0x01000000',
    })
    expect(fixture.api.cancelStuckRandomness).toHaveBeenCalledWith({
      sessionId: '7',
    })
    expect(fixture.api.revealOutcome).toHaveBeenCalledWith({ sessionId: '7' })
    expect(fixture.api.reportContentSize).toHaveBeenCalledWith({
      minHeight: 720,
    })
  })

  it('does not permit signed actions until the host wallet is ready', async () => {
    const fixture = bridgeFixture()
    fixture.host.resolve(fixture.api)
    await fixture.host.promise
    await fixture.methods.setState(hostSnapshot('disconnected'))

    expect(fixture.bridge.getState().canPlay).toBe(false)
    await expect(
      fixture.bridge.openSession({ wager: '1000', gameData: '0x01000000' }),
    ).rejects.toThrow('wallet is not ready')
    await expect(
      fixture.bridge.cancelStuckRandomness({ sessionId: '7' }),
    ).rejects.toThrow('wallet is not ready')
    expect(fixture.api.openSession).not.toHaveBeenCalled()
    expect(fixture.api.cancelStuckRandomness).not.toHaveBeenCalled()

    await fixture.bridge.revealOutcome({ sessionId: '7' })
    expect(fixture.api.revealOutcome).toHaveBeenCalledOnce()
  })

  it('surfaces action failures and reconnects on retry', async () => {
    const first = deferredHost()
    const second = deferredHost()
    const firstDestroy = vi.fn()
    const secondDestroy = vi.fn()
    let methods: GuestApiV1 | undefined
    const connector = vi
      .fn<ChainHostConnector>()
      .mockImplementationOnce((guestMethods) => {
        methods = guestMethods
        return connection(first.promise, firstDestroy)
      })
      .mockImplementationOnce((guestMethods) => {
        methods = guestMethods
        return connection(second.promise, secondDestroy)
      })
    const failingApi = hostApi()
    vi.mocked(failingApi.openSession).mockRejectedValueOnce(
      new Error('Host rejected the request.'),
    )
    const bridge = createChainHostBridge(connector)

    first.resolve(failingApi)
    await first.promise
    await methods?.setState(hostSnapshot('ready'))
    await expect(
      bridge.openSession({ wager: '1000', gameData: '0x01000000' }),
    ).rejects.toThrow('Host rejected the request.')
    expect(bridge.getState().error).toContain('Opening the session failed')

    bridge.retry()
    expect(firstDestroy).toHaveBeenCalledOnce()
    expect(bridge.getState().status).toBe('connecting')
    expect(connector).toHaveBeenCalledTimes(2)

    second.resolve(hostApi())
    await second.promise
    expect(bridge.getState().status).toBe('connected')
    expect(bridge.getState().error).toBeNull()

    bridge.destroy()
    expect(secondDestroy).toHaveBeenCalledOnce()
  })

  it('turns an unresponsive embedded parent into a recoverable error', () => {
    vi.useFakeTimers()
    const pending = deferredHost()
    const destroy = vi.fn()
    const bridge = createChainHostBridge(() =>
      connection(pending.promise, destroy),
    )

    act(() => vi.advanceTimersByTime(12_000))

    expect(bridge.getState()).toMatchObject({
      status: 'error',
      canPlay: false,
    })
    expect(bridge.getState().error).toContain('did not respond in time')
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('shares the StrictMode connection and destroys it after final unmount', () => {
    vi.useFakeTimers()
    const pending = deferredHost()
    const destroy = vi.fn()
    const connector = vi.fn<ChainHostConnector>(() =>
      connection(pending.promise, destroy),
    )
    const wrapper = ({ children }: PropsWithChildren) => (
      <StrictMode>{children}</StrictMode>
    )

    const rendered = renderHook(() => useChainHost(true, connector), {
      wrapper,
    })
    expect(connector).toHaveBeenCalledTimes(1)

    rendered.unmount()
    act(() => vi.runAllTimers())
    expect(destroy).toHaveBeenCalledTimes(1)
  })
})

function bridgeFixture() {
  const host = deferredHost()
  const destroy = vi.fn()
  let methods: GuestApiV1 | undefined
  const connector: ChainHostConnector = (guestMethods) => {
    methods = guestMethods
    return connection(host.promise, destroy)
  }
  const bridge = createChainHostBridge(connector)

  if (!methods) throw new Error('Guest methods were not registered.')
  return { api: hostApi(), bridge, destroy, host, methods }
}

function connection(
  promise: Promise<HostApiV1>,
  destroy: () => void,
): GuestBridgeConnection {
  return { promise, destroy } as GuestBridgeConnection
}

function deferredHost() {
  let resolve!: (api: HostApiV1) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<HostApiV1>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function hostApi(): HostApiV1 {
  return {
    reportContentSize: vi.fn(async () => undefined),
    openSession: vi.fn(async () => ({
      sessionKey: 'session-1',
      transactionHash: '0x01' as const,
    })),
    submitAction: vi.fn(async () => ({ transactionHash: '0x02' as const })),
    cancelStuckRandomness: vi.fn(async () => ({
      transactionHash: '0x03' as const,
    })),
    revealOutcome: vi.fn(async () => undefined),
  }
}

function hostSnapshot(
  walletStatus: HostSnapshotV1['wallet']['status'],
): HostSnapshotV1 {
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
    wallet: { status: walletStatus },
    token: { symbol: 'chUSD', decimals: 18 },
    balances: { smartVaultBalance: '1000000000000000000' },
    sessions: { items: [] },
    ui: { locale: 'en', theme: 'dark' },
  }
}

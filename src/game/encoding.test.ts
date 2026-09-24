import { describe, expect, it } from 'vitest'

import fixtures from '../../fixtures/game-data-v1.json'
import {
  decodeGameData,
  encodeGameData,
  GameDataError,
  type GameDataErrorCode,
  ReceiverMode,
  receiverSignalLength,
  signalBitsToMask,
  signalMaskToBits,
  type SignalBeat,
} from './encoding'

describe('Signum v1 game-data encoding', () => {
  it.each(fixtures.valid)('matches the $name golden vector', (fixture) => {
    const decoded = decodeGameData(fixture.payload as `0x${string}`)

    expect(decoded).toEqual({
      version: 1,
      mode: fixture.mode,
      signalLength: fixture.signalLength,
      playerSignal: fixture.playerSignal,
      flags: 0,
    })
    expect(
      encodeGameData({
        mode: fixture.mode as ReceiverMode,
        playerSignal: fixture.playerSignal,
      }),
    ).toBe(fixture.payload)
    expect(
      signalMaskToBits(decoded.playerSignal, decoded.signalLength),
    ).toEqual(fixture.bits)
    expect(signalBitsToMask(fixture.bits as SignalBeat[])).toBe(
      fixture.playerSignal,
    )
  })

  it.each([
    [ReceiverMode.Pulse, 4],
    [ReceiverMode.Carrier, 6],
    [ReceiverMode.Deepwave, 8],
  ] as const)(
    'round-trips every valid signal for mode %i',
    (mode, signalLength) => {
      expect(receiverSignalLength(mode)).toBe(signalLength)

      for (
        let playerSignal = 0;
        playerSignal < 2 ** signalLength;
        playerSignal++
      ) {
        const encoded = encodeGameData({ mode, playerSignal })
        const decoded = decodeGameData(encoded)

        expect(decoded).toEqual({
          version: 1,
          mode,
          signalLength,
          playerSignal,
          flags: 0,
        })
        expect(
          signalBitsToMask(signalMaskToBits(playerSignal, signalLength)),
        ).toBe(playerSignal)
      }
    },
  )

  it.each(fixtures.invalid)('rejects $name', (fixture) => {
    expectErrorCode(
      () => decodeGameData(fixture.payload as `0x${string}`),
      fixture.error as GameDataErrorCode,
    )
  })

  it('rejects every unsupported version byte and oversized calldata', () => {
    for (let version = 0; version <= 255; version++) {
      if (version === 1) continue
      expectErrorCode(
        () =>
          decodeGameData(`0x${version.toString(16).padStart(2, '0')}000000`),
        'UNSUPPORTED_VERSION',
      )
    }

    expectErrorCode(
      () => decodeGameData(`0x${'a5'.repeat(4_096)}`),
      'INVALID_LENGTH',
    )
  })

  it.each(['01000000', '0x1', '0x01000g00'])(
    'rejects malformed hex %s',
    (value) => {
      expectErrorCode(
        () => decodeGameData(value as `0x${string}`),
        'INVALID_HEX',
      )
    },
  )

  it.each([
    [ReceiverMode.Pulse, 16],
    [ReceiverMode.Carrier, 64],
    [ReceiverMode.Deepwave, 256],
    [ReceiverMode.Pulse, -1],
    [ReceiverMode.Pulse, 1.5],
  ] as const)('rejects signal %s for mode %s', (mode, playerSignal) => {
    expectErrorCode(
      () => encodeGameData({ mode, playerSignal }),
      'SIGNAL_OUT_OF_RANGE',
    )
  })

  it('rejects unknown modes and malformed beat arrays', () => {
    expectErrorCode(() => receiverSignalLength(3), 'UNSUPPORTED_MODE')
    expectErrorCode(
      () => signalBitsToMask([0, 1, 0] as SignalBeat[]),
      'INVALID_SIGNAL_BEATS',
    )
    expectErrorCode(
      () => signalBitsToMask([0, 1, 2, 0] as SignalBeat[]),
      'INVALID_SIGNAL_BEATS',
    )
  })
})

function expectErrorCode(action: () => unknown, code: GameDataErrorCode): void {
  try {
    action()
  } catch (error) {
    expect(error).toBeInstanceOf(GameDataError)
    expect((error as GameDataError).code).toBe(code)
    return
  }

  throw new Error(`Expected game-data error ${code}.`)
}

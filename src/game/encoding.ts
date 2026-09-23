export const GAME_DATA_VERSION = 1 as const
export const GAME_DATA_BYTE_LENGTH = 4 as const

export const ReceiverMode = {
  Pulse: 0,
  Carrier: 1,
  Deepwave: 2,
} as const

export type ReceiverMode = (typeof ReceiverMode)[keyof typeof ReceiverMode]
export type SignalLength = 4 | 6 | 8
export type SignalBeat = 0 | 1
export type GameDataHex = `0x${string}`

export type DecodedGameData = {
  version: typeof GAME_DATA_VERSION
  mode: ReceiverMode
  signalLength: SignalLength
  playerSignal: number
  flags: 0
}

export type GameDataErrorCode =
  | 'INVALID_HEX'
  | 'INVALID_LENGTH'
  | 'UNSUPPORTED_VERSION'
  | 'UNSUPPORTED_MODE'
  | 'NON_ZERO_FLAGS'
  | 'SIGNAL_OUT_OF_RANGE'
  | 'INVALID_SIGNAL_BEATS'

export class GameDataError extends Error {
  readonly code: GameDataErrorCode

  constructor(code: GameDataErrorCode, message: string) {
    super(message)
    this.name = 'GameDataError'
    this.code = code
  }
}

export function receiverSignalLength(mode: number): SignalLength {
  switch (mode) {
    case ReceiverMode.Pulse:
      return 4
    case ReceiverMode.Carrier:
      return 6
    case ReceiverMode.Deepwave:
      return 8
    default:
      throw new GameDataError(
        'UNSUPPORTED_MODE',
        `Unsupported receiver mode: ${mode}.`,
      )
  }
}

export function encodeGameData(input: {
  mode: ReceiverMode
  playerSignal: number
}): GameDataHex {
  const signalLength = receiverSignalLength(input.mode)
  validatePlayerSignal(input.playerSignal, signalLength)

  return bytesToHex(
    Uint8Array.of(GAME_DATA_VERSION, input.mode, input.playerSignal, 0),
  )
}

export function decodeGameData(
  gameData: GameDataHex | Uint8Array,
): DecodedGameData {
  const bytes =
    typeof gameData === 'string' ? hexToBytes(gameData) : gameData.slice()

  if (bytes.length !== GAME_DATA_BYTE_LENGTH) {
    throw new GameDataError(
      'INVALID_LENGTH',
      `Signum game data must be exactly ${GAME_DATA_BYTE_LENGTH} bytes; received ${bytes.length}.`,
    )
  }

  const [version, mode, playerSignal, flags] = bytes

  if (version !== GAME_DATA_VERSION) {
    throw new GameDataError(
      'UNSUPPORTED_VERSION',
      `Unsupported Signum game-data version: ${version}.`,
    )
  }

  const signalLength = receiverSignalLength(mode)

  if (flags !== 0) {
    throw new GameDataError(
      'NON_ZERO_FLAGS',
      `Signum v1 flags must be zero; received ${flags}.`,
    )
  }

  validatePlayerSignal(playerSignal, signalLength)

  return {
    version,
    mode: mode as ReceiverMode,
    signalLength,
    playerSignal,
    flags,
  }
}

export function signalBitsToMask(bits: readonly SignalBeat[]): number {
  assertSignalLength(bits.length)

  return bits.reduce<number>((mask, beat, index) => {
    if (beat !== 0 && beat !== 1) {
      throw new GameDataError(
        'INVALID_SIGNAL_BEATS',
        `Beat ${index} must be 0 (Rest) or 1 (Tap).`,
      )
    }
    return mask | (beat << index)
  }, 0)
}

export function signalMaskToBits(
  playerSignal: number,
  signalLength: SignalLength,
): SignalBeat[] {
  validatePlayerSignal(playerSignal, signalLength)
  return Array.from(
    { length: signalLength },
    (_, index) => ((playerSignal >> index) & 1) as SignalBeat,
  )
}

function validatePlayerSignal(
  playerSignal: number,
  signalLength: SignalLength,
): void {
  if (
    !Number.isInteger(playerSignal) ||
    playerSignal < 0 ||
    playerSignal >= 2 ** signalLength
  ) {
    throw new GameDataError(
      'SIGNAL_OUT_OF_RANGE',
      `Signal ${playerSignal} does not fit the receiver's ${signalLength} beats.`,
    )
  }
}

function assertSignalLength(length: number): asserts length is SignalLength {
  if (length !== 4 && length !== 6 && length !== 8) {
    throw new GameDataError(
      'INVALID_SIGNAL_BEATS',
      `A Signum signal must contain 4, 6, or 8 beats; received ${length}.`,
    )
  }
}

function hexToBytes(value: string): Uint8Array {
  if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(value)) {
    throw new GameDataError(
      'INVALID_HEX',
      'Signum game data must be a 0x-prefixed, even-length hexadecimal string.',
    )
  }

  const pairs = value.slice(2).match(/.{2}/g) ?? []
  return Uint8Array.from(pairs, (pair) => Number.parseInt(pair, 16))
}

function bytesToHex(bytes: Uint8Array): GameDataHex {
  return `0x${Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')}`
}

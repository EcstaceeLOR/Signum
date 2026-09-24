import { ReceiverMode, type SignalBeat, type SignalLength } from './encoding'

export type ReceiverDefinition = {
  mode: ReceiverMode
  name: string
  signalLength: SignalLength
  volatility: 'Low' | 'Medium' | 'High'
  rtp: string
  maximumPayout: string
  maximumPayoutX: number
  maximumPayoutBps: number
  description: string
}

export const RECEIVERS: readonly ReceiverDefinition[] = [
  {
    mode: ReceiverMode.Pulse,
    name: 'Pulse',
    signalLength: 4,
    volatility: 'Low',
    rtp: '96.25%',
    maximumPayout: '7.40×',
    maximumPayoutX: 7.4,
    maximumPayoutBps: 74_000,
    description: 'Short transmissions with frequent partial returns.',
  },
  {
    mode: ReceiverMode.Carrier,
    name: 'Carrier',
    signalLength: 6,
    volatility: 'Medium',
    rtp: '96.09375%',
    maximumPayout: '21.50×',
    maximumPayoutX: 21.5,
    maximumPayoutBps: 215_000,
    description: 'A longer signal with a more concentrated top return.',
  },
  {
    mode: ReceiverMode.Deepwave,
    name: 'Deepwave',
    signalLength: 8,
    volatility: 'High',
    rtp: '96.09375%',
    maximumPayout: '40.00×',
    maximumPayoutX: 40,
    maximumPayoutBps: 400_000,
    description: 'The deepest listen and Signum’s rarest perfect echo.',
  },
]

export function receiverDefinition(mode: ReceiverMode): ReceiverDefinition {
  switch (mode) {
    case ReceiverMode.Pulse:
      return RECEIVERS[0]
    case ReceiverMode.Carrier:
      return RECEIVERS[1]
    case ReceiverMode.Deepwave:
      return RECEIVERS[2]
  }
}

export function defaultSignal(signalLength: SignalLength): SignalBeat[] {
  return Array.from(
    { length: signalLength },
    (_, index) => (index % 2 === 0 ? 1 : 0) as SignalBeat,
  )
}

export function randomSignal(
  signalLength: SignalLength,
  random: () => number = Math.random,
): SignalBeat[] {
  return Array.from(
    { length: signalLength },
    () => (random() >= 0.5 ? 1 : 0) as SignalBeat,
  )
}

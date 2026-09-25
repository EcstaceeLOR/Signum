import { ReceiverMode } from './encoding'
import { receiverSlug, type ReceiverSlug } from './receivers'
import {
  readPersistent,
  writePersistent,
  type PersistentSchema,
} from '../state/persistence'

export type PlaySetup = {
  receiver: ReceiverSlug
  wager: string
  experience: 'chain' | 'demo'
}

export const playSetupSchema: PersistentSchema<PlaySetup> = {
  key: 'signum.play-setup',
  version: 2,
  fallback: () => ({
    receiver: receiverSlug(ReceiverMode.Pulse),
    wager: '1',
    experience: 'demo',
  }),
  validate: isPlaySetup,
}

export function readPlaySetup(): PlaySetup {
  return readPersistent(playSetupSchema)
}

export function savePlaySetup(setup: PlaySetup): boolean {
  return writePersistent(playSetupSchema, setup)
}

function isPlaySetup(value: unknown): value is PlaySetup {
  if (!value || typeof value !== 'object') return false
  const setup = value as Partial<PlaySetup>
  return (
    (setup.receiver === 'pulse' ||
      setup.receiver === 'carrier' ||
      setup.receiver === 'deepwave') &&
    typeof setup.wager === 'string' &&
    setup.wager.length <= 256 &&
    (setup.experience === 'chain' || setup.experience === 'demo')
  )
}

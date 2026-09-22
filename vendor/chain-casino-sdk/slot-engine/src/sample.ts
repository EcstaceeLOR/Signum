import { type Hex, hexToBigInt } from 'viem';
import type { PackedTier } from './compile.ts';

export type SampleableConfiguration = {
  missWeight: bigint;
  tiers: PackedTier[];
  stats: { totalWeight: bigint };
};

/** Mirrors SlotEngine sampling: the prize a session's randomness selects. */
export function samplePrizeUnits(configuration: SampleableConfiguration, randomness: Hex): bigint {
  const roll = hexToBigInt(randomness) % configuration.stats.totalWeight;
  if (roll < configuration.missWeight) return 0n;
  const target = roll - configuration.missWeight;
  let low = 0;
  let high = configuration.tiers.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (configuration.tiers[middle].cumulativeWeight > target) high = middle;
    else low = middle + 1;
  }
  return configuration.tiers[low].prizeUnits;
}

import { concat, type Hex, hexToBigInt, keccak256, stringToHex } from 'viem';
import type { CompiledConfiguration } from './compile.ts';

const DISPLAY_SEED_DOMAIN = stringToHex('slot-engine/display-seed');

/** Seeds per prize, keyed by prize units of the bet configuration's prize denominator. */
export type DisplayMappingFile = { prizeDenominator: number; seeds: Record<string, string[]> };

export type DisplayMapping = { prizeDenominator: bigint; seedsByPrizeUnits: Map<bigint, string[]> };

export type DisplayCoverage = { prizesWithoutSeeds: bigint[]; seedsWithoutPrize: bigint[] };

export function parseDisplayMapping(
  file: DisplayMappingFile,
  expectedPrizeDenominator?: bigint,
): DisplayMapping {
  const prizeDenominator = BigInt(file.prizeDenominator);
  if (expectedPrizeDenominator !== undefined && prizeDenominator !== expectedPrizeDenominator) {
    throw new Error(
      `Display mapping uses prize denominator ${prizeDenominator}, the bet configuration uses ${expectedPrizeDenominator}`,
    );
  }
  const seedsByPrizeUnits = new Map<bigint, string[]>();
  for (const [prize, seeds] of Object.entries(file.seeds)) {
    if (!/^\d+$/.test(prize)) {
      throw new Error(`Display mapping prize "${prize}" is not a whole number of prize units`);
    }
    if (!Array.isArray(seeds) || seeds.length === 0 || seeds.some(seed => seed === '')) {
      throw new Error(`Display mapping prize "${prize}" needs at least one non-empty seed`);
    }
    seedsByPrizeUnits.set(BigInt(prize), seeds);
  }
  return { prizeDenominator, seedsByPrizeUnits };
}

export function displaySeedCount(mapping: DisplayMapping, prizeUnits: bigint): number {
  return mapping.seedsByPrizeUnits.get(prizeUnits)?.length ?? 0;
}

/** Every client derives the same seed for a session: the choice depends only on its randomness. */
export function pickDisplaySeed(
  mapping: DisplayMapping,
  prizeUnits: bigint,
  randomness: Hex,
): string | undefined {
  const seeds = mapping.seedsByPrizeUnits.get(prizeUnits);
  if (seeds === undefined) return undefined;
  const index =
    hexToBigInt(keccak256(concat([randomness, DISPLAY_SEED_DOMAIN]))) % BigInt(seeds.length);
  return seeds[Number(index)];
}

export function checkDisplayCoverage(
  mapping: DisplayMapping,
  configuration: Pick<CompiledConfiguration, 'tiers' | 'missWeight'>,
): DisplayCoverage {
  const tablePrizes = new Set(configuration.tiers.map(tier => tier.prizeUnits));
  if (configuration.missWeight > 0n) tablePrizes.add(0n);
  return {
    prizesWithoutSeeds: [...tablePrizes].filter(units => !mapping.seedsByPrizeUnits.has(units)),
    seedsWithoutPrize: [...mapping.seedsByPrizeUnits.keys()].filter(
      units => !tablePrizes.has(units),
    ),
  };
}

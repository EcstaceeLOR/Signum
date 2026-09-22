import { type Hex, toHex } from 'viem';
import { greatestCommonDivisor, parsePrize, type Rational, type Tier } from './tier-list.ts';

export const TIER_BYTES = 8;
export const MAX_TIERS_PER_CHUNK = 3071;
const UINT32_MAX = 2n ** 32n - 1n;
const UINT64_MAX = 2n ** 64n - 1n;
const WAD = 10n ** 18n;

export type PackedTier = { prizeUnits: bigint; weight: bigint; cumulativeWeight: bigint };

export type ConfigurationStats = {
  totalWeight: bigint;
  topPrizeUnits: bigint;
  topPrizeWeight: bigint;
  prizeSum: bigint;
  bodyVarianceWad: bigint;
  rtpWad: bigint;
  rtp: Rational;
  hitRate: Rational;
};

export type CompiledConfiguration = {
  prizeDenominator: bigint;
  missWeight: bigint;
  tiers: PackedTier[];
  chunks: Hex[];
  stats: ConfigurationStats;
};

export type CompileOptions = { prizeDenominator?: bigint };

function leastCommonMultiple(a: bigint, b: bigint): bigint {
  return (a / greatestCommonDivisor(a, b)) * b;
}

function ceilDivide(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

function reduce(numerator: bigint, denominator: bigint): Rational {
  const divisor = greatestCommonDivisor(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

export function deriveStats(
  tiers: PackedTier[],
  missWeight: bigint,
  prizeDenominator: bigint,
): ConfigurationStats {
  const top = tiers[tiers.length - 1];
  const winningWeight = top.cumulativeWeight;
  const totalWeight = missWeight + winningWeight;
  let prizeSum = 0n;
  let squaredPrizeSum = 0n;
  for (const tier of tiers) {
    prizeSum += tier.prizeUnits * tier.weight;
    squaredPrizeSum += tier.prizeUnits * tier.prizeUnits * tier.weight;
  }
  const bodyPrizeSum = prizeSum - top.prizeUnits * top.weight;
  const bodySquaredPrizeSum = squaredPrizeSum - top.prizeUnits * top.prizeUnits * top.weight;
  const rtpDenominator = prizeDenominator * totalWeight;
  return {
    totalWeight,
    topPrizeUnits: top.prizeUnits,
    topPrizeWeight: top.weight,
    prizeSum,
    bodyVarianceWad: ceilDivide(
      (bodySquaredPrizeSum * totalWeight - bodyPrizeSum * bodyPrizeSum) * WAD,
      prizeDenominator * prizeDenominator * totalWeight * totalWeight,
    ),
    rtpWad: (prizeSum * WAD) / rtpDenominator,
    rtp: reduce(prizeSum, rtpDenominator),
    hitRate: reduce(winningWeight, totalWeight),
  };
}

export function packChunks(tiers: PackedTier[]): Hex[] {
  const chunks: Hex[] = [];
  for (let start = 0; start < tiers.length; start += MAX_TIERS_PER_CHUNK) {
    const slice = tiers.slice(start, start + MAX_TIERS_PER_CHUNK);
    const bytes = new Uint8Array(slice.length * TIER_BYTES);
    const view = new DataView(bytes.buffer);
    slice.forEach((tier, index) => {
      view.setUint32(index * TIER_BYTES, Number(tier.prizeUnits));
      view.setUint32(index * TIER_BYTES + 4, Number(tier.cumulativeWeight));
    });
    chunks.push(toHex(bytes));
  }
  return chunks;
}

export function compileConfiguration(
  tierList: Tier[],
  options: CompileOptions = {},
): CompiledConfiguration {
  const prizes = tierList.map(tier => ({ ...parsePrize(tier.prize), weight: tier.weight }));
  const prizeDenominator =
    options.prizeDenominator ??
    prizes.reduce((result, prize) => leastCommonMultiple(result, prize.denominator), 1n);
  if (prizeDenominator <= 0n || prizeDenominator > UINT32_MAX) {
    throw new Error(`Prize denominator ${prizeDenominator} does not fit 32 bits`);
  }

  const weightByUnits = new Map<bigint, bigint>();
  prizes.forEach((prize, index) => {
    if ((prize.numerator * prizeDenominator) % prize.denominator !== 0n) {
      throw new Error(
        `Prize ${tierList[index].prize} is not a multiple of 1/${prizeDenominator} of the wager`,
      );
    }
    const prizeUnits = (prize.numerator * prizeDenominator) / prize.denominator;
    weightByUnits.set(prizeUnits, (weightByUnits.get(prizeUnits) ?? 0n) + prize.weight);
  });

  const missWeight = weightByUnits.get(0n) ?? 0n;
  weightByUnits.delete(0n);
  if (missWeight > UINT64_MAX) throw new Error('Miss weight does not fit 64 bits');

  let cumulativeWeight = 0n;
  const tiers: PackedTier[] = [...weightByUnits.entries()]
    .filter(([, weight]) => weight > 0n)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([prizeUnits, weight]) => {
      cumulativeWeight += weight;
      return { prizeUnits, weight, cumulativeWeight };
    });
  if (tiers.length === 0) throw new Error('A settlement table needs at least one winning prize');
  if (tiers[tiers.length - 1].prizeUnits > UINT32_MAX) {
    throw new Error('Top prize does not fit 32 bits; lower the prize denominator');
  }
  if (cumulativeWeight > UINT32_MAX) {
    throw new Error('Winning weights sum past 32 bits; scale the weights down');
  }

  const stats = deriveStats(tiers, missWeight, prizeDenominator);
  if (stats.prizeSum >= prizeDenominator * stats.totalWeight) {
    throw new Error(
      `RTP is ${Number(stats.rtpWad) / 1e16}%, at or above 100%. ` +
        'Display-seed counts are not odds; supply real weights.',
    );
  }
  return { prizeDenominator, missWeight, tiers, chunks: packChunks(tiers), stats };
}

export function unpackChunk(chunk: Hex, previousCumulativeWeight: bigint): PackedTier[] {
  const bytes = Uint8Array.from(Buffer.from(chunk.slice(2), 'hex'));
  const view = new DataView(bytes.buffer);
  const tiers: PackedTier[] = [];
  let previous = previousCumulativeWeight;
  for (let offset = 0; offset < bytes.length; offset += TIER_BYTES) {
    const cumulativeWeight = BigInt(view.getUint32(offset + 4));
    tiers.push({
      prizeUnits: BigInt(view.getUint32(offset)),
      weight: cumulativeWeight - previous,
      cumulativeWeight,
    });
    previous = cumulativeWeight;
  }
  return tiers;
}

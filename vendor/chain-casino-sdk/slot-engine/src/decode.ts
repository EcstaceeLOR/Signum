import type { Address, Hex, PublicClient } from 'viem';
import { slotTitleAbi } from './abi.ts';
import { type ConfigurationStats, deriveStats, type PackedTier, unpackChunk } from './compile.ts';
import { formatPrize, type Tier } from './tier-list.ts';

export type OnChainStats = {
  totalWeight: bigint;
  topPrizeUnits: bigint;
  topPrizeWeight: bigint;
  prizeSum: bigint;
  bodyVarianceWad: bigint;
};

export type DecodedConfiguration = {
  prizeDenominator: bigint;
  missWeight: bigint;
  chunkPointers: Address[];
  tiers: PackedTier[];
  tierList: Tier[];
  quoted: OnChainStats;
  stats: ConfigurationStats;
};

export const STATS_KEYS = [
  'totalWeight',
  'topPrizeUnits',
  'topPrizeWeight',
  'prizeSum',
  'bodyVarianceWad',
] as const satisfies readonly (keyof OnChainStats)[];

/** Rebuilds each bet configuration from the chunk bytes, next to the figures the title quotes. */
export async function readTitle(
  client: PublicClient,
  title: Address,
): Promise<DecodedConfiguration[]> {
  const count = await client.readContract({
    address: title,
    abi: slotTitleAbi,
    functionName: 'betConfigurationCount',
  });
  const configurations: DecodedConfiguration[] = [];
  for (let index = 0; index < Number(count); index++) {
    const onChain = await client.readContract({
      address: title,
      abi: slotTitleAbi,
      functionName: 'betConfiguration',
      args: [index],
    });
    const tiers: PackedTier[] = [];
    for (const chunk of onChain.chunks) {
      const code = await client.getCode({ address: chunk.pointer });
      if (code === undefined || !code.startsWith('0x00')) {
        throw new Error(`Chunk ${chunk.pointer} holds no settlement table`);
      }
      const previous = tiers.length === 0 ? 0n : tiers[tiers.length - 1].cumulativeWeight;
      tiers.push(...unpackChunk(`0x${code.slice(4)}` as Hex, previous));
    }
    const prizeDenominator = BigInt(onChain.prizeDenominator);
    const tierList: Tier[] = tiers.map(tier => ({
      prize: formatPrize(tier.prizeUnits, prizeDenominator),
      weight: tier.weight,
    }));
    if (onChain.missWeight > 0n) tierList.unshift({ prize: '0', weight: onChain.missWeight });
    configurations.push({
      prizeDenominator,
      missWeight: onChain.missWeight,
      chunkPointers: onChain.chunks.map(chunk => chunk.pointer),
      tiers,
      tierList,
      quoted: {
        totalWeight: onChain.totalWeight,
        topPrizeUnits: BigInt(onChain.topPrizeUnits),
        topPrizeWeight: BigInt(onChain.topPrizeWeight),
        prizeSum: onChain.prizeSum,
        bodyVarianceWad: onChain.bodyVarianceWad,
      },
      stats: deriveStats(tiers, onChain.missWeight, prizeDenominator),
    });
  }
  return configurations;
}

export function statsMismatches(quoted: OnChainStats, derived: OnChainStats): string[] {
  return STATS_KEYS.filter(key => quoted[key] !== derived[key]).map(
    key => `${key}: title quotes ${quoted[key]}, table gives ${derived[key]}`,
  );
}

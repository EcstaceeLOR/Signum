import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import * as zlib from 'node:zlib';
import type { DisplayMappingFile } from './display.ts';
import { formatPrize, formatTierList, parsePrize, type Rational, type Tier } from './tier-list.ts';
import { compileTitleFile, type TitleDefinition } from './title.ts';

const UINT32_MAX = 2n ** 32n - 1n;
const WAD = 10n ** 18n;
/** Stake payout multipliers are hundredths of the base bet. */
const STAKE_PAYOUT_SCALE = 100n;
const BOOK_ID_PATTERN = /^\{\s*"id"\s*:\s*(\d+)/;

export type StakeIndex = {
  modes: Array<{ name: string; cost: number; events: string; weights: string }>;
};

export type StakeLookupRow = { id: string; weight: bigint; payoutMultiplier: bigint };

export type StakeModeConversion = {
  tierList: Tier[];
  bookIdsByPrize: Map<string, string[]>;
  sourceRtpWad: bigint;
  rescaled: boolean;
};

export type ImportedStakeMode = {
  name: string;
  sourceRtpWad: bigint;
  importedRtpWad: bigint;
  rescaled: boolean;
  booksWritten: number;
  booksFile?: string;
};

/** Parses `id,weight,payoutMultiplier` rows, the Stake Engine lookup table format. */
export function parseStakeLookupTable(source: string): StakeLookupRow[] {
  const rows: StakeLookupRow[] = [];
  source.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line === '') return;
    const parts = line.split(',').map(part => part.trim());
    if (parts.length !== 3 || parts.some(part => !/^\d+$/.test(part))) {
      throw new Error(`Line ${index + 1}: expected "id,weight,payoutMultiplier", got "${rawLine}"`);
    }
    const [id, weight, payoutMultiplier] = parts;
    rows.push({ id, weight: BigInt(weight), payoutMultiplier: BigInt(payoutMultiplier) });
  });
  return rows;
}

function roundedDivide(numerator: bigint, denominator: bigint): bigint {
  return (2n * numerator + denominator) / (2n * denominator);
}

/** Weight-proportional picks at evenly spaced points of the group's cumulative weight. */
function sampleBookIds(rows: StakeLookupRow[], count: number): string[] {
  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0n);
  const picks: string[] = [];
  let index = 0;
  let cumulativeWeight = 0n;
  for (let pick = 0; pick < count; pick++) {
    const target = ((2n * BigInt(pick) + 1n) * totalWeight) / (2n * BigInt(count));
    while (cumulativeWeight + rows[index].weight <= target) {
      cumulativeWeight += rows[index].weight;
      index++;
    }
    picks.push(rows[index].id);
  }
  return new Set(picks).size === 1 ? [picks[0]] : picks;
}

/**
 * Turns one Stake bet mode into a tier list. Prizes become multiples of the mode's own wager
 * (base bet × cost). Winning weights that overflow 32 bits are scaled down, keeping every prize,
 * and the miss weight is re-solved so the RTP stays that of the source table.
 */
export function convertStakeMode(
  rows: StakeLookupRow[],
  cost: Rational,
  seedsPerPrize: number,
): StakeModeConversion {
  const rowsByPayout = new Map<bigint, StakeLookupRow[]>();
  for (const row of rows) {
    if (row.weight === 0n) continue;
    const group = rowsByPayout.get(row.payoutMultiplier);
    if (group) group.push(row);
    else rowsByPayout.set(row.payoutMultiplier, [row]);
  }
  const payouts = [...rowsByPayout.keys()].sort((a, b) => (a < b ? -1 : 1));
  const weightByPayout = new Map(
    payouts.map(payout => [
      payout,
      rowsByPayout.get(payout)!.reduce((sum, row) => sum + row.weight, 0n),
    ]),
  );

  let totalWeight = 0n;
  let winningWeight = 0n;
  let payoutSum = 0n;
  for (const [payout, weight] of weightByPayout) {
    totalWeight += weight;
    payoutSum += payout * weight;
    if (payout > 0n) winningWeight += weight;
  }
  if (payoutSum === 0n) throw new Error('The lookup table has no winning rows');

  const rescaled = winningWeight > UINT32_MAX;
  if (rescaled) {
    const winningPayouts = payouts.filter(payout => payout > 0n);
    const budget = UINT32_MAX - BigInt(winningPayouts.length);
    let scaledWinningWeight = 0n;
    let scaledPayoutSum = 0n;
    for (const payout of winningPayouts) {
      const scaled = (weightByPayout.get(payout)! * budget) / winningWeight;
      const weight = scaled > 0n ? scaled : 1n;
      weightByPayout.set(payout, weight);
      scaledWinningWeight += weight;
      scaledPayoutSum += payout * weight;
    }
    const missWeight =
      roundedDivide(scaledPayoutSum * totalWeight, payoutSum) - scaledWinningWeight;
    weightByPayout.set(0n, missWeight > 0n ? missWeight : 0n);
  }

  const prizeOf = (payout: bigint) =>
    formatPrize(payout * cost.denominator, STAKE_PAYOUT_SCALE * cost.numerator);
  return {
    tierList: [...weightByPayout.entries()]
      .filter(([, weight]) => weight > 0n)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([payout, weight]) => ({ prize: prizeOf(payout), weight })),
    bookIdsByPrize: new Map(
      payouts.map(payout => [
        prizeOf(payout),
        sampleBookIds(rowsByPayout.get(payout)!, seedsPerPrize),
      ]),
    ),
    sourceRtpWad:
      (payoutSum * cost.denominator * WAD) / (STAKE_PAYOUT_SCALE * cost.numerator * totalWeight),
    rescaled,
  };
}

function openBooks(path: string): Readable {
  const stream = createReadStream(path);
  if (!path.endsWith('.zst') && !path.endsWith('.zstd')) return stream;
  if (typeof zlib.createZstdDecompress !== 'function') {
    throw new Error(`Decompressing ${path} needs Node 22.15 or newer; or run zstd -d on it first`);
  }
  return stream.pipe(zlib.createZstdDecompress());
}

/** Copies the chosen books out of a books file, one `<id>.json` per book. */
async function extractBooks(booksPath: string, wantedIds: Set<string>, outDir: string) {
  mkdirSync(outDir, { recursive: true });
  let written = 0;
  for await (const line of createInterface({ input: openBooks(booksPath), crlfDelay: Infinity })) {
    if (line.trim() === '') continue;
    const cheapId = BOOK_ID_PATTERN.exec(line)?.[1];
    if (cheapId !== undefined && !wantedIds.has(cheapId)) continue;
    const book = JSON.parse(line) as { id: number };
    const id = String(book.id);
    if (!wantedIds.has(id)) continue;
    writeFileSync(join(outDir, `${id}.json`), JSON.stringify(book));
    written++;
  }
  return written;
}

function findBooksFile(publishDir: string, events: string): string | undefined {
  return [events, events.replace(/\.zstd?$/, '')]
    .map(name => resolve(publishDir, name))
    .find(path => existsSync(path));
}

/**
 * Converts a Stake Engine publish folder (`index.json`, lookup tables, books) into a slot-engine
 * title: one tier list, display mapping and book folder per bet mode, plus `title.json`.
 */
export async function importStakeLibrary(options: {
  publishDir: string;
  outDir: string;
  name: string;
  seedsPerPrize: number;
}): Promise<ImportedStakeMode[]> {
  const { publishDir, outDir, name, seedsPerPrize } = options;
  const index = JSON.parse(readFileSync(resolve(publishDir, 'index.json'), 'utf8')) as StakeIndex;
  if (!Array.isArray(index.modes) || index.modes.length === 0) {
    throw new Error('index.json lists no modes');
  }
  mkdirSync(outDir, { recursive: true });

  const conversions = index.modes.map(mode => {
    try {
      const rows = parseStakeLookupTable(readFileSync(resolve(publishDir, mode.weights), 'utf8'));
      return convertStakeMode(rows, parsePrize(String(mode.cost)), seedsPerPrize);
    } catch (error) {
      throw new Error(
        `Mode "${mode.name}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  const title: TitleDefinition = {
    name,
    betConfigurations: index.modes.map(mode => ({
      name: mode.name,
      tierList: `${mode.name}.csv`,
      displayMapping: `${mode.name}.display-mapping.json`,
    })),
  };
  index.modes.forEach((mode, position) => {
    writeFileSync(join(outDir, `${mode.name}.csv`), formatTierList(conversions[position].tierList));
  });
  writeFileSync(join(outDir, 'title.json'), `${JSON.stringify(title, null, 2)}\n`);

  const compiled = compileTitleFile(join(outDir, 'title.json'));
  const imported: ImportedStakeMode[] = [];
  for (const [position, mode] of index.modes.entries()) {
    const { prizeDenominator, stats } = compiled.betConfigurations[position];
    const conversion = conversions[position];
    const mapping: DisplayMappingFile = { prizeDenominator: Number(prizeDenominator), seeds: {} };
    for (const [prize, bookIds] of conversion.bookIdsByPrize) {
      const { numerator, denominator } = parsePrize(prize);
      mapping.seeds[String((numerator * prizeDenominator) / denominator)] = bookIds;
    }
    writeFileSync(join(outDir, `${mode.name}.display-mapping.json`), JSON.stringify(mapping));

    const booksFile = findBooksFile(publishDir, mode.events);
    const wantedIds = new Set([...conversion.bookIdsByPrize.values()].flat());
    imported.push({
      name: mode.name,
      sourceRtpWad: conversion.sourceRtpWad,
      importedRtpWad: stats.rtpWad,
      rescaled: conversion.rescaled,
      booksFile,
      booksWritten:
        booksFile === undefined
          ? 0
          : await extractBooks(booksFile, wantedIds, join(outDir, 'books', mode.name)),
    });
  }
  return imported;
}

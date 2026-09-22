import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { keccak256, toHex } from 'viem';
import { decodeSeed, prizeUnits } from '../example/game.ts';
import {
  checkDisplayCoverage,
  compileConfiguration,
  compileTitleFile,
  displaySeedCount,
  parseDisplayMapping,
  parseTierList,
  pickDisplaySeed,
  samplePrizeUnits,
} from '../src/index.ts';

const EXAMPLE_TITLE = new URL('../example/title.json', import.meta.url).pathname;

describe('display mapping', () => {
  const configuration = compileConfiguration(parseTierList('0,9000\n0.5,900\n72.6,9\n200,1'), {
    prizeDenominator: 20n,
  });
  const file = {
    prizeDenominator: 20,
    seeds: { '0': ['miss-a', 'miss-b'], '10': ['half'], '1452': ['a', 'b', 'c'], '60': ['three'] },
  };
  const mapping = parseDisplayMapping(file, configuration.prizeDenominator);

  it('keys seeds by prize units', () => {
    assert.equal(displaySeedCount(mapping, 1452n), 3);
    assert.equal(displaySeedCount(mapping, 0n), 2);
    assert.equal(displaySeedCount(mapping, 4000n), 0);
  });

  it('picks one seed per session, the same for every client', () => {
    const randomness = keccak256(toHex('session'));
    const seed = pickDisplaySeed(mapping, 1452n, randomness);
    assert.ok(['a', 'b', 'c'].includes(seed ?? ''));
    assert.equal(pickDisplaySeed(mapping, 1452n, randomness), seed);
    assert.equal(pickDisplaySeed(mapping, 999n, randomness), undefined);

    const seen = new Set<string | undefined>();
    let next = randomness;
    for (let i = 0; i < 64; i++) {
      next = keccak256(next);
      seen.add(pickDisplaySeed(mapping, 1452n, next));
    }
    assert.equal(seen.size, 3);
  });

  it('reports prizes without seeds and seeds without a prize', () => {
    const coverage = checkDisplayCoverage(mapping, configuration);
    assert.deepEqual(coverage.prizesWithoutSeeds, [4000n]);
    assert.deepEqual(coverage.seedsWithoutPrize, [60n]);
  });

  it('rejects a foreign denominator, fractional prizes and empty seed lists', () => {
    assert.throws(() => parseDisplayMapping(file, 10n), /prize denominator 20/);
    assert.throws(
      () => parseDisplayMapping({ prizeDenominator: 20, seeds: { '1.5': ['x'] } }),
      /whole number/,
    );
    assert.throws(
      () => parseDisplayMapping({ prizeDenominator: 20, seeds: { '1': [] } }),
      /at least one/,
    );
  });

  it('covers every example prize with reels that show that prize', () => {
    const base = compileTitleFile(EXAMPLE_TITLE).betConfigurations[0];
    const example = parseDisplayMapping(
      JSON.parse(readFileSync(base.displayMappingPath!, 'utf8')),
      base.prizeDenominator,
    );
    assert.deepEqual(checkDisplayCoverage(example, base), {
      prizesWithoutSeeds: [],
      seedsWithoutPrize: [],
    });
    for (const [units, seeds] of example.seedsByPrizeUnits) {
      for (const seed of seeds) assert.equal(BigInt(prizeUnits(decodeSeed(seed))), units);
    }

    let randomness = keccak256(toHex('lucky-reels'));
    for (let i = 0; i < 200; i++) {
      randomness = keccak256(randomness);
      const units = samplePrizeUnits(base, randomness);
      const seed = pickDisplaySeed(example, units, randomness);
      assert.equal(BigInt(prizeUnits(decodeSeed(seed!))), units);
    }
  });
});

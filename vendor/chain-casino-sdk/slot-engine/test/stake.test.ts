import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { zstdCompressSync } from 'node:zlib';
import {
  checkDisplayCoverage,
  compileConfiguration,
  compileTitleFile,
  convertStakeMode,
  importStakeLibrary,
  parseDisplayMapping,
  parsePrize,
  parseStakeLookupTable,
  parseTierList,
} from '../src/index.ts';

const WAD = 10n ** 18n;

describe('Stake Engine import', () => {
  it('reads prizes as multiples of the mode wager and keeps small tables exact', () => {
    const rows = parseStakeLookupTable('1,700,0\n2,200,150\n3,100,200\n4,0,99990\n');
    const conversion = convertStakeMode(rows, parsePrize('1'), 4);
    assert.deepEqual(conversion.tierList, [
      { prize: '0', weight: 700n },
      { prize: '1.5', weight: 200n },
      { prize: '2', weight: 100n },
    ]);
    assert.equal(conversion.rescaled, false);
    assert.equal(conversion.sourceRtpWad, (WAD * 50n) / 100n);
  });

  it('divides payouts by the mode cost, including costs that leave fractions', () => {
    const rows = parseStakeLookupTable('1,1,5000\n2,3,150000\n');
    assert.deepEqual(
      convertStakeMode(rows, parsePrize('100'), 1).tierList.map(tier => tier.prize),
      ['0.5', '15'],
    );
    const thirds = convertStakeMode(parseStakeLookupTable('1,9,0\n2,1,100\n'), parsePrize('3'), 1);
    assert.equal(thirds.tierList[1].prize, '1/3');
    assert.equal(compileConfiguration(thirds.tierList).prizeDenominator, 3n);
  });

  it('scales winning weights into 32 bits, keeps every prize and holds the source RTP', () => {
    const rows = parseStakeLookupTable(
      ['0,199895993606,0', '1,31126951527,20', '2,311363026,140', '3,5,500000', '4,17,12340'].join(
        '\n',
      ),
    );
    const conversion = convertStakeMode(rows, parsePrize('1'), 1);
    assert.equal(conversion.rescaled, true);
    assert.deepEqual(
      conversion.tierList.map(tier => tier.prize),
      ['0', '0.2', '1.4', '123.4', '5000'],
    );
    const compiled = compileConfiguration(conversion.tierList);
    assert.ok(compiled.tiers[compiled.tiers.length - 1].cumulativeWeight <= 2n ** 32n - 1n);
    const drift = compiled.stats.rtpWad - conversion.sourceRtpWad;
    assert.ok(drift < 10n ** 9n && drift > -(10n ** 9n), `RTP drifted by ${drift} wad`);
  });

  it('picks display books in proportion to their weight within a prize', () => {
    const rows = parseStakeLookupTable('1,1,0\n10,3,150\n11,1,150\n');
    const { bookIdsByPrize } = convertStakeMode(rows, parsePrize('1'), 4);
    assert.deepEqual(bookIdsByPrize.get('1.5'), ['10', '10', '10', '11']);
    assert.deepEqual(bookIdsByPrize.get('0'), ['1']);
  });

  it('writes a title whose display mapping points at extracted books', async () => {
    const publishDir = mkdtempSync(join(tmpdir(), 'stake-publish-'));
    const outDir = mkdtempSync(join(tmpdir(), 'stake-title-'));
    writeFileSync(
      join(publishDir, 'index.json'),
      JSON.stringify({
        modes: [
          { name: 'base', cost: 1.0, events: 'books_base.jsonl.zst', weights: 'base.csv' },
          { name: 'bonus', cost: 100.0, events: 'books_bonus.jsonl', weights: 'bonus.csv' },
        ],
      }),
    );
    writeFileSync(join(publishDir, 'base.csv'), '1,90,0\n2,5,120\n3,5,1500\n');
    writeFileSync(join(publishDir, 'bonus.csv'), '1,1,2000\n2,1,17000\n');
    const book = (id: number, payoutMultiplier: number) =>
      JSON.stringify({ id, events: [{ type: 'reveal' }], payoutMultiplier });
    writeFileSync(
      join(publishDir, 'books_base.jsonl.zst'),
      zstdCompressSync([book(1, 0), book(2, 120), book(3, 1500)].join('\n')),
    );
    writeFileSync(
      join(publishDir, 'books_bonus.jsonl'),
      [book(1, 2000), book(2, 17000)].join('\n'),
    );

    const modes = await importStakeLibrary({
      publishDir,
      outDir,
      name: 'Fixture',
      seedsPerPrize: 2,
    });
    assert.deepEqual(
      modes.map(mode => [mode.name, mode.booksWritten]),
      [
        ['base', 3],
        ['bonus', 2],
      ],
    );

    const title = compileTitleFile(join(outDir, 'title.json'));
    assert.deepEqual(
      title.betConfigurations.map(configuration => configuration.name),
      ['base', 'bonus'],
    );
    for (const configuration of title.betConfigurations) {
      const mapping = parseDisplayMapping(
        JSON.parse(readFileSync(configuration.displayMappingPath!, 'utf8')),
        configuration.prizeDenominator,
      );
      assert.deepEqual(checkDisplayCoverage(mapping, configuration), {
        prizesWithoutSeeds: [],
        seedsWithoutPrize: [],
      });
      for (const [units, [bookId]] of mapping.seedsByPrizeUnits) {
        const stored = JSON.parse(
          readFileSync(join(outDir, 'books', configuration.name, `${bookId}.json`), 'utf8'),
        );
        const cost = configuration.name === 'bonus' ? 100n : 1n;
        assert.equal(
          BigInt(stored.payoutMultiplier) * configuration.prizeDenominator,
          units * 100n * cost,
        );
      }
    }
    assert.deepEqual(parseTierList(readFileSync(join(outDir, 'bonus.csv'), 'utf8')), [
      { prize: '0.2', weight: 1n },
      { prize: '1.7', weight: 1n },
    ]);
  });
});

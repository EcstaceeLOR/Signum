#!/usr/bin/env tsx
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { type Address, createPublicClient, createWalletClient, type Hex, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { ConfigurationStats } from './compile.ts';
import { readTitle, statsMismatches } from './decode.ts';
import { deployTitle } from './deploy.ts';
import { checkDisplayCoverage, parseDisplayMapping } from './display.ts';
import { importStakeLibrary } from './stake.ts';
import { formatPrize, formatTierList } from './tier-list.ts';
import { compileTitleFile } from './title.ts';

const USAGE = `slot-engine <command>

  compile <title.json>                          print each bet configuration's exact figures
  check-mapping <title.json>                    check the display mapping covers every prize
  deploy <title.json> --rpc <url> --deployer <address>
                                                needs SLOT_ENGINE_PRIVATE_KEY
  decode <title address> --rpc <url> [--out <dir>]
                                                rebuild tier lists and RTP from chain bytes
  import-stake <publish_files dir> --out <dir> [--name <title>] [--seeds-per-prize <n>]
                                                convert a Stake Engine math export into a title`;

function percent(wad: bigint): string {
  return `${(Number(wad) / 1e16).toFixed(6)}%`;
}

function describe(
  name: string,
  prizeDenominator: bigint,
  tierCount: number,
  stats: ConfigurationStats,
) {
  return [
    `${name}`,
    `  RTP            ${percent(stats.rtpWad)}  (${stats.rtp.numerator}/${stats.rtp.denominator})`,
    `  hit rate       ${((Number(stats.hitRate.numerator) / Number(stats.hitRate.denominator)) * 100).toFixed(4)}%`,
    `  top prize      ${formatPrize(stats.topPrizeUnits, prizeDenominator)}x, weight ${stats.topPrizeWeight} of ${stats.totalWeight}`,
    `  body sigma     ${Math.sqrt(Number(stats.bodyVarianceWad) / 1e18).toFixed(4)}x per unit wager`,
    `  prizes         ${tierCount}, denominator ${prizeDenominator}`,
  ].join('\n');
}

function requireOption(value: string | undefined, name: string): string {
  if (value === undefined) throw new Error(`Missing --${name}\n\n${USAGE}`);
  return value;
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      rpc: { type: 'string' },
      deployer: { type: 'string' },
      out: { type: 'string' },
      name: { type: 'string' },
      'seeds-per-prize': { type: 'string' },
    },
  });
  const [command, target] = positionals;
  if (command === undefined || target === undefined) throw new Error(USAGE);

  if (command === 'compile' || command === 'check-mapping' || command === 'deploy') {
    const title = compileTitleFile(target);
    console.log(`${title.name}\n`);
    for (const configuration of title.betConfigurations) {
      console.log(
        describe(
          configuration.name,
          configuration.prizeDenominator,
          configuration.tiers.length,
          configuration.stats,
        ),
      );
      console.log(`  chunks         ${configuration.chunks.length}\n`);
    }

    if (command === 'check-mapping') {
      let checked = 0;
      let uncovered = 0;
      for (const configuration of title.betConfigurations) {
        if (configuration.displayMappingPath === undefined) {
          console.log(`${configuration.name}: no display mapping`);
          continue;
        }
        const mapping = parseDisplayMapping(
          JSON.parse(readFileSync(configuration.displayMappingPath, 'utf8')),
          configuration.prizeDenominator,
        );
        const coverage = checkDisplayCoverage(mapping, configuration);
        checked++;
        uncovered += coverage.prizesWithoutSeeds.length;
        console.log(
          `${configuration.name}: ${coverage.prizesWithoutSeeds.length} prizes without seeds, ` +
            `${coverage.seedsWithoutPrize.length} mapped prizes absent from the table`,
        );
      }
      if (checked === 0) throw new Error('No bet configuration has a displayMapping');
      if (uncovered > 0) process.exitCode = 1;
    }

    if (command === 'deploy') {
      const privateKey = process.env.SLOT_ENGINE_PRIVATE_KEY;
      if (privateKey === undefined) throw new Error('Set SLOT_ENGINE_PRIVATE_KEY');
      const transport = http(requireOption(values.rpc, 'rpc'));
      const publicClient = createPublicClient({ transport });
      const chain = { id: await publicClient.getChainId() } as never;
      const deployed = await deployTitle({
        publicClient,
        walletClient: createWalletClient({
          transport,
          chain,
          account: privateKeyToAccount(privateKey as Hex),
        }),
        deployer: requireOption(values.deployer, 'deployer') as Address,
        configurations: title.betConfigurations,
      });
      console.log(`title ${deployed.title}  title RTP ${percent(deployed.titleRtpWad)}`);
    }
    return;
  }

  if (command === 'decode') {
    const client = createPublicClient({ transport: http(requireOption(values.rpc, 'rpc')) });
    const configurations = await readTitle(client, target as Address);
    configurations.forEach((configuration, index) => {
      console.log(
        describe(
          `bet configuration ${index}`,
          configuration.prizeDenominator,
          configuration.tiers.length,
          configuration.stats,
        ),
      );
      const mismatches = statsMismatches(configuration.quoted, configuration.stats);
      console.log(
        mismatches.length === 0
          ? '  quoted figures match the table\n'
          : `  MISMATCH ${mismatches.join('; ')}\n`,
      );
      if (mismatches.length > 0) process.exitCode = 1;
      if (values.out !== undefined) {
        writeFileSync(
          `${values.out}/configuration-${index}.csv`,
          formatTierList(configuration.tierList),
        );
      }
    });
    return;
  }

  if (command === 'import-stake') {
    const outDir = requireOption(values.out, 'out');
    const seedsPerPrize = Number(values['seeds-per-prize'] ?? 16);
    if (!Number.isInteger(seedsPerPrize) || seedsPerPrize < 1) {
      throw new Error('--seeds-per-prize must be a positive whole number');
    }
    const modes = await importStakeLibrary({
      publishDir: target,
      outDir,
      name: values.name ?? 'Imported Stake title',
      seedsPerPrize,
    });
    for (const mode of modes) {
      console.log(
        [
          mode.name,
          `  source RTP     ${percent(mode.sourceRtpWad)}`,
          `  imported RTP   ${percent(mode.importedRtpWad)}${mode.rescaled ? '  (weights rescaled to 32 bits)' : ''}`,
          `  books          ${mode.booksFile === undefined ? 'no books file found' : `${mode.booksWritten} written`}`,
        ].join('\n'),
      );
    }
    console.log(`\nwrote ${outDir}/title.json; next: compile and check-mapping it`);
    return;
  }

  throw new Error(USAGE);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

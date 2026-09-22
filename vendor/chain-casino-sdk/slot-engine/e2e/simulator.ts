// Deploys a slot title onto the running simulator chain and plays real sessions through the
// VRF node, checking each settlement against the reference sampler. Needs `vp run start`.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { type Hex, hexToBigInt, parseAbi, parseEther, parseEventLogs } from 'viem';
import {
  formatPrize,
  parseDisplayMapping,
  pickDisplaySeed,
  samplePrizeUnits,
} from '../src/index.ts';
import {
  deployTitleToSimulator,
  EXAMPLE_TITLE_PATH,
  localCasinoHostAbi,
  readSimulatorDeployment,
  SIMULATOR_DEPLOYMENT_PATH,
} from './local-title.ts';

const SETTLEMENT_TIMEOUT_MS = 60_000;
const tokenAbi = parseAbi(['function approve(address spender, uint256 amount) returns (bool)']);

const { values } = parseArgs({
  options: {
    deployed: { type: 'string', default: SIMULATOR_DEPLOYMENT_PATH },
    title: { type: 'string', default: EXAMPLE_TITLE_PATH },
    sessions: { type: 'string', default: '25' },
  },
});

async function main() {
  const deployment = readSimulatorDeployment(values.deployed);
  const { deployer, title, onChain, publicClient, walletClient } = await deployTitleToSimulator(
    deployment,
    values.title,
  );
  const base = title.betConfigurations[0];
  console.log(`deployer ${deployer}`);
  console.log(`title    ${onChain.title}  RTP ${Number(onChain.titleRtpWad) / 1e16}%`);

  const write = async (hash: Hex) => publicClient.waitForTransactionReceipt({ hash });
  await write(
    await walletClient.writeContract({
      address: deployment.token,
      abi: tokenAbi,
      functionName: 'approve',
      args: [deployment.host, parseEther('1000000')],
    }),
  );

  const mapping =
    base.displayMappingPath === undefined
      ? undefined
      : parseDisplayMapping(
          JSON.parse(readFileSync(base.displayMappingPath, 'utf8')),
          base.prizeDenominator,
        );

  const wager = parseEther('1');
  let wagered = 0n;
  let paid = 0n;
  for (let i = 0; i < Number(values.sessions); i++) {
    const receipt = await write(
      await walletClient.writeContract({
        address: deployment.host,
        abi: localCasinoHostAbi,
        functionName: 'openSession',
        args: [onChain.title, deployment.vault, wager, '0x'],
      }),
    );
    const [opened] = parseEventLogs({
      abi: localCasinoHostAbi,
      eventName: 'CasinoSessionOpened',
      logs: receipt.logs,
    });
    const settled = await waitForSettlement(opened.args.sessionId, receipt.blockNumber);

    const expectedUnits = samplePrizeUnits(base, settled.randomness);
    const expectedPayout = (wager * expectedUnits) / base.prizeDenominator;
    if (settled.payout !== expectedPayout || hexToBigInt(settled.gameState) !== expectedUnits) {
      throw new Error(
        `session ${opened.args.sessionId}: chain paid ${settled.payout} for prize ${settled.gameState}, ` +
          `reference expects ${expectedPayout} for ${expectedUnits}`,
      );
    }
    const seed = mapping ? pickDisplaySeed(mapping, expectedUnits, settled.randomness) : undefined;
    if (mapping && seed === undefined) {
      throw new Error(
        `session ${opened.args.sessionId}: no display seed for prize ${expectedUnits}`,
      );
    }
    wagered += wager;
    paid += settled.payout;
    console.log(
      `session ${opened.args.sessionId}  prize ${formatPrize(expectedUnits, base.prizeDenominator)}x` +
        (seed === undefined ? '' : `  display seed ${JSON.stringify(seed)}`),
    );
  }
  if (wagered === 0n) return;
  console.log(
    `\n${values.sessions} sessions settled and matched the reference sampler. ` +
      `Realized RTP ${((Number(paid) / Number(wagered)) * 100).toFixed(1)}% against a table RTP of ` +
      `${Number(onChain.titleRtpWad) / 1e16}%.`,
  );

  async function waitForSettlement(sessionId: bigint, fromBlock: bigint) {
    const deadline = Date.now() + SETTLEMENT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const logs = await publicClient.getContractEvents({
        address: deployment.host,
        abi: localCasinoHostAbi,
        eventName: 'CasinoSessionSettled',
        args: { sessionId },
        fromBlock,
      });
      if (logs.length > 0) return logs[0].args as Required<(typeof logs)[0]['args']>;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`session ${sessionId} did not settle within ${SETTLEMENT_TIMEOUT_MS} ms`);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

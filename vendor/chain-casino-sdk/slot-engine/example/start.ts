// Runs inside `vp run start`: waits for the simulator node to finish deploying, then puts the
// example title on that chain. Registering it on the host adds it to the simulator's game list.
import { existsSync, statSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  deployTitleToSimulator,
  EXAMPLE_TITLE_PATH,
  readSimulatorDeployment,
  SIMULATOR_DEPLOYMENT_PATH,
  SIMULATOR_URL,
} from '../e2e/local-title.ts';

const startedAt = Date.now();

async function waitForSimulatorNode() {
  while (
    !existsSync(SIMULATOR_DEPLOYMENT_PATH) ||
    statSync(SIMULATOR_DEPLOYMENT_PATH).mtimeMs < startedAt
  ) {
    await sleep(500);
  }
}

console.log('waiting for the simulator node…');
await waitForSimulatorNode();
const { onChain, title } = await deployTitleToSimulator(
  readSimulatorDeployment(),
  EXAMPLE_TITLE_PATH,
);
console.log(`${title.name} ${onChain.title}  title RTP ${Number(onChain.titleRtpWad) / 1e16}%`);
console.log(`open ${SIMULATOR_URL} and pick ${title.name} in the game list`);

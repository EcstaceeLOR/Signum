import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  type Address,
  createPublicClient,
  createWalletClient,
  defineChain,
  type Hex,
  http,
  parseAbi,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { compileTitleFile, deployTitle } from '../src/index.ts';

export const HARDHAT_ACCOUNT_0 =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;
/** The casino SDK simulator: a sibling in the SDK download, or the monorepo package's. */
export const SIMULATOR_DIR = ['../../simulator', '../../casino-sdk/simulator']
  .map(candidate => resolve(import.meta.dirname, candidate))
  .find(existsSync)!;
export const SIMULATOR_DEPLOYMENT_PATH = join(SIMULATOR_DIR, 'local-node/deployed.json');
export const EXAMPLE_TITLE_PATH = resolve(import.meta.dirname, '../example/title.json');
const MIN_RTP_WAD = 850_000_000_000_000_000n;
const MAX_RTP_WAD = 980_000_000_000_000_000n;

export const localCasinoHostAbi = parseAbi([
  'function registerGame(address game, string gameName)',
  'function openSession(address game, address vault, uint256 wager, bytes gameData) returns (uint256 sessionId, bytes32 requestId)',
  'event CasinoSessionOpened(uint256 indexed sessionId, address indexed game, address indexed player, address vault, uint256 wager)',
  'event CasinoSessionSettled(uint256 indexed sessionId, address indexed game, address indexed player, uint8 phase, uint256 payout, bytes32 randomness, bytes gameState)',
]);

export type SimulatorDeployment = {
  chainId: number;
  rpcUrl: string;
  host: Address;
  vault: Address;
  token: Address;
};

export function readSimulatorDeployment(path = SIMULATOR_DEPLOYMENT_PATH): SimulatorDeployment {
  return JSON.parse(readFileSync(path, 'utf8')) as SimulatorDeployment;
}

export function createSimulatorClients(deployment: SimulatorDeployment) {
  const chain = defineChain({
    id: deployment.chainId,
    name: 'casino-sdk simulator',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [deployment.rpcUrl] } },
  });
  const account = privateKeyToAccount(HARDHAT_ACCOUNT_0);
  return {
    account,
    publicClient: createPublicClient({ chain, transport: http(), pollingInterval: 200 }),
    walletClient: createWalletClient({ chain, transport: http(), account }),
  };
}

/** Deploys a fresh SlotTitleDeployer and the title onto the simulator chain, then registers it. */
export async function deployTitleToSimulator(deployment: SimulatorDeployment, titlePath: string) {
  const { account, publicClient, walletClient } = createSimulatorClients(deployment);
  const artifact = JSON.parse(
    readFileSync(
      resolve(
        import.meta.dirname,
        '../artifacts/contracts/SlotTitleDeployer.sol/SlotTitleDeployer.json',
      ),
      'utf8',
    ),
  );
  const deployHash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [account.address, MIN_RTP_WAD, MAX_RTP_WAD],
  });
  const { contractAddress: deployer } = await publicClient.waitForTransactionReceipt({
    hash: deployHash,
  });
  if (!deployer) throw new Error('SlotTitleDeployer deployment failed');

  const title = compileTitleFile(titlePath);
  const onChain = await deployTitle({
    publicClient,
    walletClient,
    deployer,
    configurations: title.betConfigurations,
  });
  const registerHash = await walletClient.writeContract({
    address: deployment.host,
    abi: localCasinoHostAbi,
    functionName: 'registerGame',
    args: [onChain.title, title.name],
  });
  await publicClient.waitForTransactionReceipt({ hash: registerHash });
  return { deployer, title, onChain, account, publicClient, walletClient };
}

export const SIMULATOR_URL = 'http://localhost:3300/?game=http://localhost:3500';

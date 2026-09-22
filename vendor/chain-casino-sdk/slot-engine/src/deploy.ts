import { type Address, parseEventLogs, type PublicClient, type WalletClient } from 'viem';
import { slotTitleDeployerAbi } from './abi.ts';
import type { CompiledConfiguration } from './compile.ts';
import { readTitle, statsMismatches } from './decode.ts';

export type DeployTitleParams = {
  publicClient: PublicClient;
  walletClient: WalletClient;
  deployer: Address;
  configurations: CompiledConfiguration[];
};

export type DeployedTitle = { title: Address; chunkPointers: Address[][]; titleRtpWad: bigint };

/** Stores every chunk, deploys the title, then confirms the chain derived the compiler's figures. */
export async function deployTitle(params: DeployTitleParams): Promise<DeployedTitle> {
  const { publicClient, walletClient, deployer, configurations } = params;
  const account = walletClient.account;
  if (account === undefined) throw new Error('walletClient needs an account');

  const chunkPointers: Address[][] = [];
  for (const configuration of configurations) {
    const pointers: Address[] = [];
    for (const chunk of configuration.chunks) {
      const hash = await walletClient.writeContract({
        address: deployer,
        abi: slotTitleDeployerAbi,
        functionName: 'deployChunk',
        args: [chunk],
        account,
        chain: walletClient.chain,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const [deployed] = parseEventLogs({
        abi: slotTitleDeployerAbi,
        eventName: 'ChunkDeployed',
        logs: receipt.logs,
      });
      pointers.push(deployed.args.pointer);
    }
    chunkPointers.push(pointers);
  }

  const hash = await walletClient.writeContract({
    address: deployer,
    abi: slotTitleDeployerAbi,
    functionName: 'deployTitle',
    args: [
      configurations.map((configuration, index) => ({
        prizeDenominator: Number(configuration.prizeDenominator),
        missWeight: configuration.missWeight,
        chunks: chunkPointers[index],
      })),
    ],
    account,
    chain: walletClient.chain,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const [deployed] = parseEventLogs({
    abi: slotTitleDeployerAbi,
    eventName: 'TitleDeployed',
    logs: receipt.logs,
  });

  const onChain = await readTitle(publicClient, deployed.args.title);
  onChain.forEach((configuration, index) => {
    const mismatches = statsMismatches(configuration.quoted, configurations[index].stats);
    if (mismatches.length > 0) {
      throw new Error(`Bet configuration ${index} differs on chain: ${mismatches.join('; ')}`);
    }
  });
  return { title: deployed.args.title, chunkPointers, titleRtpWad: deployed.args.titleRtpWad };
}

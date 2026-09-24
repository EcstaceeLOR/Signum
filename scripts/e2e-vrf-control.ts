import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import {
  LOCAL_VRF_NODE_PRIVATE_KEY,
  fulfillLocalVrfRequest,
  randomnessFulfilledEvent,
  randomnessRequestFromLogArgs,
  randomnessRequestedEvent,
} from '../vendor/chain-casino-sdk/local-verify-network/src/local-verify-network.ts'

type Deployment = {
  chainId: number
  rpcUrl: string
  router: Address
}

const command = process.argv[2]
if (command !== 'fulfill-latest') {
  throw new Error(`Unsupported command: ${command ?? '(missing)'}`)
}

const deployment = JSON.parse(
  await readFile(
    resolve('vendor/chain-casino-sdk/simulator/local-node/deployed.json'),
    'utf8',
  ),
) as Deployment

const chain = defineChain({
  id: deployment.chainId,
  name: `Signum E2E ${deployment.chainId}`,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [deployment.rpcUrl] } },
})
const publicClient = createPublicClient({
  chain,
  transport: http(deployment.rpcUrl),
  pollingInterval: 100,
})
const nodeAccount = privateKeyToAccount(LOCAL_VRF_NODE_PRIVATE_KEY)
const walletClient = createWalletClient({
  account: nodeAccount,
  chain,
  transport: http(deployment.rpcUrl),
})

const requestedLogs = await publicClient.getLogs({
  address: getAddress(deployment.router),
  event: randomnessRequestedEvent,
  fromBlock: 0n,
  toBlock: 'latest',
})
const fulfilledLogs = await publicClient.getLogs({
  address: getAddress(deployment.router),
  event: randomnessFulfilledEvent,
  fromBlock: 0n,
  toBlock: 'latest',
})
const fulfilled = new Set(
  fulfilledLogs
    .map((log) => log.args.requestId)
    .filter((value): value is Hex => value !== undefined)
    .map((value) => value.toLowerCase()),
)

const pending = requestedLogs
  .map((log) => randomnessRequestFromLogArgs(log.args))
  .filter((entry) => entry && !fulfilled.has(entry.requestId.toLowerCase()))

const latest = pending.at(-1)
if (!latest) {
  throw new Error('No unfulfilled local VRF request is available.')
}

await fulfillLocalVrfRequest({
  publicClient,
  walletClient,
  routerAddress: getAddress(deployment.router),
  requestId: latest.requestId,
  request: latest.request,
  nodePrivateKey: LOCAL_VRF_NODE_PRIVATE_KEY,
})

console.log(`[e2e-vrf] fulfilled ${latest.requestId}`)

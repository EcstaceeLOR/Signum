import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { network } from 'hardhat';
import {
  type Address,
  encodeFunctionData,
  type Hex,
  keccak256,
  parseEther,
  toHex,
  zeroAddress,
} from 'viem';
import {
  type CompiledConfiguration,
  compileConfiguration,
  compileTitleFile,
  deployTitle,
  MAX_TIERS_PER_CHUNK,
  packChunks,
  parseTierList,
  readTitle,
  samplePrizeUnits,
  slotTitleDeployerAbi,
  type Tier,
} from '../src/index.ts';

const WAD = 10n ** 18n;
const MIN_RTP_WAD = (85n * WAD) / 100n;
const MAX_RTP_WAD = (98n * WAD) / 100n;
const WAITING_RANDOMNESS = 1;
const SETTLED = 3;
const EXAMPLE_TITLE = new URL('../example/title.json', import.meta.url).pathname;
const LARGE_MISS_WEIGHT = 8_396_000n;

const randomnessForRoll = (roll: bigint) => toHex(roll, { size: 32 });

/** 4,000 ascending prizes of weight 1, spanning two chunks, at a 95.26% RTP. */
const largeTierList = (): Tier[] => [
  { prize: '0', weight: LARGE_MISS_WEIGHT },
  ...Array.from({ length: 4000 }, (_, index) => ({ prize: String(index + 1), weight: 1n })),
];

const sessionContext = (wager: bigint, gameData: Hex) => ({
  sessionId: 1n,
  player: zeroAddress,
  vault: zeroAddress,
  wagerBase: wager,
  escrowedStake: wager,
  reservedProfit: 0n,
  step: 0,
  gameData,
  gameState: '0x' as Hex,
});

describe('SlotEngine', async () => {
  const { viem } = await network.getOrCreate();
  const publicClient = await viem.getPublicClient();
  const [council, author, stranger] = await viem.getWalletClients();

  const example = compileTitleFile(EXAMPLE_TITLE).betConfigurations[0];
  const large = compileConfiguration(largeTierList());
  let deployer: Awaited<ReturnType<typeof deploySlotTitleDeployer>>;
  let exampleTitle: Address;
  let largeTitle: Address;

  async function deploySlotTitleDeployer() {
    return viem.deployContract('SlotTitleDeployer', [
      council.account.address,
      MIN_RTP_WAD,
      MAX_RTP_WAD,
    ]);
  }

  async function deploy(configurations: CompiledConfiguration[]) {
    return deployTitle({
      publicClient,
      walletClient: author,
      deployer: deployer.address,
      configurations,
    });
  }

  async function deployChunks(configuration: CompiledConfiguration, chunks = configuration.chunks) {
    const pointers: Address[] = [];
    for (const chunk of chunks) {
      const { result } = await publicClient.simulateContract({
        address: deployer.address,
        abi: slotTitleDeployerAbi,
        functionName: 'deployChunk',
        args: [chunk],
        account: author.account,
      });
      await deployer.write.deployChunk([chunk], { account: author.account });
      pointers.push(result);
    }
    return pointers;
  }

  async function rawDeployTitle(tiers: Tier[], chunksOverride?: Hex[]) {
    const configuration = compileConfiguration(tiers);
    const chunks = await deployChunks(configuration, chunksOverride);
    return deployer.write.deployTitle(
      [
        [
          {
            prizeDenominator: Number(configuration.prizeDenominator),
            missWeight: configuration.missWeight,
            chunks,
          },
        ],
      ],
      { account: author.account },
    );
  }

  before(async () => {
    deployer = await deploySlotTitleDeployer();
    exampleTitle = (await deploy([example])).title;
    largeTitle = (await deploy([large])).title;
  });

  describe('example title', () => {
    it('derives on chain exactly the figures the compiler derives', async () => {
      const [onChain] = await readTitle(publicClient, exampleTitle);
      assert.equal(onChain.quoted.totalWeight, example.stats.totalWeight);
      assert.equal(onChain.quoted.topPrizeUnits, 1005n);
      assert.equal(onChain.quoted.topPrizeWeight, example.stats.topPrizeWeight);
      assert.equal(onChain.quoted.prizeSum, example.stats.prizeSum);
      assert.equal(onChain.quoted.bodyVarianceWad, example.stats.bodyVarianceWad);
      assert.equal(onChain.tiers.length, example.tiers.length);
      assert.equal(onChain.chunkPointers.length, 1);
      assert.deepEqual(onChain.stats.rtp, { numerator: 24n, denominator: 25n });
    });

    it('publishes the base configuration RTP as the title RTP', async () => {
      const title = await viem.getContractAt('SlotEngine', exampleTitle);
      assert.equal(await title.read.titleRtpWad(), (96n * WAD) / 100n);
      assert.equal(await title.read.rtpWad([0]), (96n * WAD) / 100n);
      assert.equal(await title.read.betConfigurationCount(), 1n);
    });

    it('records the author and recognises the title', async () => {
      assert.equal(await deployer.read.isTitle([exampleTitle]), true);
      assert.equal(
        (await deployer.read.titleAuthor([exampleTitle])).toLowerCase(),
        author.account.address.toLowerCase(),
      );
      assert.equal(await deployer.read.isTitle([deployer.address]), false);
    });

    it('samples the same prize as the reference sampler for arbitrary randomness', async () => {
      const title = await viem.getContractAt('SlotEngine', exampleTitle);
      let randomness = keccak256(toHex('slot-engine'));
      let hits = 0;
      for (let i = 0; i < 1500; i++) {
        randomness = keccak256(randomness);
        const expected = samplePrizeUnits(example, randomness);
        if (expected > 0n) hits++;
        assert.equal(BigInt(await title.read.samplePrize([0, randomness])), expected);
      }
      assert.ok(hits > 500 && hits < 710, `hit count ${hits} is far from a 40% hit rate`);
    });

    it('quotes exact risk figures, rounding probability and variance up', async () => {
      const title = await viem.getContractAt('SlotEngine', exampleTitle);
      const wager = parseEther('3');
      const { stats, prizeDenominator } = example;
      const maxPayoutExpected = (wager * 1005n) / 10n;
      const [maxPayout, probabilityWad, expectedPayout, bodyVarianceScaled] =
        await title.read.quoteRiskParams([wager, '0x']);
      assert.equal(maxPayout, maxPayoutExpected);
      assert.equal(
        probabilityWad,
        (stats.topPrizeWeight * WAD + stats.totalWeight - 1n) / stats.totalWeight,
      );
      assert.equal(
        expectedPayout,
        (wager * stats.prizeSum) / (prizeDenominator * stats.totalWeight),
      );
      assert.equal(expectedPayout, (wager * 96n) / 100n);
      assert.equal(bodyVarianceScaled, wager * wager * stats.bodyVarianceWad);
      assert.deepEqual(await title.read.quoteCaps([wager, '0x']), [
        wager,
        maxPayoutExpected - wager,
      ]);
    });

    it('requests randomness at open and settles in the randomness callback', async () => {
      const title = await viem.getContractAt('SlotEngine', exampleTitle);
      const wager = parseEther('1');
      const context = sessionContext(wager, '0x');

      const opened = await title.read.onSessionStart([context]);
      assert.equal(opened.nextPhase, WAITING_RANDOMNESS);
      assert.equal(opened.requestRandomnessNow, true);
      assert.equal(opened.reservedProfitDelta, (wager * 1005n) / 10n - wager);

      const jackpot = await title.read.onRandomness([
        context,
        randomnessForRoll(example.stats.totalWeight - 1n),
      ]);
      assert.equal(jackpot.nextPhase, SETTLED);
      assert.equal(jackpot.payout, (wager * 1005n) / 10n);
      assert.equal(jackpot.newGameState, toHex(1005, { size: 4 }));
      assert.equal(jackpot.requestRandomnessNow, false);

      const smallest = await title.read.onRandomness([
        context,
        randomnessForRoll(example.missWeight),
      ]);
      assert.equal(smallest.payout, (wager * example.tiers[0].prizeUnits) / 10n);
      assert.equal(smallest.payout, wager / 2n);

      const miss = await title.read.onRandomness([context, randomnessForRoll(0n)]);
      assert.equal(miss.payout, 0n);
      assert.equal(miss.newGameState, toHex(0, { size: 4 }));
    });

    it('has no player actions, no forfeit value and rejects unknown bet configurations', async () => {
      const title = await viem.getContractAt('SlotEngine', exampleTitle);
      const context = sessionContext(1n, '0x');
      await viem.assertions.revertWithCustomError(
        title.read.onPlayerAction([context, '0x']),
        title,
        'SlotEngine__NoPlayerActions',
      );
      assert.equal(await title.read.quoteForfeitPayout([context]), 0n);
      await viem.assertions.revertWithCustomErrorWithArgs(
        title.read.quoteCaps([1n, '0x01']),
        title,
        'SlotEngine__UnknownBetConfiguration',
        [1n],
      );
      await viem.assertions.revertWithCustomError(
        title.read.quoteCaps([1n, '0x0000']),
        title,
        'SlotEngine__InvalidGameData',
      );
    });
  });

  describe('two-chunk title', () => {
    it('spans two chunks and derives the same figures on chain', async () => {
      const [onChain] = await readTitle(publicClient, largeTitle);
      assert.equal(onChain.chunkPointers.length, 2);
      assert.equal(onChain.tiers.length, 4000);
      assert.equal(onChain.quoted.totalWeight, LARGE_MISS_WEIGHT + 4000n);
      assert.equal(onChain.quoted.prizeSum, large.stats.prizeSum);
      assert.equal(onChain.quoted.bodyVarianceWad, large.stats.bodyVarianceWad);
    });

    it('samples the same prize as the reference sampler at every boundary', async () => {
      const title = await viem.getContractAt('SlotEngine', largeTitle);
      const { missWeight, tiers, stats } = large;
      const chunkBoundary = tiers[MAX_TIERS_PER_CHUNK - 1].cumulativeWeight;
      const rolls = [
        0n,
        missWeight - 1n,
        missWeight,
        missWeight + tiers[0].cumulativeWeight - 1n,
        missWeight + tiers[0].cumulativeWeight,
        missWeight + chunkBoundary - 1n,
        missWeight + chunkBoundary,
        stats.totalWeight - 3n,
        stats.totalWeight - 2n,
        stats.totalWeight - 1n,
      ];
      for (const roll of rolls) {
        const randomness = randomnessForRoll(roll);
        assert.equal(
          BigInt(await title.read.samplePrize([0, randomness])),
          samplePrizeUnits(large, randomness),
          `roll ${roll}`,
        );
      }
      assert.equal(await title.read.samplePrize([0, randomnessForRoll(missWeight - 1n)]), 0);
      assert.equal(await title.read.samplePrize([0, randomnessForRoll(missWeight)]), 1);
      assert.equal(
        await title.read.samplePrize([0, randomnessForRoll(stats.totalWeight - 1n)]),
        4000,
      );
    });

    it('reports sampling gas', async () => {
      const title = await viem.getContractAt('SlotEngine', largeTitle);
      const context = sessionContext(parseEther('1'), '0x');
      const gasFor = (roll: bigint) =>
        publicClient.estimateGas({
          to: largeTitle,
          data: encodeFunctionData({
            abi: title.abi,
            functionName: 'onRandomness',
            args: [context, randomnessForRoll(roll)],
          }),
        });
      console.log(
        `      onRandomness gas including the 21,000 transaction base: miss ${await gasFor(0n)}, ` +
          `first chunk hit ${await gasFor(large.missWeight)}, ` +
          `last chunk hit ${await gasFor(large.stats.totalWeight - 1n)}`,
      );
    });
  });

  describe('deployment cost', () => {
    it('reports two-chunk deployment gas', async () => {
      const [onChain] = await readTitle(publicClient, largeTitle);
      let chunkGas = 0n;
      for (const chunk of large.chunks) {
        chunkGas += await publicClient.estimateContractGas({
          address: deployer.address,
          abi: slotTitleDeployerAbi,
          functionName: 'deployChunk',
          args: [chunk],
          account: author.account,
        });
      }
      const titleGas = await publicClient.estimateContractGas({
        address: deployer.address,
        abi: slotTitleDeployerAbi,
        functionName: 'deployTitle',
        args: [
          [
            {
              prizeDenominator: Number(large.prizeDenominator),
              missWeight: large.missWeight,
              chunks: onChain.chunkPointers,
            },
          ],
        ],
        account: author.account,
      });
      console.log(`      chunks ${chunkGas} gas, title walk and clone ${titleGas} gas`);
      assert.ok(titleGas < 16_000_000n, 'title deployment must fit the per-transaction gas cap');
    });
  });

  describe('the engine itself', () => {
    it('is not a game', async () => {
      const engine = await viem.getContractAt('SlotEngine', await deployer.read.engine());
      await viem.assertions.revertWithCustomError(
        engine.read.quoteCaps([1n, '0x']),
        engine,
        'SlotEngine__NotATitle',
      );
    });
  });

  describe('bet configurations', () => {
    const base = compileConfiguration(parseTierList('0,64\n0.5,20\n2,13\n20,3'));
    const bonusBuy = compileConfiguration(parseTierList('0,12\n0.002,30\n0.5,30\n1.5,20\n9.63,5'));
    let title: Address;

    before(async () => {
      title = (await deploy([base, bonusBuy])).title;
    });

    it('gives each configuration its own denominator and RTP', async () => {
      const engine = await viem.getContractAt('SlotEngine', title);
      assert.equal(base.prizeDenominator, 2n);
      assert.equal(bonusBuy.prizeDenominator, 500n);
      assert.equal(await engine.read.rtpWad([0]), (96n * WAD) / 100n);
      assert.equal(await engine.read.rtpWad([1]), bonusBuy.stats.rtpWad);
      assert.equal(await engine.read.titleRtpWad(), base.stats.rtpWad);
      assert.notEqual(base.stats.rtpWad, bonusBuy.stats.rtpWad);
    });

    it('selects the configuration from the session game data', async () => {
      const engine = await viem.getContractAt('SlotEngine', title);
      const wager = 1_000_000n;
      const [baseMax] = await engine.read.quoteRiskParams([wager, '0x']);
      const [sameBaseMax] = await engine.read.quoteRiskParams([wager, '0x00']);
      const [bonusMax] = await engine.read.quoteRiskParams([wager, '0x01']);
      assert.equal(baseMax, wager * 20n);
      assert.equal(sameBaseMax, baseMax);
      assert.equal(bonusMax, (wager * 963n) / 100n);

      const context = sessionContext(wager, '0x01');
      const settled = await engine.read.onRandomness([
        context,
        randomnessForRoll(bonusBuy.missWeight),
      ]);
      assert.equal(settled.payout, (wager * 2n) / 1000n);
      assert.equal(settled.newGameState, toHex(1, { size: 4 }));
    });
  });

  describe('deploy-time validation', () => {
    const inBand: Tier[] = parseTierList('0,50\n1,40\n5,10');

    it('accepts a table exactly on the band ceiling', async () => {
      const onCeiling = compileConfiguration(parseTierList('0,51\n2,49'));
      assert.equal(onCeiling.stats.rtpWad, MAX_RTP_WAD);
      await deploy([onCeiling]);
    });

    it('rejects a table that pays 100% or more, whatever the band', async () => {
      const chunk = packChunks([
        { prizeUnits: 1n, weight: 50n, cumulativeWeight: 50n },
        { prizeUnits: 3n, weight: 50n, cumulativeWeight: 100n },
      ]);
      const [pointer] = await deployChunks(compileConfiguration(inBand), chunk);
      await viem.assertions.revertWithCustomErrorWithArgs(
        deployer.write.deployTitle([[{ prizeDenominator: 1, missWeight: 50n, chunks: [pointer] }]]),
        deployer,
        'SlotTitleDeployer__RtpNotBelowOne',
        [0n],
      );
      assert.throws(
        () => compileConfiguration(parseTierList('0,50\n1,50\n3,50')),
        /Display-seed counts are not odds/,
      );
    });

    it('rejects tables outside the council band', async () => {
      await viem.assertions.revertWithCustomError(
        rawDeployTitle(parseTierList('0,1\n1,99')),
        deployer,
        'SlotTitleDeployer__RtpOutsideBand',
      );
      await viem.assertions.revertWithCustomError(
        rawDeployTitle(parseTierList('0,60\n1,40')),
        deployer,
        'SlotTitleDeployer__RtpOutsideBand',
      );
    });

    it('rejects prizes that do not ascend and weights that do not increase', async () => {
      const descending = packChunks([
        { prizeUnits: 5n, weight: 10n, cumulativeWeight: 10n },
        { prizeUnits: 1n, weight: 40n, cumulativeWeight: 50n },
      ]);
      await viem.assertions.revertWithCustomErrorWithArgs(
        rawDeployTitle(inBand, descending),
        deployer,
        'SlotTitleDeployer__PrizesNotAscending',
        [0n, 1n],
      );
      const flatWeights = packChunks([
        { prizeUnits: 1n, weight: 40n, cumulativeWeight: 40n },
        { prizeUnits: 5n, weight: 0n, cumulativeWeight: 40n },
      ]);
      await viem.assertions.revertWithCustomErrorWithArgs(
        rawDeployTitle(inBand, flatWeights),
        deployer,
        'SlotTitleDeployer__WeightsNotIncreasing',
        [0n, 1n],
      );
      const zeroPrize = packChunks([{ prizeUnits: 0n, weight: 40n, cumulativeWeight: 40n }]);
      await viem.assertions.revertWithCustomError(
        rawDeployTitle(inBand, zeroPrize),
        deployer,
        'SlotTitleDeployer__PrizesNotAscending',
      );
    });

    it('rejects pointers that are not chunks, empty titles and malformed chunk bytes', async () => {
      await viem.assertions.revertWithCustomError(
        deployer.write.deployTitle([
          [{ prizeDenominator: 1, missWeight: 1n, chunks: [deployer.address] }],
        ]),
        deployer,
        'SlotTitleDeployer__NotAChunk',
      );
      await viem.assertions.revertWithCustomError(
        deployer.write.deployTitle([[]]),
        deployer,
        'SlotTitleDeployer__NoConfigurations',
      );
      await viem.assertions.revertWithCustomError(
        deployer.write.deployTitle([[{ prizeDenominator: 1, missWeight: 1n, chunks: [] }]]),
        deployer,
        'SlotTitleDeployer__EmptyTable',
      );
      await viem.assertions.revertWithCustomError(
        deployer.write.deployChunk(['0x0011223344']),
        deployer,
        'SlotTitleDeployer__InvalidChunkLength',
      );
    });
  });

  describe('RTP band', () => {
    it('is set by the council only and never reaches 100%', async () => {
      const fresh = await deploySlotTitleDeployer();
      await viem.assertions.revertWithCustomError(
        fresh.write.setRtpBand([MIN_RTP_WAD, MAX_RTP_WAD], { account: stranger.account }),
        fresh,
        'OwnableUnauthorizedAccount',
      );
      await viem.assertions.revertWithCustomError(
        fresh.write.setRtpBand([MIN_RTP_WAD, WAD]),
        fresh,
        'SlotTitleDeployer__InvalidRtpBand',
      );
      await viem.assertions.revertWithCustomError(
        fresh.write.setRtpBand([MAX_RTP_WAD, MIN_RTP_WAD]),
        fresh,
        'SlotTitleDeployer__InvalidRtpBand',
      );
      await fresh.write.setRtpBand([(90n * WAD) / 100n, (95n * WAD) / 100n]);
      assert.equal(await fresh.read.minRtpWad(), (90n * WAD) / 100n);
      assert.equal(await fresh.read.maxRtpWad(), (95n * WAD) / 100n);
    });
  });
});

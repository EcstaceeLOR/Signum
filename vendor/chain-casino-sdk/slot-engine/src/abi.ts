import { parseAbi } from 'viem';

const structs = [
  'struct SlotChunk { address pointer; uint32 endCumulativeWeight; uint16 tierCount; }',
  'struct SlotConfiguration { uint32 prizeDenominator; uint64 missWeight; uint64 totalWeight; uint32 topPrizeUnits; uint32 topPrizeWeight; uint128 prizeSum; uint128 bodyVarianceWad; SlotChunk[] chunks; }',
  'struct SlotConfigurationInput { uint32 prizeDenominator; uint64 missWeight; address[] chunks; }',
] as const;

export const slotTitleAbi = parseAbi([
  ...structs,
  'function betConfigurationCount() view returns (uint256)',
  'function betConfiguration(uint8 index) view returns (SlotConfiguration)',
  'function rtpWad(uint8 index) view returns (uint256)',
  'function titleRtpWad() view returns (uint256)',
  'function samplePrize(uint8 index, bytes32 randomness) view returns (uint32)',
  'error SlotEngine__NotATitle()',
  'error SlotEngine__InvalidGameData()',
  'error SlotEngine__UnknownBetConfiguration(uint256 index)',
  'error SlotEngine__NoPlayerActions()',
]);

export const slotTitleDeployerAbi = parseAbi([
  ...structs,
  'function engine() view returns (address)',
  'function minRtpWad() view returns (uint64)',
  'function maxRtpWad() view returns (uint64)',
  'function isTitle(address title) view returns (bool)',
  'function titleAuthor(address title) view returns (address)',
  'function setRtpBand(uint64 minRtpWad, uint64 maxRtpWad)',
  'function deployChunk(bytes tiers) returns (address pointer)',
  'function deployTitle(SlotConfigurationInput[] inputs) returns (address title)',
  'event ChunkDeployed(address indexed pointer, uint256 tierCount)',
  'event RtpBandUpdated(uint256 minRtpWad, uint256 maxRtpWad)',
  'event TitleDeployed(address indexed title, address indexed author, uint256 titleRtpWad, uint256[] configurationRtpWad)',
  'error SlotTitleDeployer__InvalidRtpBand(uint256 minRtpWad, uint256 maxRtpWad)',
  'error SlotTitleDeployer__InvalidChunkLength(uint256 length)',
  'error SlotTitleDeployer__ChunkDeployFailed()',
  'error SlotTitleDeployer__NoConfigurations()',
  'error SlotTitleDeployer__TooManyConfigurations(uint256 count)',
  'error SlotTitleDeployer__ZeroPrizeDenominator(uint256 configuration)',
  'error SlotTitleDeployer__EmptyTable(uint256 configuration)',
  'error SlotTitleDeployer__NotAChunk(address pointer)',
  'error SlotTitleDeployer__PrizesNotAscending(uint256 configuration, uint256 tier)',
  'error SlotTitleDeployer__WeightsNotIncreasing(uint256 configuration, uint256 tier)',
  'error SlotTitleDeployer__RtpNotBelowOne(uint256 configuration)',
  'error SlotTitleDeployer__RtpOutsideBand(uint256 configuration, uint256 rtpWad)',
]);

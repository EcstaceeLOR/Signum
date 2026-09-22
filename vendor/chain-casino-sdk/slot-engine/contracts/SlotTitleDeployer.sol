// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { Ownable } from '@openzeppelin/contracts/access/Ownable.sol';
import { Clones } from '@openzeppelin/contracts/proxy/Clones.sol';
import { Math } from '@openzeppelin/contracts/utils/math/Math.sol';
import { SafeCast } from '@openzeppelin/contracts/utils/math/SafeCast.sol';
import { SlotEngine } from './SlotEngine.sol';
import { SlotChunk, SlotConfiguration, SlotTitleArgs } from './SlotTitleArgs.sol';

struct SlotConfigurationInput {
  uint32 prizeDenominator;
  uint64 missWeight;
  address[] chunks;
}

/// @notice Permissionless deployer of slot titles. It derives every figure a title quotes from the
///         chunk bytes themselves, so a title created here cannot misstate its own table.
contract SlotTitleDeployer is Ownable {
  uint256 internal constant WAD = 1e18;
  uint256 internal constant TIER_BYTES = 8;
  uint256 internal constant MAX_CHUNK_BYTES = 24_568;
  uint256 internal constant CUMULATIVE_WEIGHT_MASK = type(uint32).max;

  address public immutable engine;
  uint64 public minRtpWad;
  uint64 public maxRtpWad;
  mapping(address title => address author) public titleAuthor;

  event ChunkDeployed(address indexed pointer, uint256 tierCount);
  event RtpBandUpdated(uint256 minRtpWad, uint256 maxRtpWad);
  event TitleDeployed(
    address indexed title,
    address indexed author,
    uint256 titleRtpWad,
    uint256[] configurationRtpWad
  );

  error SlotTitleDeployer__InvalidRtpBand(uint256 minRtpWad, uint256 maxRtpWad);
  error SlotTitleDeployer__InvalidChunkLength(uint256 length);
  error SlotTitleDeployer__ChunkDeployFailed();
  error SlotTitleDeployer__NoConfigurations();
  error SlotTitleDeployer__TooManyConfigurations(uint256 count);
  error SlotTitleDeployer__ZeroPrizeDenominator(uint256 configuration);
  error SlotTitleDeployer__EmptyTable(uint256 configuration);
  error SlotTitleDeployer__NotAChunk(address pointer);
  error SlotTitleDeployer__PrizesNotAscending(uint256 configuration, uint256 tier);
  error SlotTitleDeployer__WeightsNotIncreasing(uint256 configuration, uint256 tier);
  error SlotTitleDeployer__RtpNotBelowOne(uint256 configuration);
  error SlotTitleDeployer__RtpOutsideBand(uint256 configuration, uint256 rtpWad);

  struct TableWalk {
    uint256 previousPrizeUnits;
    uint256 previousCumulativeWeight;
    uint256 previousWeight;
    uint256 prizeSum;
    uint256 squaredPrizeSum;
    uint256 tierCount;
  }

  constructor(address owner_, uint64 minRtpWad_, uint64 maxRtpWad_) Ownable(owner_) {
    engine = address(new SlotEngine());
    _setRtpBand(minRtpWad_, maxRtpWad_);
  }

  function setRtpBand(uint64 minRtpWad_, uint64 maxRtpWad_) external onlyOwner {
    _setRtpBand(minRtpWad_, maxRtpWad_);
  }

  function isTitle(address title) external view returns (bool) {
    return titleAuthor[title] != address(0);
  }

  function deployChunk(bytes calldata tiers) external returns (address pointer) {
    if (tiers.length == 0 || tiers.length % TIER_BYTES != 0 || tiers.length > MAX_CHUNK_BYTES) {
      revert SlotTitleDeployer__InvalidChunkLength(tiers.length);
    }
    uint16 runtimeLength = uint16(tiers.length + 1);
    bytes memory initcode = abi.encodePacked(
      hex'61',
      runtimeLength,
      hex'600e60003961',
      runtimeLength,
      hex'6000f3',
      hex'00',
      tiers
    );
    assembly ("memory-safe") {
      pointer := create(0, add(initcode, 32), mload(initcode))
    }
    if (pointer == address(0)) revert SlotTitleDeployer__ChunkDeployFailed();
    emit ChunkDeployed(pointer, tiers.length / TIER_BYTES);
  }

  function deployTitle(SlotConfigurationInput[] calldata inputs) external returns (address title) {
    uint256 count = inputs.length;
    if (count == 0) revert SlotTitleDeployer__NoConfigurations();
    if (count > type(uint8).max) revert SlotTitleDeployer__TooManyConfigurations(count);

    SlotConfiguration[] memory configurations = new SlotConfiguration[](count);
    uint256[] memory configurationRtpWad = new uint256[](count);
    bytes memory buffer = new bytes(MAX_CHUNK_BYTES);
    for (uint256 i = 0; i < count; i++) {
      (configurations[i], configurationRtpWad[i]) = _deriveConfiguration(i, inputs[i], buffer);
    }

    title = Clones.cloneWithImmutableArgs(engine, SlotTitleArgs.encode(configurations));
    titleAuthor[title] = msg.sender;
    emit TitleDeployed(title, msg.sender, configurationRtpWad[0], configurationRtpWad);
  }

  function _setRtpBand(uint64 minRtpWad_, uint64 maxRtpWad_) private {
    if (minRtpWad_ > maxRtpWad_ || maxRtpWad_ >= WAD) {
      revert SlotTitleDeployer__InvalidRtpBand(minRtpWad_, maxRtpWad_);
    }
    minRtpWad = minRtpWad_;
    maxRtpWad = maxRtpWad_;
    emit RtpBandUpdated(minRtpWad_, maxRtpWad_);
  }

  function _deriveConfiguration(
    uint256 index,
    SlotConfigurationInput calldata input,
    bytes memory buffer
  ) private view returns (SlotConfiguration memory configuration, uint256 rtpWad) {
    if (input.prizeDenominator == 0) revert SlotTitleDeployer__ZeroPrizeDenominator(index);
    if (input.chunks.length == 0) revert SlotTitleDeployer__EmptyTable(index);

    TableWalk memory walk;
    configuration.chunks = new SlotChunk[](input.chunks.length);
    for (uint256 i = 0; i < input.chunks.length; i++) {
      uint256 tierCount = _walkChunk(index, input.chunks[i], buffer, walk);
      configuration.chunks[i] = SlotChunk({
        pointer: input.chunks[i],
        endCumulativeWeight: uint32(walk.previousCumulativeWeight),
        tierCount: uint16(tierCount)
      });
    }

    uint256 totalWeight = uint256(input.missWeight) + walk.previousCumulativeWeight;
    uint256 rtpDenominator = uint256(input.prizeDenominator) * totalWeight;
    if (walk.prizeSum >= rtpDenominator) revert SlotTitleDeployer__RtpNotBelowOne(index);
    if (
      walk.prizeSum * WAD < uint256(minRtpWad) * rtpDenominator ||
      walk.prizeSum * WAD > uint256(maxRtpWad) * rtpDenominator
    ) {
      revert SlotTitleDeployer__RtpOutsideBand(index, Math.mulDiv(walk.prizeSum, WAD, rtpDenominator));
    }
    rtpWad = Math.mulDiv(walk.prizeSum, WAD, rtpDenominator);

    configuration.prizeDenominator = input.prizeDenominator;
    configuration.missWeight = input.missWeight;
    configuration.totalWeight = SafeCast.toUint64(totalWeight);
    configuration.topPrizeUnits = uint32(walk.previousPrizeUnits);
    configuration.topPrizeWeight = uint32(walk.previousWeight);
    configuration.prizeSum = SafeCast.toUint128(walk.prizeSum);
    configuration.bodyVarianceWad = SafeCast.toUint128(
      _bodyVarianceWad(walk, totalWeight, input.prizeDenominator)
    );
  }

  function _walkChunk(
    uint256 configurationIndex,
    address pointer,
    bytes memory buffer,
    TableWalk memory walk
  ) private view returns (uint256 tierCount) {
    uint256 codeLength = pointer.code.length;
    if (
      codeLength < 1 + TIER_BYTES ||
      codeLength > 1 + MAX_CHUNK_BYTES ||
      (codeLength - 1) % TIER_BYTES != 0
    ) {
      revert SlotTitleDeployer__NotAChunk(pointer);
    }
    uint256 guardByte;
    assembly ("memory-safe") {
      extcodecopy(pointer, 0, 0, 1)
      guardByte := shr(248, mload(0))
      extcodecopy(pointer, add(buffer, 32), 1, sub(codeLength, 1))
    }
    if (guardByte != 0) revert SlotTitleDeployer__NotAChunk(pointer);

    tierCount = (codeLength - 1) / TIER_BYTES;
    uint256 previousPrizeUnits = walk.previousPrizeUnits;
    uint256 previousCumulativeWeight = walk.previousCumulativeWeight;
    uint256 previousWeight = walk.previousWeight;
    uint256 prizeSum = walk.prizeSum;
    uint256 squaredPrizeSum = walk.squaredPrizeSum;
    for (uint256 i = 0; i < tierCount; i++) {
      uint256 tier;
      assembly ("memory-safe") {
        tier := shr(192, mload(add(add(buffer, 32), mul(i, 8))))
      }
      uint256 prizeUnits = tier >> 32;
      uint256 cumulativeWeight = tier & CUMULATIVE_WEIGHT_MASK;
      if (prizeUnits <= previousPrizeUnits) {
        revert SlotTitleDeployer__PrizesNotAscending(configurationIndex, walk.tierCount + i);
      }
      if (cumulativeWeight <= previousCumulativeWeight) {
        revert SlotTitleDeployer__WeightsNotIncreasing(configurationIndex, walk.tierCount + i);
      }
      // 32-bit prizes and weights keep every term below 2^96, far from overflow.
      unchecked {
        previousWeight = cumulativeWeight - previousCumulativeWeight;
        prizeSum += prizeUnits * previousWeight;
        squaredPrizeSum += prizeUnits * prizeUnits * previousWeight;
      }
      previousPrizeUnits = prizeUnits;
      previousCumulativeWeight = cumulativeWeight;
    }
    walk.previousPrizeUnits = previousPrizeUnits;
    walk.previousCumulativeWeight = previousCumulativeWeight;
    walk.previousWeight = previousWeight;
    walk.prizeSum = prizeSum;
    walk.squaredPrizeSum = squaredPrizeSum;
    walk.tierCount += tierCount;
  }

  /// @dev Variance per unit wager of the payout with the top prize removed, rounded up:
  ///      (Σu²w · W − (Σuw)²) / (D² · W²) over every prize except the top one.
  function _bodyVarianceWad(
    TableWalk memory walk,
    uint256 totalWeight,
    uint256 prizeDenominator
  ) private pure returns (uint256) {
    uint256 topPrizeMass = walk.previousPrizeUnits * walk.previousWeight;
    uint256 bodyPrizeSum = walk.prizeSum - topPrizeMass;
    uint256 bodySquaredPrizeSum = walk.squaredPrizeSum - topPrizeMass * walk.previousPrizeUnits;
    uint256 numerator = bodySquaredPrizeSum * totalWeight - bodyPrizeSum * bodyPrizeSum;
    uint256 denominator = prizeDenominator * prizeDenominator * totalWeight * totalWeight;
    return Math.mulDiv(numerator, WAD, denominator, Math.Rounding.Ceil);
  }
}

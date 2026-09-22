// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { Clones } from '@openzeppelin/contracts/proxy/Clones.sol';
import { Math } from '@openzeppelin/contracts/utils/math/Math.sol';
import {
  ICasinoGameV2,
  SessionContext,
  SessionPhase,
  StepResult
} from '@chain/casino-sdk/contracts/ICasinoGameV2.sol';
import { SlotChunk, SlotConfiguration, SlotTitleArgs } from './SlotTitleArgs.sol';

/// @notice Shared sampler behind every slot title. A title is a clone of this contract whose
///         immutable arguments hold its bet configurations; the engine itself is not a game.
contract SlotEngine is ICasinoGameV2 {
  uint256 internal constant WAD = 1e18;
  uint256 internal constant CUMULATIVE_WEIGHT_MASK = type(uint32).max;

  address private immutable ENGINE = address(this);

  error SlotEngine__NotATitle();
  error SlotEngine__InvalidGameData();
  error SlotEngine__UnknownBetConfiguration(uint256 index);
  error SlotEngine__NoPlayerActions();

  function quoteCaps(
    uint256 wager,
    bytes calldata gameData
  ) external view returns (uint256 maxEscrowStake, uint256 maxReservedProfit) {
    SlotConfiguration memory configuration = _configuration(gameData);
    maxEscrowStake = wager;
    maxReservedProfit = _reservedProfit(configuration, wager);
  }

  function quoteRiskParams(
    uint256 wager,
    bytes calldata gameData
  )
    external
    view
    returns (
      uint256 maxPayout,
      uint256 probabilityWad,
      uint256 expectedPayout,
      uint256 bodyVarianceScaled
    )
  {
    SlotConfiguration memory configuration = _configuration(gameData);
    maxPayout = _payout(configuration, wager, configuration.topPrizeUnits);
    probabilityWad = Math.mulDiv(
      configuration.topPrizeWeight,
      WAD,
      configuration.totalWeight,
      Math.Rounding.Ceil
    );
    expectedPayout = Math.mulDiv(
      wager,
      configuration.prizeSum,
      uint256(configuration.prizeDenominator) * configuration.totalWeight
    );
    bodyVarianceScaled = wager * wager * configuration.bodyVarianceWad;
  }

  function onSessionStart(
    SessionContext calldata ctx
  ) external view returns (StepResult memory stepResult) {
    SlotConfiguration memory configuration = _configuration(ctx.gameData);
    stepResult.nextPhase = SessionPhase.WAITING_RANDOMNESS;
    stepResult.requestRandomnessNow = true;
    stepResult.reservedProfitDelta = int256(_reservedProfit(configuration, ctx.escrowedStake));
  }

  function onPlayerAction(
    SessionContext calldata,
    bytes calldata
  ) external pure returns (StepResult memory) {
    revert SlotEngine__NoPlayerActions();
  }

  function onRandomness(
    SessionContext calldata ctx,
    bytes32 randomness
  ) external view returns (StepResult memory stepResult) {
    SlotConfiguration memory configuration = _configuration(ctx.gameData);
    uint32 prizeUnits = _samplePrize(configuration, randomness);
    stepResult.newGameState = abi.encodePacked(prizeUnits);
    stepResult.nextPhase = SessionPhase.SETTLED;
    stepResult.payout = _payout(configuration, ctx.escrowedStake, prizeUnits);
  }

  function quoteForfeitPayout(SessionContext calldata) external pure returns (uint256) {
    return 0;
  }

  function betConfigurationCount() external view returns (uint256) {
    return SlotTitleArgs.configurationCount(_titleArgs());
  }

  function betConfiguration(uint8 index) external view returns (SlotConfiguration memory) {
    return _configurationAt(index);
  }

  function rtpWad(uint8 index) external view returns (uint256) {
    return _rtpWad(_configurationAt(index));
  }

  function titleRtpWad() external view returns (uint256) {
    return _rtpWad(_configurationAt(0));
  }

  function samplePrize(uint8 index, bytes32 randomness) external view returns (uint32 prizeUnits) {
    return _samplePrize(_configurationAt(index), randomness);
  }

  function _titleArgs() private view returns (bytes memory) {
    if (address(this) == ENGINE) revert SlotEngine__NotATitle();
    return Clones.fetchCloneArgs(address(this));
  }

  function _configuration(bytes calldata gameData) private view returns (SlotConfiguration memory) {
    if (gameData.length > 1) revert SlotEngine__InvalidGameData();
    return _configurationAt(gameData.length == 0 ? 0 : uint8(gameData[0]));
  }

  function _configurationAt(uint256 index) private view returns (SlotConfiguration memory) {
    bytes memory args = _titleArgs();
    if (index >= SlotTitleArgs.configurationCount(args)) {
      revert SlotEngine__UnknownBetConfiguration(index);
    }
    return SlotTitleArgs.decode(args, index);
  }

  function _rtpWad(SlotConfiguration memory configuration) private pure returns (uint256) {
    return
      Math.mulDiv(
        configuration.prizeSum,
        WAD,
        uint256(configuration.prizeDenominator) * configuration.totalWeight
      );
  }

  function _payout(
    SlotConfiguration memory configuration,
    uint256 wager,
    uint256 prizeUnits
  ) private pure returns (uint256) {
    return (wager * prizeUnits) / configuration.prizeDenominator;
  }

  function _reservedProfit(
    SlotConfiguration memory configuration,
    uint256 wager
  ) private pure returns (uint256) {
    uint256 maxPayout = _payout(configuration, wager, configuration.topPrizeUnits);
    return maxPayout > wager ? maxPayout - wager : 0;
  }

  function _samplePrize(
    SlotConfiguration memory configuration,
    bytes32 randomness
  ) private view returns (uint32) {
    uint256 roll = uint256(randomness) % configuration.totalWeight;
    if (roll < configuration.missWeight) return 0;
    uint256 target = roll - configuration.missWeight;

    uint256 chunkIndex = 0;
    while (target >= configuration.chunks[chunkIndex].endCumulativeWeight) {
      chunkIndex++;
    }
    SlotChunk memory chunk = configuration.chunks[chunkIndex];

    uint256 low = 0;
    uint256 high = uint256(chunk.tierCount) - 1;
    while (low < high) {
      uint256 middle = (low + high) >> 1;
      if ((_tier(chunk.pointer, middle) & CUMULATIVE_WEIGHT_MASK) > target) {
        high = middle;
      } else {
        low = middle + 1;
      }
    }
    return uint32(_tier(chunk.pointer, low) >> 32);
  }

  /// @dev Chunk code is one STOP byte followed by 8-byte tiers: uint32 prizeUnits ‖ uint32 cumulativeWeight.
  function _tier(address pointer, uint256 index) private view returns (uint256 tier) {
    assembly ("memory-safe") {
      extcodecopy(pointer, 0, add(1, mul(index, 8)), 8)
      tier := shr(192, mload(0))
    }
  }
}

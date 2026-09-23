// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {
  ICasinoGameV2,
  SessionContext,
  SessionPhase,
  StepResult
} from "../ICasinoGameV2.sol";

/// @dev Compile-only fixture proving a game can import and implement the canonical interface.
contract ICasinoGameV2ImportProbe is ICasinoGameV2 {
  function quoteCaps(
    uint256 wager,
    bytes calldata
  ) external pure override returns (uint256 maxEscrowStake, uint256 maxReservedProfit) {
    return (wager, 0);
  }

  function quoteRiskParams(
    uint256 wager,
    bytes calldata
  )
    external
    pure
    override
    returns (
      uint256 maxPayout,
      uint256 probabilityWad,
      uint256 expectedPayout,
      uint256 bodyVarianceScaled
    )
  {
    return (wager, 0, 0, 0);
  }

  function onSessionStart(
    SessionContext calldata ctx
  ) external pure override returns (StepResult memory) {
    return _settled(ctx.gameState);
  }

  function onPlayerAction(
    SessionContext calldata ctx,
    bytes calldata
  ) external pure override returns (StepResult memory) {
    return _settled(ctx.gameState);
  }

  function onRandomness(
    SessionContext calldata ctx,
    bytes32
  ) external pure override returns (StepResult memory) {
    return _settled(ctx.gameState);
  }

  function quoteForfeitPayout(
    SessionContext calldata
  ) external pure override returns (uint256 cashoutValue) {
    return 0;
  }

  function _settled(bytes calldata gameState) private pure returns (StepResult memory) {
    return StepResult({
      newGameState: gameState,
      escrowDelta: 0,
      reservedProfitDelta: 0,
      nextPhase: SessionPhase.SETTLED,
      requestRandomnessNow: false,
      payout: 0
    });
  }
}

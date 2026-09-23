// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {
  ICasinoGameV2,
  SessionContext,
  SessionPhase,
  StepResult
} from "./ICasinoGameV2.sol";
import { SignumGameData } from "./SignumGameData.sol";

/// @notice Chain casino game that settles a player-authored signal against a VRF echo.
contract SignumGame is ICasinoGameV2 {
  uint256 internal constant BASIS_POINTS = 10_000;
  uint8 internal constant OUTCOME_VERSION = 1;
  uint256 internal constant PULSE_MAX_PAYOUT_BPS = 74_000;
  uint256 internal constant CARRIER_MAX_PAYOUT_BPS = 215_000;
  uint256 internal constant DEEPWAVE_MAX_PAYOUT_BPS = 400_000;
  uint256 internal constant PULSE_TOP_PROBABILITY_WAD = 62_500_000_000_000_000;
  uint256 internal constant CARRIER_TOP_PROBABILITY_WAD = 15_625_000_000_000_000;
  uint256 internal constant DEEPWAVE_TOP_PROBABILITY_WAD = 3_906_250_000_000_000;
  uint256 internal constant PULSE_BODY_VARIANCE_WAD = 300_000_000_000_000_000;
  uint256 internal constant CARRIER_BODY_VARIANCE_WAD = 1_004_687_500_000_000_000;
  uint256 internal constant DEEPWAVE_BODY_VARIANCE_WAD = 1_886_853_027_343_750_000;

  error SignumGame__NoPlayerActions();
  error SignumGame__InvalidLifecycleStep(uint32 expected, uint32 actual);
  error SignumGame__UnexpectedGameStateLength(uint256 expected, uint256 actual);
  error SignumGame__UnexpectedReservedProfit(uint256 expected, uint256 actual);
  error SignumGame__EscrowDoesNotMatchWager(uint256 wagerBase, uint256 escrowedStake);
  error SignumGame__DeltaOverflow(uint256 value);

  function quoteCaps(
    uint256 wager,
    bytes calldata gameData
  ) external pure override returns (uint256 maxEscrowStake, uint256 maxReservedProfit) {
    SignumGameData.Decoded memory decoded = SignumGameData.decode(gameData);
    maxEscrowStake = wager;
    maxReservedProfit = _reservedProfit(wager, _maximumPayoutBps(decoded.mode));
  }

  function quoteRiskParams(
    uint256 wager,
    bytes calldata gameData
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
    SignumGameData.Decoded memory decoded = SignumGameData.decode(gameData);
    (
      uint256 maxPayoutBps,
      uint256 rtpNumerator,
      uint256 rtpDenominator,
      uint256 bodyVarianceWad,
      uint256 topProbabilityWad
    ) = _riskConfiguration(decoded.mode);

    maxPayout = _multiplyByBasisPoints(wager, maxPayoutBps);
    probabilityWad = topProbabilityWad;
    expectedPayout = _multiplyRatio(wager, rtpNumerator, rtpDenominator);
    bodyVarianceScaled = wager * wager * bodyVarianceWad;
  }

  function onSessionStart(
    SessionContext calldata ctx
  ) external pure override returns (StepResult memory stepResult) {
    _requireStep(ctx.step, 0);
    _requireGameStateLength(ctx.gameState, 0);
    _requireEscrowMatchesWager(ctx);
    if (ctx.reservedProfit != 0) {
      revert SignumGame__UnexpectedReservedProfit(0, ctx.reservedProfit);
    }

    SignumGameData.Decoded memory decoded = SignumGameData.decode(ctx.gameData);
    uint256 reservedProfit = _reservedProfit(
      ctx.escrowedStake,
      _maximumPayoutBps(decoded.mode)
    );
    if (reservedProfit > uint256(type(int256).max)) {
      revert SignumGame__DeltaOverflow(reservedProfit);
    }

    stepResult.newGameState = ctx.gameData;
    stepResult.reservedProfitDelta = int256(reservedProfit);
    stepResult.nextPhase = SessionPhase.WAITING_RANDOMNESS;
    stepResult.requestRandomnessNow = true;
  }

  function onPlayerAction(
    SessionContext calldata,
    bytes calldata
  ) external pure override returns (StepResult memory) {
    revert SignumGame__NoPlayerActions();
  }

  function onRandomness(
    SessionContext calldata ctx,
    bytes32 randomness
  ) external pure override returns (StepResult memory stepResult) {
    _requireStep(ctx.step, 1);
    _requireGameStateLength(ctx.gameState, 4);
    _requireEscrowMatchesWager(ctx);

    SignumGameData.Decoded memory decoded = SignumGameData.decode(ctx.gameState);
    uint256 expectedReservedProfit = _reservedProfit(
      ctx.escrowedStake,
      _maximumPayoutBps(decoded.mode)
    );
    if (ctx.reservedProfit != expectedReservedProfit) {
      revert SignumGame__UnexpectedReservedProfit(expectedReservedProfit, ctx.reservedProfit);
    }

    uint8 mask = uint8((uint16(1) << decoded.signalLength) - 1);
    uint8 ghostSignal = uint8(uint256(randomness)) & mask;
    uint8 mismatchCount = _popcount((decoded.playerSignal ^ ghostSignal) & mask);
    uint8 matchCount = decoded.signalLength - mismatchCount;
    (uint256 payoutBps, uint8 payoutTier) = _payoutTier(decoded.mode, matchCount);

    stepResult.newGameState = abi.encodePacked(
      OUTCOME_VERSION,
      uint8(decoded.mode),
      decoded.playerSignal,
      ghostSignal,
      matchCount,
      payoutTier
    );
    stepResult.nextPhase = SessionPhase.SETTLED;
    stepResult.payout = _multiplyByBasisPoints(ctx.escrowedStake, payoutBps);
  }

  function quoteForfeitPayout(
    SessionContext calldata
  ) external pure override returns (uint256 cashoutValue) {
    return 0;
  }

  function _maximumPayoutBps(
    SignumGameData.ReceiverMode mode
  ) private pure returns (uint256) {
    if (mode == SignumGameData.ReceiverMode.PULSE) return PULSE_MAX_PAYOUT_BPS;
    if (mode == SignumGameData.ReceiverMode.CARRIER) return CARRIER_MAX_PAYOUT_BPS;
    return DEEPWAVE_MAX_PAYOUT_BPS;
  }

  function _payoutTier(
    SignumGameData.ReceiverMode mode,
    uint8 matchCount
  ) private pure returns (uint256 payoutBps, uint8 payoutTier) {
    if (mode == SignumGameData.ReceiverMode.PULSE) {
      if (matchCount < 2) return (0, 0);
      if (matchCount == 2) return (4_000, 1);
      if (matchCount == 3) return (14_000, 2);
      return (PULSE_MAX_PAYOUT_BPS, 3);
    }

    if (mode == SignumGameData.ReceiverMode.CARRIER) {
      if (matchCount < 3) return (0, 0);
      if (matchCount == 3) return (2_000, 1);
      if (matchCount == 4) return (10_000, 2);
      if (matchCount == 5) return (35_000, 3);
      return (CARRIER_MAX_PAYOUT_BPS, 4);
    }

    if (matchCount < 4) return (0, 0);
    if (matchCount == 4) return (2_000, 1);
    if (matchCount == 5) return (10_000, 2);
    if (matchCount == 6) return (30_000, 3);
    if (matchCount == 7) return (65_000, 4);
    return (DEEPWAVE_MAX_PAYOUT_BPS, 5);
  }

  function _riskConfiguration(
    SignumGameData.ReceiverMode mode
  )
    private
    pure
    returns (
      uint256 maxPayoutBps,
      uint256 rtpNumerator,
      uint256 rtpDenominator,
      uint256 bodyVarianceWad,
      uint256 topProbabilityWad
    )
  {
    if (mode == SignumGameData.ReceiverMode.PULSE) {
      return (
        PULSE_MAX_PAYOUT_BPS,
        77,
        80,
        PULSE_BODY_VARIANCE_WAD,
        PULSE_TOP_PROBABILITY_WAD
      );
    }
    if (mode == SignumGameData.ReceiverMode.CARRIER) {
      return (
        CARRIER_MAX_PAYOUT_BPS,
        123,
        128,
        CARRIER_BODY_VARIANCE_WAD,
        CARRIER_TOP_PROBABILITY_WAD
      );
    }
    return (
      DEEPWAVE_MAX_PAYOUT_BPS,
      123,
      128,
      DEEPWAVE_BODY_VARIANCE_WAD,
      DEEPWAVE_TOP_PROBABILITY_WAD
    );
  }

  function _reservedProfit(uint256 wager, uint256 maxPayoutBps) private pure returns (uint256) {
    uint256 maxPayout = _multiplyByBasisPoints(wager, maxPayoutBps);
    return maxPayout > wager ? maxPayout - wager : 0;
  }

  /// @dev Equivalent to floor(value * multiplierBps / 10_000) without overflowing the
  ///      intermediate product when the final result fits in uint256.
  function _multiplyByBasisPoints(
    uint256 value,
    uint256 multiplierBps
  ) private pure returns (uint256) {
    return
      (value / BASIS_POINTS) * multiplierBps +
      ((value % BASIS_POINTS) * multiplierBps) /
      BASIS_POINTS;
  }

  function _multiplyRatio(
    uint256 value,
    uint256 numerator,
    uint256 denominator
  ) private pure returns (uint256) {
    return
      (value / denominator) * numerator +
      ((value % denominator) * numerator) /
      denominator;
  }

  function _popcount(uint8 value) private pure returns (uint8 count) {
    while (value != 0) {
      value &= value - 1;
      count++;
    }
  }

  function _requireStep(uint32 actual, uint32 expected) private pure {
    if (actual != expected) revert SignumGame__InvalidLifecycleStep(expected, actual);
  }

  function _requireGameStateLength(bytes calldata gameState, uint256 expected) private pure {
    if (gameState.length != expected) {
      revert SignumGame__UnexpectedGameStateLength(expected, gameState.length);
    }
  }

  function _requireEscrowMatchesWager(SessionContext calldata ctx) private pure {
    if (ctx.escrowedStake != ctx.wagerBase) {
      revert SignumGame__EscrowDoesNotMatchWager(ctx.wagerBase, ctx.escrowedStake);
    }
  }
}

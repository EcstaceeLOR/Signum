// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { SignumGame } from "../SignumGame.sol";
import { SignumGameData } from "../SignumGameData.sol";

/// @dev Exhaustive, gas-bounded assertions over SignumGame's production outcome resolver.
contract SignumGameOutcomeHarness is SignumGame {
  error InvalidPlayerRange(uint16 startPlayer, uint16 endPlayer, uint16 signalCount);

  function assertExhaustiveRange(
    uint8 rawMode,
    uint16 startPlayer,
    uint16 endPlayer
  ) external pure returns (uint256 checked) {
    uint8 signalLength = SignumGameData.signalLength(rawMode);
    uint16 signalCount = uint16(1) << signalLength;
    if (startPlayer >= endPlayer || endPlayer > signalCount) {
      revert InvalidPlayerRange(startPlayer, endPlayer, signalCount);
    }

    uint256[9] memory distribution;
    SignumGameData.ReceiverMode mode = SignumGameData.ReceiverMode(rawMode);

    for (uint16 playerSignal = startPlayer; playerSignal < endPlayer; playerSignal++) {
      for (uint16 ghostSignal = 0; ghostSignal < signalCount; ghostSignal++) {
        (
          uint8 resolvedGhost,
          uint8 matchCount,
          uint256 payoutBps,
          uint8 payoutTier
        ) = _resolveOutcome(
            mode,
            signalLength,
            uint8(playerSignal),
            bytes32(uint256(ghostSignal))
          );

        uint8 expectedMatches = _referenceMatchCount(
          signalLength,
          uint8(playerSignal),
          uint8(ghostSignal)
        );
        (uint256 expectedPayoutBps, uint8 expectedTier) = _referenceTier(
          rawMode,
          expectedMatches
        );

        assert(resolvedGhost == uint8(ghostSignal));
        assert(matchCount == expectedMatches);
        assert(payoutBps == expectedPayoutBps);
        assert(payoutTier == expectedTier);
        distribution[matchCount]++;
        checked++;
      }
    }

    uint256 playersChecked = endPlayer - startPlayer;
    for (uint8 matches = 0; matches <= signalLength; matches++) {
      assert(distribution[matches] == playersChecked * _binomial(signalLength, matches));
    }
  }

  function _referenceMatchCount(
    uint8 signalLength,
    uint8 playerSignal,
    uint8 ghostSignal
  ) private pure returns (uint8 matches) {
    for (uint8 index = 0; index < signalLength; index++) {
      if (((playerSignal >> index) & 1) == ((ghostSignal >> index) & 1)) {
        matches++;
      }
    }
  }

  function _referenceTier(
    uint8 mode,
    uint8 matches
  ) private pure returns (uint256 payoutBps, uint8 payoutTier) {
    if (mode == 0) {
      if (matches < 2) return (0, 0);
      if (matches == 2) return (4_000, 1);
      if (matches == 3) return (14_000, 2);
      return (74_000, 3);
    }
    if (mode == 1) {
      if (matches < 3) return (0, 0);
      if (matches == 3) return (2_000, 1);
      if (matches == 4) return (10_000, 2);
      if (matches == 5) return (35_000, 3);
      return (215_000, 4);
    }
    if (matches < 4) return (0, 0);
    if (matches == 4) return (2_000, 1);
    if (matches == 5) return (10_000, 2);
    if (matches == 6) return (30_000, 3);
    if (matches == 7) return (65_000, 4);
    return (400_000, 5);
  }

  function _binomial(uint8 n, uint8 k) private pure returns (uint256 result) {
    if (k > n) return 0;
    if (k > n - k) k = n - k;
    result = 1;
    for (uint8 index = 1; index <= k; index++) {
      result = (result * (n - k + index)) / index;
    }
  }
}

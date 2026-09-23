// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { SignumGameData } from "../SignumGameData.sol";

/// @dev Runtime harness used to prove the Solidity codec against shared fixtures.
contract SignumGameDataHarness {
  function decode(
    bytes calldata gameData
  )
    external
    pure
    returns (uint8 version, uint8 mode, uint8 signalLength, uint8 playerSignal, uint8 flags)
  {
    SignumGameData.Decoded memory decoded = SignumGameData.decode(gameData);
    return (
      decoded.version,
      uint8(decoded.mode),
      decoded.signalLength,
      decoded.playerSignal,
      decoded.flags
    );
  }

  function encode(uint8 mode, uint8 playerSignal) external pure returns (bytes memory) {
    return SignumGameData.encode(mode, playerSignal);
  }

  /// @notice Models the validation gate that settlement entry points must cross.
  function settlementGuard(bytes calldata gameData) external pure returns (bool) {
    SignumGameData.decode(gameData);
    return true;
  }

  /// @notice Proves every valid v1 signal survives a Solidity encode/decode round trip.
  function assertAllRoundTrips() external pure returns (uint256 checked) {
    for (uint8 mode = 0; mode < 3; mode++) {
      uint8 length = SignumGameData.signalLength(mode);
      uint16 signalCount = uint16(1) << length;

      for (uint16 signal = 0; signal < signalCount; signal++) {
        bytes memory encoded = SignumGameData.encode(mode, uint8(signal));
        SignumGameData.Decoded memory decoded = SignumGameData.decode(encoded);

        assert(decoded.version == 1);
        assert(uint8(decoded.mode) == mode);
        assert(decoded.signalLength == length);
        assert(decoded.playerSignal == uint8(signal));
        assert(decoded.flags == 0);
        checked++;
      }
    }
  }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Versioned codec for the game data committed when a Signum session opens.
library SignumGameData {
  uint8 internal constant VERSION = 1;
  uint256 internal constant ENCODED_LENGTH = 4;

  enum ReceiverMode {
    PULSE,
    CARRIER,
    DEEPWAVE
  }

  struct Decoded {
    uint8 version;
    ReceiverMode mode;
    uint8 signalLength;
    uint8 playerSignal;
    uint8 flags;
  }

  error InvalidGameDataLength(uint256 actualLength);
  error UnsupportedGameDataVersion(uint8 version);
  error UnsupportedReceiverMode(uint8 mode);
  error NonZeroGameDataFlags(uint8 flags);
  error SignalBitsOutOfRange(uint8 playerSignal, uint8 signalLength);

  function decode(bytes memory gameData) internal pure returns (Decoded memory decoded) {
    if (gameData.length != ENCODED_LENGTH) {
      revert InvalidGameDataLength(gameData.length);
    }

    uint8 version = uint8(gameData[0]);
    if (version != VERSION) revert UnsupportedGameDataVersion(version);

    uint8 rawMode = uint8(gameData[1]);
    uint8 length = signalLength(rawMode);
    uint8 playerSignal = uint8(gameData[2]);
    uint8 flags = uint8(gameData[3]);

    if (flags != 0) revert NonZeroGameDataFlags(flags);
    _validateSignal(playerSignal, length);

    decoded = Decoded({
      version: version,
      mode: ReceiverMode(rawMode),
      signalLength: length,
      playerSignal: playerSignal,
      flags: flags
    });
  }

  function encode(uint8 rawMode, uint8 playerSignal) internal pure returns (bytes memory) {
    uint8 length = signalLength(rawMode);
    _validateSignal(playerSignal, length);
    return abi.encodePacked(VERSION, rawMode, playerSignal, uint8(0));
  }

  function signalLength(uint8 rawMode) internal pure returns (uint8) {
    if (rawMode == uint8(ReceiverMode.PULSE)) return 4;
    if (rawMode == uint8(ReceiverMode.CARRIER)) return 6;
    if (rawMode == uint8(ReceiverMode.DEEPWAVE)) return 8;
    revert UnsupportedReceiverMode(rawMode);
  }

  function _validateSignal(uint8 playerSignal, uint8 length) private pure {
    if (uint16(playerSignal) >= (uint16(1) << length)) {
      revert SignalBitsOutOfRange(playerSignal, length);
    }
  }
}

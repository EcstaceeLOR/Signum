// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

struct SlotChunk {
  address pointer;
  uint32 endCumulativeWeight;
  uint16 tierCount;
}

struct SlotConfiguration {
  uint32 prizeDenominator;
  uint64 missWeight;
  uint64 totalWeight;
  uint32 topPrizeUnits;
  uint32 topPrizeWeight;
  uint128 prizeSum;
  uint128 bodyVarianceWad;
  SlotChunk[] chunks;
}

/// @notice Packed layout of a slot title's immutable arguments:
///         uint8 configurationCount ‖ uint16[configurationCount] recordOffset ‖ records.
///         Record: uint32 prizeDenominator ‖ uint64 missWeight ‖ uint64 totalWeight ‖
///         uint32 topPrizeUnits ‖ uint32 topPrizeWeight ‖ uint128 prizeSum ‖ uint128 bodyVarianceWad ‖
///         uint8 chunkCount ‖ chunkCount × (address pointer ‖ uint32 endCumulativeWeight ‖ uint16 tierCount).
library SlotTitleArgs {
  uint256 internal constant RECORD_HEAD_BYTES = 61;
  uint256 internal constant CHUNK_BYTES = 26;

  error SlotTitleArgs__OutOfBounds();
  error SlotTitleArgs__TooLarge();

  function encode(SlotConfiguration[] memory configurations) internal pure returns (bytes memory args) {
    uint256 count = configurations.length;
    bytes memory offsets;
    bytes memory records;
    uint256 recordsStart = 1 + count * 2;
    for (uint256 i = 0; i < count; i++) {
      uint256 recordOffset = recordsStart + records.length;
      if (recordOffset > type(uint16).max) revert SlotTitleArgs__TooLarge();
      offsets = bytes.concat(offsets, bytes2(uint16(recordOffset)));
      records = bytes.concat(records, _encodeRecord(configurations[i]));
    }
    args = bytes.concat(bytes1(uint8(count)), offsets, records);
  }

  function configurationCount(bytes memory args) internal pure returns (uint256) {
    return _read(args, 0, 1);
  }

  function decode(bytes memory args, uint256 index) internal pure returns (SlotConfiguration memory configuration) {
    uint256 record = _read(args, 1 + index * 2, 2);
    configuration.prizeDenominator = uint32(_read(args, record, 4));
    configuration.missWeight = uint64(_read(args, record + 4, 8));
    configuration.totalWeight = uint64(_read(args, record + 12, 8));
    configuration.topPrizeUnits = uint32(_read(args, record + 20, 4));
    configuration.topPrizeWeight = uint32(_read(args, record + 24, 4));
    configuration.prizeSum = uint128(_read(args, record + 28, 16));
    configuration.bodyVarianceWad = uint128(_read(args, record + 44, 16));
    uint256 chunkCount = _read(args, record + 60, 1);
    configuration.chunks = new SlotChunk[](chunkCount);
    for (uint256 i = 0; i < chunkCount; i++) {
      uint256 chunk = record + RECORD_HEAD_BYTES + i * CHUNK_BYTES;
      configuration.chunks[i] = SlotChunk({
        pointer: address(uint160(_read(args, chunk, 20))),
        endCumulativeWeight: uint32(_read(args, chunk + 20, 4)),
        tierCount: uint16(_read(args, chunk + 24, 2))
      });
    }
  }

  function _encodeRecord(SlotConfiguration memory configuration) private pure returns (bytes memory record) {
    if (configuration.chunks.length > type(uint8).max) revert SlotTitleArgs__TooLarge();
    record = abi.encodePacked(
      configuration.prizeDenominator,
      configuration.missWeight,
      configuration.totalWeight,
      configuration.topPrizeUnits,
      configuration.topPrizeWeight,
      configuration.prizeSum,
      configuration.bodyVarianceWad,
      uint8(configuration.chunks.length)
    );
    for (uint256 i = 0; i < configuration.chunks.length; i++) {
      SlotChunk memory chunk = configuration.chunks[i];
      record = bytes.concat(
        record,
        abi.encodePacked(chunk.pointer, chunk.endCumulativeWeight, chunk.tierCount)
      );
    }
  }

  function _read(bytes memory data, uint256 offset, uint256 size) private pure returns (uint256 value) {
    if (offset + size > data.length) revert SlotTitleArgs__OutOfBounds();
    assembly ("memory-safe") {
      value := shr(sub(256, mul(size, 8)), mload(add(add(data, 32), offset)))
    }
  }
}

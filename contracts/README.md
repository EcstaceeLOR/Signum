# Canonical Chain contract boundary

`ICasinoGameV2.sol` is an exact, line-for-line copy of the host interface bundled with Chain's casino SDK. Keep provenance outside the Solidity file so the canonical copy remains directly comparable with upstream.

## Source

- SDK package: `@chain/casino-sdk` `0.4.0`
- Bundled changelog release: `2026.09.18-1`
- Repository source: `vendor/chain-casino-sdk/simulator/contracts/ICasinoGameV2.sol`
- Normalized interface SHA-256: `0994930bd09720f2430a968ae26934c5dd4bbf9e617462e8d15b13973f9752a4`
- Distribution archive: `https://sdk.chain.wtf/sdk/casino-sdk.zip`
- Archive SHA-256 at import: `b6504291c667cb315ddd288d76beb3ebbfe3a801cfaea38ba11247f4eee938c4`
- Imported into Signum's contract boundary: `2026-09-23`
- Upstream commit: not supplied in the distributed SDK archive

The executable drift check compares normalized source text against the vendored SDK copy before compiling. A line-ending difference is ignored; any semantic or comment difference fails.

## Compiler contract

Signum uses the same settings as the SDK simulator:

- Solidity `0.8.30`
- optimizer enabled with `200` runs
- `viaIR: true`

Run the boundary check from the repository root:

```sh
npm run contracts:check
```

The command verifies canonical-source equality and compiles both the interface and `test/ICasinoGameV2ImportProbe.sol`. The probe implements every host method, proving a future `SignumGame` can import the declarations without a custom ABI.

## Signum game-data v1

`SignumGameData.sol` is the shared contract boundary for the four-byte player payload frozen in the product specification:

| Byte | Field         | v1 rule                                                   |
| ---: | ------------- | --------------------------------------------------------- |
|    0 | version       | `0x01`                                                    |
|    1 | receiver mode | Pulse `0x00`, Carrier `0x01`, Deepwave `0x02`             |
|    2 | player signal | left-most beat in bit zero; unused high bits must be zero |
|    3 | flags         | reserved and zero in v1                                   |

Receiver mode determines the only valid signal length: 4, 6, or 8 beats. Keeping length derived rather than independently encoded prevents contradictory mode/length payloads. The matching TypeScript implementation lives in `src/game/encoding.ts`, and both implementations consume `fixtures/game-data-v1.json` during the quality gate.

`npm run contracts:check` compiles the codec and deploys its harness to an in-memory Hardhat network. It executes the shared vectors, proves every one of the 336 valid mode/signal combinations round-trips, and verifies malformed values cannot cross the settlement validation guard.

## SDK migration path

When Chain publishes a new SDK:

1. Follow the archive replacement and checksum process in `docs/CHAIN_SDK_INTEGRATION.md`.
2. Compare the new simulator interface with `contracts/ICasinoGameV2.sol`.
3. If it changed, replace this file with the new canonical file; do not hand-merge declarations.
4. Update the source metadata above and adapt `SignumGame`, fixtures, and bridge decoding in the same pull request.
5. Run `npm run contracts:check`, `npm run simulator:check`, and the simulator lifecycle tests before deployment.

Never edit only the local interface to make Signum compile. The Chain host's canonical interface controls.

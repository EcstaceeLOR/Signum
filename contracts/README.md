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

## SDK migration path

When Chain publishes a new SDK:

1. Follow the archive replacement and checksum process in `docs/CHAIN_SDK_INTEGRATION.md`.
2. Compare the new simulator interface with `contracts/ICasinoGameV2.sol`.
3. If it changed, replace this file with the new canonical file; do not hand-merge declarations.
4. Update the source metadata above and adapt `SignumGame`, fixtures, and bridge decoding in the same pull request.
5. Run `npm run contracts:check`, `npm run simulator:check`, and the simulator lifecycle tests before deployment.

Never edit only the local interface to make Signum compile. The Chain host's canonical interface controls.

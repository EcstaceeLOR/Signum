# Signum security model

## Trust boundaries

- The Chain host is the only wallet and transaction boundary. The Signum iframe never requests a
  private key, mnemonic, signature, or direct wallet provider.
- The contract settles from the `gameData`, wager, escrow, lifecycle step, and VRF word committed in
  the on-chain session. Receiver cards, draft React state, animations, sound, URL parameters, CSS
  attributes, and fairness-panel text cannot alter settlement.
- `gameData` is exactly four bytes in v1. Solidity validates its version, receiver mode, zero flags,
  and receiver-specific signal range before quoting risk or opening a round. Oversized, truncated,
  unsupported, and out-of-range payloads revert.
- The frontend treats every host snapshot as untrusted input. It disables wagering when token or
  risk metadata is absent or malformed, rejects values outside EVM `uint256`, and displays a result
  only after the settled state, payout, commitment, and canonical paytable agree.
- Chain's Verify Network supplies randomness. The optional host verification API checks its ECVRF
  proof and enclave signature against on-chain artifacts in the browser. An unavailable check is
  shown as unavailable, never as a successful verdict.

## Wager boundaries

The product minimum is one whole host token. The maximum comes from the latest host risk limits and
the selected receiver's frozen maximum multiplier. Exact minimum and maximum values are accepted;
zero, fractional precision beyond the token, balances or inputs outside `uint256`, values above the
live limit, and unfunded wagers are rejected before `openSession` is called. The casino contract is
still authoritative and may reject a transaction if state changes between quote and inclusion.

Solidity uses checked arithmetic. The contract test gate covers zero and boundary wagers, verifies
the largest wager whose maximum payout fits in `uint256`, and requires larger values to revert
without mutating a session.

## Automated abuse checks

`npm run contracts:check` compiles the canonical Chain interface and Signum contracts, then executes
shared vectors, every valid signal, deterministic malformed-input fuzz cases, all unsupported
version bytes, a 4 KiB calldata rejection, wager-overflow boundaries, lifecycle invariants, and all
69,888 player/ghost combinations in an in-memory EVM.

`npm run security:dependencies` audits production dependencies in both the application and vendored
Chain SDK lockfiles. Dependabot monitors both npm manifests and GitHub Actions weekly.

`npm run security:secrets` scans tracked text and, after a production build, the emitted bundle for
high-confidence credentials. Frontend paths receive stricter checks for 32-byte private values and
secret-bearing `VITE_*` variables. No non-example `.env` file may be tracked. The simulator includes
publicly known local-development accounts; they are test-only and must never be funded or reused on
another network.

## Operational assumptions

- Serve the immutable production build over HTTPS and embed only the expected Signum origin.
- Configure `VITE_BLOCK_EXPLORER_URL` with public explorer metadata only. Vite variables are public
  by design and must never contain credentials.
- Keep the Chain SDK snapshot, canonical interface hash, lockfiles, and deployed contract source in
  sync. Run all CI gates before deployment.
- Treat unexpected settlement-decoding errors, failed VRF checks, and repeated host rejections as
  security signals. Preserve transaction/session identifiers, but do not log wallet secrets or raw
  bridge payloads.

Report a suspected vulnerability privately to the repository owner before opening a public issue.
Include reproduction steps, affected commit, session or transaction identifiers when relevant, and
avoid including private keys or personal data.

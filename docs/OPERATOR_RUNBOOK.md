# Signum operator runbook

This runbook is the release and recovery path for the Signum guest, Chain contract, and submission URL. It contains no signing secret. Contract deployment must use an operator-controlled signer outside the guest application.

## Release inventory

| Item                     | Canonical location        | Current value                                                           |
| ------------------------ | ------------------------- | ----------------------------------------------------------------------- |
| Guest source             | `main` in this repository | <https://github.com/EcstaceeLOR/Signum>                                 |
| Production guest         | GitHub Pages              | <https://ecstaceelor.github.io/Signum/>                                 |
| Manifest                 | Same origin as guest      | <https://ecstaceelor.github.io/Signum/game.manifest.json>               |
| Local game address       | Simulator-generated       | `vendor/chain-casino-sdk/simulator/local-node/deployed.json` at runtime |
| Production game address  | Chain deployment          | **Not deployed—record before enabling real wagering**                   |
| Contract source          | Repository                | `contracts/SignumGame.sol`                                              |
| Canonical host interface | Repository                | `contracts/ICasinoGameV2.sol`                                           |

Never substitute a demo address or local Hardhat address in submission material.

## Release procedure

1. Use the Node version selected by `.nvmrc`, then install exact lockfile dependencies with `npm ci`.
2. Run `npm run ci` and `npm run test:e2e:simulator`.
3. Confirm the paytables and RTP in `docs/PRODUCT_SPEC.md` match the contract, UI, fixtures, and submission copy.
4. Deploy `contracts/SignumGame.sol` through the Chain-approved casino deployment process. The contract has no constructor arguments.
5. Record the target network, contract address, deployment transaction, compiler `0.8.30`, optimizer `200`, and `viaIR: true` below and in `docs/SUBMISSION_CHECKLIST.md`.
6. Register the game address with Chain and test one minimum-wager Pulse round plus one cancellation/recovery path.
7. Merge the release commit to `main`. The Pages workflow uploads the already-built `dist` directory and deploys that exact artifact.
8. Wait for the `github-pages` environment to report success, then run:

   ```bash
   npm run deployment:check -- https://ecstaceelor.github.io/Signum/
   ```

9. Load the production URL standalone and in the Chain host iframe. Confirm the manifest, Jam widget, host-ready state, wager limits, settlement, fairness proof, and explorer links.
10. Put the tested guest URL, exact commit SHA, game address, and RTP table into the DoraHacks submission.

## Production deployment record

Complete this table in the release PR; do not rely on chat history.

| Field                    | Value                                      |
| ------------------------ | ------------------------------------------ |
| Chain network / chain ID | Pending production deployment              |
| `SignumGame` address     | Pending production deployment              |
| Deployment transaction   | Pending production deployment              |
| Registered game ID       | `signum`                                   |
| Guest commit SHA         | `e5a02d5f8fcef1efe69d262191933cfd5250257a` |
| Pages workflow run       | `36082185638`                              |
| Verified at (UTC)        | 2026-09-25                                 |

## Fairness verification

The declared math is reproducible without trusting the UI:

- `docs/PRODUCT_SPEC.md` derives all three binomial paytables and RTP values.
- `fixtures/game-data-v1.json` and `fixtures/outcome-v1.json` are shared cross-layer golden vectors.
- `npm run contracts:check` compiles the canonical interface and exhaustively verifies all 69,888 player/ghost outcomes.
- `npm test` checks the TypeScript encoding, payout reconstruction, session state, bridge behavior, and fairness presentation.
- `npm run test:e2e:simulator` runs a real local VRF settlement and delayed-randomness cancellation through the Chain iframe bridge.

The player pattern cannot affect probability: each ghost bit is independently derived from the VRF word, so every position matches with probability `1/2` and every pattern has identical odds.

## Troubleshooting

### Chain host stays connecting

- Confirm the guest is inside the Chain simulator/host iframe. Standalone mode intentionally uses the local demo host.
- Confirm the game URL and game address are both supplied to the simulator.
- Check browser console output for Penpal origin or handshake failures and verify the guest URL uses HTTPS in production.
- Do not add direct wallet access as a workaround; wallet and signing remain host-owned.

### Wallet ready but wagering disabled

- Inspect the host snapshot for wallet status, token symbol/decimals, Smart Vault balance, casino max bet, and risk reserve.
- Confirm the selected receiver's maximum payout fits the available reserve.
- Unknown or malformed limits deliberately fail closed.

### VRF settlement is delayed

- Keep the session key and transaction hash; do not open a duplicate wager.
- Check the Verify Network/Chain service and wait for the UI's cancellation threshold.
- Use **Cancel delayed request** only when Chain exposes it. The contract and host decide whether cancellation is valid.
- On recovery, refresh the host snapshot; Signum reconstructs live or settled sessions from host state.

### Fairness proof is unavailable

- Settlement remains authoritative on-chain even if browser proof retrieval is temporarily unavailable.
- Verify the session ID, request/fulfillment transactions, game state, and decoded outcome against the contract.
- Never label a demo result or an unavailable proof as VRF verified.

### Iframe is blank or refused

- Run `npm run deployment:check -- <guest-url>` and inspect `X-Frame-Options` and CSP `frame-ancestors` headers.
- Confirm the manifest and all built assets resolve beneath the guest base path.
- Confirm the URL is HTTPS and does not redirect to authentication or a repository page.

### Standalone demo differs from Chain play

This is expected only in settlement authority: demo mode uses secure browser randomness, local credits, and no chain proof. Encoding, receiver math, reveal, and payout reconstruction must remain identical. A visible `DEMO` label must always be present.

### Pages deployment fails

- Open the failed `Deploy Signum to GitHub Pages` run and fix the first failing build step.
- Confirm Pages is configured with `build_type: workflow` and the workflow has `pages: write` plus `id-token: write`.
- Revert the release commit to roll back; do not manually edit the deployed artifact. The next successful `main` workflow atomically replaces it.

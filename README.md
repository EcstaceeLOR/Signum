# Signum: Resonance

Signum is a provably-fair signal-matching casino game being built for Chain Jam Vol. 1. Players compose a Tap/Rest transmission, Chain's VRF generates a ghost signal, and matching beats determine the payout.

The implementation is tracked in the [delivery roadmap](https://github.com/EcstaceeLOR/Signum/issues/35).

## Requirements

- Node.js 24.12.4 or newer
- npm 10 or newer
- Chrome or Chromium for the browser-level simulator E2E test

The repository includes an `.nvmrc` file for compatible Node version managers. Node 24.12.4 is
the minimum declared by the pinned Chain casino SDK v0.4.0 workspace.

## Setup

```bash
git clone https://github.com/EcstaceeLOR/Signum.git
cd Signum
npm ci
npm run dev
```

## Commands

| Command                   | Purpose                                                          |
| ------------------------- | ---------------------------------------------------------------- |
| `npm run dev`             | Start the Vite development server                                |
| `npm run build`           | Typecheck and create the static production build                 |
| `npm run preview`         | Preview the production build locally                             |
| `npm run lint`            | Run ESLint                                                       |
| `npm run lint:fix`        | Apply safe ESLint fixes                                          |
| `npm run format`          | Format the repository with Prettier                              |
| `npm run format:check`    | Verify formatting without changing files                         |
| `npm run typecheck`       | Run the TypeScript project build check                           |
| `npm run contracts:check` | Verify Chain ABI and execute Solidity codec checks               |
| `npm run test`            | Run Vitest once                                                  |
| `npm run test:watch`      | Run Vitest in watch mode                                         |
| `npm run simulator`       | Install and start the official Chain stack with Signum synced in |
| `npm run simulator:check` | Build the simulator and official Coinflip example                |
| `npm run e2e:simulator`   | Run the real browser + local Chain + VRF lifecycle test          |
| `npm run ci`              | Run the complete local unit/build quality gate                   |

## Real simulator lifecycle test

`npm run e2e:simulator` starts Signum, the vendored Chain casino simulator, the in-memory Hardhat chain, the local Verify Network deployment, and headless Chrome. It opens a real Signum session through the iframe guest bridge, proves the `WAITING_RANDOMNESS` state, fulfills the real local ECVRF request, verifies the rendered payout against the Pulse paytable, then opens another session and exercises the expired-randomness cancellation path.

The stuck-randomness scenario suspends only the simulator's local VRF watcher while leaving its Hardhat child running. For that reason the full local E2E command currently requires Linux, macOS, or WSL. GitHub Actions runs it on Ubuntu for every pull request. Set `CHROME_BIN` if Chrome is installed somewhere the runner cannot discover automatically.

On failure, browser console/exception output and the Signum/simulator process logs are written to `artifacts/e2e/`. CI uploads that directory as `signum-simulator-e2e-logs`.

## Project documentation

- [Architecture and build plan](./SIGNUM_ARCHITECTURE_AND_BUILD_PLAN.md)
- [Product specification and UX contract](./docs/PRODUCT_SPEC.md)
- [Novelty dossier](./docs/NOVELTY_DOSSIER.md)
- [Chain SDK and simulator integration](./docs/CHAIN_SDK_INTEGRATION.md)
- [Canonical Chain contract boundary](./contracts/README.md)
- [GitHub issue roadmap](https://github.com/EcstaceeLOR/Signum/issues/35)

## CI

GitHub Actions runs installation, linting, formatting checks, TypeScript checks, canonical contract compilation, in-memory EVM codec tests, frontend tests, production builds, the pinned Chain simulator baseline, and the full Signum browser lifecycle for every pull request and every push to `main`.

# Signum: Resonance

Signum is a provably-fair signal-matching casino game being built for Chain Jam Vol. 1. Players compose a Tap/Rest transmission, Chain's VRF generates a ghost signal, and matching beats determine the payout.

The repository contains a playable standalone demo and the production Chain guest flow, including
session recovery, on-chain settlement decoding, and browser-side Verify Network proof checks. The
remaining release work is tracked in the [delivery roadmap](https://github.com/EcstaceeLOR/Signum/issues/35).

## Fairness view

Open **Fairness & verification** in the game to inspect the selected receiver's complete paytable,
RTP, perfect-match probability, integer rounding rule, and a plain-language explanation of the
signal comparison. A settled Chain round also shows its session, game contract, available
transaction hashes, decoded player/ghost signals, exact payout reconstruction, and the host's
client-side VRF verification verdict. Standalone rounds are explicitly labelled as local demos and
never claim an on-chain proof.

Transaction hashes link to supported network explorers. Deployments on another EVM network can set
`VITE_BLOCK_EXPLORER_URL` to that explorer's origin, without a trailing slash.

## Requirements

- Node.js 24.12.4 or newer
- npm 10 or newer

The repository includes an `.nvmrc` file for compatible Node version managers. Node 24.12.4 is
the minimum declared by the pinned Chain casino SDK v0.4.0 workspace.

## Setup

```bash
git clone https://github.com/EcstaceeLOR/Signum.git
cd Signum
npm install
npm run dev
```

## Commands

| Command                         | Purpose                                            |
| ------------------------------- | -------------------------------------------------- |
| `npm run dev`                   | Start the Vite development server                  |
| `npm run build`                 | Typecheck and create the static production build   |
| `npm run preview`               | Preview the production build locally               |
| `npm run lint`                  | Run ESLint                                         |
| `npm run lint:fix`              | Apply safe ESLint fixes                            |
| `npm run format`                | Format the repository with Prettier                |
| `npm run format:check`          | Verify formatting without changing files           |
| `npm run typecheck`             | Run the TypeScript project build check             |
| `npm run contracts:check`       | Verify Chain ABI and execute Solidity codec checks |
| `npm run security:dependencies` | Audit production dependency lockfiles              |
| `npm run security:secrets`      | Scan source and built output for exposed secrets   |
| `npm run test`                  | Run Vitest once                                    |
| `npm run test:watch`            | Run Vitest in watch mode                           |
| `npm run simulator`             | Install and start the official Chain stack         |
| `npm run simulator:check`       | Build the simulator and official Coinflip example  |
| `npm run test:e2e:simulator`    | Run Signum through the local Chain + VRF lifecycle |
| `npm run ci`                    | Run the complete local quality gate                |

## Project documentation

- [Architecture and build plan](./SIGNUM_ARCHITECTURE_AND_BUILD_PLAN.md)
- [Product specification and UX contract](./docs/PRODUCT_SPEC.md)
- [Novelty dossier](./docs/NOVELTY_DOSSIER.md)
- [Chain SDK and simulator integration](./docs/CHAIN_SDK_INTEGRATION.md)
- [Canonical Chain contract boundary](./contracts/README.md)
- [Security model and operator assumptions](./docs/SECURITY.md)
- [GitHub issue roadmap](https://github.com/EcstaceeLOR/Signum/issues/35)

## CI

GitHub Actions runs installation, linting, formatting checks, TypeScript checks, canonical contract compilation, in-memory EVM codec tests, frontend tests, and a production build for every pull request and every push to `main`.

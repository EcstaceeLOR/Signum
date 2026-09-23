# Signum: Resonance

Signum is a provably-fair signal-matching casino game being built for Chain Jam Vol. 1. Players compose a Tap/Rest transmission, Chain's VRF generates a ghost signal, and matching beats determine the payout.

The project currently contains the tested frontend foundation. Chain SDK integration and gameplay are tracked in the [delivery roadmap](https://github.com/EcstaceeLOR/Signum/issues/35).

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

| Command                   | Purpose                                            |
| ------------------------- | -------------------------------------------------- |
| `npm run dev`             | Start the Vite development server                  |
| `npm run build`           | Typecheck and create the static production build   |
| `npm run preview`         | Preview the production build locally               |
| `npm run lint`            | Run ESLint                                         |
| `npm run lint:fix`        | Apply safe ESLint fixes                            |
| `npm run format`          | Format the repository with Prettier                |
| `npm run format:check`    | Verify formatting without changing files           |
| `npm run typecheck`       | Run the TypeScript project build check             |
| `npm run contracts:check` | Verify Chain ABI and execute Solidity codec checks |
| `npm run test`            | Run Vitest once                                    |
| `npm run test:watch`      | Run Vitest in watch mode                           |
| `npm run simulator`       | Install and start the official Chain stack         |
| `npm run simulator:check` | Build the simulator and official Coinflip example  |
| `npm run ci`              | Run the complete local quality gate                |

## Project documentation

- [Architecture and build plan](./SIGNUM_ARCHITECTURE_AND_BUILD_PLAN.md)
- [Product specification and UX contract](./docs/PRODUCT_SPEC.md)
- [Novelty dossier](./docs/NOVELTY_DOSSIER.md)
- [Chain SDK and simulator integration](./docs/CHAIN_SDK_INTEGRATION.md)
- [Canonical Chain contract boundary](./contracts/README.md)
- [GitHub issue roadmap](https://github.com/EcstaceeLOR/Signum/issues/35)

## CI

GitHub Actions runs installation, linting, formatting checks, TypeScript checks, canonical contract compilation, in-memory EVM codec tests, frontend tests, and a production build for every pull request and every push to `main`.

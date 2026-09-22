# Slot engine

Casino SDK add-on: one shared, immutable sampler for every slot title. A title is a settlement
table per bet configuration, deployed as a clone of the engine; no Solidity is written per title.

- In the Chain monorepo this is `packages/slot-engine`: `vp run start` runs the local stack,
  `vp run test` the contracts, compiler, sampler, display picker and importer.
- In the casino SDK download it ships as `slot-engine/`, a workspace member: `bun run start:slots`
  from the SDK root (npm, pnpm and yarn work the same). The copy is rewritten by
  `packages/docs/scripts/zip-sdks.mjs`; edit this package, not the copy.

Guides live with the SDK docs: [`SLOT_ENGINE.md`](../casino-sdk/docs/SLOT_ENGINE.md) for running,
building, deploying and verifying titles, and
[`MIGRATING_FROM_STAKE_ENGINE.md`](../casino-sdk/docs/MIGRATING_FROM_STAKE_ENGINE.md) for
bringing a Stake Engine game over. Vocabulary follows the monorepo's root `CONTEXT.md`.

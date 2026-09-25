# Signum asset provenance

Last audited: 2026-09-25

Every non-code asset shipped by Signum is inventoried below. Signum does not ship stock, scraped, commissioned, or third-party media.

## Player-facing runtime

| Asset class                                                     | Source and permission                                                                       | Delivery                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Signal-room visuals, sonar rings, waveforms, states, and motion | Original Signum implementation authored in `src/styles.css`                                 | CSS gradients, borders, transforms, and keyframes                                                   |
| Signum mark and interface symbols                               | Original Signum text and CSS geometry                                                       | No downloaded icons, SVGs, or icon fonts                                                            |
| Typography                                                      | User-device system font stack                                                               | No font files or font network requests                                                              |
| Sound cues and soundtrack                                       | Original oscillator frequencies and gain envelopes authored in `src/game/useSignumSound.ts` | Synthesized at runtime with Web Audio; no samples or recordings                                     |
| Chain Jam widget                                                | Event-organizer integration required by the competition                                     | Loaded from `https://jam.chain.wtf/widget.js` and governed by Chain's terms; not copied into Signum |

Audio is cosmetic and non-predictive: it never reads game randomness or changes game math. It starts only after a player gesture, can always be muted, and suppresses the continuous soundtrack when reduced-motion is active.

## Repository media

These files were generated solely from the Signum application by `scripts/capture-launch-assets.mjs`. They contain only the original runtime presentation described above. The capture uses the explicitly labelled standalone showcase mode; it does not depict or claim a real wager.

| Path                                    | Purpose                      | SHA-256                                                            |
| --------------------------------------- | ---------------------------- | ------------------------------------------------------------------ |
| `public/og-image.png`                   | Deployed Open Graph preview  | `65e0e8e928f7d68edbaf5d796527d497720a881b041977e2cab3f6760e461d4d` |
| `docs/assets/signum-pulse.png`          | Pulse mode launch still      | `458efef352b75b74b1e468d5a92beec3ab181e7d3604d12e8d8a520cd0191c6e` |
| `docs/assets/signum-carrier.png`        | Carrier mode launch still    | `f1b3262f60917ac0b03c2833289f4656654735fac9115b8aec8f635a9e6f5983` |
| `docs/assets/signum-deepwave.png`       | Deepwave mode launch still   | `770341bff5151a66dd80517aeb45b07951c7a39d4611af03d0e495b9a4db3ac2` |
| `docs/assets/signum-showcase-demo.webm` | 44-second launch walkthrough | `24d8e70d27afb47f53b152e168cc8584c30e47452fc6a01f22461905aa30a3d9` |

`public/game.manifest.json` is authored configuration rather than media. It contains no embedded or remote artwork.

## Software dependencies

The deployed bundle directly incorporates React, React DOM, and Penpal under the MIT License. Their required notices are preserved in [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md). Build and test-only packages are not delivered to players.

The vendored `@chain/casino-sdk` integration is event-organizer source supplied for Chain Jam entrants and is governed by Chain's terms. It is code, not a media asset, and remains isolated under `vendor/chain-casino-sdk` with its upstream README and package metadata intact.

## Enforcement

Run `npm run assets:check`. CI rejects an unlisted media file, a changed binary hash, or a runtime dependency whose declared license is no longer MIT. Regenerated launch media must be reviewed and its new hash recorded here and in the checker.

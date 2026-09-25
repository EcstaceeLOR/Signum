# Signum eligibility and product-readiness audit

Audit package prepared: 2026-09-25 UTC  
Application release candidate: [`e5a02d5f8fcef1efe69d262191933cfd5250257a`](https://github.com/EcstaceeLOR/Signum/commit/e5a02d5f8fcef1efe69d262191933cfd5250257a)  
Deployed URL: <https://ecstaceelor.github.io/Signum/>  
Official brief reviewed: <https://jam.chain.wtf/>  
Status: **Blocked pending independent sign-off and production Chain registration**

This report separates machine-backed findings from the independent review required by issue #33. It must not be marked final by a Signum implementer.

## Release evidence

| Evidence                        | Result | Record                                                                                                                                                                                                   |
| ------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main CI                         | Pass   | [Run 36082185605](https://github.com/EcstaceeLOR/Signum/actions/runs/36082185605): lint, formatting, types, 69,888-case math/contract checks, unit/component tests, build, dependency audit, secret scan |
| Chain simulator                 | Pass   | Same run: official simulator build plus real local VRF settlement and delayed-randomness cancellation through the iframe bridge                                                                          |
| Pages deployment                | Pass   | [Run 36082185638](https://github.com/EcstaceeLOR/Signum/actions/runs/36082185638) deployed the tested `e5a02d5` artifact                                                                                 |
| Production smoke script         | Pass   | `npm run deployment:check -- https://ecstaceelor.github.io/Signum/` on 2026-09-25: page, manifest, Jam widget, and iframe policy                                                                         |
| Asset and dependency provenance | Pass   | `npm run assets:check`; see `docs/ASSET_PROVENANCE.md` and `THIRD_PARTY_NOTICES.md`                                                                                                                      |

## Binary eligibility gates

| Gate from the official brief                | Result                       | Evidence                                                                                                                        |
| ------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Casino game built with the Chain casino SDK | Pass                         | Guest imports `@chain/casino-sdk/guest`; the required SDK is pinned under `vendor/chain-casino-sdk`; CI exercises its simulator |
| Wager, random outcome, and payout           | Pass in source and simulator | `contracts/SignumGame.sol`; simulator E2E opens, fulfills, settles, and verifies a session                                      |
| Theoretical RTP between 93% and 98%         | Pass                         | Pulse 96.25%; Carrier and Deepwave 96.09375%; `docs/PRODUCT_SPEC.md`; exhaustive cross-layer check                              |
| Local simulator game completes quickly      | Pass                         | Automated E2E completes settlement without human/operator intervention                                                          |
| Playable standalone experience              | Pass                         | Public HTTPS URL starts in a visibly labelled, no-money demo with secure browser randomness                                     |
| Original concept rather than a clone        | Pass with documented search  | `docs/NOVELTY_DOSSIER.md`; no equivalent signal-composition casino mechanic found in the reviewed field                         |
| Chain Jam widget included                   | Pass                         | Deployed HTML loads `https://jam.chain.wtf/widget.js`; production smoke verifies it                                             |
| Source can be shared with reviewers         | Pass                         | Public repository: <https://github.com/EcstaceeLOR/Signum>                                                                      |
| Embeddable in the Chain host                | Pass                         | Cross-origin iframe smoke and simulator lifecycle pass; deployed headers do not deny framing                                    |
| Production Chain game address registered    | **Blocked**                  | No production deployment signer, network, transaction, or registered address has been provided                                  |

## Cross-layer consistency

| Area                             | Result             | Evidence                                                                                                                 |
| -------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Contract interface and lifecycle | Pass               | Canonical `ICasinoGameV2`; no constructor arguments; malformed data and lifecycle paths covered                          |
| Bridge authority                 | Pass               | Host owns wallet, token metadata, limits, signing, randomness, and settlement; guest fails closed on malformed snapshots |
| Manifest                         | Pass               | Public `game.manifest.json` returns `gameId: signum`, API version 1, full-iframe presentation, and declared capabilities |
| RTP and payout cap               | Pass               | Contract, fixtures, UI, docs, and exhaustive report agree on all three paytables and the 40.00x Deepwave cap             |
| Fairness claims                  | Pass               | Demo and showcase are labelled; real Chain proof is not claimed in standalone mode; player patterns cannot change odds   |
| Responsible play                 | Pass               | Real mode is gated by age/jurisdiction acknowledgement and shows independence, limits, break, and support messaging      |
| Accessibility and mobile         | Pass in automation | Axe, keyboard path, focus handling, reduced motion, responsive layout, and compressed bundle budgets are covered         |
| Privacy and diagnostics          | Pass               | Local-only bounded diagnostics; no analytics, wallet addresses, signals, wagers, or outcomes are collected               |

## Product-readiness review

| Quality question          | Current assessment         | Evidence / limitation                                                                                                                             |
| ------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| First-round simplicity    | Strong automated evidence  | Ten-second rule, one-screen guide, keyboard flow, and deterministic judge path; five independent first-time-player sessions are still outstanding |
| Ten-hour replay potential | Plausible, not proven      | Three volatility modes, expressive signals, non-predictive journal, and varied audiovisual profiles avoid strategy misrepresentation              |
| Visual and sound finish   | Pass for release candidate | Responsive signal-room presentation, original CSS motion, mode-specific Web Audio, mute, and reduced-motion support                               |
| Judge path                | Pass                       | `?showcase=1` offers an explicitly labelled deterministic walkthrough; normal demo and Chain wagering never use it                                |

## Findings

| ID     | Severity | Finding                                                                                                                                                             | Owner                                         | Release disposition                                                                      |
| ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| AUD-01 | High     | Production Chain network, contract address, deployment transaction, and game registration are absent.                                                               | Release operator with a Chain-approved signer | **Block submission** until deployed, registered, and smoke-tested in the real host       |
| AUD-02 | High     | The required reviewer must be someone who did not implement Signum; implementer-generated evidence cannot satisfy independent sign-off.                             | Independent reviewer                          | **Block closure of issue #33** until the sign-off below is completed                     |
| AUD-03 | Medium   | The five first-time-player sessions in issue #27 have not been conducted. Automated UX evidence is not a substitute for human comprehension and replay-intent data. | Product owner / five testers                  | Keep visible; complete the privacy-safe protocol before final product-readiness approval |

No payout, RTP, bridge, manifest, standalone, widget, source-access, or iframe discrepancy was found in the tested candidate.

## Independent reviewer procedure

The reviewer should use a clean browser profile and must not rely only on this report:

1. Open the deployed URL and play Pulse, Carrier, and Deepwave in standalone mode.
2. Explain the rule, whether pattern choice changes odds, and what `1.00x` means.
3. Confirm the demo and showcase labels cannot be mistaken for real wagering.
4. Run `npm ci`, `npm run ci`, and `npm run test:e2e:simulator` from the tested commit.
5. Inspect the official brief, manifest, widget, contract interface, paytables, public source access, and iframe behavior.
6. Recheck the production address and host settlement after AUD-01 is resolved.
7. Record every new finding with severity and owner. Do not approve with an unresolved critical/high finding.

## Independent sign-off

| Field                                               | Value             |
| --------------------------------------------------- | ----------------- |
| Reviewer name or GitHub handle                      | Pending           |
| Confirmation that reviewer did not implement Signum | Pending           |
| Commit tested                                       | Pending           |
| Production URL tested                               | Pending           |
| Production contract/network tested                  | Pending           |
| Critical/high findings remaining                    | AUD-01 and AUD-02 |
| Decision and UTC timestamp                          | **Not approved**  |

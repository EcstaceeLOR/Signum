# Signum complete-product release audit

Audit refreshed: 2026-09-25 UTC

Tested application commit: [`e2f19ac7e82b3659a75270a608923905639fed61`](https://github.com/EcstaceeLOR/Signum/commit/e2f19ac7e82b3659a75270a608923905639fed61)

Release-fallback commit: [`2fd35199166321d010dd28860557f88bb75abbb6`](https://github.com/EcstaceeLOR/Signum/commit/2fd35199166321d010dd28860557f88bb75abbb6)

Primary URL: <https://signum-delta.vercel.app/>

Static mirror: <https://ecstaceelor.github.io/Signum/>

Status: **Automated product gates pass; release remains blocked by three external acceptance gates.**

This record distinguishes reproducible machine evidence from human validation. A Signum implementer cannot complete the five first-time-player sessions or independent sign-off on behalf of the required participants.

## Complete-product delivery

Issues [#79 through #91](https://github.com/EcstaceeLOR/Signum/milestone/1) are closed. They deliver the route/UX contract, application shell, persistence and recovery, Home, Play setup, active round, result receipts, history/detail, learning and fairness, settings, responsible play, support, failure states, and full-product E2E coverage.

Issue #92 and epic #78 remain open until the human and production release gates below pass.

## Reproducible release evidence

| Evidence                   | Result | Record                                                                                                                                                                                       |
| -------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main CI                    | Pass   | [Run 36181869651](https://github.com/EcstaceeLOR/Signum/actions/runs/36181869651): lint, formatting, types, exhaustive math/contract checks, tests, build, dependency audit, and secret scan |
| Standalone route matrix    | Pass   | Same run: every stable route, metadata, navigation, mobile menu, serious/critical axe scan, and browser error checks                                                                         |
| Chain simulator            | Pass   | Same run: official simulator build, iframe bridge, real local VRF settlement, and delayed-randomness cancellation                                                                            |
| Exact Pages artifact       | Pass   | [Run 36181869582](https://github.com/EcstaceeLOR/Signum/actions/runs/36181869582) deployed the tested application commit                                                                     |
| Vercel production smoke    | Pass   | Root and all stable deep links return HTTP 200; page, manifest, Chain Jam widget, and iframe policy pass `npm run deployment:check`                                                          |
| Pages root smoke           | Pass   | Page, manifest, Chain Jam widget, HTTPS, and iframe policy pass                                                                                                                              |
| Pages child-route fallback | Pass   | [Run 36190521482](https://github.com/EcstaceeLOR/Signum/actions/runs/36190521482) deployed `dist/404.html`; `/Signum/play` returns the application shell                                     |
| Public source              | Pass   | <https://github.com/EcstaceeLOR/Signum>                                                                                                                                                      |

## Route and state acceptance

| Area             | Result             | Evidence                                                                                                                                 |
| ---------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Product journey  | Pass               | Home -> setup -> active round -> immutable result -> history/detail is implemented and E2E-covered                                       |
| Supporting pages | Pass               | How It Works, Fairness, Settings, Responsible Play, and Support are directly navigable and functional                                    |
| Failure recovery | Pass               | Offline, runtime error, invalid route, missing receipt, corrupt storage, delayed randomness, and reconnect paths expose recovery actions |
| Responsive input | Pass in automation | Desktop and mobile navigation, keyboard play, focus transitions, reduced motion, and overflow checks pass                                |
| Accessibility    | Pass in automation | Stable routes have no serious/critical axe findings; semantic controls and visible focus are tested                                      |
| Data honesty     | Pass               | Demo/Chain receipts are separated; no fake account, server history, support chat, transaction, or VRF proof is shown                     |
| Canonical math   | Pass               | Pulse 96.25%; Carrier and Deepwave 96.09375%; UI, fixtures, TypeScript, Solidity, and docs agree                                         |
| Privacy          | Pass               | Bounded local diagnostics; no analytics or collection of wallet addresses, signals, wagers, or outcomes                                  |

No placeholder, dead control, fake data, contract/RTP mismatch, or automated critical/high product finding was found in the tested candidate.

## Eligibility gates

| Gate                                           | Result                      | Evidence / action                                                                                                         |
| ---------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Chain casino SDK guest and canonical interface | Pass                        | Pinned SDK, manifest, guest bridge, contract interface, and official simulator are exercised in CI                        |
| Wager, random outcome, and payout              | Pass in simulator           | Real local contract/VRF lifecycle settles and reconstructs a receipt                                                      |
| RTP between 93% and 98%                        | Pass                        | Exhaustive 69,888-case cross-layer check                                                                                  |
| Original concept                               | Pass with documented search | See `docs/NOVELTY_DOSSIER.md`                                                                                             |
| Standalone HTTPS and embeddability             | Pass                        | Vercel deployment and iframe policy smoke pass                                                                            |
| Chain Jam widget and public source             | Pass                        | Production HTML and public repository verified                                                                            |
| Production Chain deployment/registration       | **Blocked**                 | Requires an authorized Chain deployment signer, network, transaction, contract address, registration, and real-host smoke |

## Open release blockers

| ID     | Gate                                    | Owner                                 | Required evidence                                                                                                |
| ------ | --------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| REL-01 | Five first-time-player sessions         | Product owner plus five real testers  | Complete `docs/PLAYTEST_PROTOCOL.md`; at least 4/5 comprehend the rule and median first play is under 30 seconds |
| REL-02 | Independent eligibility/readiness audit | Reviewer who did not implement Signum | Sign the exact commit and production URL below; no unresolved critical/high finding                              |
| REL-03 | Production Chain registration           | Authorized release operator           | Record network, address, deployment transaction, registration, and successful minimum-wager real-host settlement |

These are release-process blockers, not hidden product defects. They must not be replaced with invented names, timings, addresses, or implementer self-approval.

## Independent reviewer procedure

1. Use a clean browser profile to complete standalone rounds in Pulse, Carrier, and Deepwave on the primary URL.
2. Explain the rule, pattern independence, receiver differences, demo disclosure, and `1.00x` meaning without implementer hints.
3. Run `npm ci`, `npm run ci`, `npm run test:e2e:routing`, and `npm run test:e2e:simulator` from the tested release commit.
4. Check the official brief, manifest, widget, contract interface, paytables, public source, direct links, and iframe behavior.
5. After REL-03, complete one minimum-wager production round and verify the receipt and proof state.
6. Record every finding with severity and owner. Do not approve with an unresolved critical/high finding.

## Independent sign-off

| Field                                    | Value                      |
| ---------------------------------------- | -------------------------- |
| Reviewer name or GitHub handle           | Pending                    |
| Reviewer did not implement Signum        | Pending                    |
| Exact commit tested                      | Pending                    |
| Production URL tested                    | Pending                    |
| Production Chain network/address tested  | Pending                    |
| Critical/high product findings remaining | Pending independent review |
| Decision and UTC timestamp               | **Not approved**           |

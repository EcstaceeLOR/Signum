# Chain Jam submission draft

Prepared: 2026-09-25 UTC  
Status: **Do not submit until the required values and release blockers below are resolved.**

## Copy-ready fields

| Field         | Value                                                  |
| ------------- | ------------------------------------------------------ |
| Title         | Signum: Resonance                                      |
| Game URL      | <https://ecstaceelor.github.io/Signum/>                |
| Declared RTP  | Pulse: 96.25%; Carrier: 96.09375%; Deepwave: 96.09375% |
| Source access | <https://github.com/EcstaceeLOR/Signum>                |
| Discord       | **REQUIRED FROM OWNER**                                |
| X             | **REQUIRED FROM OWNER**                                |
| Telegram      | **REQUIRED FROM OWNER**                                |

## Pitch / info

Signum turns one transparent mathematical rule into an expressive casino instrument: write a binary rhythm, send it, and listen as Chain answers. It is not Dice, Keno, a multi-coin parlay, or a signal-search game. The player fills every ordered position; VRF fills an independent equal-length signal; Hamming similarity selects a graded payout. Pulse (4 beats, 96.25%, 7.40x), Carrier (6 beats, 96.09375%, 21.50x), and Deepwave (8 beats, 96.09375%, 40.00x) provide distinct volatility without changing the core interaction. The exact XOR/popcount settlement is reconstructed in the fairness panel, and all 69,888 player/ghost combinations are checked in both TypeScript and Solidity.

Additional reviewer links:

- Judge showcase: <https://ecstaceelor.github.io/Signum/?showcase=1>
- Manifest: <https://ecstaceelor.github.io/Signum/game.manifest.json>
- Audit: <https://github.com/EcstaceeLOR/Signum/blob/main/docs/RELEASE_AUDIT.md>
- Demo video: <https://github.com/EcstaceeLOR/Signum/raw/main/docs/assets/signum-showcase-demo.webm>

The showcase and video are visibly labelled deterministic standalone fixtures and do not claim a real wager or VRF settlement. The repository's simulator test separately proves the real Chain contract, iframe bridge, and VRF lifecycle.

## Verified release candidate

| Item               | Record                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Application commit | [`e5a02d5f8fcef1efe69d262191933cfd5250257a`](https://github.com/EcstaceeLOR/Signum/commit/e5a02d5f8fcef1efe69d262191933cfd5250257a) |
| CI and simulator   | [Run 36082185605](https://github.com/EcstaceeLOR/Signum/actions/runs/36082185605) — pass                                            |
| Pages deployment   | [Run 36082185638](https://github.com/EcstaceeLOR/Signum/actions/runs/36082185638) — pass                                            |
| Production smoke   | Page, manifest, widget, HTTPS, and iframe policy passed on 2026-09-25                                                               |
| Contract/network   | **REQUIRED: production deployment and Chain registration**                                                                          |
| Independent review | **REQUIRED: issue #33 sign-off by a non-implementer**                                                                               |
| Human playtest     | **REQUIRED: five anonymous first-time-player sessions for issue #27**                                                               |

## Final five-minute handoff

1. Add the owner's submission contact handles above.
2. Deploy and register `SignumGame`, then record its network, address, and transaction in `docs/OPERATOR_RUNBOOK.md`.
3. Have a non-implementer complete `docs/RELEASE_AUDIT.md`; resolve any critical/high finding.
4. Record five anonymous sessions using `docs/PLAYTEST_PROTOCOL.md` and calculate its acceptance metrics.
5. Re-run the final CI/Pages release, production smoke, and one real-host minimum-wager settlement.
6. Paste the fields above into the official form, submit, and save the submission URL/confirmation in issue #23.

Never substitute a local simulator address, demo outcome, invented contact handle, or implementer self-review for a required production value.

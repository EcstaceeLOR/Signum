# Signum product specification and UX contract

- Status: **Approved for v1 implementation**
- Product name: **Signum: Resonance**
- Specification version: **1.0.0**
- Last reviewed: **2026-09-21**

This is the canonical player-facing behavior for Signum. Contract, frontend, demo, tests, marketing copy, and submission material must agree with it. The words **must**, **should**, and **may** are normative.

## The ten-second rule

> Build a Tap/Rest signal. Chain sends an independent random echo. More matching beats pay more.

A first-time player must be able to act from that sentence and the labels visible in the main game panel. Rules may be expanded in the fairness panel, but no manual may be required to complete a round.

## Product promise

- One wager produces one independently generated ghost signal and one final payout.
- A player may express any Tap/Rest pattern; **every pattern has identical odds**.
- Receiver selection changes signal length, payout distribution, and volatility.
- The result is not generated or revealed until the wager and signal are committed.
- The contract is the settlement authority in host mode.
- Past signals and outcomes never alter or predict a future round.

Signum must never call the signal a prediction, strategy, solution, or skill test. Composition is expressive agency. Receiver selection is risk preference. Neither lets a player influence the VRF output.

## Vocabulary

| Term          | Meaning                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------ |
| Beat          | One position in a signal.                                                                                          |
| Tap           | Binary value `1`.                                                                                                  |
| Rest          | Binary value `0`.                                                                                                  |
| Player signal | The complete Tap/Rest sequence committed with the wager.                                                           |
| Ghost signal  | The independent sequence derived from Chain's VRF word.                                                            |
| Match         | A beat where the player and ghost values are equal.                                                                |
| Receiver      | Pulse, Carrier, or Deepwave; the selected volatility mode.                                                         |
| Total payout  | Amount returned including stake. `1.00x` returns the stake; values below `1.00x` are net losses.                   |
| RTP           | Theoretical expected total payout divided by wager over infinitely many rounds. It is not a promise for a session. |

## Receiver modes

All positions independently have a `1/2` probability of matching. Match counts therefore follow the binomial distribution `C(n, k) / 2^n` and do not depend on the chosen pattern.

| Receiver | Beats | Product label     |       RTP | Zero payout | Profit payout | Perfect match | Maximum payout | Return standard deviation |
| -------- | ----: | ----------------- | --------: | ----------: | ------------: | ------------: | -------------: | ------------------------: |
| Pulse    |     4 | Low volatility    |    96.25% |      31.25% |        31.25% |         6.25% |          7.40x |                   1.7453x |
| Carrier  |     6 | Medium volatility | 96.09375% |     34.375% |      10.9375% |       1.5625% |         21.50x |                   2.7739x |
| Deepwave |     8 | High volatility   | 96.09375% |  36.328125% |    14.453125% |     0.390625% |         40.00x |                   2.8037x |

`Profit payout` means a total payout greater than `1.00x`. The labels are relative Signum labels based on loss rate, payout concentration, and maximum payout; they are not claims that one mode has better expected value.

### Pulse paytable

| Matches | Outcomes | Probability | Total payout | Payout basis points |
| ------: | -------: | ----------: | -----------: | ------------------: |
|     0–1 |        5 |      31.25% |        0.00x |                   0 |
|       2 |        6 |      37.50% |        0.40x |               4,000 |
|       3 |        4 |      25.00% |        1.40x |              14,000 |
|       4 |        1 |       6.25% |        7.40x |              74,000 |

```text
RTP = (6 × 0.40 + 4 × 1.40 + 1 × 7.40) / 16 = 0.9625
```

### Carrier paytable

| Matches | Outcomes | Probability | Total payout | Payout basis points |
| ------: | -------: | ----------: | -----------: | ------------------: |
|     0–2 |       22 |     34.375% |        0.00x |                   0 |
|       3 |       20 |      31.25% |        0.20x |               2,000 |
|       4 |       15 |    23.4375% |        1.00x |              10,000 |
|       5 |        6 |      9.375% |        3.50x |              35,000 |
|       6 |        1 |     1.5625% |       21.50x |             215,000 |

```text
RTP = (20 × 0.20 + 15 × 1.00 + 6 × 3.50 + 1 × 21.50) / 64
    = 0.9609375
```

### Deepwave paytable

| Matches | Outcomes | Probability | Total payout | Payout basis points |
| ------: | -------: | ----------: | -----------: | ------------------: |
|     0–3 |       93 |  36.328125% |        0.00x |                   0 |
|       4 |       70 |   27.34375% |        0.20x |               2,000 |
|       5 |       56 |     21.875% |        1.00x |              10,000 |
|       6 |       28 |    10.9375% |        3.00x |              30,000 |
|       7 |        8 |      3.125% |        6.50x |              65,000 |
|       8 |        1 |   0.390625% |       40.00x |             400,000 |

```text
RTP = (70 × 0.20 + 56 × 1.00 + 28 × 3.00 + 8 × 6.50 + 1 × 40.00) / 256
    = 0.9609375
```

The v1 Deepwave maximum is `40.00x`. Platform reserve validation must reject deployment if that cap cannot be supported. It must not silently substitute a different live paytable; changing it requires a new specification version and matching contract, frontend, tests, and disclosures.

## Deterministic encoding

### Player `gameData`

`gameData` is exactly four bytes encoded with `abi.encodePacked`:

| Byte | Field          | Allowed value                                 |
| ---: | -------------- | --------------------------------------------- |
|    0 | `version`      | `0x01`                                        |
|    1 | `mode`         | `0x00` Pulse, `0x01` Carrier, `0x02` Deepwave |
|    2 | `playerSignal` | Bitfield containing the selected signal       |
|    3 | `flags`        | `0x00` in v1                                  |

Beat index zero is the left-most beat shown to the player and is stored in bit zero, the least significant bit. Tap is `1`; Rest is `0`. Bits above the receiver's beat count must be zero.

Example: displayed Pulse signal `Tap Rest Tap Tap` is bits `1,0,1,1`, encoded as `0b00001101`, so `gameData` is `0x01000d00`.

The contract must reject:

- any length other than four bytes;
- an unknown version or mode;
- non-zero flags;
- set signal bits above the selected receiver length.

### Ghost derivation

For `n` beats:

```text
mask = (1 << n) - 1
ghostSignal = uint8(randomness & mask)
matchCount = n - popcount((playerSignal XOR ghostSignal) & mask)
```

Using the low `n` bits is exactly uniform for a uniformly distributed VRF word and needs no modulo operation. The contract must select the payout tier from `matchCount` and calculate:

```text
totalPayout = floor(wager × payoutBasisPoints / 10_000)
```

The contract, TypeScript preview, standalone demo, and fairness decoder must use this exact rounding rule.

### Settled outcome payload

The settled `gameState` exposed to the frontend is exactly six bytes:

| Byte | Field                                                        |
| ---: | ------------------------------------------------------------ |
|    0 | outcome version `0x01`                                       |
|    1 | mode                                                         |
|    2 | player signal                                                |
|    3 | ghost signal                                                 |
|    4 | match count                                                  |
|    5 | payout tier index, starting at zero in ascending match order |

The frontend must treat malformed or internally inconsistent outcome data as an error and must not invent a result.

## Player flow

1. **Choose a receiver.** Each card shows beats, volatility, RTP, and maximum payout.
2. **Compose the signal.** Every beat is visibly either Tap or Rest and can be toggled by pointer or keyboard.
3. **Choose a wager.** The panel shows balance, allowed range, and the selected receiver's maximum possible return.
4. **Transmit.** The wager, mode, and complete signal are committed together.
5. **Wait for Chain.** The signal is locked while verified randomness and settlement are pending.
6. **Receive the echo.** Ghost beats reveal left to right beside the committed beats.
7. **See the result.** Match count, total payout, net result, and verification action appear together.

The initial receiver is Pulse. Its initial signal is `Tap Rest Tap Rest`. Carrier and Deepwave use the same alternating pattern extended to their lengths. A changed draft is remembered separately for each receiver during the current page session. Defaults are deterministic and are never described as lucky, recommended, or generated.

Changing receiver or signal is disabled after Transmit and remains disabled until settlement or a terminal error returns the game to an editable state.

## Main-screen information hierarchy

The complete main screen must expose, without opening help:

1. the one-sentence rule;
2. selected receiver, beat count, volatility, RTP, and max payout;
3. the full Tap/Rest composer;
4. wager, balance, and Transmit action;
5. this permanent microcopy near the composer:

> Every pattern has the same odds. Chain generates an independent echo after you transmit.

The receiver selector labels are:

- `Pulse · 4 beats · Low · up to 7.40x`
- `Carrier · 6 beats · Medium · up to 21.50x`
- `Deepwave · 8 beats · High · up to 40.00x`

Each receiver's expanded details must show its exact RTP and full paytable. No card may use language such as “easier pattern,” “stronger signal,” or “better odds.”

## Required product copy

| Context            | Copy                                                                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hero               | `Compose a signal. Receive Chain's echo.`                                                                                                           |
| Rule               | `Build a Tap/Rest signal. More matching beats pay more.`                                                                                            |
| Primary action     | `Transmit {formatted wager}`                                                                                                                        |
| Host connecting    | `Connecting to Chain…`                                                                                                                              |
| Opening session    | `Locking your transmission…`                                                                                                                        |
| Randomness pending | `Awaiting a verified echo…`                                                                                                                         |
| Delayed randomness | `Chain is still producing your verified echo. Your signal and wager are locked.`                                                                    |
| Demo badge         | `DEMO · No real wager or on-chain settlement`                                                                                                       |
| Demo action        | `Transmit demo wager`                                                                                                                               |
| Fairness summary   | `Your pattern does not change the odds. Chain's VRF creates an independent signal after your wager is committed. Each beat has a 50% match chance.` |
| History notice     | `Past echoes are a record, not a prediction. Every round is independent.`                                                                           |

Result headings are selected only by payout class:

| Result                     | Heading             | Sentence template                               |
| -------------------------- | ------------------- | ----------------------------------------------- |
| Perfect match              | `Perfect resonance` | `{matches}/{beats} matched · {payout} returned` |
| Profitable partial match   | `Signal locked`     | `{matches}/{beats} matched · {payout} returned` |
| Stake returned             | `Signal balanced`   | `{matches}/{beats} matched · stake returned`    |
| Partial return below stake | `Faint echo`        | `{matches}/{beats} matched · {payout} returned` |
| Zero payout                | `Signal lost`       | `{matches}/{beats} matched · no payout`         |

Near misses must not use manipulative copy such as “almost,” “so close,” or “due.”

## Runtime and UI states

| State                | Player sees                                                     | Allowed actions                                                                |
| -------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `CONNECTING`         | Skeleton balance and `Connecting to Chain…`                     | Open rules and accessibility settings only                                     |
| `READY`              | Receiver, composer, wager, balance, disclosures                 | Edit mode/signal/wager; Transmit                                               |
| `OPENING_SESSION`    | Locked composer and progress label                              | No duplicate Transmit                                                          |
| `WAITING_RANDOMNESS` | Committed signal, empty ghost rail, verified-randomness message | Open fairness; cancel only if host exposes an eligible stuck-randomness action |
| `REVEALING`          | Sequential ghost beats and match markers                        | Skip animation; mute/unmute                                                    |
| `SETTLED`            | Match count, payout, net result, verification link              | Play again; inspect fairness/history                                           |
| `DISCONNECTED`       | Non-destructive connection message                              | Retry connection; switch to demo if direct URL                                 |
| `ERROR`              | Specific recoverable or terminal message                        | Retry only when safe; return to editable state only if no live session exists  |
| `DEMO_READY`         | Persistent demo badge and simulated balance                     | Same composition flow using demo wording                                       |

The app must derive host-mode truth from the latest `HostSnapshotV1`, not from optimistic local assumptions. Refreshing or reconnecting during an active session must restore the pending or settled session and must not create another wager.

## Reveal contract

Normal-motion reveal:

1. Hold the committed player signal on screen for `300 ms`.
2. Reveal one ghost beat every `240 ms` from left to right.
3. On each beat, play the Tap or Rest tone and show a match or miss marker.
4. After the last beat, hold for `350 ms`.
5. Show the result card and call `revealOutcome({ sessionId })`.

The reveal is presentation only. The settled outcome already exists and animation timing cannot affect it. A visible `Skip reveal` action must immediately render all beats, show the result, and perform the same reveal acknowledgement.

With reduced motion, all ghost beats appear together after a short opacity transition no longer than `150 ms`; no sweeping, shaking, flashing, or parallax effect runs. Sound follows the user's mute setting and never blocks settlement acknowledgement.

## Error and recovery contract

| Condition                                  | Required behavior and copy                                                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Host bridge unavailable while embedded     | Disable wagering. `Chain connection is unavailable. Retry to reconnect.`                                                    |
| Direct URL with no host                    | Enter demo mode automatically; never show a wallet error.                                                                   |
| Unsupported host API                       | Disable wagering. `This Chain host version is not supported yet.`                                                           |
| Invalid or out-of-range wager              | Inline error with the exact allowed range; do not call `openSession`.                                                       |
| Insufficient balance                       | `Your balance is below this wager.` Keep all draft input.                                                                   |
| Session request rejected before creation   | Unlock input and show the host-provided safe reason or `Transmission was not opened. Nothing was wagered.`                  |
| Randomness pending for more than 8 seconds | Keep session locked and show delayed-randomness copy. Never fabricate an outcome.                                           |
| Host enables stuck-randomness cancellation | Show `Cancel stuck transmission` with the host's consequence copy. Do not expose it early.                                  |
| Disconnect with a live session             | Preserve the committed view, reconnect, and recover from snapshot. Do not offer another wager.                              |
| Malformed settled outcome                  | Stop reveal. `Chain settled this round, but Signum could not decode the result.` Preserve session ID and verification link. |
| Reveal acknowledgement fails               | Keep the real result visible and offer `Retry acknowledgement`; never replay the wager.                                     |
| Demo simulation fails                      | Return the demo stake, show `Demo round could not be simulated`, and keep the demo label.                                   |

Errors must not claim funds are safe unless the host snapshot proves the relevant state. Raw stack traces, RPC payloads, wallet addresses, and internal IDs other than the public session/transaction references must not appear in player copy.

## Standalone demo contract

Standalone mode exists so the submitted URL is immediately playable outside the Chain iframe.

- The demo badge is persistent in the header and result card.
- The starting balance is `1,000 demo credits` and resets on page reload.
- Demo wagers use the same min/max validation, paytables, integer rounding, reveal, and result components as host mode.
- Random bytes come from `crypto.getRandomValues`; `Math.random()` is forbidden.
- Demo output is local simulation, not Chain VRF, and must never display a transaction hash, verification badge, or “provably fair” claim for that round.
- The fairness panel says `This demo result was generated locally. Play through Chain for a VRF-settled, on-chain-verifiable round.`
- Demo history is labelled `Local demo history` and is cleared on reload.

## History, progression, and repeat play

The Signal Journal may show the latest 20 rounds, personal match records, and cosmetic signal badges. It must:

- label host and demo rounds separately;
- state that history does not predict future rounds;
- avoid hot/cold indicators, trend arrows, forecasts, streak betting prompts, and “due” language;
- never recommend a signal or wager;
- keep cosmetic unlocks economically inert.

Cosmetic badges may recognize authored shapes such as alternating, mirrored, or single-pulse signals. A badge may change visual or audio presentation only; it must not change probability, payout, RTP, balance, or eligibility for a prize.

The adaptive soundtrack may build layers across a session, but it must reset independently of game odds and must not imply that a winning state is accumulating.

## Accessibility and input

- Every beat is a native button with accessible name `Beat {index}: Tap` or `Beat {index}: Rest`.
- Tap and Rest differ by text, icon/shape, tone, and color; color alone is insufficient.
- `ArrowLeft` and `ArrowRight` move between beats; `Space` or `Enter` toggles one.
- Receiver cards, wager controls, Transmit, Skip reveal, and fairness actions are keyboard reachable in logical order.
- Focus remains visible. After settlement, focus moves to the result heading; Play again returns it to the first composer beat.
- Live-region announcements occur once for session opening, delayed randomness, and final result, not for every animation frame.
- The UI honors reduced motion and mute preferences from first render.

## Fairness panel

Before a wager, it shows:

- the one-sentence fairness summary;
- exact mode paytable, RTP, max payout, and perfect-match probability;
- the statement that all player patterns have the same distribution;
- total-payout and rounding definitions.

After a host-mode settlement, it also shows:

- session ID and transaction/explorer link when supplied by the host;
- mode and specification version;
- player and ghost signals in text and binary form;
- match count and payout basis points;
- a plain-language reconstruction of the payout;
- the Chain verification action.

It must distinguish “verifiable outcome integrity” from “positive expected value.” Provable fairness does not remove the house edge.

## Analytics boundaries

Product analytics may record mode, beat count, lifecycle timing, result tier, demo/host mode, and UI errors. It must not record wallet secrets, private bridge payloads, personal contact data, or infer that a player has found a predictive pattern.

## Implementation acceptance scenarios

The product is conformant only when automated or reproducible tests cover:

1. every valid signal for all three modes has the same match-count distribution;
2. every written paytable recomputes its exact RTP using integer basis points;
3. all malformed `gameData` values are rejected;
4. a known VRF word decodes to the same ghost signal and payout in Solidity, TypeScript, demo helpers, and fairness display;
5. duplicate Transmit is impossible while a session is active;
6. refresh during waiting and settlement recovers without opening a new session;
7. direct URL starts a clearly labelled, fully playable demo;
8. delayed randomness never causes a local result to appear;
9. reduced-motion and keyboard-only rounds complete successfully;
10. no rendered copy claims that a pattern or history changes future odds.

## Change control

Any change to encoding, bit order, receiver length, paytable, rounding, RTP, maximum payout, reveal acknowledgement, or fairness wording requires:

1. a specification version update;
2. matching contract and frontend changes;
3. regenerated golden vectors and distribution tests;
4. updated architecture and submission disclosures;
5. a migration decision for unsettled sessions.

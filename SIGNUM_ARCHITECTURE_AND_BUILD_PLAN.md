# Signum

Signum is a provably-fair, instant signal-matching casino game for Chain Jam Vol. 1.

The player composes a four-beat signal using Tap/Rest controls. Chain's VRF generates a four-beat ghost signal. The payout is based on the number of matching beats.

> Compose a signal. Receive Chain's echo.

## Product goals

- Ship a complete Chain Jam submission, not a prototype.
- Satisfy every binary eligibility requirement before visual polish.
- Make the first round understandable in under ten seconds.
- Make the reveal memorable through sound, waveform motion, and clear feedback.
- Keep the game instant and deterministic: one wager, one VRF request, one settlement.
- Make the declared RTP exactly match the Solidity paytable.

## Non-goals for the Jam build

- No multi-action session flow.
- No cash-out mechanic.
- No custom wallet connection or raw transaction signing in the guest frontend.
- No backend dependency for gameplay.
- No leaderboard, token, referral, or social system before the playable game is complete.

## Game rules and math

The player chooses a four-bit signal. `1` is Tap and `0` is Rest.

Example:

```text
1 0 1 1
```

Chain derives a uniformly distributed four-bit ghost signal from the VRF word. The contract counts equal positions.

| Matching beats | Total payout | Probability |
|---:|---:|---:|
| 0–1 | 0.00x | 5/16 |
| 2 | 0.40x | 6/16 |
| 3 | 1.40x | 4/16 |
| 4 | 7.40x | 1/16 |

```text
RTP = (6/16 × 0.40) + (4/16 × 1.40) + (1/16 × 7.40)
    = 96.25%
```

Implementation rules:

- Store payout multipliers as integer basis points: `0`, `4000`, `14000`, `74000`.
- Use the same integer rounding in Solidity, TypeScript previews, and tests.
- Derive four bits with bit extraction from the VRF word; never use `Math.random()` for a real outcome.
- Treat the contract as the only source of truth for settlement.
- Quote the exact maximum payout, top-tier probability, expected payout, and body variance required by the Chain risk interface.

## System architecture

```text
Player
  │
  ▼
Static Signum guest frontend
  │  @chain/casino-sdk/guest bridge
  │  openSession(wager, gameData)
  ▼
Chain host / CasinoGameFacet
  │
  ▼
SignumGame.sol implementing ICasinoGameV2
  │
  │ request randomness
  ▼
Verify Network VRF
  │
  ▼
onRandomness() → payout + encoded outcome → SETTLED
  │
  ▼
Host snapshot → reveal animation → revealOutcome()
```

The host owns the wallet, smart vault, signing, balance, session feed, and transaction lifecycle. The Signum iframe only renders the game and calls the bridge API.

## Contract design

`SignumGame.sol` implements `ICasinoGameV2`.

### `quoteCaps(wager, gameData)`

- Decode and validate the four-bit player signal.
- Return `maxEscrowStake >= wager`.
- Return the maximum reserved profit needed for the 7.4x outcome.

### `quoteRiskParams(wager, gameData)`

- `maxPayout`: 7.4x wager.
- `probabilityWad`: 1/16 for the perfect match tier.
- `expectedPayout`: 96.25% of wager, subject to the contract's integer rounding.
- `bodyVarianceScaled`: calculated according to the Chain SDK risk model and covered by tests.

### `onSessionStart(ctx)`

- Decode and validate `gameData`.
- Store the player signal in opaque `gameState`.
- Reserve the maximum possible profit.
- Return `WAITING_RANDOMNESS` with `requestRandomnessNow = true`.

### `onRandomness(ctx, randomness)`

- Derive the random four-bit ghost signal.
- Count matching positions.
- Select the payout basis points.
- Encode the ghost signal, match count, payout tier, and outcome version in `newGameState`.
- Return `SETTLED` with the payout.

### Unsupported actions

- `onPlayerAction`: revert because Signum is an instant game.
- `quoteForfeitPayout`: return `0` because there is no cashable intermediate state.

## Guest frontend architecture

The frontend is a small static Vite/React/TypeScript application.

### Runtime states

```text
IDLE
  → READY
  → OPENING_SESSION
  → WAITING_RANDOMNESS
  → REVEALING
  → SETTLED
```

### Host mode

- Call `connectGameToHost()` on mount.
- Save snapshots received through `GuestApiV1.setState()`.
- Enable betting only after the bridge promise resolves and the host wallet is ready.
- Call `openSession({ wager, gameData })`.
- Read the latest settled session from `HostSnapshotV1`.
- Animate the ghost signal.
- Call `revealOutcome({ sessionId })` after the reveal finishes.
- Destroy the bridge connection on unmount.

### Standalone mode

When no Chain host is present, Signum must boot into a clearly labelled demo mode:

- Simulated balance.
- Local simulated rounds.
- No claim that the demo result is on-chain.
- Same UI and reveal animation as host mode.

## Frontend composition

- `SignalComposer`: four Tap/Rest cells with keyboard and pointer support.
- `WagerPanel`: amount, balance, max-bet validation, and play button.
- `SignalPreview`: animated waveform representing the selected signal.
- `WaitingState`: Chain randomness request state with no fake outcome.
- `RevealAnimation`: sequentially reveals each ghost beat and match marker.
- `ResultCard`: payout, match count, replay action, and verification link.
- `FairnessPanel`: session ID, transaction link, decoded signals, and verification explanation.
- `SoundEngine`: small Web Audio layer for tap, rest, match, miss, and jackpot sounds.
- `DemoHost`: standalone adapter implementing the same view model without pretending to be Chain.

## Manifest and hosting

`public/game.manifest.json` must declare:

- `gameId: signum`
- `schemaVersion: 1`
- `apiVersion: 1`
- English name and description
- `presentation.mode: full-iframe`
- `capabilities.openSession: true`
- `capabilities.submitAction: false`
- `capabilities.forfeitExpiredSession: false`
- `capabilities.cancelStuckRandomness: true`
- `capabilities.resize: true`

The hosted page must:

- Serve `game.manifest.json` from the same origin.
- Load near-instantly.
- Work directly outside the Chain iframe.
- Permit iframe embedding.
- Include the Jam widget:

```html
<script async src="https://jam.chain.wtf/widget.js"></script>
```

## Repository structure

```text
signum/
├─ contracts/
│  ├─ SignumGame.sol
│  └─ ICasinoGameV2.sol
├─ src/
│  ├─ app/
│  ├─ bridge/
│  ├─ components/
│  ├─ game/
│  │  ├─ encoding.ts
│  │  ├─ math.ts
│  │  └─ outcome.ts
│  ├─ standalone/
│  └─ styles/
├─ public/
│  ├─ game.manifest.json
│  └─ index.html
├─ simulator/
│  └─ contracts/
│     └─ SignumGame.sol
├─ tests/
│  ├─ math.spec.ts
│  ├─ contract.spec.ts
│  ├─ bridge.spec.ts
│  └─ lifecycle.spec.ts
├─ docs/
│  ├─ fairness.md
│  └─ submission-checklist.md
├─ README.md
├─ package.json
└─ SIGNUM_ARCHITECTURE_AND_BUILD_PLAN.md
```

## Milestones

### Milestone 0 — Project setup

- Create the repository and baseline README.
- Install Node 22+, the Chain SDK, Vite, React, TypeScript, Vitest, and formatting/lint tooling.
- Add the Jam widget placeholder and manifest skeleton.
- Add CI for install, typecheck, lint, tests, and build.

Exit condition: clean empty app builds in CI.

### Milestone 1 — Game math specification

- Freeze the signal encoding.
- Freeze the payout table and RTP calculation.
- Implement shared TypeScript math.
- Add exhaustive tests across all 16 player signals and all 16 random signals.
- Document rounding and risk assumptions.

Exit condition: TypeScript math and the written paytable agree exactly.

### Milestone 2 — Solidity contract

- Vendor the canonical `ICasinoGameV2.sol`.
- Implement `SignumGame.sol`.
- Implement caps, risk quotes, session start, randomness settlement, and unsupported action reverts.
- Add Solidity tests for every payout tier and invalid input.

Exit condition: contract compiles and deterministic tests pass.

### Milestone 3 — Local simulator integration

- Drop the contract into the simulator.
- Register Signum in the local game picker.
- Run real open → `WAITING_RANDOMNESS` → VRF → settlement flows.
- Test delayed randomness and stuck-randomness cancellation.

Exit condition: a real local bet settles through the simulator without mocks.

### Milestone 4 — Host bridge frontend

- Implement `connectGameToHost()`.
- Render `HostSnapshotV1` into the game view model.
- Implement wager validation and `openSession()`.
- Implement settled session detection and `revealOutcome()`.
- Add explicit disconnected/setup-required/error states.

Exit condition: the simulator can play Signum end to end through the iframe.

### Milestone 5 — Standalone playable mode

- Add demo host adapter.
- Support direct URL play without Chain.
- Clearly label demo mode.
- Keep host and standalone render paths visually identical.

Exit condition: direct URL opens into a playable demo with no wallet errors.

### Milestone 6 — Visual and sound identity

- Build the sonar/signal-room visual system.
- Add responsive Tap/Rest interactions.
- Add waveform motion and sequential reveal.
- Add handcrafted Web Audio feedback.
- Add reduced-motion support and keyboard accessibility.

Exit condition: a first-time player understands the game and wants to replay it.

### Milestone 7 — Fairness and hardening

- Add fairness panel and transaction/session links.
- Add payout distribution simulation.
- Test all malformed game data paths.
- Test iframe resize and embedding headers.
- Test mobile viewport and slow-network behavior.

Exit condition: no known eligibility, payout, or host lifecycle failure remains.

### Milestone 8 — Submission release

- Build and deploy the static site.
- Verify the Jam widget from the deployed HTML.
- Verify standalone and iframe modes from the deployed URL.
- Submit the exact declared RTP.
- Share source access with the Chain review team.
- Record the final contract address and deployed URL in the README.

Exit condition: submission checker accepts the URL.

## Definition of done

Signum is ready when:

- The contract implements `ICasinoGameV2` correctly.
- The local simulator completes real VRF-backed rounds.
- The declared 96.25% RTP matches the actual integer paytable.
- The frontend works inside Chain and standalone.
- The result is not revealed before settlement.
- The Jam widget is present on the deployed page.
- The UI is polished enough to score on visual and sound quality.
- The repository contains reproducible setup, tests, fairness notes, and submission instructions.

# Signum complete-product architecture

Status: **Approved implementation contract for Complete Product v1**  
Milestone: [Signum Complete Product v1](https://github.com/EcstaceeLOR/Signum/milestone/1)  
Epic: [#78](https://github.com/EcstaceeLOR/Signum/issues/78)  
Last reviewed: 2026-09-25

## Product boundary

Signum v1 is a complete route-based product built around the existing verified game engine. The Solidity lifecycle, Chain bridge, encoding, paytables, randomness verification, and exhaustive math remain canonical. The rework replaces the current single-screen presentation and state ownership; it does not fork or rewrite game math.

The release is not complete while any page contains placeholder content, dead navigation, fake account or history data, an unexplained disabled control, a broken direct link/reload, or a failure state with no recovery action.

## Product map

```mermaid
flowchart TD
  Home[/ Home] --> Play[/play Play setup]
  Home --> Learn[/how-it-works]
  Home --> Fairness[/fairness]
  Play --> Round[/play/:receiver Active round]
  Round --> Result[/results/:roundId Receipt]
  Result --> Play
  Result --> History[/history]
  History --> Detail[/history/:roundId]
  Detail --> Result

  Shell[Global application shell] --> Home
  Shell --> Play
  Shell --> History
  Shell --> Learn
  Shell --> Fairness
  Shell --> Responsible[/responsible-play]
  Shell --> Settings[/settings]
  Shell --> Support[/support]
  Shell --> NotFound[Not found]
```

## Route contract

| Route               | Purpose                                                                                              | Primary action                             | Data authority                                                                        | Direct-link and reload behavior                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `/`                 | Explain Signum and establish the demo/Chain distinction                                              | Play Signum                                | Static canonical product data plus environment                                        | Always renders standalone; embedded entry redirects to `/play`                          |
| `/play`             | Check readiness, compare receivers, set wager, and accept real-play eligibility                      | Continue with selected receiver            | Chain host snapshot in embedded mode; versioned demo state standalone                 | Restores valid setup selections; invalid host data fails closed                         |
| `/play/:receiver`   | Compose, commit, wait, reveal, cancel/recover, and settle one round                                  | Transmit signal / resume round             | Active-round state plus authoritative host session in Chain mode                      | Validates receiver; reconstructs pending/settled host session before enabling actions   |
| `/results/:roundId` | Show a complete immutable receipt immediately after settlement                                       | Play again                                 | Versioned local receipt derived from authoritative settlement or labelled demo result | Renders receipt, missing/expired recovery, or environment mismatch; never invents proof |
| `/history`          | Browse locally indexed receipts with explicit retention and environment boundaries                   | Open receipt                               | Versioned local receipt index                                                         | Empty/corrupt/unavailable-storage states remain useful                                  |
| `/history/:roundId` | Reopen a historical receipt                                                                          | Play again                                 | Same canonical receipt component and local record as Results                          | Missing records offer History, Play, and Support recovery                               |
| `/how-it-works`     | Teach the round journey, terms, receiver differences, and demo/Chain model                           | Start playing                              | Canonical receiver definitions and reviewed content                                   | Supports stable section anchors and heading focus                                       |
| `/fairness`         | Publish paytables, RTP derivation, pattern independence, rounding, VRF flow, and verification states | Start playing / inspect source             | Canonical receiver/math modules and source links                                      | Automated drift checks bind displayed values to game math                               |
| `/responsible-play` | Present independence, limits, breaks, eligibility, terms, and support resources                      | Return to Play / open support              | Reviewed static content plus local reminder preference                                | External links are labelled and validated                                               |
| `/settings`         | Control sound, motion, tutorial, reminders, diagnostics, and local data                              | Save/reset scoped preference               | Versioned local preferences only                                                      | Storage denial falls back to session state with explanation                             |
| `/support`          | Diagnose environment/build and provide recovery instructions                                         | Export diagnostics / retry relevant action | Privacy-safe runtime capabilities and diagnostics                                     | No fake chat or unsupported contact workflow                                            |
| `*`                 | Recover from an unknown URL                                                                          | Home / Play / Support                      | Route metadata only                                                                   | Vercel serves the SPA shell with a real product 404 page                                |

## Entry behavior

### Standalone

- `/` is the default entry and identifies the experience as a local no-money demo.
- The user follows Home → Play setup → Active round → Result → History.
- Standalone receipts never display a contract address, transaction hash, or VRF-verified badge.
- `?showcase=1` remains an explicitly labelled media/test fixture and is excluded from normal navigation.

### Embedded Chain host

- A root iframe load redirects to `/play` after environment detection so a host user does not traverse marketing content before account readiness.
- The Chain host remains the sole authority for wallet state, token metadata, limits, signing, randomness, cancellation, and settlement.
- Navigating to educational/settings routes does not destroy the shared bridge connection or active session identity.
- Returning to Play reconciles the latest host snapshot before any wager action is enabled.
- Content resize reporting follows the routed page content and remains active for the shared shell.

## Global navigation

Desktop primary navigation contains **Home**, **Play**, **History**, and **Learn**. Learn opens links to **How it works** and **Fairness**. Utility navigation contains **Responsible play**, **Settings**, and **Support**.

Mobile uses one accessible menu with the same destinations and ordering. It must:

- expose its expanded state;
- move focus into the menu when opened;
- close on Escape, destination selection, and outside interaction;
- restore focus to the trigger;
- never cover a pending-session recovery action without an accessible close control.

The current environment pill is persistent but not interactive. A pending Chain round adds a persistent **Resume round** navigation action. Active route styling cannot rely on color alone.

## Navigation and focus rules

- Every route change moves focus to the page heading, except browser back/forward restores the prior meaningful focus when available.
- A skip link targets the routed main content.
- Browser back from an uncommitted Play page is immediate.
- Leaving a committed unresolved round requires confirmation; choosing to stay restores focus to the triggering control.
- A settled round uses `replace` navigation to its Result receipt so Back does not replay submission.
- Invalid receiver names redirect to `/play` with an actionable message; unknown receipt IDs remain on the requested route with a recovery state.
- Query parameters may select non-authoritative presentation options but never encode wager authority, settlement, or a claimed proof.

## State ownership

| State                    | Owner                       | Persistence                                            | Rules                                                                                       |
| ------------------------ | --------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Environment              | Runtime detector            | None                                                   | Standalone or embedded is derived, never user-forged into Chain authority                   |
| Host connection/snapshot | Shared Chain provider       | Host-managed                                           | One connection survives route transitions; malformed authority fails closed                 |
| Play setup               | Product state provider      | Session plus safe local preference                     | Receiver may persist; wager is revalidated against every fresh snapshot                     |
| Active round             | Round coordinator           | Minimal versioned recovery record plus host session ID | No duplicate submit; Chain host is authoritative after commitment                           |
| Receipts/history         | Receipt repository          | Versioned capped local store                           | Demo and Chain records are separated; local index is not claimed as complete wallet history |
| Preferences              | Preferences repository      | Versioned local store                                  | Sound, tutorial, reminders, and display choices cannot affect math                          |
| Diagnostics              | Bounded in-memory collector | Export only on explicit action                         | No wallet address, signal, wager, outcome, secret, or analytics event                       |

All repositories must tolerate denied storage, quota exhaustion, invalid JSON, old schema versions, and cross-tab updates. Migrations are deterministic and covered by fixtures. Reset actions are scoped; clearing preferences must not silently clear history, and clearing local history must not claim to erase on-chain activity.

## Page-state matrix

Every data-bearing route implements these states rather than relying on an indefinite spinner:

| State                      | Required behavior                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| Loading                    | Stable skeleton, accurate status text, no enabled authority-dependent action                   |
| Ready                      | Complete content and a clear primary action                                                    |
| Empty                      | Explain why there is no data and provide the next useful destination                           |
| Recoverable error          | Name the failed boundary and expose Retry plus Support when relevant                           |
| Offline                    | Keep static/local content readable; disable Chain actions with an explicit network explanation |
| Invalid/corrupt local data | Quarantine/reset only the affected scope and explain what was preserved                        |
| Fatal route error          | Preserve global navigation, build ID, diagnostics export, and safe reload/home actions         |

## Component migration

| Current implementation                                                | Complete-product destination                                                                |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `App.tsx` environment, guide, eligibility, host, and layout ownership | `AppProviders`, `AppRouter`, and shared `AppShell`                                          |
| Hero and `SignalPreview`                                              | Home page presentation components                                                           |
| `ChainHostScreen` / `DemoModeScreen`                                  | Shared environment/readiness status used by Play and Support                                |
| `FirstRunGuide`                                                       | How It Works content plus optional first-run route prompt                                   |
| `ResponsiblePlayPanel`                                                | Responsible Play page plus concise contextual Play notice                                   |
| `SignalWorkbench`                                                     | Play setup, Active Round, and Result page compositions; underlying game hooks remain shared |
| `FairnessPanel`                                                       | Fairness page and contextual receipt summary                                                |
| `SignalJournal`                                                       | History index and shared Receipt Detail                                                     |
| Footer diagnostics button                                             | Settings and Support actions; footer keeps a lightweight Support link                       |

Page modules may compose game components, but page routes do not duplicate encoding, payout, receipt reconstruction, or receiver definitions.

## Content and metadata

Each page has one visible `h1`, a unique document title in the form `Page · Signum`, a useful description, and canonical Vercel URL. Home owns the social preview image. Result/history identifiers are excluded from generic social metadata, and no private runtime values are emitted into document metadata.

## Responsive and accessibility contract

- Complete layouts at 320px, 768px, 1024px, and wide desktop without horizontal page scrolling.
- Usable at 200% zoom and with text spacing overrides.
- Keyboard access and visible focus for every action; no pointer-only interaction.
- Route announcements, status live regions, reduced motion, system contrast support, and mute remain functional.
- Axe reports no critical/serious violation on any stable page.
- Motion and audio remain cosmetic and non-predictive.

## Explicitly out of scope for v1

Signum will not fabricate completeness with unsupported features. V1 does not add:

- a Signum account or authentication layer when Chain owns wallet identity;
- a server database solely to claim cloud history;
- a leaderboard, social feed, referral system, or chat;
- fake support availability;
- strategy, prediction, streak, or personalized-odds claims;
- an alternate contract/math implementation for standalone mode.

These exclusions remove misleading surface area; they do not permit incomplete behavior in the routes that do ship.

## Delivery order

1. Routed shell and global providers: #80 and #81.
2. Complete primary journey: #82 through #86.
3. Complete supporting destinations: #87 through #89.
4. Failure handling and cross-route verification: #90 and #91.
5. Human and independent release acceptance: #92, retaining #27 and #33.

## Definition of complete

The product is complete only when:

- every route above is deployed, directly loadable, navigable, responsive, and accessible;
- standalone and embedded journeys finish from entry through a truthful receipt;
- reload, back/forward, disconnect, delayed randomness, corrupt storage, offline, and not-found paths recover safely;
- every visible control performs its documented action;
- canonical math, contract, bridge, manifest, and displayed copy agree;
- full-product E2E, five real first-time-player sessions, and independent review pass against the exact production commit;
- no critical/high finding or known placeholder remains.

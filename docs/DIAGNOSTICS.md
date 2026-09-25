# Privacy-safe production diagnostics

Signum sends no analytics or diagnostic event to a third party. The **Export diagnostics** control creates a JSON file locally, only after the player asks for it.

The export contains:

- the immutable deployment commit supplied as `VITE_BUILD_SHA`;
- generation time and whether the app is embedded;
- browser capability booleans for secure context, cryptographic randomness, Web Audio, local storage, and reduced-motion preference;
- the current demo/bridge/render stage;
- at most 25 in-memory error-code events and JavaScript error type names.

It never includes wallet addresses, private keys, seed phrases, balances, wager amounts, player signals, round history, transaction/provider payloads, IP addresses, or persistent identifiers. Events are held only in memory and disappear on reload. The downloaded file remains under the player's control and is retained only if they choose to save or share it.

`APP_RENDER_FAILURE` activates a recoverable full-page boundary with reload and export controls. Existing bridge, VRF, iframe, manifest, and reveal recovery procedures are documented in `docs/OPERATOR_RUNBOOK.md`.

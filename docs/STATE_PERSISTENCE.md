# Signum state and recovery boundary

Signum treats Chain as authoritative for wallet identity, limits, signing, randomness, and settlement. The browser stores only the minimum product state needed to preserve continuity.

## Versioned local records

Every current record uses an envelope with `version`, `updatedAt`, and `data`:

- `signum.preferences`: tutorial, eligibility, sound, and diagnostics choices.
- `signum.demo`: demo-only balance and the latest local demo session.
- `signum.signal-journal.v1`: local receipts, migrated from the former unversioned array.
- `signum.session.chain`: the minimum active Chain commitment/session identifiers.
- `signum.session.demo`: the minimum active demo commitment/session identifiers.

Chain and demo keys are deliberately separate. No wallet address, private key, signature, auth token, or unrestricted transaction payload is stored.

## Recovery behavior

- Active Chain sessions reconcile against the fresh host snapshot after navigation or reload; the host snapshot always wins.
- Active demo sessions restore their deducted balance and finish locally after reload.
- Settled results are reconstructed from the host/demo snapshot and then copied into the local receipt journal.
- Invalid data is copied to a timestamped `.recovery.*` key when possible, reset only for that section, and reported to the user.
- Storage denial or quota exhaustion falls back to in-memory state without blocking play.
- Valid `storage` events update preferences and history across tabs; malformed events are ignored.

Legacy tutorial, eligibility, sound, and journal values are read and migrated. They are never allowed to override a newer explicit value.

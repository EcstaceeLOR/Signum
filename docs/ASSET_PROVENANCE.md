# Signum asset provenance

Signum's player-facing visual and audio system is authored entirely in this repository. No stock, generated, scraped, or third-party media assets are shipped by the game.

## Visual system

- The signal-room backdrop, sonar rings, waveforms, pulse states, match/miss states, and jackpot motion are CSS gradients, borders, transforms, and keyframes in `src/styles.css`.
- The Signum mark and all interface symbols are text and CSS geometry. There are no external icon fonts, raster images, SVG downloads, or AI-generated visuals.
- Typography uses the local system font stack; Signum does not download a webfont.
- `https://jam.chain.wtf/widget.js` is the event organizer's required Chain Jam widget and remains an external runtime dependency rather than a Signum-owned asset.

## Audio system

- Every cue and soundtrack layer is synthesized at runtime with the browser Web Audio API in `src/game/useSignumSound.ts`.
- Tap, Rest, match, miss, win, and receiver ambience are oscillator frequencies and gain envelopes authored for Signum. No audio samples or music recordings are bundled or fetched.
- Pulse, Carrier, and Deepwave use distinct frequency profiles. The ambient layer is cosmetic only and never reads randomness or changes game math.
- Sound starts only after a player gesture, can be muted at all times, persists the mute preference locally, and suppresses the continuous soundtrack when reduced-motion preference is active.

## License

Repository-authored code and generated-at-runtime output follow the repository's project license. The Chain Jam widget remains governed by Chain's own terms.

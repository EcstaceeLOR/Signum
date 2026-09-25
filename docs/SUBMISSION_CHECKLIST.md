# Chain Jam submission checklist

## Canonical release details

- Game URL: <https://ecstaceelor.github.io/Signum/>
- Public manifest: <https://ecstaceelor.github.io/Signum/game.manifest.json>
- Repository: <https://github.com/EcstaceeLOR/Signum>
- Game name: Signum
- Category: Original casino game / provably fair signal matching

## Published RTP and maximum payout

| Receiver |       RTP | Maximum payout |
| -------- | --------: | -------------: |
| Pulse    |    96.25% |          7.40× |
| Carrier  | 96.09375% |         21.50× |
| Deepwave | 96.09375% |         40.00× |

## Release proof

- [ ] The GitHub Pages deployment for the intended `main` commit is green.
- [ ] Record the deployed commit SHA in the DoraHacks submission notes.
- [ ] `npm run deployment:check -- https://ecstaceelor.github.io/Signum/` passes.
- [ ] The URL loads standalone over HTTPS.
- [ ] The URL renders inside a cross-origin iframe without a frame-policy error.
- [ ] `game.manifest.json` returns HTTP 200 and `gameId: signum`.
- [ ] The deployed HTML contains `https://jam.chain.wtf/widget.js`.
- [ ] The production UI and submission copy show the RTP and payout table above.
- [ ] The contract address and target Chain network are recorded after production deployment.

GitHub Pages deploys the exact `dist` artifact built from `main`; it does not rebuild during the deploy job. This keeps the public release tied to the tested repository commit shown by the workflow run.

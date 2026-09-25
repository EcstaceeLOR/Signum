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

- [x] The complete-product CI run is green: [`36181869651`](https://github.com/EcstaceeLOR/Signum/actions/runs/36181869651).
- [x] The exact complete-product Pages artifact is deployed: [`36181869582`](https://github.com/EcstaceeLOR/Signum/actions/runs/36181869582).
- [x] Record the tested application commit in the submission notes: `e2f19ac7e82b3659a75270a608923905639fed61`.
- [x] `npm run deployment:check` passes against Vercel and the Pages root.
- [x] Vercel directly serves every stable product route and the product not-found route with HTTP 200.
- [ ] Re-run the Pages smoke after the SPA fallback in `db96dfea0ff7ef8f4b59f61498bac44f5b5de248` reaches `main`.
- [x] The URL loads standalone over HTTPS.
- [x] The URL renders inside a cross-origin iframe without a frame-policy error.
- [x] `game.manifest.json` returns HTTP 200 and `gameId: signum`.
- [x] The deployed HTML contains `https://jam.chain.wtf/widget.js`.
- [x] The production UI and submission copy show the RTP and payout table above.
- [ ] Five privacy-safe first-time-player sessions pass `docs/PLAYTEST_PROTOCOL.md`.
- [ ] A reviewer who did not implement Signum signs `docs/RELEASE_AUDIT.md` against the release commit and URL.
- [ ] The contract address and target Chain network are recorded after production deployment.

GitHub Pages deploys the exact `dist` artifact built from `main`; it does not rebuild during the deploy job. This keeps the public release tied to the tested repository commit shown by the workflow run.

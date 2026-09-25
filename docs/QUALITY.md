# Accessibility, mobile, and performance quality gates

Signum treats keyboard access, motion preferences, narrow viewports, and fast delivery as release requirements rather than optional polish.

## Accessibility and input

- Every round can be completed with the keyboard alone.
- Native radio controls select receivers. Arrow keys use the browser's expected radio-group behavior.
- Beat buttons toggle with `Space` or `Enter`. Arrow keys move between adjacent beats, wrap at either edge, and `Home`/`End` jump to the first/last beat.
- Settlement moves focus to the result heading. “Compose another signal” returns focus to the first beat.
- All controls expose visible focus states and accessible names.
- The sound toggle is always available, exposes its pressed state, and persists the player's choice locally.
- `prefers-reduced-motion: reduce` removes non-essential transitions and shortens the result reveal.
- The production-browser suite runs axe against WCAG 2 A/AA rules and fails on serious or critical violations.

## Mobile viewport

The production-browser suite covers a 390 × 844 viewport and rejects horizontal document overflow. Touch targets remain native buttons or form controls, and the composer reflows without hiding game state.

## Performance budgets

`npm run build` measures the generated JavaScript and CSS with Node's gzip implementation and fails if any budget is exceeded:

| Resource         | Gzip limit |
| ---------------- | ---------: |
| JavaScript       |     116 kB |
| CSS              |      10 kB |
| JavaScript + CSS |     125 kB |

These budgets cover first-party runtime assets. The Chain Jam widget is loaded asynchronously by the host integration and does not block Signum's initial render.

## Release checks

Run `npm run ci` for static checks and unit tests. Run `npm run test:e2e:routing` for every stable standalone route, navigation, metadata, mobile navigation, axe scans, and browser error checks. Run `npm run test:e2e:simulator` for the production build, Chain simulator, local contract, keyboard/mobile flow, and real VRF lifecycle.

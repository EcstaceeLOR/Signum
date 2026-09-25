# First-time player test protocol

Status: **vertical slice ready; five human sessions required before closing Issue #27**

Use the public standalone build at <https://ecstaceelor.github.io/Signum/>. Do not explain the rules before timing starts, do not collect names, wallet addresses, recordings, IP addresses, or contact details, and do not ask testers to use real funds.

## Session script

1. Assign an anonymous ID `P01`–`P05` and record the viewport class only: desktop or mobile.
2. Say: “This is a no-funds demo. Please play one round and talk through what you think is happening.” Start the timer when the page appears.
3. Stop first-play time when **Transmit demo wager** is activated with a valid signal/wager.
4. After settlement ask, without hints:
   - “What did you choose?”
   - “What determined the payout?”
   - “Would a different Tap/Rest pattern improve your odds?”
   - “What is the difference between Pulse, Carrier, and Deepwave?”
   - “Would you play another round? Why or why not?”
5. Mark comprehension as passing only if the tester explains that their signal is compared beat-by-beat with a random echo, more matches select a payout, and no pattern improves the odds.
6. Record confusion as a short paraphrase, not a quote linked to identity.

## Acceptance calculation

- At least `4/5` sessions must pass comprehension after one round.
- Median first-play time must be below 30 seconds.
- Any blocker affecting wagering, receiver choice, result interpretation, demo disclosure, keyboard access, or mobile layout must be fixed or explicitly accepted in the findings table.
- Replay intent is directional evidence, not a release gate; record yes/no and the reason category.

## Results template

| ID  | Viewport | First play (s) | Comprehension | Replay  | Confusion / finding | Resolution |
| --- | -------- | -------------: | ------------- | ------- | ------------------- | ---------- |
| P01 | Pending  |              — | Pending       | Pending | Pending             | Pending    |
| P02 | Pending  |              — | Pending       | Pending | Pending             | Pending    |
| P03 | Pending  |              — | Pending       | Pending | Pending             | Pending    |
| P04 | Pending  |              — | Pending       | Pending | Pending             | Pending    |
| P05 | Pending  |              — | Pending       | Pending | Pending             | Pending    |

## Existing automated vertical-slice evidence

The production-browser suite already verifies the no-chain path at a 390 × 844 viewport with reduced motion: receiver selection, beat composition, mute persistence, demo wager, local secure-random settlement, result focus, replay focus, mobile overflow, and serious/critical axe violations. `npm run test:e2e:simulator` runs that scenario alongside the real Chain lifecycle. Automation proves functionality and accessibility, but it does not replace the five comprehension interviews above.

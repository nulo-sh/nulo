# Phase 3: the arc gate, in both browsers

2026-10-20, at `8123b6087`, host load1 about 140-150.

- Chrome, armed build: `token-list.test.ts` (2) 24.6 s and `rows.test.ts` (10) 76.2 s, all passed at retry 0.
- Firefox, armed build: `token-list.test.ts` (2) 53.1 s and `rows.test.ts` (10) 132.1 s, all passed at retry 0.
- Against the Phase 1 base runs, the token-list file moved 29.6 → 24.6 s on Chrome and 51.3 → 53.1 s on Firefox: within run-to-run spread, no added scenario.
- `bun run lint:actions` exit 0.

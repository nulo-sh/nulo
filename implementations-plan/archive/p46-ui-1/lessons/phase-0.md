# Phase 0 — planning log

## Recon

- One Sonnet Explore sweep over seven capabilities; findings in `recon.md`. Main surprises: the auth registry's confirm emits no event, and event-spliced rows are never decorated.

## Consults

- 2026-10-18, Codex (gpt-6.1-sol, high, read-only), plan audit round 1: `conditional approve` with three Medium findings.
  1. `AmountCard.test.ts` stubs `Flex`, so a `wrap-wrap` class check would fail on correct code. Accepted: mount the wrap cases with the real `Flex`.
  2. I4's fetch/event race: proposed `mode: "resync"`. Disputed: resync flashes "FETCHING AUTHWITS" over the list on every event. Codex withdrew it on resume; the race stays a closed known limit (plausible but unverified).
  3. Send had no browser measurement. Accepted: `send-amount-exact.test.ts` already renders the signed state; one-line label and balance-below checks go there, and line counts use `Range` text rects.
- 2026-10-18, Codex resume: `VERDICT: approve`.
- 2026-10-18, Opus 5.5 (Plan), plan audit: `conditional approve`. Two Medium: the chip needs the drawn `.title` wrapper (`.type` is `flex: 1`); Send needs a browser measurement (as Codex 3). Lows accepted: `HEADER` const, lock chip 26 → 28 px stated, testid-only e2e reads, armed rebuilds before smoke, unconditional wrap, search-after-add test, I2 margin, registered-token grant pictured. The 190 px floor: first filed as a known limit.
- 2026-10-18, Codex resume 2 on the revision: `approve`, noting the 190 px floor is plausible but unverified (the parser takes 80 digits a side). Per Proportion, a local fix wins: `overflow-wrap: anywhere`. Codex resume 3: `approve`.

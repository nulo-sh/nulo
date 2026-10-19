# Phase 2: the matrix, measured

- 2026-10-19 Unit: `general.test.ts` 21/21 with the reactive, scope-keyed gas mock; the service's two new cases green. Red proofs, each restored: `feeJuiceShown` inverted fails five Home cases; a "another profile" check that skips imported rows fails both new service cases.
- 2026-10-19 Chrome smoke, head armed build, retry 0: `stale-network` 4/4 and `security-backup` 3/3.
- 2026-10-19 Timing, each file alone, base 3f9f958c then head, back to back:
  - Chrome: `security-backup` 37.4 → 51.3 s (tests 19.2 → 36.4 s; the folded later-profile test 14.5 s); S1a 10.5 → 12.9 s.
  - Firefox: `security-backup` 42.0 → 73.1 s (tests 29.0 → 55.0 s; the later-profile test 25.5 s); S1a 15.6 → 32.8 s, with load at 263 by the head run's end, so it is re-timed.
- 2026-10-19 Firefox smoke, head armed build, retry 0: `security-backup` 3/3 and `stale-network` 4/4 (the timing runs).
- 2026-10-19 Network `fee-methods` on Chrome through `agent.sh`, retry 0: 8/8 in 574.7 s; "public gas only" 91.2 s locally, against 47.8 s on CI at 3f9f958c (CI's own after-figure comes with the push).
- The capture spec ran three times: the first scrolled the card under the pinned balance, and the second left a hairline under the one-row mockups. Each run's copy was deleted at once; `git status` stayed clean.

# fit-gate-1 phase 3: every surface the pass reads

- `origin/dev` merged first (`7eb5e6c5c`, #1028: the in-place update arrival; no overlap), so one run of D7's files is also the post-merge rerun of fit-240-2's three.
- D7's files at retry 0, armed smoke builds rebuilt after the merge, network proverless through `e2e:agent`. Batches stay under the host's 10-minute command bound.
  - Chrome smoke, 9 files: 59 passed, 1 skipped (`type-roles`, `viewers-csp`, `rows` 218 s; `legal-acceptance`, `restore-outcome`, `registration` 230 s; `backup-imported-account`, `passkey-backup`, `security-backup` 124 s).
  - Firefox smoke, 9 files plus `firefox-sidebar`: 64 passed (`type-roles`, `viewers-csp` 187 s; `rows`, `legal-acceptance` 282 s; `restore-outcome`, `registration`, `firefox-sidebar` 125 s; the three backup files 154 s).
  - Network: Chrome `type-roles-windows` 5 passed (256 s), `in-flight-send-guard` and `cancel-mid-prove` 2 passed (150 s); Firefox 5 passed (311 s) and 2 passed (137 s).
  - No red beyond the two Phase 1 named, so no list entry (D1) and no owner ask.
- `type-roles.test.ts` alone, armed build, retry 0, tests time: base Chrome 114.6 s, Firefox 196.8 s; after Chrome 125.7 s, Firefox 193.0 s. The planted test takes 0.7 s on Chrome and 1.5 s on Firefox; the rest of the difference is host load (load1 between 60 and 150 across the runs).
- Gate: lint, `typecheck:all`, `bun run test`, `bun run test:all` (14 workspaces), `check:plans` exit 0.

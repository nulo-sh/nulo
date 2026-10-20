# Phase 3: the arc gate, in both browsers

2026-10-20, at `8123b6087`, host load1 about 140-150.

- Chrome, armed build: `token-list.test.ts` (2) 24.6 s and `rows.test.ts` (10) 76.2 s, all passed at retry 0.
- Firefox, armed build: `token-list.test.ts` (2) 53.1 s and `rows.test.ts` (10) 132.1 s, all passed at retry 0.
- Against the Phase 1 base runs, the token-list file moved 29.6 → 24.6 s on Chrome and 51.3 → 53.1 s on Firefox: within run-to-run spread, no added scenario.
- `bun run lint:actions` exit 0.

## Review loop

- Round 1, Codex (gpt-6.1-sol, high, session `01a15b44`): **clean**, no material issue.
- Round 1, Opus `general-purpose` diff review: **changes**, wording only. Adopted: the fetch comment states the invariant and the trap ("no-cache" would revalidate with the stored validator) and sits on the `cache:` line in both files; `ARCHITECTURE.md:99` no longer makes `no-store` the cause of all four absences; OA-1 B names its cost to the e2e request loop. Not changed: `no-store`'s spec'd request headers (`Pragma`, `Cache-Control: no-cache`) are the same for every install.

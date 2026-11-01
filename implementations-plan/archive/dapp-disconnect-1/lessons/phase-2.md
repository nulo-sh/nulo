# dapp-disconnect-1: phase 2 (e2e, captures, the full gate) and the review loop

- 2026-11-01: network e2e at retry 0 on the fix's production code (`68382c2ac`; later commits change tests and one comment only): Chrome 4 files, 10 tests, 256 s; Firefox 4 files, 10 tests, 393 s. No new scenario, so no suite wall-clock change.
- 2026-11-01: Codex post-implementation round 1 (gpt-6.1-sol, high): approve, two low findings (failure cleanup, two comments), adopted. Opus diff review beside it: approve, four optional findings, adopted. Codex round 2 (resumed): approve. The pre-fix `service.ts` still turned the three cases red with the new cleanup.
- 2026-11-01: captures. `seedJournalRecord` stamps every row with a terminal time, so a seeded `queued` row drew as "Transaction failed"; the throwaway spec writes the row itself with `terminalAt: null`. History lists terminal rows only (`src/utils/activity-rows.ts:122`), so the honest "before" is History with no row for the held send.
- 2026-11-01: final head `30c36ebe8`: `bun run audit:vue` and `bun run test:all` green; network e2e at retry 0, Chrome 10/10 (285 s), Firefox 10/10 (404 s).

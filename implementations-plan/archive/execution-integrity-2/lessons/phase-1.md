# execution-integrity-2 · phase 1 (the worker)

- 2026-10-20 · Merged `origin/dev` (85edeb86, #971) before editing: `service.ts` moved (class-id binding), no overlap with `executeTransfer`; `index.md` conflicted on two appended lines, resolved by keeping both.
- Deviation: the RPC boundary's refusals (malformed figure, both figures) are tested in `service.estimate-queue.test.ts`, where the facade's existing fee-cap refusals already lived, not in the composition file.
- Red check: with `buildPass` restored to the strict comparison and no refusal, 7 new tests fail (the +10% control and the accepted-fee band in the executor and in composition, the three missing-figure refusals); the "asks" cases pass under both rules by design, which is why each rule has a control inside the band.
- Gate: `bun run lint` 0 (one format fix in the test file), `bun run typecheck:all` 0, execution suite 72 files / 1442 tests, `bun run test` 886 files / 14677 tests.

LESSONS_FILE=implementations-plan/execution-integrity-2/lessons/phase-1.md

# Phase 2 (arc 2) log

- **#1975.** Both helpers in `network/service.ts`; the five edits and the reset write's tail call them. The network and stale-network suites (343 tests, the evict-before-emit pins among them) pass unedited.
- **#1976, proving backends.** `PROVE_BACKENDS` plus one test per schema. `stored-shapes/snapshot.test.ts` passes with no new stamp.
- **Bundle check.** Chrome build at `368fa72aa` against base: the popup loads the same 174 modules (names with content hashes stripped), 4,012,957 bytes against 4,012,930; three dist entries change size, none new.
- **Arc 2 diff pass, Codex `gpt-6.1-sol` high.** Approve, no finding: every caller compared line by line with base; the stored shape's JSON Schema is identical for the old and new enum.
- **Gates.** lint, typecheck:all, build-storybook, test (1056 files), test:all exit 0 at retry 0 at `368fa72aa`; rerun after the `origin/dev` merge at the close-out head.

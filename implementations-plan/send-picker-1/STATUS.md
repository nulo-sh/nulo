# send-picker-1 status

- 2026-10-28: homed in the lane worktree; recon by one Sonnet explorer plus the planner's reads persisted (recon.md).
- 2026-10-28: plan drafted (light tier, one arc); audits next.
- 2026-10-28: round 1: Codex conditional approve (8 accepted), Opus conditional approve (10 accepted); plan revised; final fresh Codex pass next.
- 2026-10-28: final Codex pass conditional approve; condition 1 accepted (D4), condition 2 rebutted (needs an active token the failed fetch never sets); resumed check next.
- 2026-10-28: final Codex pass resumed: approve. Plan committed; arc 1 next (auto-continue).
- 2026-10-28: phase 1 green (1037 tests; lint, typecheck:all exit 0); 10 tests red on base.
- 2026-10-28: phase 2 green (`bun run test src/popup` 3271 passed; lint, typecheck:all exit 0); 47 tests red on base, of which the New token file's legacy cases are harness-only (rerun on base with the old cache mock: 7 red, all payload or report).
- 2026-10-28: phase 3 green (`bun run test src/components/composite/send src/popup/pages` 1201 passed; build-storybook and `audit:vue` exit 0, 16258 tests); 6 tests red on base.
- 2026-10-28: phase 4 green at retry 0. Per-file vitest times (Chrome / Firefox): S1 `send-picker-add.test.ts` 15.8 s / 18.8 s, again 9.1 s / 16.8 s (estimate 14 s / 18 s); N1's new test 18.0 s / 19.8 s (estimate 50 s / 60 s), `network/send-picker.test.ts` 70.3 s / 72.1 s with the existing test at 51.8 s / 50.5 s. Smoke gate (four files) green on both; `test:all` green.
- 2026-10-28: `token-list.test.ts`'s flagged case red on Firefox, 2 of 5 runs: its seeded SCAM token had no balance functions, so a background sync wrote a read zero and the picker's fold hid the row. The seed now names both balance functions; 4 of 4 Firefox runs green, then both smoke gates.
- 2026-10-28: implementation review: Codex round 1 conditional (1 accepted, fixed); Opus conditional (3 accepted and fixed, 1 owner ask recorded). Lint, typecheck:all, test:all exit 0 at b75eb01d1; the review fixes' tests red-first, then 347 passed across the touched files. Codex round 2 next.

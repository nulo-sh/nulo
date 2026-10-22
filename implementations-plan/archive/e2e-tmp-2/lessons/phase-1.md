# e2e-tmp-2 phase 1: the primitive, the cases, the self-test

- 2026-10-22: the armed Chrome build, then `import-stage-timing.test.ts` unmodified under a scratch `TMPDIR`: 17 passed, 3 `nulo-stage-log-*` dirs left. Changed: 17 passed, 0 left.
- 2026-10-22: mutation (`testTempDir` reduced to a bare `mkdtempSync`): exactly the refusal and the three "gone" cases failed; both controls passed and the `test.fails` case still failed as expected. The helper was staged first, so the restore was checked worktree against index: clean.
- 2026-10-22: gate green: lint, `typecheck:all`, `test` (914 files, 15,099 tests), `test:all`.
- 2026-10-22: commitlint reads a body line that starts with `it:` as a footer token and warns `footer-leading-blank`; reworded before pushing.
- 2026-10-22, A1 Codex r1 (session `01a164e2`): clean. A1 Opus review: clean; one optional TSDoc wording not taken. Loop converged.

# e2e-tmp-3 phase 0: planning consults and measurements

- **Base run** (`6da033705`): `bun run test:release` under an empty scratch `TMPDIR`, probe vars unset: exit 0, 341 pass, 10 skip, 23 s; left `nulo-release-probe-*`, `nulo-provenance-*`, `tag-by-hand-*` and `node-compile-cache`.
- **Provenance probe opt-in** (`NULO_PROVENANCE_PROBE=1`) on the base, scratch `TMPDIR`: 4 pass, 15 s; left only `node-compile-cache`.
- **Hook probes** (scratch files outside the repo): Bun 1.4.2 runs a skipped describe's body and none of its hooks; `onTestFinished` runs after pass, `test.failing` and a timeout, and throws outside `bun test`. vitest 4.1.10 runs no `afterAll` of a skipped suite.
- **Failure-path probes** (asked by Codex r1): an ordinary failed assertion runs `onTestFinished`; a `beforeAll` that throws after `mkdtempSync` still gets its `afterAll`; a timed-out test's continuation keeps running and recreated a dir its `onTestFinished` had removed (left 1 dir). GitHub answers `401` to `Authorization: Bearer ` (curl).
- **Codex r1** (gpt-6.1-sol, high): conditional approve. The timeout continuation moved both probes back to the base's `afterAll` lifetime; known limit #1079 filed and closed.
- **Opus 5.5 r1** (Plan): conditional approve. On a timeout Bun SIGTERMs the runner, which traps it and runs `close()` through `PATH`; removing the fake `gh` first would reach the real one. The hook kills and awaits the runner, then removes the dir.
- **Codex r2**: conditional approve (both release-probe tests fail on 401; the close-out names #1079). **Codex r3**: approve.

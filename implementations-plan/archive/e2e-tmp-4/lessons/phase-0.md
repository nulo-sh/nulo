# e2e-tmp-4 phase 0: planning consults and measurements

- **Base runs** (`2afb3260e`), from `apps/extension`: the three files under an empty scratch `TMPDIR` with `process.platform` stubbed to `"darwin"` by an extra setup file: exit 0, 2 passed, 42 skipped; left 3 empty dirs. All of `apps/extension/scripts/` under the stub: the same 3 dirs, nothing else; 4 files fail only under the stub (rolldown's native binding; they pass on Linux). On Linux under `/tmp`: 44 passed, 0 left.
- **Scratch `TMPDIR` length**: under `~/.cache/nulo-backlog/e2e-tmp-4/` 4 `owned-processes` cases fail (`createRunDir` refuses a socket path over 107 bytes) and one leaves `nulo-aztec-outside-*`. The Linux control runs under the default `TMPDIR`.
- **Hook probes** (vitest 4.1.10, Bun 1.4.2, scratch files outside the repo): no hook runs in a file whose every test is skipped, a module-level `afterAll` included; with one runnable test it runs; `afterAll` runs after a throwing `beforeAll`; `onTestFinished` runs after a failed assertion.
- **vitest CLI**: `--setupFiles` is not a CLI option in 4.1.10; the stub goes through a scratch config that spreads the extension's.
- **Codex r1** (gpt-6.1-sol, high, session `01a16532`): conditional approve. A `randomUUID()` suffix breaks 4 Linux cases on the socket budget; the `afterAll` removed a planted entry after `mkdirSync` threw (probe); `find -newer` on `/tmp` cannot attribute a dir; name the gates' working dirs.
- **Opus 5.5 r1** (Plan): conditional approve. The same suffix finding through the real `nodeTmpDir`; `rootMade`; a Linux after-proof for `outside` (step 8); scratch removal after Phase 2; per-file import wording; an invariant comment. Found an orphaned `sleep 120` (verified by the driver: ppid 1, `NULO_TEST_USER=1`): known limit #1082, filed closed.
- **#1078 extended** by a comment with D2 (`reconcile-lock`) and D3 (`outside`).
- **Codex r2** (resumed): approve; probed the five gate runs on an in-memory transform of the edits, no new finding.

# e2e-tmp-3 phase 1: the three dirs and the proof

All runs at the arc head, scratch `TMPDIR`s under `~/.cache/nulo-backlog/e2e-tmp-3/`, count = entries other than `node-compile-cache`.

- **Step 2, base** (`origin/dev` already merged, nothing new): `test:release` exit 0, 341 pass, 10 skip; count 3 (`nulo-provenance-*`, `nulo-release-probe-*`, `tag-by-hand-*`).
- **Step 4, after**: exit 0, 341 pass, 11 skip, 352 entries; count 0. The skip count moved because Bun 1.4.2 lists each hook of a skipped describe as a skipped entry: `attach-assets-run.test.ts` alone, from a base copy taken with `git show 6da033705:<path>`, reports 3 skipped (two tests and the `afterAll`), and 4 after (plus the new `beforeAll`). Recorded as D6.
- **Step 5**: `NULO_PROVENANCE_PROBE=1`: 4 pass, 16 s; count 0.
- **Step 6**: `env -u GH_TOKEN NULO_RELEASE_PROBE=1`: exit 1, 36 pass, 2 fail, both `HTTP 401: Bad credentials` (`GET releases`, `GET attestations/sha256:…`); count 0.
- **Diagnostic, the probe's `beforeAll` runs**: the same command under a read-only scratch `TMPDIR` failed in the hook with `EACCES … mkdtemp` at `attach-assets-run.test.ts:409`; step 6's 0 therefore follows a dir that was made and removed.
- **Diagnostic, kill before remove**: a sentinel `gh` and `git` (each appends its argv to a log and exits 0) first in the outer `PATH`, so second after the fakes, and `bun test scripts/release/tag-by-hand-run.test.ts -t "SIGTERM to it alone" --timeout 200` to force the timeout. With the fix: the test timed out, 0 sentinel calls, 0 dirs left. With the hook reduced to `rmSync` alone (the naive fix, restored from a saved copy afterwards): 2 sentinel calls, `gh api -X PUT repos/nulo-sh/nulo/rulesets/25437716 --input -` and a ruleset read. On a host without the sentinel those are the owner's real `gh`.
- **Slip**: the naive run's cleanup used `pkill -f "^sleep 30$"` for the fake `gh`'s descendant, a name match that could hit another agent's `sleep 30`. Kill such a descendant by the pid its `calls.log` records.
- **Gate**: `bun run lint` 0, `bun run typecheck:all` 0, `bun run test:ci-gating` 0 (687 pass).

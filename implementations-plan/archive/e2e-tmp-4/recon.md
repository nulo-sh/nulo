# e2e-tmp-4 recon

Base: `origin/dev` at `2afb3260e`. One Explore agent (Sonnet) ran the reuse sweep; the driver read the three test files, probed vitest's hook rules, and ran the files under scratch `TMPDIR`s on Linux and under a platform stub.

## Base measurement

- **Non-Linux, simulated.** The three files (`webdriver-ownership`, `owned-processes`, `reconcile-lock`, all under `apps/extension/scripts/e2e/`) under an empty scratch `TMPDIR`, with the extension's own vitest config plus one setup file that sets `process.platform` to `"darwin"`: exit 0, files 1 passed and 2 skipped, tests 2 passed and 42 skipped. Left: `nulo-owned-processes-test-*`, `nulo-ownership-test-*`, `nulo-reconcile-lock-test-*`, each empty.
- **The whole `apps/extension/scripts/` set** under the same stub and an empty scratch `TMPDIR`: the same three dirs and nothing else. Four files fail under the stub only (`store-listing`, `strip-artifact-debug-info`, `e2e/shard-sequencer` at import: rolldown looks for a darwin native binding; `pages-options`: one case), so the stub cannot run that set as a gate.
- **Linux, default `TMPDIR`** (`/tmp`, on the overlay root disk here): the three files pass, 44 tests; no dir with the three prefixes or `nulo-aztec-outside-` is newer than a marker touched before the run.
- **Linux, long scratch `TMPDIR`** (`~/.cache/nulo-backlog/e2e-tmp-4/t-…`): 4 cases of `owned-processes` fail, `createRunDir` refusing a socket path over 107 bytes, and one of them leaves `nulo-aztec-outside-*` (`owned-processes.test.ts:238`, removed only by the test's last line, `:253`). A scratch dir short enough (at most 21 bytes) cannot live under `~/.cache`, so the Linux control runs under the default `TMPDIR`.

## Hook rules (vitest 4.1.10 on Bun 1.4.2, scratch files outside the repo)

- A module-level `afterAll` does **not** run when every test in the file is skipped: vitest marks the file's suite skipped and runs none of its hooks (a file with one `describe.skipIf(true)` left its dir). With one runnable test anywhere in the file, it runs.
- An `afterAll` inside a skipped `describe` never runs; a `beforeAll` inside one never runs, so a dir made there is never made.
- An `afterAll` runs after its block's `beforeAll` throws.
- `onTestFinished` runs after a failed assertion.

## Reuse map

| Need | Found | Verdict |
|---|---|---|
| Dir made and removed by a Linux-only block | `boot-guard.test.ts:152-164`: `let root = ""` in a `describe.skipIf(process.platform !== "linux")`, `mkdtempSync` in its `beforeAll`, `if (root) rmSync(…)` in its `afterAll` | **reuse** its shape for `reconcile-lock` |
| A path the imported modules read at import | `tests/e2e/lockfile.ts:44` (`E2E_DATA_ROOT` const from `NULO_E2E_DATA_ROOT`), consumed at import by `fixtures/browser/ownership.ts:28,31`; the two test files set the env var before `await import(…)` (`webdriver-ownership.test.ts:7-22`, `owned-processes.test.ts:8-38`) | the path stays fixed at import; only the dir moves |
| A test-scoped dir removed pass or fail | `onTestFinished` in `tests/e2e/helpers/backup-temp.ts`; `try/finally` in `retry-error-reporter.test.ts:22-30`, `proverless-guard.test.ts:25-42` | **reuse** `onTestFinished` for `outside` |
| A shared temp-dir helper for these tests | none exported under `apps/extension/scripts/` or `tests/`; `writeBackupToTemp` is backup-specific; e2e-tmp-2's `testTempDir` is not on `dev` | **not built**: three sites, idioms that exist |
| Platform stub precedent | none in the repo | scratch-only, for the proof |
| Module-scope `process.platform` reads | `tests/e2e/sandbox-ownership.ts:31` (`SOCKET_PATH_MAX`) and the `skipIf` arguments; `owned-processes.test.ts:512` reads it in a test body | the stub flips both, which matches what macOS presents |

## Same class elsewhere (sweep)

- Module-level dir with a module-level `afterAll` and a runnable test on every platform: `node-stub`, `port-registry`, `resolve-ports`, `egress-guard`, `backup-temp` (all `scripts/e2e/`), `packages/token-list` `keygen-cli`, `sign`. Safe.
- `stall-watchdog.test.ts`: dirs made inside tests, removed by a module `afterEach`; only on Linux. Safe.
- `reconcile-lock.test.ts:15-20`: the issue's working example. Its only `describe` is the Linux one, so on a non-Linux host its module `afterAll` never runs and `DIR` is left (measured above).

## Found beside the leak

- **The socket budget bounds the name.** `nodeTmpDir` refuses a socket path over 107 bytes (`tests/e2e/sandbox-ownership.ts:31-50`). Under `/tmp` the longest one `owned-processes` builds is 90 bytes with `mkdtemp`'s 6-character suffix; a 36-character `randomUUID()` suffix makes it 120 and 4 cases throw (both plan reviewers, probed).
- **An orphaned `sleep`.** The case at `owned-processes.test.ts:275` kills `sh -c "sleep 120; :"` by pid; the forked `sleep` runs on under init for up to 120 s (demonstrated). No dir or resource: known limit #1082, filed closed.

## Issue claims checked

- **#1078, the two files and the hook:** holds (`webdriver-ownership.test.ts:9,102-111`, `owned-processes.test.ts:10,139-148`), demonstrated under the stub.
- **#1078, "`reconcile-lock.test.ts` … is removed":** does not hold off Linux. Same command, same consequence: a third dir.
- **#1078, "holding what each file's module scope writes":** the imported modules write nothing at import; each dir is empty.
- **#1078's second fix ("move the `afterAll` to module level"):** does not work for `webdriver-ownership` (every test is Linux-only) and works for `owned-processes` only while its two cross-platform tests (`:414`, `:511`) exist.

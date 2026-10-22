# e2e-tmp-3 recon

Base: `origin/dev` at `6da033705`. One Explore agent (Sonnet) ran the reuse sweep; the driver read the three test files, probed Bun's and vitest's hook rules, and ran `test:release` and the provenance probe under scratch `TMPDIR`s.

## Base measurement

- `bun run test:release` with both probe vars unset and `TMPDIR` an empty scratch dir: exit 0, 341 pass, 10 skip, 23 s. Left: `nulo-release-probe-*` (empty), `nulo-provenance-*` (empty), `tag-by-hand-*` (`calls.log`, `gh`, `git`), and `node-compile-cache`.
- `node-compile-cache` is not a per-run leak: Node and Bun keep one compile cache per runtime version and uid there (`v1.4.2-x86_64-…`, `v24.21.0-x64-…`), reused across runs. This host's `/tmp` holds one.
- `NULO_PROVENANCE_PROBE=1 bun test scripts/publish/verify-provenance.test.ts` under a scratch `TMPDIR`: exit 0, 4 pass, 15 s; left only `node-compile-cache` (npm's). The opt-in path removes its dir.
- This host's `/tmp` held 10 `nulo-release-probe-*`, 10 `nulo-provenance-*` (issue #1076) and 31 `tag-by-hand-*`.

## Hook rules (probed, scratch files outside the repo)

- **Bun 1.4.2**: a `describe.skipIf(true)` body runs at collection; its `beforeAll`, `afterAll` and tests never run. `onTestFinished` (`bun-types` 1.4.2 `test.d.ts:381-401`) runs after a passing, a failing (`test.failing`) and a timed-out test; called outside `bun test` it throws before anything else.
- **vitest 4.1.10**: a skipped suite's `afterAll` never runs either (a one-file probe with an empty config).

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Dir shared by a describe's tests | none under `scripts/` makes it in `beforeAll`; three files make it at module level and remove it in a module-level `afterAll` (`publish/stage.test.ts:14-15`, `release/zip-read.test.ts:7-8`, `release/zip-reproducible.test.ts:10-11`). `verify-provenance.test.ts:18-22` already has the `beforeAll` that fills the dir | **reuse**: move `mkdtempSync` into that `beforeAll` |
| Dir one test owns | `try/finally` in the test is the dominant idiom (23 `finally` in `scripts/**/*.test.ts`; `release/store-copy.test.ts:142-160` does it inside a `skipIf` block). `onTestFinished`: 0 uses in `scripts/`; vitest's twin owns e2e dirs (`apps/extension/tests/e2e/helpers/backup-temp.ts`) | **reuse** Bun's `onTestFinished` (plan D1) |
| A shared temp-dir helper for root script tests | `scripts/ci-cd/plans/fixture-repo.ts:57-65` (`tempDir()` + a module `made[]` drained by `cleanupRepos()`, prefix `plans-gate-`, two callers in `ci-cd/plans/`). The e2e owner `testTempDir` (e2e-tmp-2, in flight) is a vitest module under `apps/extension`, which a root script must not import. Searched `scripts packages infra apps/extension/tests/e2e/helpers` for exported `*Temp*`, `*Tmp*`, `*Scratch*`, `*Sandbox*` | **not built**: three sites, two idioms that already exist |
| A test that runs `bun test` on another file | none under `scripts/` (searched `"bun", "test"`, `bun test`, `process.execPath`, `TMPDIR`, `readdirSync(tmpdir`). Nearest: `ci-cd/release-integrity.test.ts:1100-1125` runs a script with `TMPDIR` pinned | **not built** (plan D3) |

## Readers of the dirs

- `attach-assets-run.test.ts`: `dir` is read only in the first probe test (`:417-418`).
- `verify-provenance.test.ts`: `dir` and `tarball` are read only inside the describe (`:19-21`, `:48`).
- `tag-by-hand-run.test.ts`: `fakeTools()` (`:181-210`) has one caller (`:215`); the child gets the dir through `PATH`; the test kills the `sleep` descendant (`:225-226`).
- No workflow sets `NULO_RELEASE_PROBE` or `NULO_PROVENANCE_PROBE`. `test:release` runs in `_unit-tests.yml:38` and `publish-packages.yml:63`.

## Claims in #1076

- **Holds**: both `mkdtempSync` calls sit in a skippable describe body (`attach-assets-run.test.ts:406`, `verify-provenance.test.ts:15`); both `afterAll`s are inside the skipped block; one dir of each prefix per run (measured above).
- **Incomplete**: the same run leaves a third dir, `tag-by-hand-*`, by another cause: nothing removes it (filed as #1077).

## Neighbours

- **#1077** (filed here): `tag-by-hand-run.test.ts:182`, the third `test:release` dir. Plan D2 folds it into A1.
- **#1078** (filed here): `apps/extension/scripts/e2e/webdriver-ownership.test.ts:9` and `owned-processes.test.ts:10` make `ROOT` at import and remove it only in a Linux-only describe's `afterAll`, so a non-Linux `bun run test` leaves two dirs. Plausible but unverified on macOS. Other runner and workspace: no arc.
- Checked, clean: the other skippable blocks (`store-copy.test.ts:142`, `infra/*/test/live.test.ts`, `price/real-data.test.ts:16`, `stale-anchor.real.test.ts:76`, `reconcile-lock.test.ts:15-22`) make nothing in their bodies, or remove it at module level.
- No open lane edits `scripts/release/` or `scripts/publish/` test files (e2e-tmp-2 is in `apps/extension/tests/e2e/`).

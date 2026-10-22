# e2e-tmp-2 recon

Base: `origin/dev` at `6da033705`, which carries e2e-tmp-1 (#1074). One Explore agent (Sonnet) ran the reuse sweep; the driver read the file, the helper, its self-test and the vitest runner, and counted the host's leftovers.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| A temp dir the current test owns | `writeBackupToTemp` (`tests/e2e/helpers/backup-temp.ts:12-21`): registers `onTestFinished` removal, then `mkdtempSync(join(tmpdir(), "nulo-e2e-backup-"))`, then writes one file. The stage-log cases need the bare dir (its path goes into `NULO_E2E_STAGE_LOG_OUT`; one case nests a missing path under it) | **adapt**: its dir half becomes the primitive both use (plan D1) |
| Other owners | `contactsFiles()` (`helpers/contacts.ts:23-35`, `{ write, cleanup }`, `afterAll` or `finally` at each caller); `migration.test.ts:170-179` (`afterEach` removes one `let profileDir`); `scripts/e2e/stall-watchdog.test.ts:16-19` (a `cleanups[]` drained in `afterEach`); profile dirs in `try/finally` | not taken: each needs every caller to wire the owner |
| `onTestFinished` | vitest 4.1.10 (`@vitest/runner` `chunk-artifact.js`): per attempt, `afterEach` (`:2973`), fixture cleanup (`:2977`), then the test's `onFinished` hooks in reverse order (`:2983-2985`), then reset (`:2990`); the imported hook throws `Hook onTestFinished() can only be called inside a test` only with no current test (`:909-918`); the throwing guards at `:2582-2588` replace the *context* methods, so the imported hook called from `beforeEach`/`afterEach` registers and runs, and from inside an `onTestFinished` callback it registers after the snapshot and is dropped. Only user today: `backup-temp.ts` | **reuse as-is** |
| The owner's self-test | `scripts/e2e/backup-temp.test.ts` (unit layer, `bun run test`): own `TMPDIR` root, refusal outside a test, gone after a passing and after a failing test, prefix-filtered listing | **adapt** (plan D2) |
| A unit test that runs an e2e file | none runs a `tests/e2e/*.test.ts`. Nearest: `scripts/e2e/stall-watchdog.test.ts:11,26` spawns a nested vitest on a fixtures root with its own config. The smoke config's global setup needs the armed build in `dist/<browser>` (`global-setup-smoke.ts:41-65`), but `import-stage-timing.test.ts` and its helper import only `node:*` and vitest, so a nested `vitest run --no-config` (vitest 4.1.10) could run it without that setup. Searched `scripts/**` for `vitest.e2e`, imports of `tests/e2e/*.test`, `spawn(Sync)?(.*(vitest|bun)` | not built (plan, Not taken c) |
| A static guard on raw `mkdtempSync(join(tmpdir()` | none. Searched the `*-ban*` tests, `biome.json*`, `scripts/`, `.github/` | not built (plan, Not taken d) |

## Readers of the stage-log dir

`NULO_E2E_STAGE_LOG` (`helpers/import-stage-timing.ts:210`) and `NULO_E2E_STAGE_LOG_OUT` (`:219`, `stageLogPath`) are set only by `import-stage-timing.test.ts`; CI sets neither. The real recorder writes `nulo-probes-import-stages-<runId>.jsonl` straight under `os.tmpdir()`, which the network workflow's artifact glob `/tmp/nulo-probes-*.jsonl` collects (`_extension-network-e2e.yml:431`); the test's `nulo-stage-log-*` dirs match no glob. Nothing reads them after their case.

## Claims in #1071

- **Holds**: the three `mkdtempSync` calls at `import-stage-timing.test.ts:204, 214, 231`; the `afterEach` at `:193-198` restores the two env vars and removes nothing; the file is in the smoke selection (`vitest.e2e.config.ts:13`, `tests/e2e/*.test.ts`); the "enabled" case leaves its JSONL record in its dir.
- **Holds, larger**: this host held 159 `nulo-stage-log-*` dirs at 15:4xZ on 2026-10-22 (150 when filed). e2e-tmp-1's smoke runs each left three under a scratch `TMPDIR` (`archive/e2e-tmp-1/lessons/phase-2.md`).
- **Detail**: smoke runs with `retry: 2` by default (`vitest.e2e.config.ts:30`); each attempt makes a fresh dir, so the owner must act per attempt, as `onTestFinished` does.

## Neighbours

- **#1076** (filed here): `scripts/release/attach-assets-run.test.ts:406` and `scripts/publish/verify-provenance.test.ts:15` make a dir in a skipped `describe.skipIf` body; Bun 1.4.2 runs the body and never the block's `afterAll` (probe: a same-shaped file left 1 dir). One `nulo-release-probe-*` and one `nulo-provenance-*` per `test:release` run; 10 of each on this host. Other owner (`bun test`, `scripts/`), not this lane's scope.
- Checked, not filed: profile dirs in `import-dead-rpc`, `restore-outcome`, `import-errors-scroll`, `legal-acceptance`, `sealed-storage`, `backup-roundtrip` are made before the `try` whose `finally` removes them, so a launch that throws leaves one; 0 of those prefixes on this host. `nulo-e2e-contacts-*` (6) and `nulo-mig-e2e-*` (2) are removed by `afterAll`/`afterEach` and remain only after a killed run, the class of the closed known limit #1075.
- **#1026** (firefox-handoff-1) and **#1027** are on `dev`; no open lane edits `import-stage-timing.test.ts` or `helpers/backup-temp.ts`.

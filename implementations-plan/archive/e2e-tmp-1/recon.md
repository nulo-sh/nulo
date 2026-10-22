# e2e-tmp-1 recon

Base: `origin/dev` at `5c35ca934` (#1063 not yet merged, so `nodeTmpDir` and the node's run-dir `TMPDIR` are absent here). One Explore agent (Sonnet) for the reuse sweep; the driver read the helper, the vitest runner and the neighbours' diffs.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| A temp dir with a lifetime owner | `contactsFiles()` (`tests/e2e/helpers/contacts.ts:22-31`, `{ write, cleanup }`, callers' `afterAll(files.cleanup)`); `previewImport` (`helpers/account-io.ts:159-175`, `finally` after the pick); `runHandshakeImport` (`helpers/handshake-import.ts:77`, `finally`) | adapt the principle (one owner per dir), not the shape: each needs every caller to wire the owner |
| Cleanup bound to the test that made the resource | vitest's `onTestFinished` (4.1.10, `@vitest/runner` `chunk-artifact.js:799-801`, `:2983-2990`): runs at the end of each attempt, pass or fail, after `afterEach` and the cleanup of fixtures the test created, before `onTestFailed` and an `aroundEach` teardown, then resets; throws `Hook onTestFinished() can only be called inside a test` outside one (`:910-916`). Used in e2e test bodies today (`network/incoming-arrival.test.ts:94`, `network/delete-after-prove.test.ts:70`) | **reuse as-is** |
| A per-run dir teardown removes | network only: `createRunDir` (`sandbox-ownership.ts:32`) under `E2E_DATA_ROOT`, removed at teardown only when this run started the node (`global-setup.ts:864-865`); a reused lock keeps an earlier run's dir (`global-setup.ts:328`). Smoke: none (`global-setup-smoke.ts` only kills Chromes; provides `extensionPath`, `egressGuard`, `liveLeg`) | not reusable for smoke; rejected (plan D1) |
| A scan of `os.tmpdir()` for leftovers | none. Searched `tests`, `scripts`, `../../scripts`, root `package.json` for `readdirSync(tmpdir`, `readdirSync(os.tmpdir`, `nulo-e2e-*`, `nulo-*`: only `port-registry.ts` comments matched | not built (plan D5) |
| Harness self-tests | `apps/extension/scripts/e2e/*.test.ts`, run by `vitest.config.ts:37-39` (`scripts/**/*.test.ts`) under `bun run test`; e.g. `webdriver-ownership.test.ts` (own `mkdtemp` root, env pointed at it before import, `afterAll` removes it) | **reuse** the shape |
| A unit test importing `import-drivers.ts` | probe 2026-10-22: a `scripts/e2e/` test imported it (module import 3.8 s) and ran | **reuse** (no module split needed) |
| `os.tmpdir()` following `TMPDIR` at call time | probe: Bun and Node both return the new `TMPDIR` after `process.env.TMPDIR` changes | **reuse** for a hermetic self-test |

## Callers of `writeBackupToTemp` (25 call sites, 17 files)

Smoke (`tests/e2e/`): `account-import-export.test.ts:153`; `backup-imported-account.test.ts:86`; `backup-migration.test.ts:51,100`; `import-paths.test.ts:103` (before its `try`); `import-dead-rpc.test.ts:194,208,234`; `import-errors-scroll.test.ts:53` (local `backupFile`); `passkey-backup.test.ts:328`; `passkey-retry.test.ts:37` (local helper); `restore-outcome.test.ts:165` (before `withExtension`), `:216`, `:220`, `:232`, `:267`; `toolbar-panel.test.ts:565,608`.

Network (`tests/e2e/network/`): `account-balance-orphans.test.ts:146`; `backup-import-stalled-network.test.ts:63` (local helper); `backup-restore-integrity.test.ts:141`; `backup-migration-roundtrip.test.ts:85`; `profile-reimport-matrix.test.ts:112` (picked twice); `restore-again.test.ts:62` (local helper).

Through `helpers/crash-truth.ts:107` (`exportFundedBackup`, a module-level cache of the path, `:97-110`): `network/hero-prices-unavailable.test.ts:25` (one test); `network/backup-restore-sw-restart.test.ts:236,366` (two tests share the cached path; each re-imports it up to three times: `:263`, `:313`, `:336`).

Every call runs inside a test body or a helper called from one; none in `beforeAll`/`beforeEach` or at module scope. No e2e file uses `test.concurrent`.

## When the page reads the picked file

Chrome: `chooser.accept([path])` (`fixtures/browser/chrome.ts:320-323`). Firefox: `input.uploadFile(path)` (`fixtures/browser/firefox.ts:618-631`); neither copies the file. The full-backup page reads it at pick (`useFullBackupImport.ts:543-546`); the account page too (`import.vue:74`). A file deleted when its test ends is never read later by that test.

## Claims in #1064

- Holds: the helper at `import-drivers.ts:588-593`; nothing removes the dir; no teardown or `e2e:reap` looks under `os.tmpdir()`. Host count on 2026-10-22 at 15:2xZ: 1,334 `nulo-e2e-backup-*` dirs again after the morning's removal.
- **Did not hold:** the caller list. The issue names five call sites; there are 25 in 17 files, plus two network test files through `crash-truth.ts` (eight network test files in all, above). Six network files already remove the dir in their `finally`, and two smoke files remove only the file (found in the A1 review).

## Neighbours

- **#1063** (e2e-stores-1, merging): touches `global-setup.ts`, `boot-guard.ts`, `sandbox-ownership.ts`, `lockfile.ts`, no file this lane edits.
- **#1026** (firefox-handoff-1): edits `toolbar-panel.test.ts`'s import block and adds `contactsFiles()` there; it changes no `writeBackupToTemp` line. This lane edits neither file.
- **#1071** (filed here): `import-stage-timing.test.ts:202-235` leaves three `nulo-stage-log-*` dirs per smoke run (150 on this host on 2026-10-22). Same class, other owner; not this lane's scope.
- Other `tmpdir()` users checked and found cleaned: `verify-provenance.test.ts:17`, `attach-assets-run.test.ts:407` (`afterAll`), `contactsFiles` callers (`afterAll` or `finally`).

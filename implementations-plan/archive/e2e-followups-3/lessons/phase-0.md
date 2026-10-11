# Phase 0 (planning): recon, checks, consults

All reads at `origin/dev` ca79036. Nothing was run in a browser while planning.

## Checks the planner ran

- **The re-land is an exact revert.** `git diff 9094cf9 ca79036` on the eight relay files prints nothing. `git diff --stat 39f3dda ca79036 -- apps .claude scripts .github packages` lists only those eight files. `git diff 9094cf9 39f3dda | git apply --check -v` reports every file clean on ca79036.
- **The commits are reachable.** 78d47d4, d4398b3, d9249ad, c0be903, ed05853, 5a89d52, 09659e9, 9094cf9 and 39f3dda are all present locally, and 9094cf9 is an ancestor of `refs/pull/298/head` (77cace3). The branch `worktree-e2e-followups-2` is gone from origin.
- **Open PRs at planning:** #293 and #271, both drafts against `dev`; neither touches a relay file, `fixtures/**`, FIREFOX.md or the e2e-testing skill.
- **Dedupe:** `gh issue list --state all --search "Invalid window ID"` and `--search "dynamically imported module"` return only #281. `--search "bootstrapActiveProfile lock redirect"` returns nothing.
- **Firefox on this host:** `~/.cache/puppeteer/firefox/linux-stable_153.0.4`, the revision the relay was proved on.
- **The `auth` chunk path** (recon.md): the guard sends a wallet with no profile to `register` from `beforeEach`; `waitForLockScreen` reloads when the hash is not on `/popup/auth` at the instant the session record clears. `waitForLockScreen`'s reload has no history before the squashed `e1c7533`.

## Checks after panel round 1

- **The archived pool-5 log** (`~/.cache/nulo-backlog/e2e-followups-2/nfull-firefox-gate-pool-5.log`, outside the repo). The run built `auth-CG6VbMod.js` at its start and printed the rejection once, in `account-balance-orphans.test.ts`'s third launch. The line comes after that launch's relay arming line and before its first BackupService line and first PXE slow-script warning. The file took 66 s, and stderr has no times, so the log places the rejection neither at the boot nor at the lock.
- **No build overlapped the instance.** By birth and modification times, the lane's N-full driver ran its eight calls one after another: pool 4 08:06:08-08:31:50, pool 5 08:31:52-08:48:28, heavy from 08:48:28. Its other logs in that window are none; a smoke probe ran at 08:52, after pool 5, and builds nothing.
- **Who imports `auth`.** A planner build of `dist/firefox` at ca79036 (deleted afterwards): only `generated-pages…js`, the shared route table, references `auth-<hash>.js`, through a lazy `import()`. `src/popup/index.html`, `popup-*.js`, `onboarding-*.js` and `setup-*.js` load that table.
- **Round 1's claims, checked.**
  - `useProfileBootstrap.ts:164-179` re-reads the active session before setting `isLogined`, and `useProfileBootstrap.test.ts:286-293` pins the stale-bootstrap case.
  - `import.vue:84-89` pushes `/popup/auth` when activation outlasts 30 s.
  - `locked-state.ts:45-53` awaits `readProfiles()` before landing.
  - `_probe-console-capture.test.ts` skips every case without `NULO_E2E_CONSOLE_PROBE=1`.

## Consults

The panel rounds and their dispositions are in `plan.md` § Audit verdicts. This section logs failed or retried consults.

## Checks after panel round 2

- `setUpPopupPage` awaits `loadPopup` before its 2 s `popupReady` wait (`extension.ts` at 39f3dda), so a background hold placed before navigation completes stalls the navigation instead of forcing the fallback.
- A background evaluation holds WebDriver classic's exclusive channel (`webdriver-classic.ts`, `chromeScript`), so a hold must be scheduled inside the evaluated body and the call must return at once.
- Vitest selects a shard by the file's path relative to its root, so the pool-5 reproduction instruments the file in place.

## Checks after panel round 3

- Puppeteer 25.8.0 over BiDi emits `framenavigated` only for fragment navigations and DOMContentLoaded (`bidi/Frame.js`). vue-router's hash history commits through `pushState`, which arrives as `browsingContext.historyUpdated` and only updates `page.url()` (`bidi/core/BrowsingContext.js`). So a Firefox route timeline polls `page.url()`.
- `reopenAndRecoverAfterImport` (`fixtures/helpers.ts`) documents its reopen as `lockWallet`'s reload, which ran only when the redirect lagged; 6 test files call it. `lockWallet`'s comment credits an `isLogined` watcher with the push, which `locked-state.ts` does not do.

## Implementation: the dependency gate (2026-10-11)

- `gh issue view 297 --json state,closedByPullRequestsReferences`: `CLOSED`, closed by #300 (`fix: save a firefox fee pick as plain data, log integrity errors as objects`), merged into `dev` at 27af8d7.
- #300 covers every caller #297 lists: `persistSelection` saves a plain record, and `storageLocalSet` structured-clones its items at the call, so any caller handing it reactive state now rejects on every engine. Its Firefox run of the seven files that printed the error printed `DataCloneError` 0 times (10 on base).
- `git merge origin/dev` (signed, 2cabd2b): clean. It touched no relay file, nothing under `tests/e2e/fixtures/`, FIREFOX.md or the e2e-testing skill; its one e2e change is `network/tx-sendTx-sponsoredFpc.test.ts` (a readback of the saved pick). `index.md` unchanged; `lessons.md` gained one line (Firefox `storage.local.set` refuses a reactive Proxy) and lost its header sentence.
- Fast: `bun run lint` 0, `bun run typecheck:all` 0, `bun run test` 0 (740 files passed, 3 skipped; 11233 tests passed).

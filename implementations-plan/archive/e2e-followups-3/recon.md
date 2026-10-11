# e2e-followups-3: recon

Read at `origin/dev` ca79036 (#298 merged) by the planner and two read-only explorers (sonnet). `39f3dda` is the last commit of #298's branch that carried the relay; `9094cf9` is the revert that took it out. Both stay reachable from `refs/pull/298/head` (77cace3).

## Reuse map

| Capability the arc needs | Existing code | Verdict |
|---|---|---|
| The Firefox page-error relay (listener, parent relay, `kindOf`, `logEntryFor`, close verdict) | `fixtures/browser/firefox-page-errors.ts` at 39f3dda (322 lines), reviewed in five Codex rounds | reuse as is: restore it |
| Arming at launch, check at close, `close()` once | `fixtures/browser/firefox.ts` at 39f3dda | reuse as is: restore it |
| Per-page recording, `openPopup`'s close-and-fresh-tab fallback, `closeConfirmed` | `fixtures/extension.ts` at 39f3dda (`recordPageErrors`, `loadPopup`, `popupReady`, `closeConfirmed`) | reuse as is: restore it |
| Unit cases for the relay | `scripts/e2e/firefox-driver.test.ts` at 39f3dda (+117 lines over HEAD) | reuse as is: restore it |
| The smoke success control | `tests/e2e/page-error-capture.test.ts` at 39f3dda | reuse as is: restore it |
| Docs (FIREFOX.md rows, e2e-testing skill lines, row 23) | at 39f3dda | reuse, then re-date the proof line if the Firefox revision moved |
| Seam and page-error unit suites | `scripts/e2e/browser-seam.test.ts`, `scripts/e2e/page-errors.test.ts` (present at HEAD) | reuse as is |
| Host contention for a reproduction | e2e-testing skill, "Reproduce like CI" (`taskset -c 0,1 …`) and the three pinned busy loops | reuse (procedure, no code) |
| Fast/fallback path log | `NULO_E2E_OPENPOPUP_LOG=1` | reuse |
| Delaying an extension chunk, CPU throttling in the harness | none. Searched `setCPUThrottlingRate`, `Emulation.`, `emulateNetworkConditions`, `emulateCPUThrottling`, `stress-ng`, `nice -n`, `cpulimit`, `cgroup`, `systemd-run` (outside `node_modules`); `firefox-rpc-intercept.ts` sees only HTTP channels | not built: a probe holds the chunk in a scratch dist copy (a top-level `await` on a release the probe sends) |
| Firefox stderr as an inventory | geckodriver spawned with stderr inherited (`firefox.ts`); no log file, `agent.sh` does not tee | reuse: redirect the run's output to a real-disk file under `~/.cache/nulo-backlog/e2e-followups-3/` |

## The re-land is an exact revert

- `git diff 9094cf9 ca79036 --` the eight relay files prints nothing, and `git diff 39f3dda ca79036` outside `implementations-plan/` touches only those eight files. So the tree `ca79036` carries is 39f3dda's code minus the relay, and `git diff 9094cf9 39f3dda | git apply --check` passes on it.
- The lane brief's "cherry-pick against the current tree" does not hold as stated. The moves under #298 (`waitForTxMined`, `owned-processes.ts`, `firefox.ts`, `extension.ts`) are already in the revert's parent, and `d9249ad`'s two #280 hunks already ship. Replaying the seven commits would replay the intermediate fallback designs (`c0be903`'s detach, `ed05853`'s first close) and conflict on those hunks. Reverting `9094cf9` restores the final reviewed state byte for byte.
- Open PRs at planning (#293, #271, both drafts) touch none of the eight files. #297's fix (lane `wallet-followups-3`) lives under `apps/extension/src`; whether it adds or edits an e2e file is unknown until it merges.

## The `auth-*.js` rejection (Phase 2 input)

Recorded once in the archived Firefox network run (`account-balance-orphans.test.ts`, pool 5), not alone (2 of 2 green). The archive calls it "early in the fresh second launch" and names the `openPopup` fallback as the likely cause. Neither half is established; the static reading and the log pull in different directions, so Phase 2 settles it at run time.

- **Which page can hold it.** `ctx2.pageErrors` hears only pages the fixtures attached `recordPageErrors` to (`openOnboarding`, `loadPopup` at 39f3dda): `page2` and, if the fast path failed, the slow tab the fallback closes. The first-run onboarding tab and the launch's scratch page carry no listener.
- **What the log says** (archived `nfull-firefox-gate-pool-5.log`, read by the planner). The chunk `auth-CG6VbMod.js` was built at pool 5's start. In the third launch, stderr prints `JavaScript error: , line 0: TypeError: error loading dynamically imported module: …/assets/auth-CG6VbMod.js` after the relay's arming line and before that launch's first BackupService line and first PXE slow-script warning (an ACVM execution in the offscreen PXE). The whole file took 66 s, and stderr carries no times, so the log does not place the rejection at the boot or at the lock.
- **What the tree says.** `auth-<hash>.js` is the lazy route chunk of `src/popup/pages/auth.vue`. In a Firefox build (planner, ca79036) only the shared route table references it, through a lazy `import()`, and the popup, onboarding and setup entries all load that table. The popup guard (`route-guard.ts:47-55`) redirects a wallet with no profile to `popup-register` inside `beforeEach`, and vue-router 5.2.0 loads a route's lazy components only after the global guards (`vue-router.js:1338-1400`). So statically, neither `ctx2`'s first popup nor the fallback's slow tab imports `auth`; nobody has checked that at run time. `page2` reaches `auth` along three paths:
  - `import.vue:84-89`, when the imported profile is not active within 30 s;
  - the lock in `reopenAndRecoverAfterImport`;
  - `waitForLockScreen`'s reload.
- **The harness reload.** `lockWallet` → `waitForLockScreen` (`fixtures/helpers.ts`) waits for the session record to clear, then reads the hash once; not on `/popup/auth`, it calls `reloadExtensionPage(page)`. The background clears the session first; the popup's lock event then seals, awaits `readProfiles()` and pushes `/popup/auth` (`locked-state.ts:45-53`; the helper's comment says an `isLogined` watcher pushes it, which is not how the tree does it). vue-router commits the hash only after the `auth` chunk resolves. The reload therefore fires whenever the hash lags, sometimes before the import starts (harmless), sometimes while it loads, which is the departure the archived lane proved Firefox rejects. The race the reload's comment cites is guarded in product (`useProfileBootstrap.ts:164-179`, pinned by its test).
- **A rebuild under a running browser.** `agent.sh` builds into `dist/<browser>`, and Vite empties it first, so a build during a run deletes the hashed chunks and the next first-time lazy import fails with the same text and no departure. The archived lane's driver ran its eight N-full calls one after another (pool 5 08:31:52-08:48:28, heavy from 08:48:28), so no build overlapped the instance.
- **App-side navigations.** No `location.reload|assign|replace|href =|hash =` under `src/popup`, `src/utils`, `src/composables`, `src/stores`, `src/components`. `chrome-browser-api.ts:206` (`tabs.update` with a URL) and `onboarding-tab.ts:101` (`window.close()`) do not reach the popup. `MigrationBarrier.vue` calls `chrome.runtime.reload()` on a migration failure, which this flow does not reach.
- **Other harness reloads** of an extension page: `seedUsdQuoteAndReload`, `legal-drivers.ts`, and `ensureUnlocked`'s `boot-retry` press (a button, not a navigation). Each could leave a document mid-import in another file; none was recorded in the archived runs.

## `Invalid window ID: N` (Phase 3 triage input)

- No harness code calls `chrome.windows.remove|update` (fixtures close windows over WebDriver).
- In product code every window call is caught except two: `src/utils/close-current-window.ts` (`getCurrent` callback, then `chrome.windows.remove(id)` with no catch and no `lastError` read; called from `verify/index.vue`, `useDappApprovalWindow.ts`, `windows/json/index.vue`, `windows/logger/index.vue`) and `popup/pages/settings/developer/index.vue` (`windows.update`, unawaited; settings only, none of the six files reach it).
- The six files (`cap-request-reject`, `cap-window`, `connect-unserved-chain`, `connect-deny`, `connect-one-window`, `snack-placement`) all end an approval, connect or execute window from the wallet side. `WindowManager._settle` removes that window (caught) while the page's own close path (`closeCurrentWindow`, from `verify/index.vue` and the approval-window composable) removes it too. The second remove meets a window that is gone. Likely product, unproven: the page is gone when the rejection is reported, so it carries no window and no file.
- Dedupe: `gh issue list --state all --search "Invalid window ID"` returns only #281.

## CI's Firefox partition (Phase 3's N-full)

`pr-extension-network-e2e-firefox.yml` → `_extension-network-e2e.yml`, `retry: "0"`:

- pool: `--shard=N/5` (vitest hash of the filename), proverless, excluding `fee-methods`, `selfpay-phase`, `concurrent-sendtx-confirm`, `transfers`, `tx-sendTx-default`, `frozen-account-canary`, `passkey-execution-canary`, `delete-after-prove`, `same-token-concurrent-sends`;
- heavy: `fee-methods`, `selfpay-phase` (proverless); heavy-concurrent: `concurrent-sendtx-confirm`, `same-token-concurrent-sends` (proverless);
- canary (prover-ON): `transfers`, `tx-sendTx-default`, `frozen-account-canary`, `passkey-execution-canary`, `delete-after-prove`. Locally no `presto-server` is required: an unset `VITE_NULO_PRESTO_REQUIRED` falls back to WASM proving.
- 11 files carry `@requires-proverless`; `proverless-guard.sh` refuses an unarmed run that selects one.

## Smoke

- Armed build: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:<browser>`; the run checks the build stamp.
- `global-setup-smoke.ts` runs `pkill -f "chrome.*--load-extension=<dist>"` at setup and teardown, so two Chrome smoke runs on one `dist` kill each other (the archived lane lost a full Chrome run to it). Firefox has no such reap.
- `vitest.e2e.config.ts` hard-codes smoke `retry: 2`; retry 0 needs `--retry=0` on the command line.

## Relay unit files

`firefox-driver.test.ts`, `browser-seam.test.ts`, `page-errors.test.ts` live in `apps/extension/scripts/e2e/` and run under `bun run test` and `test:all` (`vitest.config.ts` includes `scripts/**/*.test.ts`); `test:ci-gating` (`bun test scripts/ci-cd/`) does not run them.

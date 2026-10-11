---
plan: e2e-followups-3
tier: light
status: approved (orchestrator, 765adbe); implementing arc 1
issues: "#281 (arc 1)"
depends_on: "#297 closed with its fix on origin/dev (lane wallet-followups-3, arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 Explore agents (sonnet); one Codex audit (gpt-6.1-sol, high), resumed to approve in round 4; an Opus Plan lens beside it (conditional approve, conditions applied)
base: origin/dev at ca79036
trunk: dev
post_implementation_hardening: not scheduled
---

# e2e-followups-3: the Firefox page-error relay, re-landed

On Firefox, Puppeteer gets no `pageerror` or `console` event from an extension page, so about 200 assertions on `ctx.pageErrors` and `ctx.consoleErrors` check nothing there (#281). The e2e-followups-2 lane built a relay that supplies those events and proved it, then reverted it (`9094cf9`) under its stop rule, because its first full Firefox network run recorded a product error (#297). This lane puts the relay back once #297's fix is on `dev`. It settles the second error that run recorded, an `auth-*.js` import rejection whose cause is unproven. Then it runs the full Firefox and Chrome suites. One arc, one PR against `dev`. Nothing a person sees changes, and no file under `apps/extension/src` changes.

The relay's design is settled and panel-converged in the archived plan (D1, D5, D6, D8, D10-D14, D-orch-4, D-orch-5); this plan does not reopen it. Record: `implementations-plan/archive/e2e-followups-2/plan.md`, its `lessons/phase-0.md` (probes) and `lessons/phase-3.md` (runs, triage, review rounds).

## Scope

**In:** #281: the re-land, the `auth-*.js` settlement, the lock helper's recovery reload (D3, whatever the settlement finds), the full runs, the `Invalid window ID` triage (it does not block), docs and close-out.

**Out:** any change under `apps/extension/src`. A product error the runs surface becomes an issue and ends the arc on its failure branch (A1).

**Dependency.** Implementation starts only when #297 is closed and `origin/dev` carries its fix; Phase 0 checks both. #297's lane runs on this host now. Until it merges, this plan waits, approved and idle.

**Claims that did not hold, or hold narrower** (evidence in [`recon.md`](recon.md)):

- **"Cherry-pick the seven commits against the current tree."** Narrower. The moves under #298 are already in the revert's parent tree. `9094cf9` and `ca79036` agree byte for byte on all eight relay files, and `39f3dda` differs from `ca79036` only in those eight files. Reverting `9094cf9` gives back exactly the final reviewed relay, with `d9249ad`'s two shipped #280 hunks untouched. Replaying the seven commits would replay two abandoned fallback designs (`c0be903`, `ed05853`) and conflict on those hunks (D1).
- **"`auth-*.js` was early in the fresh second launch; likely the `openPopup` fallback closing a popup still booting under load."** Neither half is established.
  - "Early" has no timestamp behind it. In the archived pool-5 log, the third launch's stderr prints the rejection after the relay's arming line and before that launch's first BackupService line and first PXE slow-script warning. The whole file took 66 s, and stderr carries no times.
  - The static reading of the boot path finds no import of `auth` on a wallet with no profile, so it argues against the fallback. That is a reading of the tree, not a run-time fact.
  - The test has three paths that do reach `auth` in `page2`: `waitForLockScreen`'s reload while the lock's `/popup/auth` navigation waits on the chunk (H1); the import page's own push to `/popup/auth` when activation outlasts 30 s; and the lock itself.
  - Phase 2 settles it at run time (§ Architecture).
- **`Invalid window ID: N` "unattributed (window id 0)".** Holds for attribution. `N` in the text is a real window id. The likely raiser is product code: `src/utils/close-current-window.ts` calls `chrome.windows.remove` with no catch, racing the wallet's own (caught) removal of the same approval window. Phase 3 checks it.

## Outcome & Quality Bar

**For whom.** The two Firefox lanes required on `dev`, the release's Firefox artifact smoke, and the agents and maintainers who read a green Firefox run as proof that no extension page threw.

**What excellent looks like.**
- `expect(ctx.pageErrors).toEqual([])` means the same thing on Firefox as on Chrome. `page-error-capture.test.ts` fails on either browser if the relay drops, duplicates, misroutes or delays an entry, and a launch whose relay faulted fails at close. Every full run Phase 3 names is green at retry 0 with the relay on.
- Every error the relay newly records has a named cause, proved by a reproduction or a forced probe, and a disposition: fixed in the harness, or an issue plus the failure branch. Nothing is filtered by text, URL or count, and no assertion is loosened. No timeout is raised; no retry, skip or flag is added.

**What good enough looks like.** The relay's documented gaps stay: unattributable messages, failed resource loads, rejection timing, and the close read's last-moment window (FIREFOX.md). `Invalid window ID` is triaged and filed, not fixed here. A sufficient mechanism that a forced probe proves is fixed, but it does not settle the archived `auth-*.js` instance; only an attribution does (§ Settlement rule).

## Assumptions

### Facts (verified at ca79036 unless a log or probe is named)

1. `9094cf9` reverts the relay out of #298's branch. Its parent `39f3dda` is the last relay state, after Codex review rounds 1-3 and passes 4-5 approved it. The seven relay commits, `9094cf9` and `39f3dda` exist locally and are reachable from `refs/pull/298/head` (77cace3).
2. `git diff 9094cf9 ca79036` on the eight relay files is empty. `git diff 39f3dda ca79036` outside `implementations-plan/` touches only those eight files, and `git diff 9094cf9 39f3dda | git apply --check` passes on ca79036. The files:
   - `fixtures/browser/firefox-page-errors.ts` (new) and `fixtures/browser/firefox.ts`;
   - `fixtures/extension.ts`;
   - `page-error-capture.test.ts` (new) and `_probe-console-capture.test.ts`;
   - `scripts/e2e/firefox-driver.test.ts`;
   - `FIREFOX.md` and `.claude/skills/e2e-testing/SKILL.md`.
3. `waitForLockScreen` (`tests/e2e/fixtures/helpers.ts`) waits for `nulo:core:session` to leave `chrome.storage.session`, then reads `location.hash` once. If the hash lacks `/popup/auth`, it calls `reloadExtensionPage(page)`, then waits 15 s for the hash. Its comment justifies the reload by a product race (a stale `bootstrapActiveProfile` flipping `isLogined` back after a lock). The product now guards that race: `useProfileBootstrap.ts:164-179` re-reads the active session under the profile service's mutex before setting `isLogined`, and `useProfileBootstrap.test.ts:286-293` pins it. Test files that call the lock helpers: 27.
4. The lock's redirect: the background clears the session, then the popup's lock event seals, awaits `readProfiles()` and lands with `router.push("/popup/auth")` (`src/popup/locked-state.ts:45-53`). vue-router 5.2.0 runs the global `beforeEach`, then loads the entering route's lazy components (`extractComponentsGuards(…, "beforeRouteEnter")`), then commits the URL in `finalizeNavigation` (`node_modules/vue-router/dist/vue-router.js:1338-1400`). So the session record can clear well before the hash reaches `/popup/auth`.
5. `auth-<hash>.js` is the lazy route chunk of `src/popup/pages/auth.vue`. In a Firefox build, only the shared route table (`generated-pages…js`) references it, through a lazy `import()`. The popup, onboarding and setup entries all load that table (planner build at ca79036). On a wallet with no profile, the popup guard (`route-guard.ts:47-55`) redirects to `popup-register` from `beforeEach`. `import.vue:84-89` pushes `/popup/auth` when an imported profile is not active within 30 s, and `account-balance-orphans.test.ts:176-189` accepts that landing.
6. No popup code reloads or reassigns its document: no `location.reload|assign|replace|href =|hash =` under `src/popup`, `src/utils`, `src/composables`, `src/stores`, `src/components`. Two calls elsewhere navigate or close an extension page: `chrome-browser-api.ts:206` (`tabs.update` with a URL) and `onboarding-tab.ts:101` (`window.close()`), and neither reaches the popup. `MigrationBarrier.vue` calls `chrome.runtime.reload()` only on a migration failure.
7. In `ctx2`, `account-balance-orphans.test.ts` records errors only from `page2` and, if the fast path fails, from the slow tab the fallback closes. Recorders attach only in `openOnboarding` and `loadPopup` (`extension.ts` at 39f3dda). The first-run onboarding tab and the launch's scratch page carry none.
8. The archived probes (phase-3 lessons): a navigation away from a document with uncached `import()`s in flight makes Firefox reject them from that document while it is still current (150/150 to another extension page). Closing the tab raised nothing (0 of 15 closes with 30 imports each, on an idle host). Chrome reports neither.
9. The archived N-full ran its eight calls one after another: pool 5 from 08:31:52 to 08:48:28, its build at its start, heavy from 08:48:28. No other build into that worktree's `dist/firefox` overlapped pool 5 (the lane's run logs). `agent.sh` builds into `dist/<browser>`, and Vite empties that directory first.
10. Only two product window calls leave a rejection unhandled: `close-current-window.ts` and `settings/developer/index.vue`'s unawaited `windows.update`. `close-current-window.ts` calls `chrome.windows.remove(id)` with no catch, from `verify/index.vue`, `useDappApprovalWindow.ts`, `windows/json/index.vue` and `windows/logger/index.vue`. `WindowManager` removes the same approval window on settle, and it catches its error. Harness code never calls `chrome.windows.remove` or `update`.
11. CI's Firefox network partition (`pr-extension-network-e2e-firefox.yml`, `retry: "0"`) has four groups:
    - five proverless pool shards (`--shard=N/5`, nine `exclude_files`);
    - heavy (`fee-methods`, `selfpay-phase`);
    - heavy-concurrent (`concurrent-sendtx-confirm`, `same-token-concurrent-sends`);
    - canary, prover-ON (`transfers`, `tx-sendTx-default`, `frozen-account-canary`, `passkey-execution-canary`, `delete-after-prove`).
12. The smoke config hard-codes `retry: 2`, so retry 0 needs `--retry=0`. `global-setup-smoke.ts` kills every Chrome loading this worktree's `dist/chrome`. The smoke suite reads `EXTENSION_PATH` when it is set. `_probe-console-capture.test.ts` skips every case unless `NULO_E2E_CONSOLE_PROBE=1`.
13. Firefox on this host is the Puppeteer-pinned `linux-stable_153.0.4`, the revision the relay was proved on.

### Inferences (unverified; audits attack these)

- **I1.** No hypothesis is favoured before Phase 2. For H1: in `page2`, the lock may be the first time `auth` loads, and the helper's reload can land while the chunk loads (Facts 3-5, 8). Against H1: the archived rejection prints before its launch's first PXE slow-script warning. That warning plausibly comes from the restore's balance work, which runs before the lock. Against H2: the static reading of the boot path, and the idle close probe.
- **I2.** With #297 fixed, no `DataCloneError` appears in the Firefox network run. #297's lane gates on the seven files that printed it. A `storageLocalSet` caller that lane missed would reappear here as a product error.
- **I3.** A top-level `await` at the head of a scratch `auth-*.js` holds the `/popup/auth` navigation pending. Such a module has finished loading, so a reload during the hold may not raise Firefox's load-phase error. The forced probe therefore proves the preemption, and P2c the text.
- **I4.** The six `Invalid window ID` lines come from `closeCurrentWindow`'s second remove, which loses to `WindowManager._settle`'s remove.

### Asks (each with the working assumption the plan proceeds on)

- **A1. The two terminal branches.** No product fix ships in this lane (EF2-orch-2 carried; D-orch-2 to D-orch-6). The arc ends on exactly one of two branches:
  - **Success:** Phases 0-3 green. Then the quality loop, Delivery and Close-out (§ Post-implementation).
  - **Failure:** the stop rule fired, or Phase 2 stayed unsettled after three probe rounds, or a gate failed three times on one step.
    1. Revert every implementation commit on the branch: the re-land and any harness fix. Keep the plan and lessons commits.
    2. Open the product issue if there is one (dedupe first).
    3. Comment the measurements on #281.
    4. Report `ARC_FAILED: arc-1 <reason>`.

    No quality loop runs and no PR is opened. The worktree stays. Whether the plan's record lands as a docs-only PR is the orchestrator's call.
- **A2. Chrome network e2e.** The re-land changes `openPopup`'s fallback on both browsers, and Phase 2 may change `waitForLockScreen`, which network files on both browsers call, the Chrome canary's `delete-after-prove` included. No Chrome network run has exercised the new fallback (#298's CI ran after the revert). Working assumption: Phase 3 runs Chrome N-full locally in CI's partition, at retry 0 (D5).

## Architecture & Implementation

### Re-land (Phase 1)

One commit: `git revert --no-commit 9094cf9`, committed as `test(e2e): re-land the firefox page-error relay`. Its body names the seven commits it restores and says #297 is fixed. Proof of exactness: after the commit, `git diff 39f3dda HEAD` on the eight files is empty. If a merge from `dev` touched one of them meanwhile (#297, #293), the diff equals that merge's change to the file, which is read and reconciled by hand.

What comes back, unchanged:

- the relay (`firefox-page-errors.ts`);
- its arming before `installAddon` and its check at a once-only `close()` (`firefox.ts`);
- per-page recording, and the `openPopup` fallback that closes a slow tab and loads a fresh one (`extension.ts`);
- the unit cases (`firefox-driver.test.ts`);
- the smoke control (`page-error-capture.test.ts`), and the removal of the probe case it replaced (`_probe-console-capture.test.ts`);
- the FIREFOX.md rows and the e2e-testing skill lines, with the 153.0.4 proof and the hold-the-bump rule (EF2-orch-4, D-orch-6), and the two comment clauses in `fixtures/extension.ts`.

### Settling `auth-*.js` (Phase 2)

**Hypotheses.**
- **H1 (harness):** `waitForLockScreen` reloads `page2` while the lock's `/popup/auth` navigation still loads the chunk.
- **H2 (harness):** `openPopup`'s fallback closes a slow tab that had an `auth` import in flight. The static reading says a fresh wallet's boot never imports `auth`, and the archived probe found that a close raises nothing (on an idle host). Neither has been checked under load.
- **H3a (harness, etiquette):** a build empties `dist/firefox` under a running browser, and the next first-time lazy import fails with no departure. Fact 9 excludes it for the archived instance. Every run here guards it: never build into a dist a running browser loads, and hash the `dist/<b>/assets` listing before and after every probe and run.
- **H4 (product or Firefox):** an import fails with no harness departure of its document. Examples: a saturated extension process (popup pages and the offscreen PXE share one process, and that run printed a PXE slow-script warning), or a departure the app itself makes.

**What the archived order already says.** In the third launch, the rejection prints before that launch's first BackupService line and first PXE slow-script warning. The BackupService line is Firefox's own (`resource:///modules/backup/BackupService.sys.mjs`), on its own idle timing, so it places nothing. The PXE warning is an ACVM run in the offscreen PXE. If this test's first ACVM run comes from the restore's balance work, the rejection came before the lock, and H1 cannot explain the archived instance (Opus round 2). P2a's timestamps place both lines against the test's stages.

**Probe rules.**
- Every probe is a scratch file, never committed: `implementations-plan/e2e-followups-3/_probe-*.test.ts` and `_probe-*.ts`, run with `--dir` as the archived lane ran its probes, and deleted before the phase commit.
- A temporary edit to a tracked file is a diagnostic only. It is reverted before the phase commit, and `git diff` shows it gone.
- Scratch dists live under `~/.cache/nulo-backlog/e2e-followups-3/` and load through `EXTENSION_PATH`. A scratch dist may rewrite one exact string in the route table: the `auth` chunk's lazy `import()` gains an import-start marker. That marker is the only proof that an import started.
- Every marker carries a per-document nonce. It is posted synchronously on a `BroadcastChannel` to a sibling probe page that the test reads, so a departure right after it cannot lose it. P2c's `.then` records travel the same way. Before any probe counts, a control proves the channel: post a marker, then reload or close at once; 5/5 must arrive for each action.
- Every run is on Firefox unless named, at retry 0, with the relay on. Its stderr goes through a per-line timestamper into a real-disk file under `~/.cache/nulo-backlog/e2e-followups-3/`.
- **Holds.** A background hold is scheduled inside the evaluated body (a `setTimeout` busy loop) and the call returns at once, so it never keeps WebDriver's exclusive channel. It starts only after the target document's navigation has completed, runs for at most 5 s, and the trial asserts that it took effect. A chunk hold releases once per tab (a `sessionStorage` flag) and always ends with a release the probe sends.

**Probes.**
- **P2a: instrumented reproduction.**
  - Instrument `account-balance-orphans.test.ts` in place, as a temporary edit: the pool's shard hash is by path, so a copy elsewhere would leave pool 5. Log, with timestamps:
    - `openPopup`'s path (`NULO_E2E_OPENPOPUP_LOG=1`);
    - for every recorded page: a label, a timestamped poll of `page.url()`, its `close` event, and each `pageerror` the relay delivers. On Firefox, Puppeteer's `framenavigated` misses vue-router's `pushState` commits; BiDi's `historyUpdated` keeps `page.url()` current. A positive control: the poll must see the known landing on `/popup/general` after the import;
    - each stage of the test;
    - one line in `waitForLockScreen`'s reload branch. The helper itself stays the original.
  - Runs: up to 5 alone, under the e2e-testing skill's "Reproduce like CI" contention (`taskset -c 0,1`, plus three busy loops pinned there and killed by their own pids). Then up to 2 as pool 5, reporting the shard's selected file inventory.
  - Stop at the first reproduction. Every run, green or red, records the stage each BackupService and PXE slow-script line falls in. A reproduction names the document, its route timeline, and the last action on it before the rejection.
- **P2b: forced mechanism probes**, one for each hypothesis P2a leaves open (all of them if P2a never reproduces). A P2a reproduction with action X still needs P2b-X, since rule 2 asks for it.
  - **H1.** The page2 scenario at smoke level: a fresh wallet, a profile created in the popup document that booted on `register`, then the real `lockWallet(page)` with the original helper.
    - The scratch dist adds the import-start marker. The `auth` chunk's head adds a top-level `await` on a `BroadcastChannel` release, once per tab.
    - Pass, 5/5: the first document posted no marker before the lock (so nothing used up its hold early); its import-start marker is present after the lock; its chunk has not been released; the helper reloads it. The reloaded document loads `auth` unheld and lands on `/popup/auth`. Then the probe releases the hold.
    - 5 controls on the unmodified build record how often the reload branch fires there; that count is data, not a pass condition.
  - **H2.** The fallback's slow-tab window at smoke level, on a fresh wallet. Load a popup page; once its navigation has completed, start a background hold. Check the page is not ready after 2 s, then close it as the fallback does (`page.close()` and its `close` event). 10 trials record whether the closed document had started an `auth` import (marker), and whether its close recorded a rejection.
  - **H4.** A popup page starts 30 cache-busted `auth` imports, each with a `.then` timestamp, during a background hold, with no departure. 10 trials record any rejection.
- **P2c: the text for each departure action.** In a popup page, start 30 cache-busted `import()`s of the `auth` chunk URL, each with a `.then` timestamp, then take the action. The cells:
  - reload (H1's action), on an idle host and under contention;
  - close (H2's action), on an idle host and under contention, run only if P2b-H2 shows a marked import;
  - reload on Chrome, as a control.

  Each cell runs 10 counted trials. A trial counts when at least one import was still pending at the action. Other trials are void: count them, and cap them at 5 per cell. For each Firefox cell, record whether `TypeError: error loading dynamically imported module: …/assets/auth-*.js` was recorded in every counted trial. The Chrome cell must record nothing.

**Settlement rule, in precedence order.**
1. **Product or Firefox first.** A probe records the `auth` rejection with no departure of its document, while the chunk file was present (listing hash unchanged). That is H4: open the issue and take A1's failure branch. This holds whatever any harness probe shows.
2. **A sufficient harness mechanism.** Action X (reload or close) is sufficient when both hold:
   - a forced probe shows the harness taking X on a document whose `auth` import had started (marker) and had not finished;
   - P2c shows that X gives the exact text for a pending import.

   A mechanism shown for one action never stands in for another.
3. **The archived instance's attribution.** It is X only when P2a reproduces it with X, or when a demonstrated ordering invariant places it where only X can act and excludes every alternative. New runs' stage timing of the archived bracketing lines (Firefox housekeeping and a conditional slow-script warning, not fixed milestones) can exclude a hypothesis or support an inference the plan labels uncertain; it never attributes. Otherwise the instance is unattributed.
4. **Settled.** Phase 2 settles when the archived instance is attributed to a sufficient mechanism (fix it), or when rule 1 applies. A sufficient mechanism that does not match the archived instance is still fixed, because the relay would surface it. It does not settle the instance, so probing continues.
5. **Unsettled.** Bring the evidence to the panel (Codex, then the Opus lens), and log the consult. Run at most three probe rounds, then take A1's failure branch: `ARC_FAILED: arc-1 auth-*.js unsettled`. "Did not reproduce" settles nothing; a filter, a retry or an extra wait settles nothing.

**The lock helper (D3), applied whatever H1's verdict.** H1's verdict decides only the archived instance's attribution. The helper changes after the probes, which need the original.
- `waitForLockScreen` becomes observational. After the session record clears, it waits for `/popup/auth` within the 15 s it already gives the hash, and fails on timeout. It never reloads. Its comment states that invariant, and corrects the trigger: the lock event's landing pushes the route, not an `isLogined` watcher.
- Two doc comments in `helpers.ts` are corrected with it. `lockWallet`'s claims the same watcher. `reopenAndRecoverAfterImport`'s says "lockWallet reloads a fresh popup … the real reopen path". That reload ran only when the redirect lagged, so no caller's assertion depended on a fresh document. The helper now locks and unlocks in the same document, and no reopen is added.
- **No lock helper reopens, conditionally or not.** A test whose own scenario reopens the popup does so in the test, after the lock has landed, and keeps every assertion it made before that point. For example, `wallet-lock.test.ts` asserts the auth screen, then closes and reopens. The planner's survey found that every current caller either locks the page it passes, or passes a page opened after the event (`firefox-background-restart.test.ts` opens one before it asserts the lock). So no caller needs a reopen. Phase 2 step 1 records this per caller and freezes the table before the helper runs.
- **A redirect that does not land in 15 s fails the run and is product** (A1's failure branch).
  - Triage records whether the hash landed later. That is a diagnostic poll, never a pass.
  - The Phase 2 gate logs the latency from session clear to landing for each caller.
  - A timeout never reclassifies a caller and never adds a reopen.
  - The same applies in Phase 3.
- The Phase 2 gate's callers run the observational helper: `wallet-lock`, `firefox-background-restart`, `inflight-call-background-death`, `backup-roundtrip`, `account-balance-orphans`.

**The fix for H2.** The fallback must not abandon a document with an import in flight. The panel designs the fix from the evidence. A longer fast path, a retry or a filter is not a fix.

**Its proof.** Rerun the forced probe for each sufficient mechanism against its fix: 5/5, no departure of a document with a pending import, and no recorded error. For H1, release the hold before the helper's 15 s deadline, so the helper passes only because the redirect lands. Run the Phase 2 gate's callers on both browsers; they must be green. Add no committed unit test (D4).

### Full runs and triage (Phase 3)

The archived Phase 3 gate, plus Chrome N-full (A2), on the Phase 1-2 tree:

- the smoke control on both browsers;
- Firefox smoke full, then Chrome smoke full;
- Firefox N-full and Chrome N-full, each in CI's partition (pool 1-5, heavy, heavy-concurrent, canary prover-ON).

Triage every newly recorded entry by its stack URL and text, under the stop rule. When a known flake is rerun, the failed run's recorded entries are triaged too. The stderr inventory counts each line, and counts per file the entries that the spec filters by `Client disconnected` (9 single-line filters on the error arrays in 5 test files, plus multi-line ones), so a Firefox entry absorbed by a pre-existing filter is visible.

**`Invalid window ID: N` (does not block). Probe P3a:**
1. Run `cap-request-reject.test.ts` on Firefox, scratch-labelled, with stderr captured.
2. Before the reject click, wrap `chrome.windows.remove`, for diagnosis only, in the approval window's page and in the background (`evaluateInBackground`). Each wrapper logs, with a timestamp, its caller's stack and the window id.
3. Match the rejected remove to the timestamped stderr line by window id and order.
4. Act on the result:
   - **Product (I4):** dedupe with `gh issue list --state all --search "Invalid window ID"`. Open an issue with the five sections, a domain label and a `Record` link. It does not block, because the relay never records it (it has no window).
   - **Harness:** fix it in this arc if the fix stays inside `tests/e2e/fixtures/`; otherwise open an issue.
   - **Unmatched:** file the observed error with its attribution marked unproven.

   The wrappers log the call-time stack and the window id, call the original with the same receiver and arguments, and return its own result with no promise handler attached, so the unhandled rejection under study is still reported as before.

### File-level change map

| File | Change | Phase |
|---|---|---|
| the eight relay files (Fact 2) | restored by the revert of `9094cf9` | 1 |
| `apps/extension/tests/e2e/fixtures/helpers.ts` | `waitForLockScreen` per D3: observational, with its comment stating the invariant and the corrected trigger. `lockWallet`'s and `reopenAndRecoverAfterImport`'s comments corrected | 2 |
| `apps/extension/tests/e2e/fixtures/extension.ts` | the fallback per the panel's H2 fix, only if Phase 2 settles H2 | 2 |
| `apps/extension/tests/e2e/FIREFOX.md` | the dynamic-import row names the settled harness action beside `openPopup`'s; the proof line re-dated only if the Firefox revision moved | 2, 4 |
| `.claude/skills/e2e-testing/SKILL.md` | the settled rule in one line; the `Invalid window ID` disposition in the flake ledger if filed | 4 |
| `implementations-plan/e2e-followups-3/**`, `implementations-plan/index.md`, `archive/index.md`, `lessons.md` | plan, lessons, close-out | 0-4 |

### Trade-offs and alternatives not taken

- **D1, revert versus replaying seven cherry-picks.** *Chosen:* revert `9094cf9`, whose content is exactly the reviewed final relay (Facts 1-2). *Rejected:* cherry-picking `78d47d4` … `09659e9`. That replays two fallback designs review rejected, conflicts on `d9249ad`'s shipped #280 hunks, and gains nothing: the PR squashes, and the seven commits stay reachable from `refs/pull/298/head`.
- **D2, reproduce, then force, then name.** *Chosen:* first an instrumented reproduction of the original file. Then one forced probe for each open hypothesis, using explicit synchronization. Then a load-phase text probe. *Rejected:* settling on host contention alone. One hit in one full run and none in two solo runs settles nothing. *Rejected:* a FIFO or a protocol hook to stall the chunk's fetch phase. That builds privileged machinery for one probe, and P2c covers the fetch phase. *Rejected:* resource-timing lists as evidence (round 1, both legs). Nobody has shown that Firefox records `moz-extension:` module loads there, and a list read mid-boot can be empty for the wrong reason.
- **D3, an observational lock helper, whatever H1's verdict.** *Chosen (Codex round 2, Opus round 3):* `waitForLockScreen` waits for the redirect within its existing budget and never reloads. No lock helper reopens. A redirect that does not land is a product failure. The reasons:
  - A recovery step inside a shared assertion helper turns a non-landing redirect green for every caller.
  - The race the reload covered is now guarded in product (Fact 3).
  - Elapsed time cannot tell a pending redirect from a bounced one, so no budget makes a reload safe.

  *Rejected after round 2 (Opus round 1):* keeping a wait-then-reload form, with an issue, for callers that "need" the reload. It restores the hatch in the shared helper for every caller. A caller's dependence on recovery is evidence to classify, not a design. *Rejected after round 3:* a carve-out for callers whose scenario is a reopen. As worded, it selected the archived instance's own helper, `reopenAndRecoverAfterImport`, whose doc says the person reopens. It also licensed a second reopen in callers that already open a fresh popup after a background death. Nothing in the tree needs it. *Rejected after round 3:* applying D3 only when H1 is shown sufficient. The hatch is wrong whatever the archived cause. *Rejected:* "wait 15 s then reload" for every caller, for the same reason. *Rejected:* closing the tab and returning a fresh page, which changes the helper's contract at every call site. *Rejected:* reading the Pinia store to tell pending from bounced, which reaches into app internals from a fixture.
- **D4, no committed unit test for D3.** A deterministic pending route needs a modified build. A fake-page unit test would test a ten-line race against a stub (the archived pass 4 declined the same kind). The forced probe proves the fix, and the relay is the standing guard.
- **D5, Chrome N-full locally.** The fallback and possibly the lock helper change on both browsers, and the program opens a PR only after local gates pass.

## UI impact

None. Every change is under `apps/extension/tests/e2e/**`, `apps/extension/scripts/e2e/**`, `.claude/skills/e2e-testing/` and this plan. [OWNER-ASKS.md](OWNER-ASKS.md) says "none".

## Security & Adversarial Considerations

- **Threat model.** The adversary is a regression that makes a check pass without checking. Three examples: a Firefox lane whose page-error arrays are empty by construction; a harness that turns a real error into noise; a helper that reloads its way past a product failure. The relay closes the first. The stop rule and the ban on filters close the second. D3 closes the third: the lock helper observes and never recovers. A faulted or unstarted relay fails its launch (EF2-orch-4, D-orch-6).
- **Least privilege.** The relay adds no capability. The Firefox session already runs with geckodriver's `--allow-system-access`. The listener reads only the add-on under test's own frames, by principal, never through a waived Xray. The parent emits only fields `logEntryFor` validated, onto the BiDi socket the test owns. P3a's wrappers run only in a scratch-labelled run and never ship.
- **Internal Firefox APIs.** `_onMessageHandlerProtocolEvent` and `NavigableManager.getIdForBrowsingContext` are checked at arming. A Firefox bump that removes either, or that fails `page-error-capture.test.ts`, holds the bump; it never earns a `skipIf`, a soft-fail or a removed assertion.
- **Scratch builds.** P2b's modified dists live under `~/.cache/nulo-backlog/e2e-followups-3/`, load only through `EXTENSION_PATH` in a probe, and are deleted after the phase. They never reach `dist/`, a release or a commit.
- **Host etiquette.**
  - Contention busy loops are this run's own processes, pinned to the CPUs the probe names and killed by pid.
  - Never run two `e2e:agent` runs in this worktree at once. Ports come only through `agent.sh` and `~/.agents/ports.md`.
  - Never build into a dist a running browser loads (H3a).
  - Never run two Chrome smoke runs at once (`global-setup-smoke.ts`'s reap).
  - The stall watchdog's 10-minute limit stays as it is.
- **Production.** No file under `apps/extension/src`, no build flag, no manifest or CSP change. No dependency is added or bumped.

## Phases

**Shared gate commands.** Run from the worktree root unless a command names another directory; `<files>` are relative to `apps/extension`.

- **Fast:** `bun run lint`, `bun run typecheck:all`, `bun run test`.
- **Relay units:** `cd apps/extension && bun --bun vitest run scripts/e2e/firefox-driver.test.ts scripts/e2e/browser-seam.test.ts scripts/e2e/page-errors.test.ts`.
- **Smoke build (armed), per browser `<b>`:** `cd apps/extension && VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:<b>`. Rebuild after any plain `build` and after any network run, because `agent.sh` leaves its own build in `dist/`. Never build while a run uses that dist.
- **Smoke (file):** `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- <files> --retry=0`. The Firefox twin adds `NULO_E2E_BROWSER=firefox EXTENSION_PATH=$PWD/dist/firefox`. Smoke (full) is the same with no files.
- **Network (file):** `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_RETRY=0 [NULO_E2E_PROVERLESS=1] bun run e2e:agent <files>`, then the same with `NULO_E2E_BROWSER=firefox`. Set `NULO_E2E_PROVERLESS=1` for every file except the five canary files. Keep proverless and prover-ON files in separate calls.
- **N-full, per browser** (`NULO_E2E_BROWSER=firefox` for Firefox; unset for Chrome), with `NULO_E2E_RETRY=0`:
  - pool `N` of 5: `NULO_E2E_PROVERLESS=1 bun run e2e:agent --shard=N/5`, plus one `--exclude tests/e2e/network/<f>.test.ts` for each of CI's nine `exclude_files`. The list must match CI's, or the shard hash differs.
  - heavy (`fee-methods`, `selfpay-phase`) and heavy-concurrent (`concurrent-sendtx-confirm`, `same-token-concurrent-sends`), proverless;
  - canary: the five files, prover-ON (no `NULO_E2E_PROVERLESS`).
- **Pass, for every command:**
  - It exits 0 at retry 0.
  - Vitest's summary shows every targeted test ran. A skip passes only when it is a pre-existing `skipIf` whose condition holds for that run: a browser capability, the build's arming, `hasConfig`. Compare skip counts with the archived runs (Firefox smoke: 1 file, 12 tests; Chrome smoke: 3 files, 9 tests; Firefox pool shards 1, 3 and 5: 3, 1 and 1 files), and explain each difference.
  - One rerun is allowed for a failure the e2e-testing skill lists as a known flake; log it, and triage the failed run's recorded entries too.
  - Capture the stderr of every Firefox run to `~/.cache/nulo-backlog/e2e-followups-3/<run>.log`; it is the inventory for triage. Hash `dist/<b>/assets` before and after every run.

### Phase 0: dependency gate

Assumes: I2, D-orch-1.

1. Run `gh issue view 297 --repo nulo-sh/nulo --json state,closedByPullRequestsReferences`. Expect `CLOSED`, and a closing PR merged into `dev`.
2. Run `git fetch origin dev`, then `git merge origin/dev` (signed). Read what changed under `apps/extension/tests/e2e/`, in `implementations-plan/index.md` and in `lessons.md`. Never use a union merge.
3. Read #297's PR. Confirm that it covers every caller its issue lists.

Validation gate: Fast. Pass:
- #297 is closed by a PR merged into `dev`;
- the merge is clean, or every conflict is resolved and logged in `lessons/phase-0.md`;
- Fast exits 0.

Layers: lint, typecheck, unit.

### Phase 1: re-land the relay

Assumes: Facts 1, 2 and 13; D1.

1. Run `git revert --no-commit 9094cf9`. Resolve any conflict by reading both sides; Phase 0's merge may have touched a relay file.
2. Commit it as `test(e2e): re-land the firefox page-error relay`, signed, with a body that names the seven restored commits.
3. Run `git diff 39f3dda HEAD -- <the eight files>`. Expect it empty, or equal to the merged `dev` changes to those files.
4. Run the gate.

Validation gate: Fast; Relay units; Smoke build for both browsers; Smoke (file) `tests/e2e/page-error-capture.test.ts` on Chrome and on Firefox. Pass:
- every command exits 0 at retry 0;
- the control is green on both browsers;
- no launch's close check fails;
- Firefox stderr shows the control's own `NULO-PAGE-ERROR-*` lines and one `unsafe filename` line per launch.

Layers: lint, typecheck, unit, e2e (smoke).

### Phase 2: settle the `auth-*.js` rejection

Assumes: Facts 3-9, I1, I3; D2-D4. The probes test these; they do not take them for granted.

1. Record every caller of `waitForLockScreen` (direct, or through `lockWallet` and the other helpers) per D3, with the point where its scenario reopens, if it does. Freeze the table in `lessons/phase-2.md` before any probe runs.
2. Run P2a. Log every run in `lessons/phase-2.md`: the timeline, what was recorded, what stderr printed, the listing hashes.
3. Run the P2b probes that P2a leaves open, then P2c. Log every trial the same way.
4. Apply the settlement rule. Record the verdict and its evidence in `lessons/phase-2.md` and in the decision ledger.
5. Apply D3 in any case. For H2, if it is a sufficient mechanism (settlement rule 2), whether or not it matches the archived instance, apply the panel's fix.
   1. Rerun the forced probe for each sufficient mechanism against its fix.
   2. Run the Phase 2 gate's callers against the frozen table. A redirect that does not land is product.
   3. Add the FIREFOX.md row change.
6. **Product or Firefox cause settled (rule 1), or a redirect that does not land:** take A1's failure branch.
7. **The archived instance still unattributed:** consult the panel with the evidence and log the consult. Run at most three probe rounds, then take A1's failure branch.
8. Delete every `_probe-*` file and scratch dist, and revert every temporary edit. Check `git status`: nothing untracked under `apps/` or `implementations-plan/` except the plan's own files, and no tracked file modified.

Validation gate: Fast; Relay units; Network (file) `tests/e2e/network/account-balance-orphans.test.ts tests/e2e/network/firefox-background-restart.test.ts tests/e2e/network/inflight-call-background-death.test.ts` on both browsers (proverless); Smoke (file) `tests/e2e/backup-roundtrip.test.ts tests/e2e/wallet-lock.test.ts` on both browsers. Pass:
- every command exits 0 at retry 0;
- the verdict and its evidence are logged;
- the forced probe that showed a harness cause passes 5/5 against the fix;
- the `dist` listing hash is unchanged across every probe and run.

Layers: lint, typecheck, unit, e2e, e2e-live-network.

### Phase 3: the full runs

Assumes: Facts 10-12, I2, I4; A2; D5.

1. Run the Smoke build for both browsers.
2. Run Smoke (file) `tests/e2e/page-error-capture.test.ts` on Chrome and Firefox.
3. Run Smoke (full) on Firefox, then on Chrome. Run the Chrome run alone.
4. Run N-full on Firefox: pool 1-5, heavy, heavy-concurrent, canary.
5. Run N-full on Chrome (A2).
6. Triage every newly recorded entry by stack URL and text, under the stop rule. Log each disposition and the stderr inventory in `lessons/phase-3.md`.
7. Count `DataCloneError` lines in the Firefox stderr; expect 0 (I2).
8. Run P3a. File or fix it as § Architecture says, and log the disposition.

**Stop rule** (EF2-orch-5 and D-orch-6, binary). Each error the runs newly record is a real failure; never filter it. For each one:
- **Harness cause, the relay included:** fix it, and rerun every file that recorded it on the browser that recorded it.
- **Product cause:** A1's failure branch. Nothing of this lane ships.
- **The relay proves unreliable:** A1's failure branch. Unreliable means the control red in a full smoke run, a launch's close check failing, or an entry whose stack URL names another page.

Validation gate: Fast; Relay units; `bun run test:all`; `bun run test:ci-gating`; every run in steps 2-5. Pass:
- every command exits 0 at retry 0, with every targeted test run (skips as the shared pass rule allows);
- `page-error-capture.test.ts` is green in every full smoke run, and no launch's close check fails;
- every newly recorded entry has a logged disposition, and none is open;
- `DataCloneError` is 0 in the Firefox stderr;
- P3a's disposition is logged, with an issue number if product.

Layers: lint, typecheck, unit, e2e, e2e-live-network.

### Phase 4: docs and close-out

Assumes: Fact 13, EF2-orch-4, D-orch-6.

1. Reread the restored FIREFOX.md rows and skill lines against what Phases 1-3 measured. Fix any that no longer hold: the revision, the dynamic-import row, the flake ledger.
2. Run the Post-implementation quality loop, then Delivery, then the Close-out below.

Validation gate: Fast; `bun run check:plans` on the staged plan files; `bun run lint:actions`. Pass: all exit 0. Layers: lint, typecheck, unit, plans gate.

## Decision ledger

| # | Decision | Source | Status |
|---|---|---|---|
| D-orch-1 | One PR against `dev`, no stack | orchestrator standing record | carried |
| EF2-orch-2 | No product fix in this lane; a product error is an issue plus the failure branch | e2e-followups-2 orchestrator record, carried by the lane brief | carried |
| EF2-orch-4 | Arming and the close verdict stay fail-closed; no flag disables the relay; the docs name the proved Firefox revision and say a bump that fails them is held | e2e-followups-2 orchestrator record | carried |
| EF2-orch-5 | The stop rule is binary | e2e-followups-2 orchestrator record | carried |
| D-orch-2 | D1 accepted: re-land by reverting `9094cf9`, byte for byte; no cherry-pick, no re-design. The relay's unit files and the smoke control are green on both browsers before Phase 2 starts | orchestrator approval of 765adbe | binding |
| D-orch-3 | D3 accepted: `waitForLockScreen` is observational whatever H1's verdict; it waits within its existing budget and never reloads or reopens. A redirect that does not land is a product failure: dedupe, file the issue (five sections, `Record` link), then A1's failure branch; never a reload, a retry, a longer budget or a browser-specific branch | orchestrator approval of 765adbe | binding |
| D-orch-4 | Phase 2 is bounded: attribution only from a P2a reproduction or an excluding ordering invariant; at most three probe rounds, every trial logged in `lessons/phase-2.md`; then `ARC_FAILED` with the evidence commented on #281. A product cause is an issue and the revert applies (the lane ships nothing) | orchestrator approval of 765adbe | binding |
| D-orch-5 | `Invalid window ID` is filed, not fixed: a product attribution by P3a becomes an issue (dedupe first), labelled `bug`, with the six files and the probe's evidence; it never blocks the arc, and nothing under `apps/extension/src` changes | orchestrator approval of 765adbe | binding |
| D-orch-6 | The stop rule is binary and the arming stays fail-closed (as EF2-orch-4 and EF2-orch-5): no flag that disables the relay, no try/catch-and-continue at arming or close; `FIREFOX.md` and the e2e-testing skill name the proved Firefox version and say a bump whose arming check fails is a hold on the bump, never a `skipIf` or a soft-fail | orchestrator approval of 765adbe | binding |
| D1 | Re-land by reverting `9094cf9`, not by replaying seven cherry-picks | planner (Facts 1-2); Codex verified Fact 2 | accepted (both legs) |
| D2 | Phase 2: instrumented reproduction, then one forced probe per open hypothesis with explicit synchronization, then the load-phase text probe; historical attribution stays an inference unless reproduced | planner; Codex C2, Opus O3, O6, O7 | revised after round 1 |
| D3 | `waitForLockScreen` becomes observational whatever H1's verdict: it waits within its existing 15 s and never reloads. No lock helper reopens; a test's own reopen comes after the lock lands, keeping every earlier assertion. A timeout is product (A1) | Codex C1, R2-1, R3-2; Opus O-R3-1, O-R3-2 | revised three times; the wait-then-reload form and the reopen carve-out rejected |
| D4 | No committed unit test for D3 | planner; Codex C7, Opus | accepted with reason |
| D5 | Chrome N-full joins the local gate | planner (A2); Codex | revised: canary added |
| D6 | H3a named and guarded (dist listing hash, no build under a running browser); excluded for the archived instance by Fact 9 | Opus O1; planner checked the lane's logs | added |
| D7 | Two exclusive terminal branches (A1) | Codex C5, Opus O9 | added |
| D8 | Settlement precedence: a product or Firefox result wins; a mechanism shown for one departure action never stands in for another; the archived instance is attributed only by reproduction or by an ordering invariant that excludes the alternatives; stage timing only excludes | Opus R2-1, R2-5; Codex R2-2, R3-1 | added; tightened in round 3 |
| D9 | Probe validity: import-start markers with per-document nonces, posted synchronously to a sibling page over a channel proved to survive a departure; holds scheduled without the classic channel and applied after navigation, a once-per-tab chunk hold, in-place instrumentation for shard runs, timestamped stderr | Codex R2-3, R2-4; Opus R2-4 | added |
| D10 | Phase 2 settled **H1**: P2a reproduced the archived instance in probe round 3 (run 23): on `page2`, `TypeError: error loading dynamically imported module: …/assets/auth-*.js` raised 1 ms into the lock helper's reload (Firefox time, after its `navigationStarted`, before its `navigationCommitted`), listing hash unchanged, the archived assertion failing. Rule 2 met for the same action in round 1. No product or Firefox cause; no issue. Fixed by D3; its forced probe passes 5/5 against the fix. Evidence: `lessons/phase-2.md` | P2a rounds 1-3; panel after rounds 1 and 2 (rounds 2 and 3 designed with both legs); Codex confirmed run 23 element by element | settled |

## Audit verdicts

### Round 1

**Codex (gpt-6.1-sol, high, read-only): reject**, with blocking findings on D3, Phase 2's causal settlement, and the failure branch. It verified D1/Fact 2, the vue-router order, the fail-closed relay reuse and the expanded Chrome gate.

| # | Finding | Disposition |
|---|---|---|
| C1 | [blocker] D3's wait-then-reload treats elapsed time as proof of a bounce, preempts a redirect pending past 15 s, and can turn a broken redirect green; the race it covered is guarded in product (`useProfileBootstrap.ts:164-179`, its test) | **Accepted, in part.** Verified. Round 1 kept Opus's form for callers that need the reload; round 2 (R2-1) removed it: the helper observes and never reloads (D3). |
| C2 | [blocker] Phase 2 could "settle" H1 without the causal chain: no import-start evidence, P2a timing-dependent, attribution overstated | **Accepted.** P2b gains a marker and explicit synchronization. P2c needs pending imports at the reload, and voids the rest. Historical attribution stays an inference unless P2a reproduces it (D2). |
| C3 | [major] "Only when `lockWallet` locks it" overstates: `import.vue:74-88` can route to auth | **Accepted.** Verified (`import.vue:84-89`). Fact 5 narrowed; P2a measures `auth`'s first load. |
| C4 | [major] P2c (resource list) cannot prove absence; P3a's fallback proves the text, not the caller | **Accepted.** P2c dropped; H2 gets a forced, labelled probe. P3a correlates the real calls by window id, else the issue says the attribution is unproven. |
| C5 | [blocker] Failure was not a coherent terminal branch (loop, PR and seed ran anyway) | **Accepted.** A1 defines two exclusive branches; Post-implementation and the seeds follow them (D7). |
| C6 | [major] Skips contradicted the pass rule (`_probe-console-capture` skips unarmed; full runs skip legitimately); the control cannot be green in network runs | **Accepted.** The probe file left the gate (Fact 12). Permitted skips are named against the archived counts. The control requirement is scoped to full smoke runs. |
| C7 | [minor] No durable regression for D3 | **Rejected with reason** (D4): a held route needs a modified build. |

**Opus Plan lens: conditional approve**, with conditions: name and guard the dist-rebuild cause, make every trial check its own validity, state D3's budget honestly and exercise its reload branch.

| # | Finding | Disposition |
|---|---|---|
| O1 | [major] H3a: `agent.sh` empties `dist/<b>` when it builds, and a first-time lazy import then fails with the same text and no departure; the settlement rule would call it product | **Accepted** (D6). Named, guarded by the listing hash and the etiquette rule, and required absent for a product verdict. The planner read the archived lane's run logs: the eight N-full calls ran one after another, so no build overlapped pool 5 (Fact 9). |
| O2 | [major] P2b's controls cannot expect "no reload": the session clears before the push | **Accepted.** Verified (`locked-state.ts:45-53`). The controls record the reload's frequency; recon's "an `isLogined` watcher pushes the route" corrected. |
| O3 | [major] P2a could fail on timing alone | **Accepted:** 30 imports, `.then` timestamps, void trials counted and capped (now P2c). |
| O4 | [major] P2c's resource list has no positive control | **Accepted:** dropped (same as C4). |
| O5 | [major] D3 under-specified (30 s worst case, "never preempted" false) | **Accepted.** "Never preempted" is withdrawn and two background-death callers join the gate. The budget and P2e went with the reload in round 2 (R2-1). |
| O6 | [minor] "page2 never loaded `auth`" asserted, not measured; check for static importers of the chunk | **Accepted.** P2a measures it. The planner's build found only the route table's lazy import (Fact 5). |
| O7 | [minor] Expect the held evaluation not to reproduce the text | **Accepted:** I3 reworded; the verdict wording is "a sufficient mechanism", unless P2a reproduces it. |
| O8 | [minor] Fact 5 grep scope, two missing `closeCurrentWindow` callers, the call-site count | **Accepted:** Facts 6 and 10 corrected; 27 test files counted. |
| O9 | [minor] Skip the loop on a stop; triage a flake's failed run; count `Client disconnected`-filtered entries | **Accepted:** A1, the shared pass rule, and Phase 3's inventory. |
| O10 | [minor] P3a's scratch edits must not touch this worktree's `src` | **Accepted:** P3a wraps the API at run time from the test; no `src` edit. |

### Round 2

**Codex (same session, resumed): reject**, with blocking findings on D3 (the kept reload) and on H2's action-specific proof. It closed C3, C5 and C6, accepted C7's rejection, and called the reproduction-first ladder, the relay reuse, D1 and Chrome N-full sound.

| # | Finding | Disposition |
|---|---|---|
| R2-1 | [blocker] Keeping a reload for callers that "need" it restores the hatch in the shared helper; dependence on recovery is evidence, not design; the reload-branch log cannot tell "needed" from "pending" | **Accepted** (D3). The helper becomes observational. A caller whose scenario is a reopen reopens explicitly; any other non-landing redirect is product. P2e dropped. |
| R2-2 | [blocker] H2 has no import-start evidence (a route commits after its component loads), and P2c's reload text cannot prove a close | **Accepted** (D8). The scratch route table carries an import-start marker. P2c runs the close action as its own cells, and a mechanism counts only for the action it was shown for. |
| R2-3 | [major] The holds: the 2 s timer starts after `loadPopup`; a background evaluation keeps the exclusive classic channel; holds need release and validity checks | **Accepted** (D9). Verified (`extension.ts@39f3dda:1296-1298`, `webdriver-classic.ts:119-129`). Holds are scheduled inside the evaluated body, start after navigation, last at most 5 s, and are asserted. The H1 hold is released before the fixed helper's deadline. |
| R2-4 | [major] A scratch copy changes pool membership (the shard hash is by path) | **Accepted:** P2a instruments the file in place, temporarily, and reports the shard's selected inventory. |
| R2-5 | [major] P3a's wrappers could swallow the rejection they study | **Accepted:** the wrappers log the call-time stack and window id, call the original unchanged, and return its own promise with no handler attached. |

**Opus Plan lens (resumed): conditional approve.** It confirmed its round-1 conditions met, and the ladder bounded and not over-built.

| # | Finding | Disposition |
|---|---|---|
| O-R2-1 | [major] The archived line order may rule out H1 (the rejection precedes the launch's first PXE slow-script warning, which likely comes from the restore) | **Accepted** (D8, I1). Firefox stderr is timestamped in P2a. "Most likely H1" is withdrawn. Round 3 (R3-1): stage timing only excludes; attribution needs a reproduction or an ordering invariant. |
| O-R2-2 | [major] A reload-branch log cannot tell "needed" from "pending"; measure with a helper that waits first | **Superseded** by R2-1: the helper never reloads, so the gate's callers measure it directly. |
| O-R2-3 | [major] Removing the reload can end the lane on an unmeasured caller; route a Phase 3 lock timeout to D3's second form | **Rejected in part.** The second form is gone (R2-1). Accepted in substance: a Phase 3 lock timeout is routed through D3. Since round 3 (O-R3-1) that means product, triaged with a diagnostic later-landing poll. |
| O-R2-4 | [minor] P2b-H1 sequencing: the reloaded document blocks again; `sessionStorage` survives a reload | **Accepted** (D9): a once-per-tab hold and per-document nonces. |
| O-R2-5 | [minor] The settlement rule needs precedence | **Accepted** (D8). |

### Round 3

**Codex (same session, resumed): conditional approve**, with conditions: keep every pre-reopen assertion, and do not treat consistent stage timing as causal attribution. It closed R2-1 through R2-5 and called the ladder bounded and proportionate.

| # | Finding | Disposition |
|---|---|---|
| R3-1 | [major] Stage timing from new runs can constrain the archived instance's attribution but not establish it: the bracketing lines are housekeeping and a conditional warning, not fixed milestones | **Accepted** (D8, settlement rule 3). Timing excludes, or supports an inference the plan labels uncertain. Attribution needs a reproduction or a demonstrated ordering invariant; otherwise the three-round endpoint applies. "What good enough looks like" no longer lets a sufficient mechanism stand in for the instance. |
| R3-2 | [major] The reopen carve-out is too broad: a reopen moved ahead of `wallet-lock.test.ts`'s auth assertion removes coverage; a second reopen in `firefox-background-restart.test.ts` would recover a failed boot | **Accepted** (D3). Verified (`wallet-lock.test.ts:31-36`, `firefox-background-restart.test.ts:67-71`). Then superseded by O-R3-1: the carve-out is deleted. Its rule stays: a test's own reopen comes after the lock lands and keeps every earlier assertion. The caller table is frozen first, and a timeout never reclassifies a caller or adds a reopen. |

**Opus Plan lens (fresh instance, on the round-2 revision): conditional approve**, with conditions 1-4 below. It needs no further round of its own.

| # | Finding | Disposition |
|---|---|---|
| O-R3-1 | [blocker] The reopen carve-out is a hatch that brings H1 back. `reopenAndRecoverAfterImport` (the archived file's helper) documents "locked until the user reopens", so its callers would qualify, and a reopen "before it waits" is H1's departure. The background-death callers already reopen; a second reopen would hide a fresh popup that fails to land. No caller needs the carve-out. | **Accepted** (D3). Verified (`helpers.ts:317-337`, 6 caller files). The carve-out is deleted, and no lock helper reopens. The helper's and `lockWallet`'s wrong doc comments go on the change map. |
| O-R3-2 | [major] D3 is conditional on H1 in the change map, the ledger and Phase 2, yet Security says it closes the hatch outright; its rationale does not depend on H1 | **Accepted.** D3 is applied in any case, after the probes; H1's verdict decides only the attribution. |
| O-R3-3 | [major] On Firefox, P2a's `framenavigated` cannot see route commits. Puppeteer BiDi emits it only for fragment navigations and DOMContentLoaded, and vue-router commits through `pushState` (`historyUpdated`). | **Accepted.** Verified (`puppeteer-core@25.8.0` `bidi/Frame.js:198-210`, `bidi/core/BrowsingContext.js:194-199`). P2a polls `page.url()` with timestamps and adds a positive control. |
| O-R3-4 | [major] The plan does not say where the marker is written. A record from a departing document can be lost. | **Accepted** (D9). A synchronous `BroadcastChannel` post goes to a sibling probe page, for markers and P2c's records. A control proves 5/5 survival for reload and for close. |
| O-R3-5 | [minor] P2b-H1 must check that the hold was not used up before the lock | **Accepted:** no marker from the document before the lock. |
| O-R3-6 | [minor] A P2a reproduction still needs P2b for the same action. The P2c close cells only matter if P2b-H2 shows a marked import. | **Accepted**, both. |
| O-R3-7 | [minor] Triage a lock timeout without inferring from elapsed time. Only the PXE line can place the archived rejection; BackupService is on Firefox's idle timing. | **Accepted:** a diagnostic later-landing poll and per-caller latency; the BackupService line places nothing. |

### Round 4

**Codex (same session, resumed): approve.** No new material findings.
- R3-1 is closed: attribution needs a reproduction or an excluding ordering invariant.
- R3-2 is closed: the carve-out is deleted.
- The unconditional D3 is in scope. Removing a reload that can preempt a pending navigation serves #281's capture integrity whatever the archived cause was.
- Same-document lock and unlock in `reopenAndRecoverAfterImport` loses no reliable coverage: its reload depended on route lag, and its lasting assertions (the lock, the unlock, the recovered store data) remain.
- Its caveat: the verdict approves the plan, not the measurements; the probes and both browsers' gates must still produce their results.

**Converged:** Codex approve (round 4); Opus conditional approve (round 3), with every condition applied.

## Delivery

One PR against `dev`, no stack (D-orch-1), from `worktree-e2e-followups-3`. The close-out lands as its final commits. On A1's failure branch no PR is opened.

| Branch | Phases | PR title (≤ 93 chars) | Closes | code_review |
|---|---|---|---|---|
| `worktree-e2e-followups-3` | 0-4 | `test(e2e): record extension-page errors on firefox through the driver's relay` | #281 | off |

- Open the PR only after the Codex loop converges and every local gate passes. Open it without labels. Add `e2e:extension-network` or `e2e:extension-smoke` afterwards only if the path filter would skip a suite the change needs; a label at creation cancels the run.
- PR body:
  - what changed and why;
  - the validation runs with outcomes;
  - the Phase 2 verdict, naming the archived instance's attribution and its evidence (a reproduction or an ordering invariant);
  - the stderr inventory;
  - `Closes #281`;
  - the issue numbers Phases 2-3 opened.
- Commits are signed and conventional, with a lower-case subject. Each ends with the `Co-Authored-By` trailer that names the model that wrote it. Afterwards `git log --format='%h %G?' -3` shows no `N`. On a hang, rerun the command as `env -u SSH_AUTH_SOCK git <cmd>`.

### Issue to arc

| Issue | Arc | Closed by |
|---|---|---|
| #281 | arc 1, Phases 1-4 | the PR; on the failure branch it stays open with a comment naming the measurements and the issues opened |
| #297 | no arc | lane `wallet-followups-3`; this arc depends on it (Phase 0) |
| the `Invalid window ID` issue, if product | no arc | filed in Phase 3; product code, outside this lane |
| a product failure Phase 2 or 3 finds (H4, or a lock redirect that never lands) | no arc | opened under A1's failure branch |

## Post-implementation

This section is self-contained: the implementing session follows it from here, on A1's success branch only. On the failure branch, follow A1 and stop.

### Quality loop (once, over the whole arc, after Phase 3's gate)

1. Codex audit: `env -u CODEX_ACCOUNT ~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`. On a quota or 401 error, retry once with `CODEX_ACCOUNT=alejo-icloud`. If that fails too, log the failed consult in `lessons/phase-4.md` and continue on your own judgment within scope. The prompt carries:
   - the arc's diff against the merge base with `origin/dev`. Say that the Phase 1 commit restores code five Codex passes approved (`39f3dda`), so the review checks it for drift against `39f3dda` and for interaction with what `dev` gained since. Review the Phase 2 change in full.
   - this plan and its decision ledger;
   - the adversarial ask: what could go wrong, what would an attacker target, what are we trusting that we should not;
   - the two rules below, verbatim.
2. Triage each finding. Verify Codex's factual claims against the repo first; it can misread code. Apply the accepted fixes, commit, and log the round (consult and verdict) in `lessons/phase-4.md`.
3. Resume the same Codex session (`resume-codex.sh "" <followup-file> <codex-dir> high`) with the fix diff. Ask for a re-review under the same rules. Repeat until a round yields no new material finding; rejected nitpicks do not count. Still material after three rounds: stop and surface it to the orchestrator.

**The no-over-engineering rule** (verbatim in every post-implementation Codex prompt): *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."*

**The comment-quality rule** (verbatim in every post-implementation Codex prompt): *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*

### Delivery

4. Before the push, run `bun run test` and `bun run lint:actions`. Then run `gh pr create --base dev` per § Delivery. This is the first time any PR is opened, drafts included. Then run `gh pr checks --watch`.

### Close-out (the PR's final commits)

5. Merge `origin/dev` into the branch. Read what changed in `implementations-plan/index.md` and `lessons.md`; never use a union merge. If the merge touched `tests/e2e/fixtures/**` or brought new e2e files, run them on both browsers at retry 0 before the push.
6. Write an `## Outcome` block directly after the front matter. It holds:
   - the date and the status;
   - what shipped, with the PR number;
   - one disposition line for each thing dropped or not holding;
   - an `Open items:` line (issue numbers, or `none`);
   - a closing line that retires the `/goal` and `/loop` seeds below.
7. Promote the generalizable gotchas into `implementations-plan/lessons.md`, one line each, linking the archived detail. Candidates:
   - Firefox rejects a departing document's in-flight dynamic imports; a harness reload, navigation or close of a page mid-route causes it (whichever Phase 2 settled).
   - A build that empties `dist/` under a running browser fails its next lazy import the same way.

   Keep the file under 8 KiB, deduplicate, retire what a new line supersedes, and date tool-specific lines.
8. File every open item in its home:

| Situation | Home |
|---|---|
| Work inside the implementation you are on | this `plan.md` and the PR |
| Actionable work that outlives the plan | a GitHub issue with a domain label and a `Record` link to the archived plan |
| Needs a product call, or waits on something outside the repo | an issue labelled `owner-decision` or `blocked:external` |
| A suspected exploitable weakness | a private draft security advisory; the plan records only "tracked privately: GHSA-…" |
| Rejected, superseded or already done | a disposition line in the Outcome block |
| Knowledge that prevents a repeat | `implementations-plan/lessons.md` |
| A legal or store blank with a release deadline | `BEFORE-LAUNCH.md` |
| Accepted code work that blocks launch | the `v1.0.0` milestone, pointed at once from `BEFORE-LAUNCH.md` |

   Dedupe first (`gh issue list --state all --search "<words>"`). An issue body has `## What happens`, `## Where`, `## Impact`, `## Possible fix`, `## Record`. An issue left open, or a claim that did not hold, gets a comment with the reason.
9. Delete `STATUS.md`. Keep `OWNER-ASKS.md`; it archives with the plan. Run `git mv implementations-plan/e2e-followups-3 implementations-plan/archive/e2e-followups-3` in its own commit. Repair the relative links the extra level breaks (`git grep -n 'e2e-followups-3'`). Move the index line to `implementations-plan/archive/index.md`. Run `bun run check:plans`.
10. Push and report. Merging is the orchestrator's call; the merge completes the plan.

### Teardown after the merge

11. Once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/e2e-followups-3/plan.md` succeeds, run `agent-worktree done e2e-followups-3 --merged --trunk dev` without asking. A session that started inside the worktree has nothing to exit. The helper refuses rather than forces: relay a refusal and stop.
    - A `/loop` session checks this on every firing.
    - A `/goal` session arms one background wait after its wrap-up report: `until git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/e2e-followups-3/plan.md; do sleep 300; done`.

## Seeds

Recommended: `/goal`. Use exactly one per session; they do not compose. Both are drafts until the orchestrator approves the plan.

```
/goal Either (success) Phases 0-3 of implementations-plan/e2e-followups-3/plan.md are marked ✓, each backed by its validation gate reported passing in the transcript, Phase 0 showing #297 CLOSED with its fix merged into dev, Phase 2's verdict on the auth-*.js rejection logged with its probe evidence; for each phase the transcript prints LESSONS_FILE=implementations-plan/e2e-followups-3/lessons/phase-N.md; /code-review was NOT run (code_review is off); the Codex fix loop (run-codex.sh … high read-only gpt-6.1-sol) converged over the arc, evidenced by a resumed Codex pass reporting no new material findings, quoted in the transcript; the PR against dev exists, created only after the loop converged (gh pr view in the transcript), and carries the close-out commits that archived the plan (git show --stat of the archive-move commit); bun run test and bun run lint both exit 0 in the transcript. Or (failure) plan.md's A1 failure branch ran: the implementation commits reverted on the branch (git log in the transcript), the #281 comment and any product issue posted (their URLs in the transcript), ARC_FAILED: arc-1 <reason> reported, and no PR opened.
```

```
/loop 15m Drive implementations-plan/e2e-followups-3 forward. Never idle. Each firing: (1) read plan.md, STATUS.md and lessons/; if the plan path is gone, check `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/e2e-followups-3/plan.md`: success means merged, so run `agent-worktree done e2e-followups-3 --merged --trunk dev`, report, clear this loop and stop; failure means delivered, so babysit CI only. If lessons/ records ARC_FAILED, the failure branch has run: report it once, clear this loop and stop. Before Phase 0 passes, check #297 and wait if it is open. (2) Waiting on CI is fine; confirm it progresses. (3) No task in hand: take the next pending step; run lint and the touched tests after each edit; commit. (4) A decision you would bring to a person: consult Codex (run-codex.sh … high read-only gpt-6.1-sol) and act on the stronger argument; log it in lessons/. Anything a person would see goes to OWNER-ASKS.md, never decided. Never merge, never push to main, never expand scope, never change apps/extension/src. (5) Same step failed five times: stop and reassess with Codex; a gate that failed three times on one step, a fired stop rule or an unsettled Phase 2 after three probe rounds runs plan.md's A1 failure branch. (6) Phase green per its gate: mark ✓, log lessons, print LESSONS_FILE=…. (7) All phases ✓: run the quality loop, then Delivery, then the close-out per Post-implementation, then report and stop.
```

---
plan: flake-1
tier: light (the orchestrator's spawn: one Codex audit round-trip and the Opus Plan leg)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 9ce6bb0bd
trunk: dev
status: approved (final Codex pass); arc 1 in progress
issues: "#1222"
post_implementation_hardening: not scheduled
---

# flake-1: the Firefox driver answers the file picker itself

## Problem

On Firefox a click on a file input reaches the native picker, and headless Firefox answers it by focus: a focused window's pick stays unanswered, an unfocused one's is cancelled at once (#1222, traced on 153.0.4). The suite controls neither. The driver's `pickFile` needs the first (it fills the pending input after the click); `toolbar-panel.test.ts:572-578` needs the second (it waits 10 s for the cancel to remove the input). When the contacts card window has focus at its click, the cancel never comes: the retry-0 flake, once in 88 green Firefox smoke PR runs. `FIREFOX.md:59` names the fix: a pick that answers the picker itself.

## Outcome & Quality Bar

- **For whom**: whoever reads a red Firefox smoke lane, a required check on `dev` and `main`. A red must mean the wallet broke.
- **Excellent**: (1) no Firefox pick reaches the native picker: one nobody asked for is cancelled at once, an asked one is answered with its file, whatever window has focus. Proof: the cancel half green with its window focused before the click, where the base misses. (2) Every Firefox pick still passes `expectPickerLists` against a pending input, and `toolbar-panel.test.ts` stays within chaos-5's 115-137 s on Firefox.
- **Good enough**: no change to Chrome's driver, `src/utils/files.ts` or any product file; no new e2e scenario.

## Assumptions

**Facts**
- F1. Firefox 158 dismisses pickers only for a BiDi session whose `unhandledPromptBehavior.file` is not `ignore`, by its own factory for `@mozilla.org/filepicker;1` (`omni.ja`: `shared/webdriver/FilePickerHandler.sys.mjs`; `Session.sys.mjs:319,363-367,392,478-491`); nothing reads `remote.bidi.dismiss_file_pickers.enabled`. The suite sets neither (`firefox.ts:292-316`), and this plan keeps it so.
- F2. 158 has no BiDi command that answers or closes an open picker, and refuses `input.setFiles` on an extension page (`FIREFOX.md:36`).
- F3. A session-wide dismissal breaks the pick: its cancel removes the pending input before the driver fills it (#1222 comment 2: the restore case failed in `expectPickerLists`, 2/2, 153.0.4).
- F4. An extension page's pick reaches the parent's factory: #1222's privileged wrapper saw `init`, `open` and `done` for the contacts card.
- F5. A JS factory registered from a system-principal sandbox cancels an unasked pick at once and holds an asked one until `done(returnOK)` delivers its `nsIFile` as `change` (probe, recon.md, 158.0, focused window).
- F6. Prior art: the page-error relay keeps a process-lifetime sandbox armed at launch, answers on an observer topic through the subject, and serialises TS helpers into it (`firefox-page-errors.ts:116,258-296`), unit-tested by `runSerialised` (`scripts/e2e/firefox-driver.test.ts:524`). `answerRequests` binds a page by `browserId` through `NavigableManager.getBrowserById` and refuses a second arm (`firefox-answer-requests.ts:19-24`).
- F7. `setFileInput`, `WEB_ELEMENT` and the `data-e2e-stale` stamp serve only Firefox's `pickFile` (`webdriver-classic.ts:36,199-207`; `firefox.ts:28,724-738`; `file-accept.ts:1-3`).
- F8. The cancel path is proven below e2e: `files.test.ts:15`, `contacts/index.test.ts:172`.

**Inferences**
- I1. No e2e path opens a save-mode picker (no caller passes `saveAs: true`), so cancelling every unasked picker changes no download.
- I2. Ten normal base runs will rarely miss (focus came on its own in 2 of 48 traced runs); the red/green proof is the forced-focus variant, if it still misses on 158.

**Asks** (working assumption in brackets)
- A1. The gate's "smoke seeds 9001-9005" names no smoke-lane mechanism. [Run `profile-chaos.test.ts` on Firefox, `NULO_E2E_CHAOS_SEED=9001 NULO_E2E_CHAOS_RUNS=5` (seeds 9001-9005, `helpers/profile-chaos/spec.ts:117-120`), at retry 0; the report names this reading.]

## Architecture & Implementation

- **Module.** New `tests/e2e/fixtures/browser/firefox-file-picker.ts`, beside the other `firefox-*.ts` concerns:
  - `filePickerSlot(returnOk, returnCancel)`: a TS function that uses nothing outside itself, serialised into the sandbox as the relay's helpers are. It keeps `armed` (`browserId`, path) and `held` (picker, callback). `arm` refuses unless both are empty. `open(picker, callback)` holds the pick when it is armed for the picker's `browsingContext.browserId`, else calls `done(returnCancel)` at once, as a person closing the chooser. `answer` takes and clears `held` before it sets `file` and calls `done(returnOk)`. `release` clears `armed` and cancels a held pick the same way. Each returns one outcome word.
  - `installFilePicker(session)`, called at launch beside `armPageErrorRelay` (`firefox.ts:137`), before any page exists: it evaluates the slot and the factory in a system-principal sandbox labelled `resource://nulo-e2e/file-picker.js`, registers the factory, and fails the launch unless `contractIDToCID` names its CID. Commands reach it on the observer topic `nulo-e2e:file-picker`; each writes its outcome word into the subject and catches its own error, so a missing or faulting stand-in reads as such, never as "not held yet".
- **`pickFile` on Firefox** (`firefox.ts:731`), over a `FirefoxScopeCall` as `answerRequests` is wired (`firefox.ts:979-988`): `arm` with the page's context and the path (refused for a missing file, as Send Keys refused); `open()` (the click and `expectPickerLists`, which still sees the pending input, as on Chrome); `answer`, polled within 10 s until it stops reading `not held`, which covers the contacts card's 50 ms delayed click; `release` in `finally`, whose failure never hides the step's own error.
- **`prepareClick` on Firefox** also renews the page's activation before each scripted click (D8): a picker opens only on an activated document and consumes the activation.
- **Removed**: `setFileInput` and `WEB_ELEMENT`; the `data-e2e-stale` stamp, the `PENDING_FILE_INPUT` import and the docstring at `firefox.ts:724-730`; the `:not([data-e2e-stale])` clause and its sentence in `file-accept.ts`.
- **The flaky step** (`toolbar-panel.test.ts:569-579`): only its comment changes; the cancel now comes from the stand-in. The 10 s bound and `{ connected: false, active: true }` stay, and `connected: false` still proves the press: only a pick Firefox lets through reaches `open`.
- **Docs**: `FIREFOX.md` line 43 and the row at 59 state what the stand-in does and why.

## Security & Adversarial Considerations

- **Surface**: test fixtures only; nothing ships in a build. The stand-in runs with Firefox's system principal in the suite's own browser, as the relay does under `--allow-system-access`. The `resource://` label names the source; it is no security boundary.
- **What could go wrong**: a pick the product opens unasked is cancelled silently, but the panel guard records a panel pick page-side before any factory runs (`firefox-action-popup.ts:165-171`). A pick from another page than the armed one is cancelled. A slot left armed or held by a failed step is released in `finally`, and a second arm over it is refused, so it cannot hold a later unasked pick.
- **Trust**: no secret, credential, network or dependency change. Crypto, supply chain, store and dApp boundaries: N/A.

## Decision ledger

- D1. **The driver answers the picker (chosen)** over a bounded wait that logs the cancel half as skipped (both legs agree). The skip keeps both reliances on the native picker and makes an assertion pass either way, which the owner's standing rule forbids. The stand-in removes the cause, matches Chrome's driver (`waitForFileChooser` + `accept`, `chrome.ts:354`) and is the technique Firefox's Remote Agent uses (F1).
- D2. **Not the BiDi dismissal**: it exists on 158 (F1) but is session-wide and leaves no way to give a file (F2, F3).
- D3. **Install at launch, every Firefox session**: the flaky click is not a `pickFile`, and no Firefox page should reach the native picker.
- D4. **A sandbox and an observer topic** as the relay does (F6), so the stand-in outlives every browser window.
- D5. **Bind the arm to its page** by `browserId` (Codex; Opus found no overlapping picks): one comparison, as `answerRequests` binds, so the answered picker is the one whose input `expectPickerLists` read.
- D6. **Unit-test the slot** with `runSerialised` (Codex; Opus optional): no e2e run reaches `release` after a failed step.
- D8. **Firefox's `prepareClick` renews the page's activation** (a deviation the tree forced, Phase 2). Firefox 158 sets a realm's `userActivation` flag on every `script.callFunction` (`windowglobal/script.sys.mjs:293`) but activates the document only when it turns on (`shared/Realm.sys.mjs:220-233`); Puppeteer keeps it on, so a page's evaluated clicks share one activation, and a picker consumes it. Base hid this: Send Keys filled inputs whose picker never opened. `prepareClick`, whose contract names the missing gesture (`fixtures/browser/index.ts:190-193`), now turns the main realm's flag off and on, as Chrome activates each evaluate. A first fix, `pointerClick` for the contacts picks only, rested on a misread setter ("cleared as the call returns", Opus's review) and left `restore-outcome.test.ts` red (2 of 3); Codex chose the renewal over pointer presses for every pick (high confidence).
- D9. **A control that takes over 5 s to become clickable** would outlast a renewed activation (Codex, round 2, plausible but unverified; the fix reorders `clickLast` for every click on both browsers). Decided on the full Firefox suites: no red of that shape in either, so known limit #1410 (closed, not planned).
- D7. **Keep ten normal runs per side** (Opus: wasteful; the orchestrator's gate names ten); the forced-focus runs carry the red/green proof.

## Phases

### Phase 1: measure the base
1. Record `cat /proc/loadavg` before each run.
2. Build the armed Firefox smoke dist (FIREFOX.md header). Run `toolbar-panel.test.ts` ten times at retry 0 with an uncommitted timing log on the cancel half.
3. Run it three times with an uncommitted `bringToFront(contactsWindow)` before the click. Keep both scratch edits as one patch outside the repository.

Validation gate: `lessons/phase-1.md` records each run (pass or miss, cancel time, load1, file wall-clock). Pass: at least one forced run misses. If none misses, stop: report the 158 numbers on #1222 and ship nothing. Layers: e2e.

### Phase 2: the stand-in
1. Add `firefox-file-picker.ts`, its `firefox-driver.test.ts` cases and the launch call; change Firefox's `pickFile`.
2. Run `toolbar-panel.test.ts` and `contacts-import.test.ts` on Firefox once. Do the removals and the doc edits only after both pass.
3. Run the fast layers, then the e2e below.

Validation gate (pass = every command exits 0, every e2e run green at retry 0, load1 recorded per run):
- `bun run lint`, `bun run typecheck:all`, `bun run test`. New unit cases: an unasked pick is cancelled; an armed pick from another page is cancelled and one from its page is held, answered once with its path, and `release` after it does nothing; `release` cancels a held pick once; a second arm is refused.
- The forced-focus variant three times, green. Then revert the scratch patch with `git apply -R`; the file's diff must hold only the comment edit.
- `toolbar-panel.test.ts` on Firefox ten times; `toolbar-panel` and `contacts-import` on Chrome once.
- The whole smoke suite on Firefox once; A1's seeds 9001-9005 on Firefox.
- The whole network suite on Firefox once.
Layers: lint, typecheck, unit, e2e, network e2e.

Commands (from `apps/extension`): build `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:<browser>`; smoke `NULO_E2E_BROWSER=<browser> NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 NULO_E2E_RETRY=0 bun run test:e2e [-- tests/e2e/<file>]`; chaos adds `NULO_E2E_CHAOS=1 NULO_E2E_CHAOS_SEED=9001 NULO_E2E_CHAOS_RUNS=5`; network, from the repo root, `NULO_E2E_BROWSER=firefox NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent`.

## Delivery

One arc, one PR to `dev`: `test(e2e): the firefox driver answers the file picker instead of racing it` (≤ 92 characters). Body: what changed and why, the phase 1 and 2 numbers with load1, the toolbar file's wall-clock per browser before and after, no new scenario, `Closes #1222`. Open it without labels; both Firefox lanes trigger on `apps/extension/**`. The close-out lands as the PR's final commits.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `9ce6bb0bd` binds, with: step 1 absent (`code_review: off`); step 2 one Codex session (`run-codex.sh`, `high`, `read-only`, `gpt-6.1-sol`) over the net diff from `9ce6bb0bd`, hard stop at three rounds; steps 3-5 as written there, slug `flake-1`, trunk `dev`. Merging is the orchestrator's call.

## Audit verdicts

- Codex, `high`, `gpt-6.1-sol`: approve with changes. Accepted: the network command at retry 0; take and clear the slot before a callback, refuse a second arm (in the slot); bind the arm to its page (D5); prove extension pages before the removals (F4, Phase 2 step 2); a fixture-level test (D6); the whole Firefox suites (gate); A1 named in the report.
- Opus Plan: approve with changes. Accepted: outcome words through the subject; the second-arm refusal; the missed picking files (the whole suites instead of a list; Chrome runs `contacts-import`); a Phase 1 stop condition; the scoped `git diff`; the full removal list; F3 restated; F4 promoted from an inference; `own-window` dropped (it picks nothing). Rejected: three normal runs instead of ten (D7).
- Final Codex pass (the same session, resumed): approve, no new material defect; the causal proof is Phase 1's forced-focus miss.
- Arc 1, Codex round 1 (`high`, `gpt-6.1-sol`, diff `9ce6bb0bd..d8d1a767d`): clean, one comment nit (accepted). Opus diff review: fix these; D8's mechanism wrong (accepted, D8 revised), `pointerClick` lacks an enabled wait (moot once reverted), unit gaps (accepted: counts, a release before any pick, the pick flow's release on both paths), comment widths (accepted). Codex round 2 (resumed): the renewal, high confidence; one plausible finding (D9).

## Seeds

- `/goal`: Implement implementations-plan/flake-1/plan.md phase by phase in this worktree; a phase is green only when its gate passes; then run its Post-implementation section and open the PR; never merge.
- `/loop`: Each firing, read implementations-plan/flake-1/STATUS.md, continue the first unfinished step of plan.md, run its gate, log it in lessons/, and stop at the PR.

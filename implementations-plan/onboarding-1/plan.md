---
plan: onboarding-1
tier: light
status: approved by the panel (2026-10-30, Codex r4 approve): arc 1 (#1385, #1386) next; arc 2 (#1387) waits on OA-1
issues: "#1385 #1386 (arc 1); #1387 (arc 2, after OA-1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex gpt-6.1-sol high audit round trip + Opus Plan leg
base: origin/dev at 9ce6bb0bd
trunk: dev
post_implementation_hardening: not scheduled
---

# onboarding-1: three onboarding states a reload or a duplicate import leaves wrong

The onboarding tab never renders the shared confirm, so a duplicate import spins (#1385). Its load check takes any active profile as proof that this tab's flow finished, so a reload mid-import (#1386) or on the phrase step (#1387) reads YOU'RE IN. Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md).

## Outcome & Quality Bar

- **For whom**: a person in the onboarding tab who imports a phrase the wallet already holds, or reloads the tab mid-flow.
- **Excellent**: (1) a duplicate import stops at the existing "You already have this wallet" confirm, and both answers end the spinner; (2) after a reload, Ready shows only when this tab's flow got a profile in, and an unfinished attempt reloads to its own page.
- **Good enough**: Ready's text is unchanged in arc 1; how it names an unsaved phrase waits for the owner (OA-1).

## Findings (paths verified at `9ce6bb0bd`)

| # | Path | Label |
|---|---|---|
| #1385 | Main unlocked → onboarding Import → Main's phrase → IMPORT. `DuplicateWalletError` → `askConfirm` opens `confirm` (`useConfirm.ts:29-33`), but `<PopupManager />` (`onboarding/app.vue:82`) is never imported and the component auto-import covers only `src/components` and `src/onboarding/components` (`vite.config.ts:126`). Nothing renders it, the promise never settles, and `isImporting` stays true. Broken: every `askConfirm` gets an answer. | demonstrated (trace; lab) |
| #1386 | Then reload on `/onboarding/import`: `hydrateKnownProfile()` returns Main and `app.vue:49-56` replaces to `doneRoute("import")`. Broken: Ready means this tab's flow got a profile in. Consequence: a false success screen. | demonstrated (trace; lab) |
| #1387 | Create → phrase step → reload: the same check lands on a bare Ready (`done.vue:19` takes the type), with `phraseSaved` unset and nothing said. | demonstrated (trace; lab) |

The claims held. #1385's "every confirm the onboarding tab asks" is exactly one confirm, shared by the phrase and backup paths (recon).

## Assumptions

- **Facts**: F1 the cites above. F2 CLAUDE.md requires a cross-shell component to live under `src/components/`; Biome does not ban `@/popup/components/popups/**` (`biome.json:510-521`), but the rule binds. F3 `PopupManager` connects two clients and runs `useIncomingTrustPrompts` (`PopupManager.vue:43-66`). F4 vue-router 5.2.0 merges `history.state` into the current entry on `replace` and before `push`; a pushed entry gets only the state passed (`vue-router.esm-browser.js:868-879`). F5 a backup restore opens its session at `finalizeRestore`, then runs an account-state tail of up to 45 s before `importedProfile` or `completeImport` (`useFullBackupImport.ts:501-523,727-730`). Before finalize, the run arms Home's restore-outcome reminder for the networks the tail restores. That reminder is best effort: a failed arming is caught (`:392-401`), and an empty network list arms nothing (`utils/restore-outcome.ts:58-62`). F6 the duplicate refusal is a warned choice by owner policy (`useProfileImportFlow.ts:120-140`), and #1385 asks for exactly that confirm. F7 a routed page can mount while the shell's load check still awaits `hydrateKnownProfile()` (`app.vue:49-50`, `useProfileBootstrap.ts:286-299`).
- **Inferences**: I1 Chrome and Firefox keep `history.state` across a reload of an extension page (HTML history model; phase 3's e2e proves it). I2 with no marker and an active profile, the tab's flow got no profile in, except within one microtask between `createProfile` and `onCreated` (`useProfileCreateFlow.ts:145-162`). There the tab stays on Create: the safe side, never a false Ready.
- **Asks**: OA-1, Ready's line for an unsaved phrase (wording, owner's call; arc 2 waits on it).

## Architecture & Implementation

- **#1385 (D1)**: `git mv` `src/popup/components/popups/ConfirmPopup.vue` and its test to `src/components/`, and `popup-shared.module.css` to `src/components/Popup/`. Repoint the 14 files that compose the sheet, `PopupManager`'s import, `popup-stack.pins.test.ts`, and `useConfirm.test.ts`'s import (`:15`) and `ALLOWED` path (`:287-290`). Regenerate `src/types/components.d.ts`. `onboarding/app.vue` then mounts `<ConfirmPopup :show="popupStore.isOpened('confirm')" @onClose="popupStore.close('confirm')" />` in place of `<PopupManager />`. It resolves by auto-import, as `NotificationManager` does.
- **Flow marker (D2, D3)**: the entry key `onboardingPath` that `doneRoute` already writes, now also written one step earlier. `steps.ts` adds `markFlowPath(path)`, `clearFlowPath()` (both `history.replaceState({ ...history.state, … }, "")`) and `settleResume()`, a flag for this document; `donePath` stays the reader.
- **Reader**: `app.vue`'s `onMounted` keeps its order. An active profile plus a marker (`donePath(window.history.state)`) → `router.replace(doneRoute(path))`; an active profile without one → stay on the route; no active profile → unchanged. A `finally` calls `settleResume()` on every exit and, unless the check routed to Ready, `clearFlowPath()`: the check either sends the marked entry to Ready or leaves a fresh form, a rejected `hydrateKnownProfile()` included (Codex r3-1).
- **Writers (D5)**: `create.vue` marks first thing in `onCreated`; `import.vue` marks first thing in `completeImport`, and when `restoreStage` reaches `"restoring:account-state"` (F5). Both pages call `clearFlowPath()` on mount, because a form mounted after the load check is a fresh attempt. `clearFlowPath()` does nothing until `settleResume()` has run in this document, so a page that mounts during the check never erases what the check reads (D6, F7).
- **Files**: `src/components/{ConfirmPopup.vue,ConfirmPopup.test.ts,Popup/popup-shared.module.css}` (moved); the 13 other popups' `<style>`; `src/popup/components/popups/{PopupManager.vue,popup-stack.pins.test.ts}`; `src/composables/useConfirm.test.ts`; `src/onboarding/{app.vue,steps.ts,pages/create.vue,pages/import.vue}` and their tests, plus a new `src/onboarding/resume.test.ts`; `tests/e2e/onboarding-tab.test.ts`.

## UI impact

The owner, 2026-10-30: "#1381–#1395 => yes, if they are bugs, work on them. all of them sound very worth fixing. Merge those on green, I review the captures if needed on Monday." Arc 1 changes:

- **Onboarding Import, duplicate phrase or backup**: before, a spinner that never ends; after, the existing confirm, styled as in the popup. Its text, "You already have this wallet" with Add anyway and Cancel, is unchanged.
- **Reload while a profile is active and this tab's flow got none in** (on Welcome, Terms, Create or Import): before, Ready; after, the same page. This covers a tab reopened over another profile's session.
- **Popup confirms**: no change; only the files moved.
- The PR body carries before/after captures of the Import confirm and of a reload on Import.

## Security & Adversarial Considerations

- **Trust boundary**: `history.state` belongs to the extension's own document. The manifest has no `web_accessible_resources`, so no web page frames it. The marker picks a screen and grants nothing: no session, no secret, no write. A forged marker shows Ready for the active profile, the base behaviour. It holds no profile id, so session-restore data gains nothing.
- **Duplicate refusal**: rendering the confirm restores the warned choice (F6); Add anyway passes `allowDuplicate` to the service, which re-checks under its lock (`service.ts:2339`). Profile names render as text (`ConfirmPopup.vue:63-64`).
- **Logging, storage, permissions, dependencies, crypto**: no change.

## Arc 1: phases

### Phase 1: render the confirm (#1385)

- Do D1.
- **Test**: `app.test.ts`, with real Pinia and the real dialog. `askConfirm` from a scope; Confirm resolves `true`, Cancel resolves `false`, and each closes the slot. Red at the base, because no dialog renders.
- **Gate**: `bun run lint`; `bun run typecheck:all`; `bun run test`. Pass: exit 0, and the new case is red on the base copy.

### Phase 2: the flow marker (#1386)

- Do D2, D3, D5 and D6.
- **Tests**:
  - `steps.test.ts`: mark and clear keep vue-router's keys; clear does nothing before `settleResume()`. A real `createRouter(createWebHashHistory())` keeps the marker through `push`, `replace` and a `replace: true` guard redirect, and through a second router on the same history.
  - `resume.test.ts`: the shell over a real hash router, a stub page that clears on mount, and a deferred `hydrateKnownProfile()`. While the check is pending the marker survives; a check that rejects leaves the form unmarked; once it settles, Back onto a marked form clears it.
  - `app.test.ts`: `:117-131` pins the bug and flips. The new case, "a reload on Import whose import never landed stays on Import", is red at the base. Controls: a marked Import entry and a marked Create entry resume at Ready on their path; an unmarked Welcome with an active profile stays.
  - `create.test.ts`: mount clears the marker; `onCreated` marks before the phrase shows.
  - `import.test.ts`: mount clears the marker; `completeImport` marks; `restoreStage` reaching `"restoring:account-state"` marks.
- **Gate**: phase 1's commands. Pass: exit 0, and the #1386 case is red on the base copy.

### Phase 3: browsers

- **E2E**: one scenario in `onboarding-tab.test.ts`: reload the phrase step through `reloadExtensionPage`, then expect `#/onboarding/done`. Failure mode: a real reload drops the marker, and the tab offers Create again over the new profile. jsdom cannot reload a document. The base also passes, so this scenario guards the new mechanism. Estimate: 6 s on Chrome, 9 s on Firefox.
- **Gate**:
  - `bun run lint`; `bun run typecheck:all`; `bun run test:all`.
  - Build each browser with CI's smoke flags: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`, then `build:firefox`.
  - From `apps/extension`: `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/onboarding-tab.test.ts tests/e2e/onboarding-import.test.ts tests/e2e/duplicate-phrase-import.test.ts --retry=0`, then again with `NULO_E2E_BROWSER=firefox`.
  - Pass: every command exits 0. Record each browser's wall-clock before and after.

## Arc 2: Ready names an unsaved phrase (#1387; starts on OA-1)

- Recommended (OA-1 A): `done.vue` reads `useGetStarted({ profileId: () => appStore.profile?.id })` and shows one line when `path !== "import"`, `phraseSaved === false` and `imported === false`. `dispose()` runs in `onBeforeUnmount`.
- Tests: `done.test.ts` (unsaved shows; saved and imported do not; a failed read on an import path does not). The phase-3 e2e also expects the line, and "create with password" expects none after "I saved it".
- Gate: as phase 3.

## Decision ledger

| Id | Decision | Rejected |
|---|---|---|
| D1 | Move `ConfirmPopup` to `src/components/` and its shared sheet beside `Popup` | an import from `popup/**` (Codex r1-1, Opus 3: breaks the cross-shell rule); composing the sheet from `popup/**` (a reverse dependency); `PopupManager` (F3) |
| D2 | The marker rides the history entry, as `doneRoute` already does | `sessionStorage` (a new store); `chrome.storage.session` (one value for every tab); a route-only rule (cannot tell a profile made on Create from one unlocked elsewhere) |
| D3 | Path only, no profile id (Opus 1) | the id: refusing a mismatch left a fresh Create form after a finished flow, and Ready rendered anyway (Codex r1-2) |
| D4 | #1387's line waits for the owner (Codex r1-6, Opus 4); arc 1 keeps the reload on Ready | Re-showing the words: they open only with the password or a passkey answer (`service.ts:2225-2235`), so onboarding would need a second reveal surface beside Settings' `seed.vue`. |
| D5 | Mark when the profile lands, including the restore tail (Opus 2, Codex r1-4) | Codex r1-5, which would leave a restore with errors unmarked. A reload drops that page's Retry and Continue in any design. Ready reaches Home, where the run's restore-outcome reminder (best effort, F5) offers the networks left. The Import form would invite a duplicate restore, and the base shows Ready there. |
| D6 | The form pages clear the marker on mount once the load check has settled (Codex r1-3, r2-1) | Replacing the form entry with Ready: it changes Back from Ready. Holding `RouterView` until the check settles (Codex r2-1's fix): it blanks the tab for as long as the worker takes to answer. A known limit: the fix is local. |

## Audit verdicts

| Round | Verdict | Accepted | Rejected |
|---|---|---|---|
| Codex r1 | reject | 1 (D1), 2 (resolved by D3), 3 (D6), 4 (D5), 6 (OA-1; F6 settles "refused"), 7 (phase 1 test) | 5 (D5) |
| Codex r2 | conditional approve (preserve the marker during the load check; test an interrupted check) | 1 (D6: the settle flag, `resume.test.ts`), 2 (`useConfirm.test.ts:15`), 3 (F5 wording) | none |
| Codex r3 | conditional approve (clear the marker when the check fails; test it) | 1 (the `finally` clears unless routed to Ready; `resume.test.ts` rejection case) | none |
| Codex r4 | approve | none | none |
| Opus Plan | conditional approve | 1 (D3), 2 (D5), 3 (D1), 4 (OA-1), 5 (I2, UI impact), 6 (arc 2's `path` check), tests | 7: a mark after a Back mid-import lands on the current entry. The push to Ready that follows already moves the tab, so this is noted only. |

Known limit, filed at close-out: a typed `#/onboarding/done` with a profile active shows Ready. The consequence does not matter: the profile exists.

## Delivery

- **Arc 1**: branch `worktree-onboarding-1`, one PR to `dev` with `gh pr create`. Open it ready, after the Codex loop converges and the gates pass, with no labels.
  - Title: `fix(onboarding): render the duplicate confirm and keep a reload off a false ready` (81 characters).
  - Body: the owner's words, the captures, the gates with outcomes, the e2e wall-clock per browser, `Closes #1385`, `Closes #1386`.
- **Arc 2**: after OA-1, stacked on arc 1 (`gh stack`), or off `dev` once arc 1 merges. `Closes #1387`. The close-out lands as its final commits.
- **Serial**: the arcs share `onboarding-tab.test.ts`.

## Post-implementation

Execution contract: `implementations-plan/README.md` § Post-implementation standard at `9ce6bb0bd`, with these values:

- Step 1 is absent (`code_review: off`).
- Step 2, per arc: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` on the arc's diff, resumed with `resume-codex.sh`. Both verbatim rules and the adversarial ask go in every prompt. One Opus `general-purpose` review runs beside round 1. Hard stop at three rounds.
- Steps 3 and 4 as written. The close-out moves this folder to `archive/onboarding-1/`.
- Step 5: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/onboarding-1/plan.md`, then `agent-worktree done onboarding-1 --merged`. The orchestrator's session notices the merge.
- Three failures on one step end the arc as `ARC_FAILED`.

## Seeds (not run; orchestrator-owned)

- `/goal` Arc 1 phases ✓ in implementations-plan/onboarding-1/plan.md, each gate passing in the transcript; the Codex loop converged on arc 1's diff (a resumed pass with no new material finding, quoted); a ready PR to dev closing #1385 and #1386; `bun run test` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/onboarding-1 from plan.md and lessons/: next unchecked phase, its gate, the Codex loop, delivery; arc 2 only once OA-1 is answered; never merge.

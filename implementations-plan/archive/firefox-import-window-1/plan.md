---
plan: firefox-import-window-1
tier: mid
status: completed
issues: "#1701"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex gpt-6.1-sol high audit + Opus Plan leg in parallel; final fresh Codex pass
base: origin/dev at 002b76fc7
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date**: 2026-11-06
- **Status**: completed in one arc, #1716 from `firefox-import-window-1-a1`, whose final commits are this close-out; it closes #1701.
- **Shipped**: on Firefox's toolbar panel, an import (both outcomes) and the unlock-method page's three successes close their own window, and the panel reopens on Home or Settings with the flow's line, bound to its profile (P116-16 B). One synchronous predicate, `handsBackToPanel()`, gates every hand-back; create and import land through `landOpenedProfile` (`src/popup/opening-flow.ts`); a Back during a hand-back's record write joins it. Unit pins on each page and helper; a new Firefox e2e scenario (16-18 s locally, red with the hand-back off) and test 6 now assert the hand-back through one helper shared with the contacts card; FIREFOX.md's toolbar-panel row names the hand-back.
- **Known limits** (D16), each a closed `known-limit` issue: #1718 (no focus back on the opener within 3 s, no panel reopens); #1719 (a profile-bound line whose profile does not open on the landing never shows); #1720 (a window that left its flow ends in place).
- **Open items**: OA-1 in [OWNER-ASKS.md](OWNER-ASKS.md), the unlock-method window's `UnlockMethodChangedError` ending; today's ending ships (D6).
- **Dispositions**:
  - The base moved to 36551502f under the plan (#1703 reordered the unlock-method page's passkey steps); `attempt`'s success branch was unchanged, so the plan held.
  - `leaveChanged` was extracted from `attempt` to stay under the cognitive-complexity cap, with no suppression; the chaos model's `unlock-method.vue` citations were re-cited twice by line diffs.
  - The Firefox and Chrome smoke suites ran once, on the reviewed head, not at Phase 4's gate.
  - No `lessons.md` promotion: the one cross-task gotcha, re-citing the chaos model after an edit above a cited line, is already there; the other, a privileged panel read refusing a passkey prompt in another window, is FIREFOX.md's toolbar-panel row.
- **Seeds retired**: the `/goal` and `/loop` seeds below.

# firefox-import-window-1: a profile imported from Firefox's toolbar panel ends like a created one

One arc, one PR against `dev`, `Closes #1701`, no stack. On Firefox's toolbar panel, an import and a change of unlock method move to a window of their own; when they finish, that window now closes and the panel reopens on the page the panel would have shown, with the flow's line. Create and import land through one helper. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md). Paths are under `apps/extension/` unless they name the repo root.

## Scope

#1701's claims were re-read at 002b76fc7; every citation holds (line offsets of one or two in `import.vue`). Two claims needed a correction:
- "every ending of the profile import ends in that one `completeImport`": true for the successes; the refusals (a wrong file password, a refused phrase) stay in the window for another try, as the card windows' refusals do.
- The issue's tests list says the e2e runs "through `agent.sh`" (the lane brief): `scripts/e2e/agent.sh` runs the network config only (`agent.sh:16`). Smoke runs through `bun run test:e2e`, which claims its geckodriver ports through `reservePort` against `~/.agents/ports.md` (D11).

In scope: the import's two successful endings (`active`, `needs-unlock`), the unlock-method page's three successes, create's opened landing. Out, with the reason: the unlock-method page's `UnlockMethodChangedError` ending (today's ending ships; OA-1 asks the owner, D6); an own window's Back or Cancel outside the cards (closes, no panel; not in the owner's pick, D7); a window that left its flow (an ordinary page by design, D8); create's hand-off when the profile did not open (D4); refusals, which keep the page for another try.

## Outcome & Quality Bar

- **For whom:** a Firefox user who imports a profile, or changes how a profile unlocks, from the toolbar panel; and the maintainer of the hand-off code.
- **Excellent:** (1) the window closes by itself at the end and the panel reopens on Home (import) or Settings (unlock method) with the flow's existing line, bound to that profile; (2) a needs-unlock import with its session closed reopens the panel on the lock screen with the imported profile selected, and the line shows on Home after the unlock; (3) one predicate decides "this document hands its ending back", and one helper lands both opening flows, so a later flow cannot end differently by accident; (4) Chrome, the Firefox sidebar and onboarding behave byte-for-byte as before.
- **Good enough:** refusals and the `UnlockMethodChangedError` ending keep today's in-window behaviour; the residuals of D16 are known limits; no new copy.

## Assumptions

**Facts**
- F1. `returnToPanel` gates on `isCardWindow()` (`src/utils/own-window.ts:253-257`); `CARD_FLOWS` is contacts, account import, Restore again (`:33`).
- F2. The background's `RETURN_TO_PANEL` handler accepts only the popup page in a popup-type window, removes only the sender's window, and reopens the panel only on a normal opener window that gets focus within 3 s (`src/wallet/utils/toolbar-popup.ts:82-110`).
- F3. `HANDBACK_ROUTES` holds `/popup/general` but not `/popup/settings` (`src/utils/panel-handback.ts:12-18`); `decodeSnack` accepts `success | error` only.
- F4. The panel reads the record before its router exists and settles it on its first arrival at the route with a session open; the line shows only when that session is the line's profile (`src/popup/index.ts:52`, `src/composables/panelLanding.ts`).
- F5. `/popup/general` and `/popup/settings` are `isAuthRequired`; a locked panel goes to `/popup/auth` and its unlock pushes `postAuthRoute(pageAwaitingAuth)` (`src/popup/pages/auth.vue:116`), which returns `landingRoute()` when no dApp window set a page (`own-window.ts:167`).
- F6. `completeImport` writes the last active profile first (`src/popup/pages/import.vue:69`); the lock screen preselects it.
- F7. `followOwnRoute` releases the window on a completed navigation off the flow's page and `/popup/auth` (`own-window.ts:160-163`); a shell lock on an opening route, with a session held, ends the flow and releases (`src/popup/lock-landing.ts:63`, `src/popup/app.vue:481-485`).
- F8. Create's page `/popup/profile/new` is not in `OWN_WINDOW_ROUTES`; from the panel a passkey create runs in the background's passkey window (`src/composables/useProfileCreateFlow.ts:65`).
- F9. A successful unlock-method change reopens the session it found open (`src/wallet/services/profile/service.ts` `afterUnlockChangeHoldingLock`), except an integrity block, which returns success with the session closed behind the barrier; `UnlockMethodChangedError` means "saved, or may have been", with the session closed (`packages/extension-messaging/src/errors.ts:578-590`).
- F10. The card pages hand back before they toast (account import), or toast in the window as well (Restore again).

**Inferences**
- I1. No caller needs `isCardWindow()` to decide the hand-back once the predicate exists; `isCardWindow` stays the card UI signal (`Header.vue:175`, the three card pages).
- I2. The closing import window owes nothing at completion: its import is done, `dispose()` only drops the name field's and the backup run's in-memory state, and the document dies with its heap (lessons.md: a closing window runs no Vue teardown).
- I3. `needs-unlock` does not prove a closed session: a bootstrap failure the recovery could not clear also returns it with the session open. A hand-back of `/popup/general` makes the panel boot as any fresh panel does: Home when the session is open, the lock screen when it is not (its unlock returns Home through `landingRoute()`, `src/composables/panelLanding.test.ts:50-72`), or the shell's boot-failure screen with Retry when its own bootstrap fails. The line shows only on Home with that profile's session open; no new recovery path.

**Asks**
- The needs-unlock ending: settled by the page the owner signed (D5).
- OA-1, open: the unlock-method window's ending after a change saved but not reopened ([OWNER-ASKS.md](OWNER-ASKS.md)). What ships now: today's ending in the window (D6); the arc does not depend on the answer.

## Architecture & Implementation

**The predicate (`src/utils/own-window.ts`).** A new exported, synchronous predicate names the documents that hand back:

```ts
/** This document still runs the flow it was opened for, in the popup-type window it was handed, so
 *  its flow ends by handing back to the panel. Read after `ownWindowSettled`. */
export const handsBackToPanel = (): boolean => inPopupWindow && ownFlow !== undefined
```

`returnToPanel` gates on it instead of `isCardWindow()`; its doc comment and the file header say "an own window still in its flow" instead of "a card window". `isCardWindow` is unchanged, and so is what `closeOwnWindow` does: a card's Cancel still hands back to the flow's page, and any other own window's Back still only closes. It joins a hand-back already running (`if (returning) return returning`), checked again after its own `getCurrent()` await and before the direct close, so a Back pressed during the record write cannot close the window before the reopen is asked (final pass #2). A caller that must decide in the same task as its last ownership check reads `handsBackToPanel()` and starts the hand-back without awaiting it (D13); the cards keep `if (await returnToPanel(…)) return`.

**The closed set (`src/utils/panel-handback.ts`).** `HANDBACK_ROUTES` gains `"/popup/settings"`.

**The landing (`src/popup/opening-flow.ts`).** The module that already names the two opening flows gains their landing:

```ts
export interface OpenedLanding {
	profileId: string
	/** This document's page: Home, or the lock screen when the session did not open here. */
	route: "/popup/general" | "/popup/auth"
	/** The line shown with `route`. */
	line?: Snack
	/** The line the panel shows on Home once this profile's session is open there. */
	panelLine?: Snack
}

/** Ends a create or an import as the panel would, in the caller's task: an own window still in its
 *  flow hands Home back (a fresh panel boots on it, and its guard sends a locked session to the lock
 *  screen, whose unlock returns Home); any other document releases its window, shows `line` and goes
 *  to `route`. */
export function landOpenedProfile(router: Pick<Router, "push">, openToast: (toast: ToastOptions) => unknown, landing: OpenedLanding): void {
	if (handsBackToPanel()) {
		void returnToPanel("/popup/general", landing.panelLine && { snack: landing.panelLine, profileId: landing.profileId })
		return
	}
	void releaseOwnWindow()
	if (landing.line) showSnack(openToast, landing.line)
	void router.push(landing.route)
}
```

- **Import** (`import.vue`, `completeImport`): after the existing `isUnmounted || !flowLive()` guard, one call: `active` → `{ route: "/popup/general", line: IMPORTED, panelLine: IMPORTED }`; `needs-unlock` → `{ route: "/popup/auth", line: { kind: "success", label: "Profile imported. Unlock to continue" }, panelLine: IMPORTED }`, where `IMPORTED = { kind: "success", label: "Profile imported" }`. The comment "A finished restore in its own window shows the wallet there" goes.
- **Create** (`new-profile-helpers.ts`, `openCreatedProfile`): `router.push("/popup/general")` becomes `landOpenedProfile(router, openToast, { profileId: profile.id, route: "/popup/general" })`, in the same task as the last `assertActive()`. Behaviour is unchanged: the create page never runs as an own window still in its flow (F8), so the predicate reads false and the push runs where it ran.

**Unlock method** (`unlock-method.vue`, `attempt`). The attempt captures `appStore.profile.id` with its fence. On success, after `newPasskey.forget()` and `reset()`:

```js
const changed = { kind: "success", label: done }
if (handsBackToPanel()) return void returnToPanel("/popup/settings", { snack: changed, profileId })
showSnack(openToast, changed)
leaveFor(router, "/popup/settings")
```

The `UnlockMethodChangedError` branch is unchanged everywhere (D6, OA-1). The `StaleUnlockCredentialError`, cancel and failure branches are unchanged: they keep the page for another try.

**Control flow, import from the panel (Firefox).** Panel: Import → method → `leavePanelFor` opens `#/popup/import?…&window=own&opener=<id>` and closes the panel → the window boots, `register` sets `inPopupWindow`, `ownFlow = "import"` → the import runs in the window, its passkey card included → `completeImport` → `landOpenedProfile` → `returnToPanel` writes `{ route: "/popup/general", snack: { …IMPORTED, profileId } }`, sends `RETURN_TO_PANEL`, closes → the background removes the window and opens the panel on the opener once it has focus → the panel boots on `#/popup/general` as any fresh panel does (Home with the session open; the lock screen, then Home after the unlock; the shell's own boot-failure screen if its bootstrap fails) and shows "Profile imported" once that profile's session is open on Home.

**File-level change map.**

| File | Change |
|---|---|
| `src/utils/own-window.ts` | `handsBackToPanel`; `returnToPanel`'s gate; the header, `:46`, `ownWindowSettled`'s and `returnToPanel`'s comments |
| `src/types/auto-imports.d.ts`, `src/types/.eslintrc-auto-import.json` | regenerated by the build (`src/utils/` is an auto-import directory, `vite.config.ts:113`) |
| `src/wallet/utils/toolbar-popup.ts` | header comment only: a flow, not only a file pick, hands back |
| `src/utils/own-window.test.ts` | the hand-back table over own flows; the left-flow case |
| `src/utils/panel-handback.ts` / `.test.ts` | `/popup/settings` in the closed set; its decode case |
| `src/popup/opening-flow.ts` / `.test.ts` (new test file) | `landOpenedProfile`, `OpenedLanding`; its two branches |
| `src/popup/pages/import.vue` / `import.test.ts` | the landing call; the inverted pin and the needs-unlock case |
| `src/popup/pages/profile/new-profile-helpers.ts` | create lands through the helper (its existing tests prove the in-place landing) |
| `src/popup/pages/settings/security/unlock-method.vue` / `.test.ts` | the hand-back on success; two cases and one extended assertion |
| `tests/e2e/toolbar-panel.test.ts` | one new Firefox scenario; test 6's ending |
| `tests/e2e/helpers/import-drivers.ts` | `submitEncryptedFullBackup` reports a window that closed itself |
| `tests/e2e/FIREFOX.md` | the toolbar-panel row names the import's and unlock method's hand-back |

Sixteen files (two generated), about +170/−30 lines.

**Trade-offs.** See the decision ledger (D2–D4, D9) and the competing outline below.

## Security & Adversarial Considerations

- **Threat model.** No new trust boundary, message, permission or stored key. The record lives in `chrome.storage.session` (`HANDBACK_KEY`, already registered in `stored-shapes.scan.test.ts`). The wallet restricts only `storage.local` itself (`src/wallet/index.ts:54`); `storage.session` stays at the browsers' default, which does not expose it to content scripts (confidence: moderate for Firefox, which has no `setAccessLevel`). The capability that matters is code running in an extension page: it can already write any record and send `RETURN_TO_PANEL` with any opener, since the background checks the sender's document and window type, not its flow (an inherited property; authenticating the record would add registration and cleanup obligations out of proportion). The most `/popup/settings` in the closed set adds is a panel opening on Settings, which any extension page can already route to.
- **The sender.** `RETURN_TO_PANEL` is honoured only for the popup page in a popup-type window (F2); widening `returnToPanel` changes which wallet pages may ask, not who may. The window removed is always the sender's.
- **Profile binding.** Each line carries the profile id of the run that produced it (the imported profile; the unlock-method run's fenced profile), and the panel shows it only with that profile's session open (F4). A profile switch during the change invalidates the run, so no line is built.
- **Secrets.** No secret enters the record: a fixed label and a profile id. The unlock-method page clears its held answer and typed passwords (`reset()`) before it hands back; the import window's phrase and passwords die with its document (I2). No new log line.
- **Least privilege, crypto, supply chain.** No permission, dependency or cryptography change.
- **Known limits inherited** (closed): #1067, #1068, #1069, #1070; this plan files D16's three at close-out.

## UI impact

The sign-off, quoted from decision page 116 (signed 2026-11-06 17:04 UTC), which supersedes P78-02 and OA-4 for this ending: **P116-16**: B, "A, plus Change unlock method gets the same ending (its window closes, the panel reopens on Settings with the change's line), and create and import share one landing helper so the two opening flows cannot drift again. About 13 files." The page's description of A, which B extends: "the import hands back Home with 'Profile imported' (or the lock screen when an unlock is needed, the line showing after the unlock)". The owner's note: "Do the most professional way of implementing it. That's going to be fairly easier to maintain, etc."

- **Firefox toolbar panel → Import profile → Recovery phrase or Full backup** (any unlock choice). Before: the window shows Home with "Profile imported", or the lock screen with "Profile imported. Unlock to continue", and stays open. After: the window closes and the panel reopens on Home with "Profile imported"; when an unlock is needed, the panel opens on the lock screen with the imported profile selected, and "Profile imported" shows on Home after the unlock. No copy changes.
- **Firefox toolbar panel → Settings → Unlock method** (a new passkey, a password to a passkey, a passkey to a password). Before: the window shows Settings with the change's line and stays open. After: the window closes and the panel reopens on Settings with the same line ("Now unlocks with your passkey", "Now unlocks with your new passkey", "Now unlocks with your password").
- **The same window, a change saved but not reopened** (rare): unchanged, the lock screen with "Unlock method changed. Unlock Nulo again to continue." in the window, whose unlock returns to the page; OA-1 asks the owner whether it hands back too (D6).
- **Both endings**, as the card windows already do: the panel reopens only when Firefox gives its browser window focus back within 3 s; otherwise the next panel the person opens lands on the result once (D16).
- **Create, Chrome's popup, the Firefox sidebar, onboarding, the card windows**: none.

## Phase 1: the hand-back predicate and the closed set ✓

1. In `own-window.ts`, add `handsBackToPanel` and gate `returnToPanel` on it. Rewrite the header's last paragraph and `returnToPanel`'s doc comment to name an own window still in its flow.
2. In `panel-handback.ts`, add `"/popup/settings"` to `HANDBACK_ROUTES`.
3. Tests, `own-window.test.ts`: a `test.each` over `import`, `unlockMethod` and `contacts` booted in a popup-type window: `handsBackToPanel()` is true, and the return writes the record, sends `{ type: RETURN_TO_PANEL, opener: 12 }` and closes once. One case: in an import window, Back pressed while the record write is held (a deferred `storage.session.set`) sends one message and closes once, the message first; without the join the close comes first. Replace "outside a card window the return does nothing" with: a window released from its flow, a marked URL in a tab and an unmarked page hand nothing back (no record, no message, no close). Keep "export, the profile restore and an unmarked page are not" cards.
4. Tests, `panel-handback.test.ts`: a `/popup/settings` record decodes with its snack; the export route stays refused.

**Validation gate.** `bun run lint && bun run typecheck:all`, then `cd apps/extension && bun --bun vitest run src/utils/own-window.test.ts src/utils/panel-handback.test.ts src/components/Header.test.ts src/popup/pages/settings/accounts/import.test.ts src/popup/pages/settings/contacts/index.test.ts src/popup/pages/restore-again.test.ts`. Pass: exit 0; the new table fails on the base copy of `own-window.ts` (take it from 002b76fc7) and passes after. Layers: lint, typecheck, unit.

## Phase 2: one landing for create and import ✓

1. In `opening-flow.ts`, add `OpenedLanding` and `landOpenedProfile` as above.
2. In `import.vue`, replace the release, toasts and pushes after the guard with one `landOpenedProfile` call per outcome. Remove `releaseOwnWindow` from the page's imports if unused.
3. In `new-profile-helpers.ts`, make `openCreatedProfile` end with `landOpenedProfile(router, openToast, { profileId: profile.id, route: "/popup/general" })`, not awaited, right after the last `assertActive()`. Take `openToast` from the existing deps.
4. Tests, new `src/popup/opening-flow.test.ts` (mocks `@/utils/own-window`): handed back, the helper does nothing else (no release, toast or route) and passes `/popup/general` with the panel line bound to the profile; not handed back, it releases, then shows the line, then routes, all before it returns (call order, no await).
5. Tests, `import.test.ts` (mock `handsBackToPanel` and `returnToPanel` in its own-window mock): replace "a finished restore releases the window before it shows the wallet" with one `test.each` over both outcomes, "in its own window, a finished import hands Home and 'Profile imported' back to the panel, and neither toasts nor routes (P116-16)"; make the shell-ended cases also assert no hand-back. The in-place tests stay as the Chrome and sidebar proof.
6. Tests, `new-profile-helpers.test.ts`: unchanged; its in-order tail test proves create's in-place landing through the helper. No pin for a create hand-back, which F8 says cannot happen.

**Validation gate.** `bun run lint && bun run typecheck:all`, then `cd apps/extension && bun --bun vitest run src/popup/opening-flow.test.ts src/popup/pages/import.test.ts src/popup/pages/profile/ src/utils/toast-call-sites.test.ts`. Pass: exit 0; the inverted import pin fails on the base `import.vue`. Layers: lint, typecheck, unit.

## Phase 3: Change unlock method hands back ✓

1. In `unlock-method.vue`, capture the profile id with the attempt's fence; on success hand back `/popup/settings` with the change's line, else show it and `leaveFor` as before.
2. Tests, `unlock-method.test.ts` (mock `handsBackToPanel` and `returnToPanel` through the existing `importOriginal` mock): in its own window a made change hands back Settings with its line and the profile id, and neither toasts nor routes; in its own window a change saved but not reopened hands nothing back and keeps its info line and the lock screen (the control for D6); the existing "a change that ends after a switch to another profile tells the new one nothing" (`:341`) also asserts nothing handed back; the existing in-place cases stay green unchanged.

**Validation gate.** `bun run lint && bun run typecheck:all`, then `cd apps/extension && bun --bun vitest run src/popup/pages/settings/security/`, then `bun run test` and `bun run --cwd apps/extension test:components`. Pass: exit 0. Layers: lint, typecheck, unit, component.

## Phase 4: Firefox e2e, docs, captures ✓

1. `toolbar-panel.test.ts`, a new test: **"a phrase imported from the panel with a passkey it already has closes its window, and the panel reopens on Home with its line"**. Steps: register a passkey profile (Main) in a control page, lock; open the panel on the lock screen; `IMPORT_FROM_LOCK_SCREEN`; `toOwnWindow(… "import-option-seed")`; in the window, type `CANONICAL_SEED_24`; `watchSessionWrites(control)` and `watchHandback(control)`; press `import-seed-passkey-reuse`; `sessionOpened(control, main)` gives the imported profile's id, with no panel open (`popupViews` 0); poll `returnState` until the window is gone, the record consumed and one panel open; `handbacks` equals `[{ route: "/popup/general", snack: { kind: "success", label: "Profile imported", profileId } }, null]`; `panelOn(browser, "#/popup/general")` and the line in the panel; after `POPUP_RETURN_FOCUS_MS`, still one panel.
   - Failure modes: the window survives the import's ending (#1701); no panel reopens for a non-card window; the record is not consumed or the line is not bound to the imported profile; an import's passkey step leaks into the panel (no PR-lane e2e runs an import's passkey step in an own window today).
   - Why no cheaper layer: only Firefox has the toolbar panel, and the chain needs a real popup-type window, the background's `windows.remove` and `action.openPopup` after focus returns, and a fresh panel reading the record before its router exists; each unit fakes one of them.
   - Runtime: estimated +25 s on Firefox (a launch 9 s, a passkey profile, the import), 0 on Chrome (file skipped). Measure and record it.
2. `toolbar-panel.test.ts` test 6 (artifact smokes and local runs only): arm `watchHandback(control)` before the submit; after `submitEncryptedFullBackup`, assert the same window close, consumed record, `handbacks` and panel on Home with "Profile imported". `import-drivers.ts`: `submitEncryptedFullBackup`'s probe today reads Home or a refusal in the window; it also classifies a read the driver's `isTargetGone` matches as the window having closed itself, and returns which ending it saw (`"home" | "closed"`). A close is not success by itself: the caller asserts the landing strictly from the control page. A real refusal and the timeout still fail.
3. `FIREFOX.md` row on the toolbar panel: name the hand-back of the import and the unlock method next to the cards.
4. Captures (not committed): an uncommitted spec copied from `~/.cache/nulo-backlog/firefox-import-window-1/specs/` into `tests/e2e/` for one run and deleted after, drawing the import window before its ending and the panel after it (Home), and the unlock-method window and the panel after it (Settings), with `drawSnapshot` (FIREFOX.md § Picturing the toolbar panel). PNGs go to `~/.cache/nulo-backlog/firefox-import-window-1/shots/` and the PR body.

**Validation gate.** Build the armed bundles once per browser: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:firefox` (and `build:chrome`). Then, one run at a time, from `apps/extension`, each with `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1`:
- `NULO_E2E_BROWSER=firefox bun run test:e2e -- tests/e2e/toolbar-panel.test.ts --retry=0` (test 6 included, since `CI` is unset);
- `NULO_E2E_BROWSER=firefox bun run test:e2e -- --retry=0` (the Firefox smoke suite);
- `bun run test:e2e -- --retry=0` (the Chrome smoke suite: Chrome unchanged).

Pass: every run exits 0 at retry 0; the new scenario fails on the base `own-window.ts` (window stays open). Layers: e2e (smoke, both browsers).

## Delivery

- One arc, one branch `firefox-import-window-1-a1` off `origin/dev` carrying the plan commit; one PR against `dev`, opened ready after the Codex loop converges and the local gates pass; no stack. `code_review: off`.
- Title (87 characters): `fix(firefox): an import and an unlock-method change hand their window back to the panel`.
- Body: what changed and why; P116-16 quoted; the UI impact lines; the captures; the new scenario's failure modes and measured runtime; each browser's smoke wall-clock before (the latest green `pr-extension-smoke-e2e{,-firefox}.yml` run on another PR) and after (this PR), by the `gh run view` envelope in the `e2e-testing` skill § Runtime budget; the gates with outcomes; `Closes #1701`.
- Parallelism: none; the phases share files and run in order.

## Post-implementation

The execution contract is this plan plus `implementations-plan/README.md` § Post-implementation standard at 002b76fc7. Plan-specific values:
- **Review loop**: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` over the arc's diff against `origin/dev`, with the plan, the decision ledger, the adversarial ask and the two verbatim rules; resume the same session per round (`resume-codex.sh`); until clean, hard stop at three rounds. One Opus review of the final diff (`Agent`, `model: opus`, `general-purpose`) runs alongside round 1.
- **Gates on the final head**, once, in order: `bun run lint`, `bun run typecheck:all`, `bun run test:all`, `bun run --cwd apps/extension test:components`, Phase 4's three e2e runs, `bun run check:plans` after staging.
- **Delivery and checks**: `gh pr create` (no label), then `gh pr checks <n> --watch`; a known flake gets one rerun.
- **Close-out**, as the PR's final commits: the Outcome block; lessons promotion; D16's three `known-limit` issues filed and closed; `STATUS.md` deleted; `git mv` into `archive/` in its own commit and the index line moved; `bun run check:plans` green.
- **Teardown** after the merge: `agent-worktree done firefox-import-window-1 --merged` once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/firefox-import-window-1/plan.md` succeeds. The orchestrator notices the merge; this session does not wait for it.

## Competing outline (rejected)

**O2, one ending helper for every own-window flow.** `endFlow(route, outcome, here)` in `own-window.ts`: hands back when the document runs its own flow, else runs `here` (the page's in-place navigation); the import, the unlock method, create and the three cards all call it. It removes the `if (await returnToPanel(…)) return` line from six pages. Rejected: the cards' in-place endings differ (history-aware back, replace, stay on the card), so `here` is a closure per caller and the helper adds a layer over a one-line call; migrating the cards is outside the owner's pick; and the owner named a landing helper for the two opening flows, whose shape (Home or the lock screen, a line here and a line for the panel) is specific to them. O2 stays the path if a fourth non-opening flow needs the ending.

## Decision ledger

- **D1**, the sign-off: P116-16 B, quoted under UI impact; supersedes P78-02 and OA-4 for this ending.
- **D2**, the predicate: `inPopupWindow && ownFlow !== undefined`, not a wider `isCardWindow`, which also drives the header and the card view. A released window (left its flow) and a marked tab hand nothing back.
- **D3**, the landing's home and shape: `popup/opening-flow.ts`, the module that already names the two opening flows; `route` is this document's page, the hand-back is always Home (the panel's guard and `postAuthRoute` cover the lock screen, F5), `line` and `panelLine` are separate because the needs-unlock line ("…Unlock to continue") would read wrong after the unlock.
- **D4**, create's hand-off (the profile did not open) stays out of the helper: it toasts an error with a `sub` after an awaited route and rethrows a failed navigation to hold its latch; it runs only where create ran, never in an own window (F8); routing it through the helper adds a mode with no behaviour.
- **D5**, the needs-unlock import: hand back Home with "Profile imported"; signed on page 116 ("or the lock screen when an unlock is needed, the line showing after the unlock").
- **D6**, `UnlockMethodChangedError` in an own window: today's ending ships (the lock screen and the info line in the window; the unlock returns to the page, which reads the method the profile now has), and OA-1 asks the owner. Codex round 1, the Opus leg and the final pass all held that the signed text names only the change's line; #1701's investigation proposes handing back `/popup/general` with no line, but an investigation's proposal and a matching file count do not show the owner approved dropping a visible line. No success line is true ("saved, or may have been", F9), and the info line cannot ride the record (F3), so the answer is a choice between two visible endings. The follow-up is one branch.
- **D7**, Back or Cancel in a non-card own window: unchanged (closes, no panel), as #1701's investigation listed it with no change proposed and the owner's pick does not name it.
- **D8**, a window that left its flow (an own window's lock screen used to start a create or an import, or a lock landing that ended the flow): an ordinary popup page by design (`own-window.ts:132-139`), so it still ends in place. This keeps existing behaviour outside the pick; it is not an owner decision. Filed at close-out as a closed `known-limit` issue (D16 c); reopens if the owner asks such a window to hand back too.
- **D9**, the e2e scenario is a test of its own rather than appended to test 2: its name says what it proves and a red in one does not mask the other; cost about one launch (9 s on Firefox).
- **D10**, no unlock-method e2e scenario: its hand-back is the import scenario's mechanism, and what is page-specific (the route in the closed set, the line, the profile id) is proved by unit tests; the in-page change is covered on both browsers by `security.test.ts:85-125`. Its ending is pictured by the uncommitted capture spec.
- **D11**, smoke runs through `bun run test:e2e`, not `agent.sh` (network only); its port claims already go through the host registry.
- **D12**, a handed-back line is not also shown in the closing window (as account import does; Restore again's flash is not copied).
- **D13** (Codex r1 #1, #2), the hand-back decision is synchronous: `handsBackToPanel()` is read in the caller's task and the hand-back is started without awaiting it, so create's in-place push still follows its last `assertActive()` with no suspension, and the unlock-method page's in-place ending cannot run after a profile switch. Rejected: an awaited `returnToPanel` followed by a re-check, which needs each caller's fence passed into the helper.
- **D14** (Codex r1 #2; rationale corrected by the final pass #3), the unlock-method page does not hold `isBusy` while its window closes: `reset()` re-enables its buttons for the hand-back's one IPC round trip. In that time a press reaches at most a read-only lookup (`getPasskeyUnlockParams`) and an OS passkey prompt, or a UI step ("Use a passkey instead" opens the password field); every mutation needs a prompt answered or a password typed and confirmed, and the window's close ends the page first. A hold would also be undone by the type watcher's own `reset()` on the reopened session.
- **D16** (Opus r1 #3, #4, #8), three residuals filed at close-out as closed `known-limit` issues, with no code: (a) the panel reopens only if the opener window gets focus within 3 s (`toolbar-popup.ts:108-109`), so a person who left Firefox during a long restore finds no window and no panel, and the next panel they open lands on the result (the cards share it); (b) a line bound to a profile whose session does not open on the landing never shows: a needs-unlock import while another profile opens, or an unlock-method success behind the integrity barrier (the barrier shows on every boot, and the record dies with the browser session); (c) D8's left-flow window.
- **D15** (Codex r1 #3), no composition test for the locked landing: the chain is pinned piecewise (the guard's auth gate, `src/popup/route-guard.test.ts`; lock screen first, then the landing and its line, `src/composables/panelLanding.test.ts:50-72`), and it crosses a popup boot and a runtime message, outside `tests/COMPOSITION-TESTS.md`'s service graph.

## Audit verdicts

**Round 1, Codex (gpt-6.1-sol, high): conditional approve.** Accepted: #1 and the second half of #2 (an awaited hand-back adds a suspension after the callers' last checks) → D13; #3 (`needs-unlock` is no proof of a closed session; F9 overstated) → F9, I3 rewritten, no new recovery; #4 (the e2e never armed `watchSessionWrites`) → Phase 4 step 1; #5 (the test-6 driver reads a window that closes itself) → Phase 4 step 2; #6 (`restrictToTrustedContexts` covers `storage.local` only) → Security rewritten. Rejected with reasons: #2's first half (hold `isBusy`) → D14; #3's composition test → D15. #7 (D6 to the owner) answered with new evidence → D6.

**Round 1, Opus Plan leg: conditional approve.** Accepted: #1 (driver race; no callback for one caller) → Phase 4 step 2 reports `"home" | "closed"`; #2 (same as Codex #1) → D13, plus the regenerated auto-import types; #5 (redundant unit cases) → the create pin dropped, the switch case folded into `:341`; #6 (the missing recorder; the seed cannot collide, Main's phrase is random at `service.ts:658`); #7 (stale comments) → change map; F5 and F7 corrected. #3, #4's integrity-block case and #8 → D16 known limits. #4's D6 point: as Codex #7.

**Final fresh Codex pass, round 1 (new session): conditional approve.** Conditions accepted: #1, D6 ships today's ending and goes to the owner (OA-1); #2, a Back during an in-flight hand-back closed the window before the reopen was asked (reproduced by Codex in memory) → `closeOwnWindow` joins `returning`, with its test. #3 (D14's rationale overstated) → rationale corrected, disposition kept. It found D13, D16, the structure and the test-6 driver sound.

**Final pass, round 2 (resumed): approve.** "D6 consistently preserves today's ending; OA-1 explicitly separates the unapproved alternatives. The arc can ship without that answer." One note folded: the join is checked again after `closeOwnWindow`'s `getCurrent()` await.

**Arc 1 review, Codex round 1 (gpt-6.1-sol, high, new session, the arc's diff against `origin/dev` at 253ff8833): clean.** "No material findings. … Both E2E paths require the original window to disappear; no assertions were loosened, timeouts raised, or retries/skips added. In-memory checks passed both Back/hand-back orderings and confirmed the first ending wins."

**Arc 1 review, Opus leg (alongside round 1): findings, no correctness defect.** Accepted, all wording or test: the own-window header and `handsBackToPanel`'s doc overstated which endings hand back (export, reveal and account-file export close on Back; refusals and D6 stay in the window); `returnState`'s doc named only the card window; FIREFOX.md's list missed the account file and Restore again; `leaveChanged`'s doc narrated; two test names carried a decision id; the Chrome needs-unlock line was pinned by no page test (it was not on the base either) → one assertion. Folded in one commit; the chaos model re-cited.

**Arc 1 review, Codex round 2 (resumed): clean.** "No new findings (confidence: high). The follow-up changes no runtime behavior, strengthens the in-place needs-unlock assertion, and preserves the E2E guarantees. All 13 unlock-method citations match their current source lines."

**Arc 1 review, Codex round 3 (resumed; the standard's two verbatim rules, which rounds 1 and 2 carried only in the owner's equivalent wording): three comment-only findings, no correctness or security defect.** All accepted: `landOpenedProfile`'s doc restated its else branch; `expectHandedBack`'s doc enumerated its assertions; the restore driver's reader comment restated the classification instead of naming why a detach counts (a self-closing window can reject a read before Puppeteer marks the page closed). Folded; no fourth round, as nothing material remained and the loop's cap is three.

## Seeds

Recorded for completeness; the orchestrator runs this lane, so neither seed is used.

```
/goal All phases marked ✓ in implementations-plan/firefox-import-window-1/plan.md, each backed by its validation gate reported passing in the transcript; the Codex fix loop converged on the arc's diff (a resumed pass with no new material findings, quoted); PR "fix(firefox): an import and an unlock-method change hand their window back to the panel" open against dev with Closes #1701, created after the loop; bun run test:all and bun run lint exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/firefox-import-window-1 forward from plan.md (not the chat): run the next unchecked phase and its gate, commit, then the Post-implementation section; decide with /codex high (gpt-6.1-sol) instead of waiting; never merge.
```

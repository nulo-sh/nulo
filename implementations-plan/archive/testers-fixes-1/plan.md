---
plan: testers-fixes-1
tier: light
status: delivered in one PR against dev, awaiting the orchestrator's merge
issues: "#580 #581 #582 #584 #586 (one arc closes all five)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex audit (gpt-6.1-sol, high) with resumes; one Opus Plan leg
base: origin/dev at d461b059
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-17.
- **Status:** delivered in one PR against `dev` from `worktree-testers-fixes-1`, awaiting the orchestrator's merge; the merge that lands it closes this plan.
- **Shipped:**
  - #580: text is selectable; controls take none, by semantics in `base.css` and by class elsewhere (D1, I3, I4); a click that ends a selection inside a copy target skips the copy (I2). The sweep's two links and one shifting box fixed.
  - #581: the done page's tip names no browser (OA-3 A).
  - #582: back and forward restore each history entry's scroll in the popup; a push that reuses the page opens it at its top; onboarding opens each step at its top (D2, D3, OA-4 A).
  - #584: success toasts close after 2 s (D5, OA-1 A); every success wait read, two held, one armed early (I1).
  - #586: the Home hero is display only; the token page's tap stays (D4, OA-2 A).
  - Gates: fast layers, `audit:vue`, the full smoke and network suites on Chrome and Firefox at retry 0, all green; the arc's e2e files again after merging `dev`.
  - Docs: `tests/e2e/FIREFOX.md` (Firefox keeps a drag's end node's text) and the `e2e-testing` skill (a drag can select nothing). No `lessons.md` promotion: both are e2e technique, which CLAUDE.md routes to the skill, and the file sits at its budget.
- **Known limits:** #640 (a selection across an ellipsis copies the text past the cut).
- **Open items:** #634, #635, #636, #637 (OA-1 to OA-4, owner decisions on what shipped); #638 (the other click-to-copy values copy at a drag's end); #639 (the header's address, the header lane's call).
- **Dropped, rejected, superseded:** Badge's `none` (D1's list; it has no handler, I4); the per-phase e2e file runs, folded into phase 6's full suites (I7).
- **Seeds retired:** the `/goal` and `/loop` seeds below are retired; this plan is a record, not a task list.

# testers-fixes-1: the testers' first round, the quick calls

One arc, one PR against `dev`: selectable text (#580, P28-01 A), the done page's toolbar sentence (#581, P28-02 A), scroll memory across routes (#582), two-second success toasts (#584, P28-06 A) and a display-only Home hero (#586, P28-03 A). Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (OA-1 to OA-4; each ships its "now" form). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Issue claims that did not hold

- **#582, popup.** The window never scrolls; each page owns its scroller (recon). A route to a new page remounts it at 0; a route that reuses the page (same route record: filtered Activity, then HISTORY in the bottom nav) keeps its offset. Back lands at 0 because nothing saves the leaving page's offset. A router `scrollBehavior` alone moves the window, a no-op here (D2). Onboarding's document scrolls, so there a step keeps the last one's offset (D3).
- **#586.** The Home tap copies `0`, not the figure shown: Home passes no `tokenBalance`, so `totalTokenBalance` is `{ value: 0 }` (`BalanceView.vue:73-74`). The same handler serves the token page's hero, where it first expands a balance cut at 20 characters. The brief's "Holdings rows keep their copy" has nothing to keep: no Holdings row copies.

## Outcome & Quality Bar

For testers on Chrome and Firefox reading the popup, its approval windows and the onboarding tab. Excellent: (1) a drag selects any text that informs (an address, an amount, an error, a value) and never a control's label, icon or chip, and no text box shifts under a drag; (2) back from a sub-page lands where the person left the page, and a step or a page reached forward opens at its top. Good enough: a list page whose rows arrive after its first render restores only as far as they reach (OA-4).

## Architecture & Implementation

- **D1, #580: where selection is turned off.**
  - `base.css` drops `user-select: none` from `body` and adds one rule for what is a control by its semantics: `button, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="option"], .material-symbols-outlined { user-select: none; }`. The icon font draws ligature text (`MaterialIcon.vue:31`), so without it a drag over a row copies `content_copy`. `.selectable` stays.
  - A control with no semantics takes `user-select: none` on the class it already has, as `Button.vue:161` does: the bottom nav (`Navigation.vue`), chips (`Badge.vue`, the arrival chip, `ContactRow.vue:35`), `DropdownItem.vue`, and every control the sweep finds. `nav` stays out of `base.css`: the landing renders one, selectable today (`apps/landing/src/styles/overrides.css:18`).
  - A role-bearing span that shows a value opts its value back in with `user-select: text`: `ScopeAddress.vue`'s and `ScopeClassId.vue`'s value spans.
  - The rule, one verdict per element in `lessons/phase-5.md`: an element whose click acts and whose text names the act (a button, a tab, a menu item, a chip, a toolbar item, a backdrop) is a control. A row that navigates or toggles is one control, its names and amounts included (`SettingItem`, `TokenCard`, `ContactRow`, `AccountSelectRow`, `ImportContactsPopup`'s rows, `AuthwitCard`): a drag across a list never picks up row titles. Text that informs outside a control stays selectable, even when a click copies it. A doubtful case stays selectable, the owner's default.
  - A box with `overflow: hidden` that a drag past its edge scrolls (Chrome autoscrolls it, nothing scrolls it back; `popup/app.vue:587` documents the same) becomes `overflow: clip` with `min-width: 0`, as `app.vue` does, only where the sweep sees it shift.
  - The sweep never edits another lane's file (`Header.vue`, `SettingsPageShell.vue`, `SubPageHeader*.vue`, `popup/windows/execute/**`, `FeeSettingsCard.vue`, `send.vue`): it records the site and files an issue. No `::selection` styling.
- **D2, #582 popup: scroll memory.** New `popup/scroll-memory.ts`, mounted in `popup/index.ts` beside the guard, as `start-grace.ts` is:
  - `createScrollMemory(position: () => number | undefined)` keeps `Map<number, number>` (history position → `scrollTop`) and the shown position. `leave(el)` stores `el.scrollTop` under the shown position. `arrive(el, { restore, reused })` reads the new position (`history.state.position`, the router's entry index). On `restore` it sets the stored offset; else, when `reused` and the position moved (a push, never a replace), it sets 0; then it records the position.
  - `pageScroller(route)` returns the route's mounted page root (`route.matched.at(-1)?.instances.default?.$el`) or its first descendant whose computed `overflow-y` is `auto` or `scroll`; null for a fragment or comment root.
  - Wiring: `router.afterEach((to, from, failure) => failure || memory.leave(pageScroller(from)))`; `scrollBehavior: (to, from, saved) => void memory.arrive(pageScroller(to), { restore: saved !== null, reused: to.matched.at(-1) === from.matched.at(-1) })`. It returns nothing, so the window never moves.
  - A push to a new page writes nothing, so a page that scrolls itself on mount keeps its own scroll (`ImportFullBackupForm.vue:55`). Lifetime: one popup document; one entry per history position.
  - What ships now (OA-4 A): the restore runs once, after the first render. Home, Holdings, Activity and the detail pages load their rows later, so their restore clamps. Re-applying it as rows arrive needs an observer and a cancel policy, and the page would jump once loaded: that is OA-4 B, a plan change.
  - Not taken: a `data-page-scroller` marker on each page (eleven files, four owned by other lanes; a page without it loses the restore silently); keying by `fullPath` (two entries of one path share an offset); `KeepAlive` (changes every page's service lifecycle); a document scroller (a layout rewrite).
- **D3, #582 onboarding.** `onboarding/index.ts`'s router gets `scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 }`, vue-router's documented contract for a document scroller. No shared helper: the two apps scroll different elements.
- **D4, #586.** Ships now (OA-2 A): the Home hero is display only, the surface the decision and the issue name; the token page's hero is a surface no sign-off names, so it keeps its tap. `BalanceView.vue` binds the tap and a `tappable` class carrying `cursor: pointer` only when `tokenToDisplay` is set; `.balance_amount` loses its `cursor`. Once text is selectable, a drag that starts and ends on the token hero fires its click, so the handler returns when the selection is not collapsed: a drag selects, a tap still copies. `balance-amount` stays: tests read it.
- **D5, #584.** `SUCCESS_TOAST_MS = 2_000`, every success included. A success with a "View" action keeping a longer life is OA-1.
- **#581.** `done.vue:89` reads "Click the puzzle icon in your browser's toolbar, then pin Nulo for quick access." The next sentence stays (OA-3).

## Security & Adversarial Considerations

- **Threat model.** No new trust boundary. The secret reveal stays as exposed as today: the phrase sits in a native `<input>`, always selectable (recon). A truncated address copies as drawn and fails the 64-hex check when pasted.
- **DOM text past a visual cut.** A selection copies the DOM text, which can run past a CSS ellipsis (a long stored token name). Plausible but unverified, low: the sweep copies one long hostile name and files an issue if the clipboard carries text no screen shows. No new sanitizer here.
- **Clipboard.** The 60 s scrub (`useSecretClipboardCopy.ts`) covers its own button only, as today. No new permission.
- **Scroll memory.** In memory only: no storage, message or log line. A `history.state` written by another script could only pick a wrong offset in the popup's own document.
- **Crypto, supply chain, least privilege.** N/A: no dependency, workflow or credential changes.

## Assumptions

- **Facts.** `base.css:283` (`body { user-select: none }`), `:386` (`.selectable`); `base.css.test.ts:25` pins its sha256. `toast.ts:5` (`6_000`), pinned by `toast.test.ts:12-70` and `ToastManagerBase.test.ts:419,485,502`. `popup/index.ts:43`, `onboarding/index.ts:37`: hash routers, no `scrollBehavior`. `SubPageHeader.vue:39-45` goes back with `router.back()`. `popup/app.vue:583-594` clips the root; `settings/index.vue:100` scrolls in `[data-testid="settings-page"]`. `general.vue:56` passes no `tokenBalance`. `ScopeAddress.vue:62-71` is a `role="button"` span. The landing has no `<button>` and no ARIA widget role.
- **Inferences.** (I1) Read in vue-router 5.2.0's `dist/vue-router.js`: `finalizeNavigation` sets `currentRoute` and calls `handleScroll`, whose `scrollBehavior` waits for `nextTick` (`:1385-1394`, `:1469-1473`); `afterEach` runs right after, before the render flush (`:1320-1321`), so the leaving page is still mounted; a post-flush watcher registers the entering instance (`:1082`). `saved` is non-null on a pop and on the first navigation of a reloaded document (the map is empty then), null on any other push or replace (`:1472`). (I2) `user-select: none` keeps a control's text out of a wider selection in both engines; phase 5 probes it, and a difference becomes an issue, never a clipboard interceptor. (I3) Firefox 109+ has the puzzle-piece Extensions button. (I4) The Settings hub renders its rows on its first render.
- **Asks** (owner): OA-1 the life of a success with an action; OA-2 the token page's hero tap; OA-3 the done page's second sentence; OA-4 restoring list pages after their rows load.

## Phases

Every gate includes `bun run lint`, `bun run typecheck:all`, `bun run test` and `bun run test:all` (the root `test` runs only `apps/extension`; `packages/design` runs in `test:all`). e2e needs `load1 < 150`, runs at `--retry=0`: smoke from `apps/extension` (`bun run test:e2e -- <file> --retry=0`), network through `agent.sh` (`NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<file>.test.ts`), Firefox with `NULO_E2E_BROWSER=firefox`. A red on the base SHA that the plan does not predict stops the phase: log it, consult Codex, re-plan.

### Phase 1: success toasts close after 2 s (#584) ✓

- `packages/design/src/composables/toast.ts:5` to `2_000`. Re-derive the pins in `toast.test.ts` and `ToastManagerBase.test.ts` from the new value, names included; fix `ToastManagerBase.stories.ts:43`.
- e2e: `snackbar.test.ts:304-330` asserts a life between 1 500 and 2 500 ms; its title and header say 2 s. Fix the comments at `fixtures/helpers.ts:1460`, `helpers/contacts.ts:162`, `network/holdings.test.ts:127`.
- Read every `waitForToast(` on a success (51 calls, 25 files). One with an awaited step between its trigger and itself is pre-armed: its promise starts before the trigger, its `kind`, sub and handle unchanged. A test that clicks a success's action passes a new `hold` option: `waitForToast`'s in-page predicate focuses the card's action (`preventScroll: true`) as it finds it and fails when focus did not land, a real hold with no round trip. Only tests of an action's destination or content use it; tests of focus, keyboard reach or lifetime never do. No longer timeout anywhere.
- **Gate.** The fast layers; smoke `snackbar.test.ts` and each smoke file edited; network `fee-methods`, `snack-placement`, `incoming-arrival` and each network file edited; all on Chrome and Firefox. Pass: exit 0 each, `lived` in range.

### Phase 2: the Home hero is display only (#586) ✓

- `BalanceView.vue` per D4.
- `BalanceView.test.ts`: on the Home shape a click on `balance-amount` writes no clipboard and opens no toast; on the token shape a click copies (the success control), and a click that ends a non-collapsed selection does not.
- **Gate.** The fast layers. Pass: the new test green, the file's other tests unchanged.

### Phase 3: the done page names no browser (#581) ✓

- `onboarding/pages/done.vue:89`: the decided sentence; the second kept.
- **Gate.** The fast layers (`copy-dash-ban.test.ts` included); smoke `onboarding-tab.test.ts`, Chrome. Pass: exit 0.

### Phase 4: routes keep and reset scroll (#582) ✓

- `popup/scroll-memory.ts` and its test (D2): a back restores the offset saved when its entry was left (success control); two entries of one path keep their own offsets; a push to a new page writes nothing (never-happens); a push that reuses the page sets 0, a replace that reuses it writes nothing; `pageScroller` finds the first `overflow-y: auto` descendant and returns null for a comment root.
- Wire it in `popup/index.ts`; D3's `scrollBehavior` in `onboarding/index.ts`.
- `tests/e2e/navigation.test.ts`, new test: scroll `settings-page` to its middle, open Developer, assert its scroller reads 0, go back through `subpage-back`, assert `settings-page` reads the saved offset within 1 px. The Developer page's `<SettingsPageShell>` tag gains `data-testid="settings-developer-page"`, which falls through to its scroller. Failure mode: the hook order and lookup in a real layout, which jsdom cannot render. Estimate 3 s per browser.
- `tests/e2e/onboarding-tab.test.ts`, the happy-path walk: set the viewport to 1280 × 480 before `/onboarding/create`, scroll the document to its end, assert `scrollTop > 0`, continue, assert `/onboarding/learn` opens at 0, restore the viewport. Estimate under 1 s.
- Run both new checks on the base SHA first. Predicted: the Settings restore and the onboarding reset fail; the Developer page reads 0.
- **Gate.** The fast layers; smoke `navigation.test.ts` and `onboarding-tab.test.ts`, Chrome and Firefox. Pass: exit 0; the base-SHA run red exactly as predicted.

### Phase 5: content is selectable (#580) ✓

- `base.css` per D1, first without the control rule; update `base.css.test.ts`'s hash and its comment. Per-component rules per D1.
- `tests/e2e/navigation.test.ts`, new test. Clear the selection before each drag. Each drag starts on selectable text, crosses a control and ends on selectable text, so no control's click fires: across the bottom nav, across a `<button>`, across a Toggle, across the Home address row and its copy icon. Assert each selection holds both texts and leaves out the control's label and `content_copy`. Run it with only the `body` change: it must fail on the labels; then add the control rules. Failure mode: the cascade and selection in both engines, which jsdom applies to neither. Estimate 3 s per browser.
- Sweep every popup page, window and onboarding step in both themes: drag, double-click and drag past the edge on each family; classify recon's sites, role-bearing elements and navigating rows by D1's rule; copy one long hostile token name where it shows as selectable text (`TokenMetadataPopup.vue`).
- **Gate.** The fast layers; `bun run audit:vue`; smoke `navigation.test.ts`, Chrome and Firefox. Pass: exit 0; the sweep table has no unclassified site.

### Phase 6: whole-arc gate ✓

- Full smoke, then the full network suite, each on Chrome then Firefox (`bun run test:e2e`, `bun run e2e:agent`, each again with `NULO_E2E_BROWSER=firefox`). Record each wall-clock against the base SHA's for the PR body. Capture the done page's tip and a selection on Settings, dark and light, into `implementations-plan/archive/testers-fixes-1/screenshots/`.
- **Gate.** Pass: all four suites exit 0 at retry 0, or one rerun of a known flake named in the PR body.

## UI impact

- #580: text that informs becomes draggable on every surface. Controls, rows, icons, chips and the bottom nav stay undraggable. The pointer over selectable text is the text cursor (P28-01 A). No pixel changes.
- #581: one sentence on the onboarding done page (P28-02 A).
- #584: success toasts close after 2 s (P28-06 A; OA-1).
- #586: the Home hero's hidden tap and its "Balance is copied" toast go (P28-03 A); the token page's tap stays, and a drag on it now selects instead of copying (OA-2).
- #582: none drawn; the scroll position is kept or reset (OA-4).

## Delivery

One arc, one branch (`worktree-testers-fixes-1`), one PR to `dev`, opened after phase 6 and the Codex loop converge: `fix(ui): selectable text, back keeps scroll, 2 s success toasts, display-only home hero` (87 characters). Body: what changed and why, the four picks quoted, the OA "ships now" forms, `balance-amount` kept (no testid deleted), the validation runs, the per-browser wall-clocks before and after, the screenshots, `Closes #580 #581 #582 #584 #586`. If OA-4 is answered B before the PR opens, it is a plan change: `Refs #582` instead. Unanswered at close-out, OA-4 becomes an `owner-decision` issue. Open the PR without labels; the path filters run every lane. No parallel lanes: the phases are small and share `navigation.test.ts`.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../../README.md#post-implementation-standard) at `d461b059`. Plan-specific values:

- **Review loop**: single arc, once over the net diff from `d461b059` after phase 6: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh` on the same codex-dir; both verbatim rules in every prompt; hard stop at three rounds. No `/code-review` (`code_review: off`).
- **While implementing**: one commit per phase; `lessons/phase-N.md` per phase; `agent-worktree status testers-fixes-1 "phase N green: <next>"` at each gate; stop after three failures on one step.
- **Close-out**: the PR's final commits, per the standard's step 4. `Open items:` OA-1 to OA-4's unanswered ones as `owner-decision` issues; each sweep site left to another lane. `STATUS.md` deleted; the folder moved to `archive/` in its own commit.
- **Teardown**: once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/testers-fixes-1/plan.md` succeeds, `agent-worktree done testers-fixes-1 --merged`.

## Decision ledger

Implementation decisions and deviations; evidence in `lessons/phase-N.md`.

- **I1. Toast waits** (phase 1). The two View presses in `incoming-arrival` and its hostile layout read pass `hold`; `stale-network-resume`'s address-change wait is armed before the unlock that resumes the run. No other success wait had an awaited step between its trigger and itself.
- **I2. One selection guard** (Codex r1, r2). D4's guard became `utils/selection.ts` `selectedWithin`, shared by the token hero and the scope rows, whose click also copies a value a drag now selects. Round 2 widened it from the anchor to any range (a Shift-click anchors outside); `5bd2d158` then required a selected character, since a range that only reaches the target's edge holds none of it. Enter and Space still copy. The other copy-on-click values keep copying at a drag's end, as their click always did: a follow-up issue, not this arc.
- **I3. Standalone action links are controls** (Codex r1, the sweep): `.hero_link` (the contract link composes it), register's Terms and Privacy links, Home's "View history" and "View all". Links inside a sentence stay text.
- **I4. Deviations from D1's list.** `Badge` stays text (no handler). The arrival chip takes `none` though it has no click: faded out it keeps its text, which a drag across the hero would copy. `SettingItem`'s title and description clip instead of hiding (they already carried `min-width: 100%; width: 0`).
- **I5. Scroll memory** (Opus review). A page that leaves its entry with no scroller clears that entry, so a replaced page's offset never reaches the next page on it.
- **I6. The drag test** (browser runs). It presses a quarter in from a character's edge: Chrome 152 starts no selection from a press just right of a glyph's middle. The nav and header drags must end on a control and Firefox 153 keeps the text a drag ends on, so they ban only the controls they cross (`tests/e2e/FIREFOX.md`). The header's address is left unpinned: its copy row is a `<button>`, so the control rule takes it, which D1's copy-on-click rule would not; that is the header lane's call, filed at close-out.
- **I7. Gates.** The per-phase e2e files ran inside phase 6's full suites rather than one by one, on a host shared by several leads; the new navigation checks ran alone first, red on the red dists and green, on both browsers.
- **I8. Text past an ellipsis.** A selection across an ellipsis box copies the whole DOM text (a long token name on Manage Tokens); the metadata popup wraps the same name, so it shows what it copies. A closed `known-limit` issue at close-out, per § Security.

## Audit verdicts

| Round | Leg | Verdict | Resolution |
|---|---|---|---|
| 1 | Codex (gpt-6.1-sol, high) | conditional approve, 8 findings | all accepted: vue-router 5.2.0 and the first-navigation case (I1); the role-bearing value spans (D1); the list-page restore as OA-4; a reused page reset on a push (D2); probes that cross a control; one hostile-name copy check; pre-armed waits keep `kind`; every edited network file on both browsers. Rejected at first: link rows; reversed in Opus 4 |
| 1 | Opus Plan leg | conditional approve, 8 findings | all accepted: OA-4 with `Closes`/`Refs` (#582); `fee-methods`, `snack-placement` and the full network suite gated, the `hold` option for action clicks; drags that can fail, run red first; navigating rows are whole controls (D1); `overflow: clip` where a drag shifts a box; the base-SHA stop rule and a fixed viewport (D3); other lanes' files recorded, never edited; OA-2's drag conflict (round 2 kept OA-2 A, with a guard) |
| 2 | Codex resume | conditional approve, 3 findings | all accepted: OA-2 ships A (no sign-off names the token page), with a selection guard on its tap; the false `activity-card` precedent dropped and the hostile-name check moved to a selectable surface; the `hold` option scoped and made to fail when focus does not land. The reused-page reset verified against every self-route push |
| 3 | Codex resume | approve | the round-2 fixes verified; no new material finding |
| Code 1 | Codex (gpt-6.1-sol, high), net diff from `5ec3225b` | conditional approve, 3 findings | all accepted (`ce7086e2`): the scope rows' click guard (I2), two action links (I3), a trimmed CSS-pin comment |
| Code 1 | Opus review | 6 findings | all accepted (`f828405f`): the nav drag's bans, an on-screen guard for drag points, the header address unpinned (I6), `hold` on the hostile layout read (I1), the pointer test aimed at the card's resting box, `leave(null)` (I5) |
| Code 2 | Codex resume | conditional approve, 2 findings | both accepted (`d917a875`): the guard's Shift-click bypass (I2), one comment removed |
| Code 3 | Codex resume | approve | the guard's overlap form (`5bd2d158`) and the drag test's browser fixes verified; `77a1a3e0` (the sweep's CSS fixes, I3 and I4) landed after the loop's last round |

## Seeds

Recommended, `/goal`: `/goal All phases of implementations-plan/archive/testers-fixes-1/plan.md are marked ✓, each backed by its gate's commands reported passing in the transcript; LESSONS_FILE=implementations-plan/archive/testers-fixes-1/lessons/phase-N.md printed for each phase; the Codex loop (gpt-6.1-sol, high) converged over the net diff from d461b059, quoted; one PR to dev exists, opened after the loop, with the close-out's archive move (git show --stat); bun run test and bun run lint exit 0.`

Fallback, `/loop 15m`: `/loop 15m Drive implementations-plan/testers-fixes-1 forward per its plan.md and the README's Post-implementation standard at d461b059: rebuild the task list from the phase headers, run the next phase's gate, consult Codex (gpt-6.1-sol, high) on any decision, never merge; once the archived plan is on dev, run agent-worktree done testers-fixes-1 --merged and stop.`

---
plan: popup-fixes-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: 24c68cb4
trunk: dev
post_implementation_hardening: not scheduled
status: planned, final Codex approve; arc 1 auto-continues, arc 2 waits on OA-1 and OA-2
---

# popup-fixes-1: eight popup issues, two unstacked arcs

Arc 1 ships now: #773 and #770 get code, #582, #584 and #586 close on what #642 and #678 shipped, and #593 closes as a known limit on the owner's pick. Arc 2 (#626, #786) waits on two owner asks, since both legs read their records as not covering it (D1). Recon: [`recon.md`](recon.md). Owner asks: [`OWNER-ASKS.md`](OWNER-ASKS.md). Consults: [`lessons/phase-0.md`](lessons/phase-0.md). Over the light target (150 lines): eight issues in two arcs, each with its own phase, gate and tests.

## Outcome & Quality Bar

- **For whom**: a person on the recovery phrase page, Home or a token page, a keyboard user on Home, and a developer who exports or clears the logs.
- **Excellent**: each defect is gone at its cause, with no timeout, retry or suppression; nothing else on those screens moves; every visible change ships with before and after pictures at 360 px in both themes; each issue closes with evidence that holds.
- **Good enough**: no new control, no change to the logs toolbar's other buttons, no new lint or static guard (D4).

## Assumptions

**Facts** (at 24c68cb4; recon has the citations)
1. #642 shipped #582, #584 and #586; its one line `Closes #580 #581 #582 #584 #586` linked only #580. #678 shipped their follow-ups #634 and #635.
2. `LogsToolbar.vue` uses `<Dropdown>` with no import, and no auto-registered component has that name (`src/types/components.d.ts:36-40`).
3. Both ghost columns ask for `gap="5"`, outside `flexGaps`, so `gap--5` has no rule. The loading column's box (`min-height: 37px`, `gap="2"`) is written twice (`TokenCard.vue:230-233`, `TokenSeedRow.vue:82-83`). `GHOST_ROWS = 2` (the issue says three).
4. Send and Receive are `Flex` divs with `@click` only, rendered on Home and the token page (`BalanceView.vue:348-352`). `base.css` resets `button` to `outline: none`. `Flex` renders one `<component :is="tag">`, so attributes fall through.
5. `seed.vue:184` is the only user-visible "Retrieve" in the repository.
6. On a Mac, Firefox closes its toolbar panel when the OS passkey prompt takes focus (Mozilla bug 2026687, `tests/e2e/FIREFOX.md:43`); headless Firefox keeps it open. A passkey step started there runs in the passkey window, which closes once the step ends.
7. A smoke run tests the last build; `audit:vue` ends with an unarmed `build`, which the smoke setup refuses (`tests/e2e/global-setup-smoke.ts:31-38`).

**Claims that did not hold**
- #582, #584, #586: fixed at HEAD (Fact 1); the claims held when filed.
- #586 "keep the explicit copy control where one exists": none exists for the balance on either hero.
- #593's fix "in the unlock flow's window handling": the window exists because Firefox closes the panel (Fact 6); the owner kept it (P28-08 C, on the issue).

**Inferences**
- I1 (#786). After D4 a ghost row is 16 + 37 = 53 px, a loaded row's height. Measured in Phase 6.
- I2 (#626). A held Enter on either action acts once in effect: the repeats land on the opener, since `Popup` leaves focus there (`initialFocus: false`); a second push to `/popup/send` is a duplicate navigation, and `popupStore.open` of an open popup only puts it on top (`popup.store.test.ts:46`). Checked in Phase 7.

**Asks**: OA-1 (#786's option) and OA-2 (the token page's Send and Receive) in `OWNER-ASKS.md`; arc 2 starts on their answers.

## Architecture & Implementation

**File-level change map** (paths under `apps/extension/` unless rooted)
| File | Change | Issue | Arc |
|---|---|---|---|
| `src/components/JsonViewer/LogsToolbar.vue` (+ new `LogsToolbar.test.ts`); `tests/e2e/viewers-csp.test.ts` | import `Dropdown`; testids `logs-more-trigger`, `logs-export-csv`, `logs-clear` | #773 | 1 |
| `src/popup/pages/settings/security/export/seed.vue` (+ test) | "Reveal Recovery Phrase" | #770 | 1 |
| `CLAUDE.md` § Common patterns; `packages/design/README.md` § Composables | the toast example and names as shipped | #584 | 1 |
| `src/popup/components/modules/general/TokensView.vue`, `TokenCard.vue`, `TokenSeedRow.vue`, new `token-row.module.css` | ghost columns `gap="2"`; the right one takes the loading column's box; `.loading_block` lives once | #786 | 2 |
| `src/popup/components/modules/general/ActionButtonsView.vue` (+ test); `tests/e2e/home-links.test.ts` | `tag="button" type="button"`, `font: inherit`, the accent ring | #626 | 2 |

**Decision ledger**
- D1. Two arcs, each one PR against `dev`, unstacked (orchestrator's D-orch-1). Arc 1 (`popup-fixes-1-a1` off `origin/dev`, carrying the plan commit) touches no surface the asks concern. Arc 2 (`popup-fixes-1-a2` off `origin/dev`) starts when OA-1 and OA-2 are answered and carries the close-out; an answer that drops an issue leaves it a comment and the arc the rest. Considered: one arc held for both answers (Codex and Opus round 1 both ask that the asks be surfaced; holding arc 1 behind them delays five closes that depend on neither).
- D2 (#582, #584, #586). No code. Arc 1 re-runs the tests that pin them and closes them, one `Closes #n` per line, crediting #642 and #678 and claiming no new fix. Two stale docs are fixed: `CLAUDE.md:441` becomes `openToast({ kind: "success", label: "Message" })`, and the design README names `SUCCESS_TOAST_MS` and `ACTION_TOAST_MS` instead of `TOAST_DURATION`. The rule #582 ships (`popup/scroll-memory.ts`), for every pair: a push mounts a new page, whose own box starts at its top, and the memory moves nothing (a page that scrolls itself on mount, as Settings' `?row=` highlight does, keeps that); a push that reuses the mounted page resets it to the top; Back or Forward restores the offset saved for that history entry once, after the page's first render, as far as its content reaches; a replace keeps the entry, so its offset is overwritten and nothing moves. So Settings → a sub-page → Back lands exactly, and a list (Holdings, History, Contacts) → a detail page → Back lands as far as its rows reach at first render (P30 A, #637).
- D3 (#773). The import is the fix. The trigger stays a `Flex` like the Source and Level buttons; their keyboard reach adds Tab stops to the logs window, outside the visible budget, so it is filed as an issue at close-out after a dedupe.
- D4 (#786, on OA-1 A). Both ghost columns take `gap="2"`; the right one takes the loading column's props (`align="end" justify="center"`) and its box. `.loading_block` (`min-height: 37px` and its comment) moves to `token-row.module.css`, composed by `TokenCard`, `TokenSeedRow` and the ghost column, as `list-empty.module.css` is: three copies of one box become one rule. Rejected: a `gap` validator on `Flex` (dev-only, and the shallow mounts that cover `TokensView` stub `Flex`); a static scan for off-scale gaps (a new guard for one cosmetic defect class; these two are the only ones at HEAD).
- D5 (#786 test). No committed height test: no smoke-build state holds the ghost rows (recon; the storage gates exist only in proverless builds), and a product hook or a transport wrapper for one drawn value is out of proportion. Evidence: Phase 6's scratch spec measures a ghost row before and after on Chrome; `rows.test.ts` already proves a loading and a loaded row equal, and all three now share the rule.
- D6 (#626, on OA-2). Native buttons through `Flex`'s `tag`, so Enter and Space activate and the testids stay on the element. `.button` adds `font: inherit; margin: 0` (as `TokensView`'s `.empty_link`), so the label lays out as in the div, and the design `Button`'s ring (`outline: 2px solid var(--nulo-accent); outline-offset: 2px` on `:focus-visible`). No `disabled`: a not-ready account keeps today's silent no-op and the Tab stop. No `refuseRepeatEnter`: no key handler moves focus onto these, and Home has no Enter shortcut (I2).
- D7 (#770). The label alone. Test titles and code names keep "retrieve": it names the vault read, and renaming them collides with #743's rewrite of `seed.test.ts` and `keyboard-guards.test.ts`. The label line and lines 66-73 of `seed.test.ts` sit outside #743's hunks, so either order merges cleanly.
- D8 (#593). No code. Close #593 as not planned with the `known-limit` label (Phase 4).

## Security & Adversarial Considerations

- **Logs** (#773): Export writes the viewer's buffer to a file in Downloads through the same `chrome.downloads` path as backups; cells are formula-neutralized (`logs-csv.ts:29-32`), and the buffer is already under the redactor's rules. Clear empties the session buffer. No new log line.
- **Keyboard** (#626): two Tab stops that act as the clicks do; neither sends, signs or reveals. A keyboard path to Send behind `BarrierOverlay` or the Terms sheet already exists through the nav and token rows, and the background refuses what follows (an integrity block closes the session; `assertCurrent` guards every broadcast).
- **Recovery phrase page** (#770): copy only; the password gate, the repeat refusal and the countdown are untouched.
- No dependency, permission, storage, crypto or CI change. No dApp-controlled input reaches a changed line.

## Arc 1

### Phase 1: #773, the logs menu

1. Add the import and the three testids.
2. `LogsToolbar.test.ts`: mount with the components production registers (`DropdownItem`, and `Popover`, `Flex`, `Icon`, `Text`, `Input` from `@nulo/design`) and a `#dropdown` target. A trigger click shows both items; each item emits its event once. Red on base.
3. `viewers-csp.test.ts`, last in the file: `openLogs`; log a marker line and see it; `openDropdown(page, "logs-more-trigger")`; both items visible; `shotSend(page, "logs-more-menu", "logs-more-trigger")`; Clear; the marker is gone, and a line logged after it shows. Failure mode: the menu in the real logs window (teleport target, stacking) and the real clear path, which the unit tests stub. Estimate 3 s per browser.

**Gate**: `cd apps/extension && bun --bun vitest run src/components/JsonViewer`; S on `viewers-csp.test.ts`, Chrome then Firefox. Pass: exit 0; step 2 red against `git show 24c68cb4:apps/extension/src/components/JsonViewer/LogsToolbar.vue`. Layers: unit, smoke e2e.

### Phase 2: #770, the button's verb

1. Take the before picture of the password step. Warning: never commit the scratch spec; it lives under `~/.cache/nulo-backlog/popup-fixes-1/shots/` with a config that extends `apps/extension/vitest.e2e.config.ts` and includes only it, and takes `shotSend` pictures.
2. Change the label. In `seed.test.ts`, assert the button reads "Reveal Recovery Phrase" in the existing Enter test (lines 66-73). Red on base.
3. After picture.

**Gate**: `cd apps/extension && bun --bun vitest run src/popup/pages/settings/security/export`; S on `keyboard-guards.test.ts`, Chrome then Firefox. Pass: exit 0. Layers: unit, smoke e2e.

### Phase 3: #582, #584, #586 verified; the toast docs

1. Apply D2's two doc edits.
2. Run the pins: from `packages/design`, `bun --bun vitest run src/composables/toast.test.ts src/ui/ToastManagerBase.test.ts`; from `apps/extension`, `bun --bun vitest run src/popup/scroll-memory.test.ts src/popup/components/modules/general/BalanceView.test.ts src/utils/toast-call-sites.test.ts`; S on `navigation.test.ts` and `snackbar.test.ts`.

**Gate**: step 2, Chrome then Firefox for S. Pass: exit 0. Layers: unit, smoke e2e.

### Phase 4: #593, evidence and disposition

1. Warning: headless Firefox keeps the panel open, and the test kills it the Mac way (`armPanelDeath`), so the run proves the window path, not the browser's cause. S on Firefox: `passkey-toolbar-panel.test.ts -t "create and unlock"`. Record it in `lessons/phase-4.md`.
2. Comment on #593, add `known-limit`, close as not planned. Body: the window path the run drives (open, prompt, finishing, close, the toolbar popup back); the cause as `FIREFOX.md` records it (Mozilla bug 2026687, on a Mac; not reproducible headless); the owner kept it (P28-08 C); no Firefox sidebar exists (#596). Reopen when Firefox keeps a toolbar panel open under the OS prompt, or a Firefox sidebar ships.

**Gate**: step 1 exits 0. Layers: smoke e2e.

### Phase 5: arc 1 gate

**S (a smoke run)**, warning first: rebuild after every source change, and after `audit:vue`, whose unarmed build the smoke setup refuses (Fact 7). Load1 under 150 before a build or a run. From the root, per browser `<b>`: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<b>`, then `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 [NULO_E2E_BROWSER=firefox] bun run test:e2e -- <files> --retry=0`.
From the root, in order: `bun run audit:vue`, `bun run test:all`, `bun run check:plans`; then the armed builds and every arc-1 phase's e2e files, both browsers. Pass: every command exits 0, one rerun for a known flake. The PR body names the new e2e case's failure mode and measured time, and `viewers-csp.test.ts`'s wall-clock before and after per browser.

## Arc 2 (after OA-1 and OA-2)

### Phase 6: #786, the ghost rows

1. Extend the scratch spec: hold Home's `getTokenBalances` request with a `chrome.runtime.connect` wrapper installed by `page.evaluateOnNewDocument` before the popup loads; the armed smoke build supplies no default tokens, so `hasAnyRow` stays false. Wait for `tokens-skeleton-row`; record its height and each column's gap; take pictures.
2. Run it on the base build (Chrome): before pictures and heights into `lessons/phase-6.md`.
3. Apply D4 (or OA-1's other answer). Run `TokensView.test.ts`, `TokenCard.test.ts`, `TokenSeedRow.test.ts` unchanged.
4. Run the scratch spec on the new build: after pictures; a ghost row within 0.5 px of 53 px (I1), gaps 2 px.

**Gate**: `cd apps/extension && bun --bun vitest run src/popup/components/modules/general`; S on `rows.test.ts` and `home-links.test.ts`, Chrome then Firefox. Pass: exit 0; the heights recorded. Layers: unit, smoke e2e.

### Phase 7: #626, Send and Receive

1. Before pictures (scratch spec): the actions unfocused on Home and a token page, both themes.
2. Apply D6. `ActionButtonsView.test.ts`: mount with the real `Flex`; both actions are `button[type="button"]` (red on base); the click cases stay.
3. `home-links.test.ts`, a new test on `registeredExtension`: on Home, `tabTo(page, "actions-send")` passes no `tokens-`, `nav-` or `BODY` stop (the gas card's `gas-label-public` and `gas-label-private` come before it); the next Tab is `actions-receive`; `focusRing` on both reads the accent ring; shots of both focused. A held Enter on Send (`keyboard.down` twice, the second a repeat, then `up`) opens `#/popup/send` with `history.length` one higher. Back on Home, a held Enter on Receive shows one `receive-close` and focus stays on `actions-receive`; Escape closes it with focus there; Space opens it again. Failure mode: Tab order and native key activation, neither of which jsdom implements. Estimate 20 s per browser.
4. After pictures: the actions unfocused (no change for a pointer) and focused, on Home and a token page.

**Gate**: `cd apps/extension && bun --bun vitest run src/popup/components/modules/general/ActionButtonsView.test.ts`, root `bun run lint` and `bun run typecheck:all`; S on `home-links`, `send-keyboard`, `snackbar`, `registration`, `type-roles`, `send-fee-privacy`, `tooltips-glossary`, `rows` and `navigation` (`.test.ts`), Chrome then Firefox. Pass: exit 0. Layers: lint, typecheck, unit, smoke e2e.

### Phase 8: arc 2 gate

As Phase 5, over arc 2's files. The PR body states `home-links.test.ts`'s wall-clock before and after per browser.

## UI impact

- **Logs window** (#773, arc 1): "the logs window's more menu (export CSV, clear logs) never opens" (lane brief). The menu opens with its two items; picture in the PR.
- **Recovery phrase page** (#770, arc 1): "P49-03, option A: 'Reveal': the button reads 'Reveal Recovery Phrase'" (lane brief).
- **Home's ghost rows** (#786, arc 2): "Home's ghost token rows use an off-scale gap and stand shorter than the rows that replace them (pictures before and after at 360 px, both themes)" (lane brief); the option is OA-1.
- **Send and Receive** (#626, arc 2): "real buttons or links, in the Tab order after the hero, Enter and Space activate" (lane brief), on Home; the token page is OA-2. Two Tab stops, the design Button's ring on keyboard focus, no change for a pointer.
- #582, #584, #586, #593: no change (shipped, or kept on the owner's pick). The shipped values: a success toast closes at 2 s, a success with an action at 6 s (#584, P28-06 A, P35-09 B).

## Issues

| Issue | Arc | Phase | Closed by |
|---|---|---|---|
| #773, #770 | 1 | 1, 2 | `Closes #n` |
| #582, #584, #586 | 1 | 3 | `Closes #n` (shipped in #642, #678) |
| #593 | no arc | 4 | `known-limit`, closed as not planned |
| #786, #626 | 2 | 6, 7 | `Closes #n`, after OA-1 and OA-2 |

## Delivery

- Arc 1: `popup-fixes-1-a1` → `dev`. Title (70 chars): `fix(popup): open the logs menu, reveal verb; close three shipped fixes`. Body: each fix and its why; P49-03 A quoted by id and text; the pictures; the e2e failure mode and wall-clock; the validation runs with outcomes; one line each: `Closes #773`, `Closes #770`, `Closes #582`, `Closes #584`, `Closes #586`, the last three crediting #642 and #678.
- Arc 2: `popup-fixes-1-a2` → `dev`. Title (67 chars): `fix(popup): keyboard send and receive, ghost rows the loaded height`. Body as arc 1's, with OA-1 and OA-2 quoted, `Closes #626`, `Closes #786`; the close-out lands as its final commits.
- Each PR: merge `origin/dev` first; open it without labels after its gate and its Codex loop; add `e2e:extension-smoke` only if the path filter skips smoke; the body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at 24c68cb4. Specific to this plan:
- Step 1 is absent (`code_review: off`). Step 2 runs per arc over `git diff origin/dev...HEAD` after its gate: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; prompts under `~/.cache/nulo-backlog/popup-fixes-1/`; hard stop at three rounds; one Opus review alongside round 1; rounds in `lessons/phase-5.md` and `lessons/phase-8.md`. After arc 2's loop, one fresh Codex session reads the net diff from 24c68cb4 across both arcs for seams, duplication and drift from the plan, in the same loop.
- Approval boundary: a new control, a change to the logs toolbar's other buttons, a product test hook, a shared token-row component, or any copy beyond the label is a plan change and stops for the orchestrator.
- Close-out (arc 2): file the logs toolbar's keyboard reach (D3) as an issue after a dedupe; Outcome block (`Known limits: #593`); `lessons.md` promotes nothing unless a retirement pays for it; `STATUS.md` deleted; `git mv` to `archive/` in its own commit. Teardown: slug `popup-fixes-1`, trunk `dev`.

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| 1 | Codex, gpt-6.1-sol | conditional approve | A1 and A2 surfaced as OA-1 and OA-2 (D1, arc 2); D2's #582 rule restated as the code runs; Fact 6 and Phase 4 say the run proves the window path only; I2 checked by a held Enter (Phase 7) | none |
| 1 | Opus 5.5 lens | conditional approve | OA-1, OA-2; the Clear check's success control (Phase 1); pictures of the actions unfocused, before and after; `font: inherit` on the buttons (D6); `type-roles` and `send-fee-privacy` in Phase 7's gate, the three network runs dropped (traced: none crosses the new stops); `audit:vue` before the armed builds (Phase 5); D2's replace clause; Fact 2's path; the gas card's stops; `GHOST_ROWS = 2`; the Downloads line (Security) | records for #773 and Home's #626 (the lane brief is the orchestrator's record for both, and the spawn brief makes it the visible budget) |
| final | Codex, fresh session | approve (arc 1 may proceed; arc 2 gated) | OA-1's option B heights corrected (45 or 47 px); the cross-arc fresh pass written into Post-implementation | none |

## Seeds

```
/goal Arc 1 of implementations-plan/popup-fixes-1/plan.md (Phases 1-5) marked ✓, each backed by its gate passing in the transcript; LESSONS_FILE=implementations-plan/popup-fixes-1/lessons/phase-N.md printed per phase; the Codex loop (gpt-6.1-sol, high) converged with a resumed pass quoting no new material finding; one PR from popup-fixes-1-a1 to dev opened after that, closing #773 #770 #582 #584 #586, with the pictures; #593 closed as a known limit; bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/popup-fixes-1 forward per its plan.md and the README § Post-implementation standard at 24c68cb4: reality-check plan.md and lessons/, run the next phase's gate, rebuild before every smoke run, retry 0, decide open questions with Codex (gpt-6.1-sol, high), never start arc 2 before OA-1 and OA-2 are answered, never merge, never widen scope; stop after the PR's checks are green and report.
```

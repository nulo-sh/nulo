---
plan: ui-polish-4
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev @ 948670ca
standard: implementations-plan/README.md § Post-implementation standard, read at 993b3efc
---

# ui-polish-4: the logs menu and toolbar, the recovery Close, Holdings' error line

Four signed picks, one arc, one PR against `dev` (D-orch-1, no stack). Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none).

| Arc | Issues | Branch | PR line |
|---|---|---|---|
| 1 | #810, #823, #831, #825 | `ui-polish-4-a1` off `origin/dev`, carrying this plan | `Closes #810`, `Closes #823`, `Closes #831`, `Closes #825` |

The picks, quoted by id in the PR body:
- **P56-04 = A** (#810): "Both items in the body type role with a 12 px icon and an 8 px gap, as the export item reads today."
- **P58-03 = A** (#823): "The three triggers become native buttons with the 2 px accent ring on keyboard focus: three Tab stops in the toolbar, Enter and Space open them; nothing changes for a mouse."
- **P58-04 = B** (#831): "Take the design button's: solid ring, no filled press, the default fade, as every other outline button; one override rule deleted."
- **P56-03 = B** (#825): "In the error state show the empty-value dash for the total and no count, as the page already does for a total it cannot price ('Prices unavailable'), keeping the line's height."

## Outcome & Quality Bar

- **For whom**: a person who reads logs or Holdings with a mouse or a keyboard, and the maintainer who inherits these four files.
- **Excellent**: (1) each surface reads exactly as its pick says and in no other way: the toolbar at rest and under the mouse is pixel-identical to `dev`, and every pixel that changes is one a pick names, shown in the PR's pictures; (2) each change is proven at the cheapest layer that can see it: component tests for structure and values, one real-browser scenario for Tab, keys and the ring.
- **Good enough**: the filter panels' own rows stay mouse-only (out of scope, D2).

## Assumptions

**Facts** (verified at `993b3efc`):
- F1 #810 holds: Clear logs is bare text in `DropdownItem` (`type--row-title`, 13 px), icon `close` 14 px, `gap="6"`, inline `padding-right: 4px`; Export is `Text variant="body"`, icon 12 px, `gap="8"` (`LogsToolbar.vue:118-131`, `DropdownItem.vue`).
- F2 #823 holds: the Source and Level triggers are `Flex` divs with a click handler only, and the more trigger is a bare `Flex` whose click reaches the Dropdown's `#trigger` div (`LogsToolbar.vue:46-54,113-115`; `DropdownRoot.vue:268`); none is focusable.
- F3 A native button's key-made click opens both hosts: Dropdown toggles on its `#trigger` div's click, its outside handler listens on `mousedown` and skips `#trigger`; while the menu is open, focus-trap swallows any click outside it, the trigger's included; Popover opens on the host's `open`, which `openPopover` only sets, and its outside handler listens on `mousedown` (`DropdownRoot.vue:73-94,268`, `focus-trap.esm.js:819-831`, `useLogFilters.ts:88-90`, `Popover.vue:56-80`, `composables/outside.ts:29`).
- F4 #831 holds: one rule, `.countdown_cta.countdown_cta` (`SecretCountdownClose.vue:54-66`), adds the dotted ring, the filled `:active` and `var(--bezier)`; the Button gives `position: relative; overflow: hidden` that the bar needs (`Button.vue:150-170`).
- F5 #825 holds, and wider than stated: `totalDisplay` and `summaryMeta` ignore the read's `unavailable` state (`holdings.vue:103,116-121`; `summaryMeta` reads only `isLoading`), and while it is `unavailable` a live add or unseen update still stores rows the error line hides (`useTokenBalanceSnapshot.ts:52-71,102-104`; `holdings.vue:210-214`), so the summary can read their count and priced total, or a skeleton, not only `$0.00` and `0 tokens`.
- F6 `.summary_meta` keeps `min-height: 1lh` and the dash renders in the total's 26 px role, so an empty meta keeps the line's height (`holdings.vue:240-287`).
- F7 `font: inherit` passes the type-role ban; base CSS sets `box-sizing: border-box` and `user-select: none` on every button (`base.css:210-213,262-268`).
- F8 No e2e reaches the filter triggers, the Close's look or Holdings' error state; `viewers-csp.test.ts` opens the more menu by a DOM click (`fixtures/widgets.ts:13`).

**Inferences**: I1 Each trigger is pixel-identical at rest and on hover as a button (F7 plus the class's own background, border, padding and colour); a native button keeps other UA styles, Chromium's `text-rendering: auto` among them against the body's `optimizeLegibility`, so only the capture proves it (Phase 5). I2 After a pointer open and close, the focus-trap's return lands on the button without `:focus-visible` in both browsers (pointer modality); Phase 2's e2e proves it. I3 A focus moved back by the Escape handler shows the ring in both browsers, the key being the last input; the same e2e reads it.

**Asks**: none. Accessibility calls are delegated (D2-D4).

## Architecture & Implementation

Template and CSS edits in three SFCs, one computed branch in `holdings.vue`, and an Escape focus return in `Popover.vue`; no new module, prop, persisted state or dependency.

### Phase 1: #810, the menu's two items ✓

- `apps/extension/src/components/JsonViewer/LogsToolbar.vue`: Clear logs takes Export's shape: `<Flex align="center" gap="8"><Icon name="close" size="12" /><Text variant="body">Clear logs</Text></Flex>`; the inline style goes.
- Test (`LogsToolbar.test.ts`): both open items carry an icon of size 12, a `gap--8` row and a `body` text, and no inline style.
- **Gate**: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun run test -- src/components/JsonViewer/LogsToolbar.test.ts`. Pass: exit 0 each.

### Phase 2: #823, three native triggers and the panel's Escape

- `LogsToolbar.vue`: each filter trigger `Flex tag="button" type="button"` with `:data-testid="\`logs-filter-${kind}\`"`; the more trigger the same, keeping `logs-more-trigger`, plus `aria-label="Log actions"` (D3); each filter panel's root `:data-testid="\`logs-filter-${kind}-panel\`"`. `.filter_button` gains `font: inherit` and `&:focus-visible { outline: 2px solid var(--nulo-accent); outline-offset: 2px; }`.
- `packages/design/src/ui/Popover.vue` (D2): in the `open` watcher's open branch, before the content mounts, keep `document.activeElement` when `triggerEl` contains it (the Source panel's search field autofocuses on mount); clear it in the close branch. On Escape, `preventDefault()`, and when focus is inside the card, refocus the kept element if it is still connected, then `onClose()`. A pointer close stays as it is.
- Tests. `LogsToolbar.test.ts`: the three triggers are `button[type=button]` in the order Source, Level, more; the more trigger has its name; a click on Source and on Level emits `openPopover` with its kind (control). `Popover.test.ts`: Escape is marked handled; Escape with focus in the panel returns it to the trigger's button focused at open; never-happens, beside that control: Escape with focus outside the panel, and the outside-press close (the `useOutside` callback), leave focus where it is.
- E2E (`tests/e2e/viewers-csp.test.ts`), one new scenario. Failure mode: a trigger out of the Tab order, a key that does not open or close it, a missing or wrong ring, or focus not handed back; jsdom has no Tab order, no key activation and no computed outline. Steps: `tabTo` Source, then Tab, Tab, with `activeTestId` reading Level then more, and `focusRing` reading `solid 2px 2px` in `tokenColor(--nulo-accent)` on each. On each trigger, Enter and then `" "` each open its menu or panel (its testid shown), and Escape closes it (its testid gone) with `waitForFocus` on the trigger; on more, ArrowDown first moves focus to `logs-export-csv` (`activeTestId`), so the return is real; on Source, `activeTestId` reads `logs-filter-source-panel` (its search field) before the Escape, and the ring reads on Source after it (I3). Then Tab to Level, read its ring (which settles it) and `shotSend(page, "logs-toolbar-focus", "logs-filter-level")`. In the existing more-menu scenario, open the menu and press Clear logs with `pointerClick`, then `waitForFocus` on the trigger (focus-trap returns focus on a timer) and `focusRing(...).ring` matches `/^none /` (I2). If a browser does not focus a clicked button, write that browser's expectation; never skip. Estimate: 6 s per browser, measured in the PR.
- **Gate**: Phase 1's commands with `LogsToolbar.test.ts`; `bun run --cwd packages/design test -- src/ui/Popover.test.ts`; check the load (Phase 5); build both browsers' armed bundles, since smoke loads `dist/<browser>` and builds nothing (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<chrome|firefox>`); then `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 [NULO_E2E_BROWSER=firefox] bun run test:e2e -- tests/e2e/viewers-csp.test.ts --retry=0` per browser. Pass: exit 0 each; the file's wall-clock per browser on the base build and on the head recorded in `STATUS.md`.

### Phase 3: #831, the Close takes the design button's look

- `apps/extension/src/components/composite/SecretCountdownClose.vue`: delete the `.countdown_cta.countdown_cta` rule and its class on the `Button`.
- Test (`SecretCountdownClose.test.ts`, replacing the case at `:80-87`): the Close's class list equals a bare `cta_outline` design `Button`'s, mounted the same way (never-happens: no class of its own), and it is still the `cta_outline` `<button>` holding the bar (control).
- **Gate**: lint; typecheck; `cd apps/extension && bun run test -- src/components/composite/SecretCountdownClose.test.ts`. Pass: exit 0 each.

### Phase 4: #825, Holdings' error line

- `apps/extension/src/popup/pages/holdings.vue`: `const totalUnknown = computed(() => error.value || unavailable.value)` feeds `totalDisplay`'s dash and the dash's `aria-hidden`; `awaitingPrices` is false while `error`; `summaryMeta` returns `""` while `isLoading || error`, before its `unavailable` branch. A one-line comment states the invariant: a list that failed to read has no total and no count, whatever rows events listed since.
- Tests (`holdings.test.ts`, beside the error cases in "holdings page"): a failed read shows `—`, `aria-hidden`, no skeleton and an empty meta beside `holdings-error`; with the price answer held, a live add for this chain of a row the answer prices (`TEST_USDC`, quoted in `mockQuotes`) leaves the error line, no listed row, no skeleton and the dash, and settling the answer keeps the dash and the empty meta (F5); with fiat off the meta is empty and no total renders. Control: the existing "an empty list, answered, reads $0.00 and 0 tokens".
- **Gate**: lint; typecheck; `cd apps/extension && bun run test -- src/popup/pages/holdings.test.ts`. Pass: exit 0 each.

### Phase 5: pictures and the full gate

- Check `cat /proc/loadavg` reads a 1-minute load under 150 before each build or e2e run.
- Pictures, by the house method (recon): a scratch spec under `~/.cache/nulo-backlog/ui-polish-4/`, copied into `apps/extension/tests/e2e/` for the run only and removed before lint and commit; armed Chrome builds of the base, `948670ca` (before) and the arc head (after); 400x600 at DPR 1; light and dark. Surfaces: the logs toolbar at rest, on hover, and after a pointer open and close of the more menu, each trigger also clipped to its own border box with the hover transition settled (clip before equals clip after by sha256, and each trigger's viewport `x`, `y`, `width` and `height` equal, I1; log lines show between the triggers, so full frames differ by run); the more menu open (#810); the toolbar with each trigger keyboard-focused (after) and the same keys pressed (before: no ring); the revealed recovery phrase's Close focus-visible and under a held Space, clipped to its box plus 4 px, the page clock pinned as hygiene-3 did; Holdings with the token-balance port refused in the scratch spec, fiat on and off, recording the summary's box height. PNGs go to `implementations-plan/ui-polish-4/screenshots/`; the PR links them at the commit SHA.
- A trigger pair that differs fails the gate. Compare the two builds' computed styles and boxes, then set locally on `.filter_button` only the property shown to differ (`text-rendering: inherit` is the likely one); never relax the comparison.
- **Gate**: `bun run audit:vue`; `bun run test:all`; both armed builds of the final head (Phase 2's command); smoke on Chrome and Firefox (Phase 2's run command) for `viewers-csp`, `keyboard-guards`, `legal-acceptance`, `import-paths`, `holdings-add-token`, `token-list`; `bun run check:plans` after staging. Pass: exit 0 each; the trigger clips and boxes equal; Holdings' summary height equal on both builds, fiat on and fiat off; a red re-run once only for a named known flake.

## Security & Adversarial Considerations

- No trust boundary moves: no dApp input, storage, message, permission, log line or dependency changes. Holdings' fix removes a false figure, never adds one.
- The triggers keep their click paths and emits; the menu's Escape and Enter rules are unchanged, and the panel's Escape now marks the key handled. A `<button type="button">` cannot submit a form.
- Scratch capture code never lands in the repo; the plans gate and lint run after it is removed.

## UI impact

The brief's no-ask records are the picks above, and nothing more. Logs window's more menu: Clear logs in the body role, 12 px icon, 8 px gap, so its row is 4 px shorter, as Export's is (P56-04 A). Logs toolbar: three Tab stops with the 2 px accent ring on keyboard focus, Enter and Space open; mouse unchanged (P58-03 A). Recovery-phrase Close: solid ring, no filled press, the default fade (P58-04 B). Holdings' summary in the error state: `—` and no count, same height (P56-03 B). Accessibility calls (D2-D4) are stated in the PR body as made under the owner's 2026-10-19 delegation, with one consequence named: a key pressed on a trigger the mouse focused shows the ring, as on every house `Button`.

## Decision ledger

| Id | Decision | Rejected | Panel |
|---|---|---|---|
| D1 | One arc, one PR: four small, disjoint edits | four PRs (four CI runs for ~60 lines) | brief |
| D2 | `Popover`'s Escape marks the key handled and returns focus to the trigger's control kept at open, only when focus is in the panel; the panels' rows, and a panel left open when Tab leaves its trigger, filed as one issue at close-out | leave `Popover` as is (Opus: the rows are out of scope); refocus on every close (a pointer close from the autofocused, `:focus-visible` search field would carry the ring to Source) | Codex for the fix, Opus for leaving it; the driver takes Codex's: the path is demonstrated, the newly reachable trigger makes it reachable, and CLAUDE.md § Keyboard asks a handled Escape and focus returned. Opus's own constraint (Escape only) is met |
| D3 | `aria-label="Log actions"` on the icon-only trigger, as the house's other "… actions" menus; no `aria-haspopup` or `aria-expanded` (no other house Dropdown trigger has them, and the menu has no menu roles) | a tooltip (visible, an owner ask) | both agree |
| D4 | New testids `logs-filter-source`/`-level` and `logs-filter-<kind>-panel`; `logs-more-trigger` kept | text or role selectors (banned) | both agree |
| D5 | `error` overrides every summary input, rows from events included | clearing rows on error (the list's own rule) | both agree |
| D6 | The Close's test compares class lists with a bare `cta_outline` Button | a source scan of the SFC's CSS | both agree |

## Audit verdicts

**Round 1.** Codex (gpt-6.1-sol, high, session `01a153c0`): `conditional approve` (repair Escape focus handling, strengthen the browser proofs, build both bundles before smoke, correct the Holdings test). Opus 5.5 Plan: `conditional approve` (proof steps before Phases 2 and 5; no design change). C = Codex, O = Opus; all accepted unless marked:
- C1 Source's Escape drops focus, unhandled → D2's fix. O (D2) leave `Popover` → rejected, reason in D2.
- C2/O1/O2 the e2e passed without a return or a pointer → ArrowDown into the menu, both keys per trigger, `pointerClick` on the item, `waitForFocus`, ring `/^none /`.
- C3 smoke builds nothing → both armed builds before each smoke gate.
- C4/O-facts F2, F3, F5 wording; no error describe → corrected.
- C5/O3 a full frame shows log lines; UA `text-rendering` → per-trigger clips, a differing pair fixed by the property shown.
- C6 fiat-off height → measured on both builds.

**Round 2** (Codex, resumed): `conditional approve (with conditions: compare trigger positions and dimensions independently of their cropped-image hashes)`. Accepted: a moved trigger keeps its clip's hash, so every trigger's box is compared too. Codex verified that the pre-flush `open` watcher runs before the search field's `onMounted` focus (Vue `runtime-core`), that refocusing before `onClose()` is right, and Opus's focus-trap claim (`focus-trap.esm.js:819-831,878`).

**Round 3** (Codex, resumed, verification): `approve`, no new finding.
 O4 Clear logs 4 px shorter → named in UI impact. O5 a key after a mouse focus shows the ring → named in the PR body. O6 the live-add row priced. O7 Level focused and settled before the shot.

## Delivery

- PR title: `fix(ui): logs toolbar keys, its menu items, the recovery close, holdings error line` (86 characters). Opened ready, no label; add `e2e:extension-smoke` only if the path filter skipped smoke.
- Body: the four picks by id and text, the delegated accessibility calls, the pictures, the e2e wall-clock per browser before and after, the gates with outcomes, the four `Closes` lines.
- ui-dedupe-2 (#839) edits Holdings' rows: if it lands first, merge `origin/dev` and keep both.

## Post-implementation

The standard is `implementations-plan/README.md` § Post-implementation standard at `993b3efc`. Plan-specific values:
- Step 1 is absent (`code_review: off`).
- Step 2 once, after Phase 5, over `git diff origin/dev...ui-polish-4-a1`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh` until a round has no material finding; hard stop at three. One Opus 5.5 diff review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1.
- Step 3: one PR against `dev`, then `gh pr checks <n> --watch`.
- Step 4 as this PR's final commits: merge `origin/dev`, read `index.md` and `lessons.md`; the Outcome; file D2's issue (dedupe first); the lessons pass; `STATUS.md` deleted; `git mv` into `archive/` in its own commit; the index line moved; `bun run check:plans` green.
- Step 5 after the merge: `agent-worktree done ui-polish-4 --merged`, once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/ui-polish-4/plan.md` succeeds.

## Seeds

`/goal` (recommended): `implementations-plan/ui-polish-4/plan.md is done: Phases 1-5 marked ✓, each backed by its gate reported passing in the transcript; LESSONS_FILE=implementations-plan/ui-polish-4/lessons/phase-N.md printed per phase; the Codex loop converged on the arc's diff, quoted; the PR exists against dev, opened after the loop, with the close-out's archive commit on it; bun run test and bun run lint exit 0.`

`/loop 15m Drive implementations-plan/ui-polish-4 per its plan.md (read it and lessons/ first; plan.md is the state). Take the next unchecked step, run the fast gates after each edit, commit signed. Decide open questions with Codex (gpt-6.1-sol high) and log each consult. After Phase 5, run the Post-implementation loop, open the PR against dev, watch checks, report and stop. Never merge.`

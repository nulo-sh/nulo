---
plan: list-perf-1
tier: light
status: planned, Codex approve (r3), awaiting the orchestrator's approval; the arc starts after #1027 merges
issues: "#1036 (arc 1), #1037 (arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); one Codex audit round-trip (gpt-6.1-sol, high) and one Opus Plan critique; no e2e while planning
base: origin/dev at 5711a1bc3 (the arc rebases its evidence on dev after #1027)
trunk: dev
post_implementation_hardening: not scheduled
---

# list-perf-1: long lists in the popup

One arc, one PR against `dev`, `Closes #1036`, `Closes #1037`. `Icon` stops running Vue's `useCssVars`, and Send's recipient suggestions render only the rows near the view. Nothing a person sees changes. Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## The claims and what did not hold

- **#1036 held, and is wider than written.** `useCssVars` runs a document-wide query per `Icon` after mount and after each update (queued post-flush), and each instance observes its parent's children and reruns it (`runtime-dom.esm-bundler.js:437-468`). Only one caller sets `hoverColor` (`EditFpcPopup.vue:236-244`); its own `.icon_btn:hover` sets the same colour at equal specificity (`:298-304`).
- **#1037 held as code; its cause is inferred.** Every match renders a row of 7 component instances with no key or cap (`RecipientField.vue:259-278`). Phase 3's A/B measures the rendering share.
- **Not taken:** the issue's "cap" changes the screen; the lane brief rules it out, and windowing makes it unneeded.

## Outcome & Quality Bar

- **For whom**: a person with hundreds or thousands of contacts or transactions who opens a list or types a name in Send.
- **Excellent**: the 5,000-row contacts and activity opens and the 5,000-contact keystroke fall by more than half against the same build without the change, with zero differing pixels on every compared screen; the long list scrolls, highlights and picks the same destination as before on both browsers.
- **Good enough**: other long lists still render every row; after the `Icon` fix they scale about linearly (#1036's A/B), and no issue asks for more.

## UI impact

None. The lane brief's records are the whole budget: #1036 "Rendering is pixel-identical: the type-roles e2e sweep passes unchanged on both browsers, and a pixel compare of Home, Holdings, a contacts page and the bottom bar at 1x and 2x in both themes shows no differing pixel"; #1037 "what the person sees and can scroll to is unchanged, so no UI change. A cap on the matches ("and N more") would change the screen"; and "pixel-identical means zero differing pixels outside the per-run account address". D7 and D10 are made under the owner's 2026-10-19 carve-out ("press, hover and fade states, and ARIA wiring are NOT owner asks"; delegated to the panel).

## Assumptions

**Facts** (recon.md has the lines): F1 `Icon.vue:55` holds the tree's only CSS `v-bind`. F2 inline custom properties through `:style` are the house pattern (`BalanceView.vue:277`, `OnboardingPage.vue:21`); the theme-var guard ignores non-owned names. F3 the listbox is a column `Flex` scroller (no `gap`), `max-height: 160px` including 2 px borders, whose rows are its only children; `send-keyboard.test.ts:71-111` counts them and reads the active row by child index, on a 4-row list. F4 `moveHighlight` scrolls the target into view before any render (`RecipientField.vue:153-160`); the unit mock requires `{ block: "nearest" }` on `options[index]`, after awaiting `nextTick`. F5 `matchRecipients` keeps input order and identity; selection uses the held object, never a DOM index. F6 no windowing code or dependency exists. F7 #1027's `Icon.vue` hunks do not touch the lines this arc edits. F8 the probe's recipient cell waits for `n` rows (`_probe-ceilings.test.ts:461`); Send suggests "Account 1" before its contacts load (`send.vue:216-225`).

**Inferences**: I1 every row has one height and no margin (fixed line heights, `nowrap`), 54 px today; the code reads it, and D9's extent check catches a later gap. I2 (provisional) after windowing a keystroke costs the match (8.9 ms at 5,000 on Bun, not a browser figure) plus about 12 rows. I3 zero-height spacers in a short list change no pixel (Phase 3 proves it).

**Asks** (none to the owner): A1 the arc starts only when #1027 is merged. A2 captures use a fixed recovery phrase where the fixtures allow, so they compare unmasked; otherwise only the address element's box is masked, as the brief's rule allows. A3 (orchestrator) both issues carry `enhancement`; the lane brief is the only scheduling record this plan has, and approval confirms it. A4 (orchestrator) D2 adds a repo-wide test policy; declining narrows it to `Icon.vue`.

## Architecture & Implementation

**Icon (D1, D2).** `styles` gains `"--icon-hover": var(--txt-<hoverColor>)` only when `hoverColor` is set; `.hovered:hover` reads `color: var(--icon-hover)`; `hoverColorVar` goes. The value resolves on the same element as before. `css-v-bind-ban.test.ts` refuses any SFC under `SCAN_ROOTS` whose `parse(...).descriptor.cssVars` is non-empty.

**The window (D3-D8).** A pure helper beside `recipient-search.ts`:

```ts
suggestionWindow({ count, scrollTop, rowPx, viewPx }): { start: number; end: number }
nearestScrollTop({ index, scrollTop, rowPx, viewPx }): number
```

- Invariants: every row that meets `[scrollTop, scrollTop + viewPx]` is in `[start, end)`, with 4 rows of overscan each side; a `scrollTop` past the end clamps the window to the tail; `rowPx === 0` (unmeasured, jsdom) gives `[0, min(count, 12))`.
- `RecipientField.vue` keeps `scrollTop`, `rowPx` and `viewPx` refs. `@scroll.passive` on the listbox sets `scrollTop`. A post-flush watcher on the matches and the shown state reads the first row's `getBoundingClientRect().height`, the listbox's `clientHeight` and its `scrollTop`: a browser clamp after the list shrinks is read back, and a list that opens reads 0, so it starts at its top as today.
- `start` and `end` are primitive computeds. The `v-for` runs over `filteredContacts.slice(start, end)` with the full index `i = start + k` for `id`, `aria-selected`, `.active` and `:key`. `--rows-before` (`start * rowPx`) and `--rows-after` (`(count - end) * rowPx`) go on the listbox's inline style; its `::before` and `::after` (`content: ""; flex: none; align-self: stretch; overflow-anchor: none`) take those heights. Rows stay its only element children, its `scrollHeight` stays `count * rowPx`, and a scroll inside the window renders nothing.
- `moveHighlight` writes `nearestScrollTop(next)` to the listbox's `scrollTop` and to the ref, so the target row renders and the read-back agrees; after `nextTick`, `scrollIntoView({ block: "nearest" })` on that row moves the page scroller as today.

**Change map.** Modified: `packages/design/src/core/Icon.vue`, `Icon.test.ts`, `apps/extension/src/popup/components/modules/send/RecipientField.vue`, `RecipientField.test.ts`, `apps/extension/tests/e2e/send-keyboard.test.ts`. Added: `send/suggestion-window.ts` and its test, `apps/extension/src/utils/css-v-bind-ban.test.ts`, `implementations-plan/list-perf-1/screenshots/`. No `data-testid` changes. Nothing of the probe is committed.

## Security & Adversarial Considerations

- **The invariant that matters**: the row a person sees and the address picked stay one destination through filtering, scrolling and keys. Selection keeps the held object (F5); Phase 2's tests pick after a scroll, after a narrowing and after a reveal.
- **Threat model**: contact rows are the profile's own, rendered by text interpolation as today; the window reads only geometry. `hoverColor` is a typed prop set in source, written through `style.setProperty`, so a value cannot leave its declaration.
- **Supply chain**: no new dependency (D3). Least privilege, cryptography and logging are untouched.
- **The scratch probe** runs only in `git archive` exports under `~/.cache/nulo-backlog/list-perf-1/`; the PR's `git diff --name-only origin/dev...` lists only the change map.

## Phases

### Phase 0 — Start after #1027 (0.3 h)

1. Run `gh pr view 1027 --json state -q .state`. If it is not `MERGED`, stop and report waiting.
2. Run `git fetch origin && git merge origin/dev`, then `bun install --frozen-lockfile`. Write the base SHA (`git rev-parse origin/dev`) to `STATUS.md`.

**Gate.** `bun run lint && bun run typecheck:all && bun run test` exit 0 at the merged base. Layers: lint, typecheck, unit.

### Phase 1 — `Icon` without CSS `v-bind` (#1036, 1 h)

1. Edit `Icon.vue` as in Architecture.
2. Add one `Icon.test.ts` test: with `hoverColor: "primary"` the root has the `hovered` class and `--icon-hover: var(--txt-primary)`; without it, neither.
3. Add `css-v-bind-ban.test.ts` over `sourceFiles` with a Vue-only policy on `SCAN_ROOTS`, reading `descriptor.cssVars` from `@vue/compiler-sfc`'s `parse`. Its self-test refuses a planted SFC with `color: v-bind(x)` and passes one with a template `v-bind="attrs"` and a `:style`.
4. Prove it red: run the ban test with `Icon.vue` from the base SHA; it must fail naming `Icon.vue`.

**Gate.** `bun run lint && bun run typecheck:all && bun run --cwd packages/design test && bun run test` exit 0; the red proof in `lessons/phase-1.md`. Layers: lint, typecheck, unit.

### Phase 2 — The windowed suggestion list (#1037, 3 h)

1. Add `suggestion-window.ts` and edit `RecipientField.vue` as in Architecture.
2. Add `suggestion-window.test.ts`, one table: unmeasured; top; middle; end; `scrollTop` past the end; a list shorter than the view; `nearestScrollTop` above, below and inside the view.
3. Add one `RecipientField.test.ts` block with stubbed geometry (row 54 px, view 156 px, 40 candidates): at most 12 rows render; a scroll event moves the window and ids stay full indices; Up from no highlight renders the last row (`optionId(39)`, `aria-posinset="40"`) and scrolls it into view; a scroll away drops `aria-activedescendant`, and Enter still picks that candidate; scrolled near the end, a narrower term renders its matches from the tail, and a click picks the right one. Leave every existing test as it is.
4. Add one smoke scenario to `send-keyboard.test.ts` (D9), testid-only: 40 seeded contacts plus "Account 1" match "Acc". Take the row pitch from two consecutive `recipient-suggestion-address` tops. Wait until `scrollHeight` equals `Math.round(41 * pitch)`; then assert fewer than 41 address rows render. Scroll through the list in steps of whole rows, keying each address by its row index from its box; the 41 texts equal, as a multiset, the seeded addresses' and the account's trimmed forms. Scroll back to the top and wait two frames; the account's address is not among the rendered rows. Up from no highlight then shows the row `aria-activedescendant` names inside the list, with `aria-posinset="41"`; Enter sets the destination to the account's address.

**Gate.** `bun run lint && bun run typecheck:all && bun run test` exit 0; `cd apps/extension && bun run test:e2e -- tests/e2e/send-keyboard.test.ts --retry=0` green, then the same with `NULO_E2E_BROWSER=firefox`; both per-file durations in `lessons/phase-2.md`. Layers: lint, typecheck, unit, component, smoke e2e on both browsers.

### Phase 3 — Evidence and full gates (3 h)

1. **Pixel sheets.** Copy pxe-limits-1's probe tooling into `~/.cache/nulo-backlog/list-perf-1/`; re-point `run-tree.sh`'s namespace and recorded SHA. Export the base SHA and the arc head with `git archive`; add a scratch smoke probe to both. Import one fixed recovery phrase (the flow `import-paths.test.ts` drives) and seed fixed contacts, so captures compare unmasked. If the address cannot be fixed, mask only its element box, read by its testid in the same capture. Capture with `page.screenshot` and a clip, the pointer off any list, animations frozen the same way in both arms, two frames after any scroll.
   - Set (a): Home, Holdings, Settings → Contacts with 5 contacts, and the bottom bar, at DPR 1 and 2, light and dark, Chrome and Firefox. Also the EditFpc copy icon, hovered after the probe strips `icon_btn` from it in both arms, so `Icon`'s own rule paints; record its computed `color` against `--txt-primary`.
   - Set (b): the suggestion list at 1,000 contacts at its top, middle and end, and after Up from no highlight; dark, DPR 1, both browsers.
   - Compare decoded RGBA pairs. If a pair differs, capture that screen twice on base (A/A): a difference A/A also shows is method noise, removed from the method, never masked.
2. **Measurements**, A/B/A (head, base, head), Chrome, proverless, retry 0, through `run-tree.sh`: contacts and activity opens at 1,000 and 5,000 rows, and the recipient keystroke at 1,000 and 5,000 contacts. Before the timed keystroke the probe types once, waits for the full match count, and clears the field. The timed keystroke ends, in both arms, at the full expected match count (rows on base, the rows' `aria-setsize` on head) with `quiet` true and `timedOut` false; record the rendered row count. Write every number with its load1, closes and timeouts to `lessons/phase-3.md`.
3. Run the full gates below.

**Gate.** Every pair has zero differing pixels (outside the address box only where step 1 masked); `screenshots/pixel-compare.md` lists each pair and its count, beside Chrome's DPR 2 dark head captures; the hovered icon's computed colour matches in both arms. In both head runs, the 5,000-row opens and the 5,000-contact keystroke are at most half of base. If the base run shows document closes, timeouts or a spread that prevents attribution, run one more base run (predeclared); a result still unresolved is reported as inconclusive and stops the arc for the panel. The probe is never tuned to pass. `bun run audit:vue` and `bun run test:all` exit 0; `cd apps/extension && bun run test:e2e -- --retry=0` green on Chrome and on Firefox. Layers: all of the above plus e2e-live-network (probe only).

## Decision ledger

| Id | Decision | Why | Rejected |
|---|---|---|---|
| D1 | The hover colour reaches `Icon` as an inline `--icon-hover` | the house pattern (F2); #1036's A/B; same value on the same element (both legs) | utility classes per colour role (a generator change for one caller); deleting the prop (removes a design-package capability to fix a compiler side effect, and the caller's 0.2 s transition competes with `Icon`'s 0.3 s) |
| D2 | A scan refuses CSS `v-bind` in every SFC under `SCAN_ROOTS` | the cause is per-instance cost in any component a list repeats, which no static check can name; invisible to every functional test; 21-41 s at 5,000 rows; the compiler's `cssVars` is exact (Opus; the issue's own proposal) | an `Icon`-only guard (Codex's smaller choice; it stops this instance, not the cause) |
| D3 | A hand-written fixed-height window with a pure helper beside its one caller | about 40 lines; keeps the listbox → option DOM | a virtual-list dependency (wraps rows in a positioned box, breaking F3; supply chain); a composable (one caller); appending rows on scroll (Up to the last row renders them all) |
| D4 | Off-window height on the listbox's `::before`/`::after`, `flex: none` (an empty item would shrink to 0), `align-self: stretch`, `overflow-anchor: none` | rows stay its only children (F3, ARIA's owned options); a spacer is never a scroll anchor | spacer elements; padding (end padding in a flex scroller's overflow is an engine difference to prove) |
| D5 | Row and view heights read after each change to the matches or the shown state; unmeasured renders 12 | a CSS change cannot desync the window | a 54 px constant; a `ResizeObserver` (a lifecycle no traced failure needs) |
| D6 | Arrow keys write the target's offset to the listbox and the ref, then `scrollIntoView` after the render | one source of truth (the element), so a list change in the same task cannot undo the reveal; the page scroller still follows (F4) | a ref-only prediction (Opus P9: a same-task list change reads 0 back and the reveal is lost) |
| D7 | Accessibility (delegated): rows carry `aria-setsize`/`aria-posinset`; `aria-activedescendant` names only a rendered row | a screen reader keeps "n of N"; the attribute must name an element in the DOM | leaving it on an absent id |
| D8 | `:key` is the full index | a filter change still patches in place; a window shift adds and drops one node; no collision when a contact and an account share an address | no key; the address (not unique) |
| D9 | One new smoke scenario, both browsers: spacers, scroll events, the keyboard reveal and the pick in a real engine | jsdom has no layout; estimated 8 s on Chrome, 13 s on Firefox (5.0 / 9.2 s launch), measured in Phase 2 | none (the pixel sheet proves it once, not on later changes) |
| D10 | Fade (delegated): a row the keyboard brings in from outside the window shows its highlight at once instead of fading 0.2 s | it is created already highlighted; avoiding it would add an ordering step to `moveHighlight` | that ordering step; filed at close-out as a `known-limit` issue (with Opus P8: an unlaid-out list would show 12 rows) |

## Audit verdicts

- **Codex r1** (gpt-6.1-sol, high; session `01a162a2`): *conditional approve* (no incomplete-data timing pass; unmasked pixels or the exemption quoted; first-visible assertions; a scrolled list that shrinks; the long-list pick). All accepted: readiness and the full-count end condition, the runner re-pointed, the predeclared extra base run (Phase 3); the brief's mask rule quoted and a fixed phrase (A2); the D9 sweep and pick; the stale-offset and reveal-then-Enter cases (Phase 2); D5 narrowed; the `useCssVars` timing corrected. D2: Codex preferred an `Icon`-only guard, not blocking; decided against it (D2, A4).
- **Opus r1** (Plan agent): *conditional approve*. Accepted: D9 waits on the 41-row extent, testid-only, order-agnostic, `Math.round` (P2-P4); the hover pair made real by stripping `icon_btn` and reading the computed colour (P1); the spacers' `align-self` and `overflow-anchor`, heights from `start`/`end` (P6, P7); a conditional A/A control; the redundant reset on hide dropped; F3's range. P9 removed by D6; P5 and P8 are D10's known limit. Rejected: asking the owner about P5 (fade states are delegated). Noted, no change: `fade` translates the list (`base.css:302-305`), which moves boxes but not their heights, the only thing the window reads.
- **Codex r2** (resumed `01a162a2`, verification): *conditional approve* (D9 must return to the top and show the account row unrendered before Up). Accepted: Phase 2 step 4. Every r1 condition verified met; D6 checked against the unit mock and the 4-row scenario.
- **Codex r3** (resumed `01a162a2`): *approve*; the r2 condition met, no regression.

## Delivery

One arc, one branch (`worktree-list-perf-1`), one PR against `dev`, opened only after the Phase 3 gate and the fix loop: `gh pr create --base dev --title "perf(ui): icons drop the CSS v-bind; send's suggestions render only the rows in view"` (84 characters). Open it without labels; add `e2e:extension-smoke` only if the path filter skips smoke. The body states what changed and why, the A/B table, the pixel-compare result, the per-file and per-browser suite wall-clocks (the `e2e-testing` skill § Runtime budget), D7 and D10 as calls under the owner's 2026-10-19 delegation, and `Closes #1036`, `Closes #1037`. The close-out lands as the PR's final commits. No stack (the orchestrator's D-orch-1); no parallel lanes (one arc).

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `5711a1bc3` is the contract; plan-specific values:

- Step 1 is absent (`code_review: off`). Step 2 runs once over `git diff <base SHA>...HEAD` after Phase 3: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; the prompt carries the plan, this ledger, the adversarial ask and the standard's two rules verbatim. Hard stop at three rounds, then report. Log each round in `lessons/phase-4.md`.
- Step 3: `gh pr checks <n> --watch`; one rerun for a known flake. Do not merge: the orchestrator merges.
- Step 4: merge `origin/dev` first; Outcome, lessons, D10's `known-limit` issue filed and closed, `STATUS.md` deleted, `git mv` into `archive/`, `bun run check:plans` green.
- Step 5: `agent-worktree done list-perf-1 --merged` once `implementations-plan/archive/list-perf-1/plan.md` is on `origin/dev`.

## Seeds

```
/goal Phases 0-3 of implementations-plan/list-perf-1/plan.md marked ✓, each backed by its gate reported passing in the transcript with `LESSONS_FILE=implementations-plan/list-perf-1/lessons/phase-N.md` printed; /code-review NOT run (code_review: off); the Codex fix loop converged on the whole diff (a resumed pass with no new material finding, quoted); one PR against dev with `Closes #1036` and `Closes #1037`, opened only after the loop, carrying the close-out (`git show --stat` of the archive move); `bun run test` and `bun run lint` exit 0.
```

```
/loop 15m Drive implementations-plan/list-perf-1 forward in its worktree. Each firing: read plan.md and lessons/ (not the chat); if `implementations-plan/archive/list-perf-1/plan.md` is on origin/dev, run `agent-worktree done list-perf-1 --merged` and stop; if a PR exists, babysit its checks only. Else take the next unchecked phase, run its gate, mark ✓, log lessons. Decide with Codex (run-codex.sh ... high read-only gpt-6.1-sol), never wait for me; never merge, never widen scope. After Phase 3: the Codex loop (≤ 3 rounds), the PR, the close-out, then report and stop.
```

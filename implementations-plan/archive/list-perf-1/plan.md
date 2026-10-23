---
plan: list-perf-1
tier: light
status: completed with its one PR; #1037 moved to recipient-cap-1 (D11)
issues: "#1036 (arc 1); #1037 moved to recipient-cap-1"
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

## Outcome

- **Date:** 2026-10-22.
- **Status:** closed with its one PR (`worktree-list-perf-1` → `dev`, `Closes #1036`), which carries this close-out; the merge closes the plan. #1037 left the plan for recipient-cap-1 (D11) and stays open there.
- **Shipped:**
  - **`Icon` without CSS `v-bind`.** The hover colour reaches the `<svg>` as an inline `--icon-hover`, the same value on the same element, so no icon runs `useCssVars`. 40 base/head pixel pairs (Home, Holdings, Contacts, the bottom bar, the hovered FPC copy icon; light and dark; DPR 1 and 2; Chrome and Firefox) differ in 0 pixels: [screenshots/pixel-compare.md](screenshots/pixel-compare.md).
  - **The speed-up**, A/B/A on Chrome: the 5,000-row Contacts page opens in 6.06 s and 4.80 s against base's 62.2 s, Activity in 8.05 s and 5.38 s against 63.3 s ([lessons/phase-3.md](lessons/phase-3.md)).
  - **The ban.** `css-v-bind-ban.test.ts` refuses any CSS `v-bind` (the compiler's own `cssVars`) and any hand-written `useCssVars` call (by syntax) under `SCAN_ROOTS`, against a reviewed list (content-keyed, a reason per entry, it only shrinks; empty at landing). It is red on the base `Icon.vue`.
- **Dispositions:**
  - The orchestrator approved the plan with A3 and A4. #1037, Phase 2 and D3-D10 moved to recipient-cap-1 (D11), and #1037 carries a comment saying so. D10's known limit needs the window's code, so the lane that ships the window files it.
  - Review: Codex r1 approved; the Opus leg's four points were folded as test changes (D12); Codex r2's text-match finding was fixed by syntax; Codex r3 approved ([lessons/phase-4.md](lessons/phase-4.md)).
  - Rejected: SFCs outside `SCAN_ROOTS` and an aliased `useCssVars` callee, limits every source guard shares; no such source exists.
  - Size: 169 lines, over the light target by the window design kept for recipient-cap-1.
- **Lessons:** none promoted. `lessons.md` sits at its budget, and the one new gotcha (the popup's CSP refuses an injected `<style>`, so a spec restyles through a constructed sheet) is in [lessons/phase-3.md](lessons/phase-3.md).
- **Known limits:** none.
- **Open items:** none (#1037 is recipient-cap-1's).
- **Seeds retired:** the `/goal` and `/loop` below.

# list-perf-1: long lists in the popup

One arc, one PR against `dev`, `Closes #1036`. `Icon` stops running Vue's `useCssVars`, and a repo test refuses a CSS `v-bind` in any component. Nothing a person sees changes. #1037 left this plan for recipient-cap-1 (D11); the window design below stays as the audited design that lane reuses if the owner picks it. Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## The claims and what did not hold

- **#1036 held, and is wider than written.** `useCssVars` runs a document-wide query per `Icon` after mount and after each update (queued post-flush), and each instance observes its parent's children and reruns it (`runtime-dom.esm-bundler.js:437-468`). Only one caller sets `hoverColor` (`EditFpcPopup.vue:236-244`); its own `.icon_btn:hover` sets the same colour at equal specificity (`:298-304`).
- **#1037 held as code; its cause is inferred.** Every match renders a row of 7 component instances with no key or cap (`RecipientField.vue:259-278`). Moved to recipient-cap-1 (D11).
- **Not taken:** the issue's "cap" changes the screen; the lane brief rules it out here.

## Outcome & Quality Bar

- **For whom**: a person with hundreds or thousands of contacts or transactions who opens a list.
- **Excellent**: the 5,000-row contacts and activity opens fall by more than half against the same build without the change, with zero differing pixels on every compared screen.
- **Good enough**: long lists still render every row; after the `Icon` fix they scale about linearly (#1036's A/B), and no issue asks for more.

## UI impact

None. The lane brief's records are the whole budget: #1036 "Rendering is pixel-identical: the type-roles e2e sweep passes unchanged on both browsers, and a pixel compare of Home, Holdings, a contacts page and the bottom bar at 1x and 2x in both themes shows no differing pixel"; and "pixel-identical means zero differing pixels outside the per-run account address". D7 and D10 (the window's ARIA and fade calls, under the owner's 2026-10-19 carve-out) leave with the window (D11).

## Assumptions

**Facts** (recon.md has the lines): F1 `Icon.vue:55` holds the tree's only CSS `v-bind`. F2 inline custom properties through `:style` are the house pattern (`BalanceView.vue:277`, `OnboardingPage.vue:21`); the theme-var guard ignores non-owned names. F7 #1027's `Icon.vue` hunks do not touch the lines this arc edits. Window facts (D11, kept for recipient-cap-1): F3 the listbox is a column `Flex` scroller (no `gap`), `max-height: 160px` including 2 px borders, whose rows are its only children; `send-keyboard.test.ts:71-111` counts them and reads the active row by child index, on a 4-row list. F4 `moveHighlight` scrolls the target into view before any render (`RecipientField.vue:153-160`); the unit mock requires `{ block: "nearest" }` on `options[index]`, after awaiting `nextTick`. F5 `matchRecipients` keeps input order and identity; selection uses the held object, never a DOM index. F6 no windowing code or dependency exists. F8 the probe's recipient cell waits for `n` rows (`_probe-ceilings.test.ts:461`); Send suggests "Account 1" before its contacts load (`send.vue:216-225`).

**Inferences** (window, D11): I1 every row has one height and no margin (fixed line heights, `nowrap`), 54 px today; the code reads it, and D9's extent check catches a later gap. I2 (provisional) after windowing a keystroke costs the match (8.9 ms at 5,000 on Bun, not a browser figure) plus about 12 rows. I3 zero-height spacers in a short list change no pixel.

**Asks** (none to the owner): A1 the arc starts only when #1027 is merged (held: merged as `de500244a`). A2 captures use a fixed recovery phrase where the fixtures allow, so they compare unmasked; otherwise only the address element's box is masked, as the brief's rule allows. A3 (orchestrator, approved 2026-10-22) #1036 carries `enhancement`; the lane brief is the scheduling record. A4 (orchestrator, approved 2026-10-22) D2's tree-wide ban ships with a reviewed allowlist in the repo's usual form: content-keyed, a reason per entry, it only shrinks; empty at landing.

## Architecture & Implementation

**Icon (D1, D2).** `styles` gains `"--icon-hover": var(--txt-<hoverColor>)` only when `hoverColor` is set; `.hovered:hover` reads `color: var(--icon-hover)`; `hoverColorVar` goes. The value resolves on the same element as before. `css-v-bind-ban.test.ts` refuses any SFC under `SCAN_ROOTS` whose `parse(...).descriptor.cssVars` is non-empty, and any hand-written `useCssVars` call there (D12), unless a reviewed entry names that file and that expression (or the call) with a reason; an entry that no longer matches fails too, so the list only shrinks.

**The window (D3-D8; out of this arc, D11).** A pure helper beside `recipient-search.ts`:

```ts
suggestionWindow({ count, scrollTop, rowPx, viewPx }): { start: number; end: number }
nearestScrollTop({ index, scrollTop, rowPx, viewPx }): number
```

- Invariants: every row that meets `[scrollTop, scrollTop + viewPx]` is in `[start, end)`, with 4 rows of overscan each side; a `scrollTop` past the end clamps the window to the tail; `rowPx === 0` (unmeasured, jsdom) gives `[0, min(count, 12))`.
- `RecipientField.vue` keeps `scrollTop`, `rowPx` and `viewPx` refs. `@scroll.passive` on the listbox sets `scrollTop`. A post-flush watcher on the matches and the shown state reads the first row's `getBoundingClientRect().height`, the listbox's `clientHeight` and its `scrollTop`: a browser clamp after the list shrinks is read back, and a list that opens reads 0, so it starts at its top as today.
- `start` and `end` are primitive computeds. The `v-for` runs over `filteredContacts.slice(start, end)` with the full index `i = start + k` for `id`, `aria-selected`, `.active` and `:key`. `--rows-before` (`start * rowPx`) and `--rows-after` (`(count - end) * rowPx`) go on the listbox's inline style; its `::before` and `::after` (`content: ""; flex: none; align-self: stretch; overflow-anchor: none`) take those heights. Rows stay its only element children, its `scrollHeight` stays `count * rowPx`, and a scroll inside the window renders nothing.
- `moveHighlight` writes `nearestScrollTop(next)` to the listbox's `scrollTop` and to the ref, so the target row renders and the read-back agrees; after `nextTick`, `scrollIntoView({ block: "nearest" })` on that row moves the page scroller as today.

**Change map.** Modified: `packages/design/src/core/Icon.vue`, `Icon.test.ts`. Added: `apps/extension/src/utils/css-v-bind-ban.test.ts`, `implementations-plan/list-perf-1/screenshots/`. No `data-testid` changes. Nothing of the probe is committed.

## Security & Adversarial Considerations

- **The invariant that matters**: the hover colour resolves to the same token on the same element, and no component regains a per-instance document query unnoticed.
- **Threat model**: `hoverColor` is a typed prop set in source, written through `style.setProperty`, so a value cannot leave its declaration. The ban reads source with the compiler's own parser; an allowlist entry is keyed on the file and its exact `cssVars`, so a new `v-bind` beside an accepted one still fails.
- **Supply chain**: no new dependency. Least privilege, cryptography and logging are untouched.
- **The scratch probe** runs only in `git archive` exports under `~/.cache/nulo-backlog/list-perf-1/`; the PR's `git diff --name-only origin/dev...` lists only the change map.

## Phases

### Phase 0 — Start after #1027 (0.3 h) ✓

1. Run `gh pr view 1027 --json state -q .state`. If it is not `MERGED`, stop and report waiting.
2. Commit the scope amendment (D11).
3. Run `git fetch origin && git merge origin/dev`, then `bun install --frozen-lockfile`. Write the base SHA (`git rev-parse origin/dev`) to `STATUS.md`.

**Gate.** `bun run lint && bun run typecheck:all && bun run test` exit 0 at the merged base. Layers: lint, typecheck, unit.

### Phase 1 — `Icon` without CSS `v-bind` (#1036, 1 h) ✓

1. Edit `Icon.vue` as in Architecture.
2. Add one `Icon.test.ts` test: with `hoverColor: "primary"` the root has the `hovered` class and `--icon-hover: var(--txt-primary)`; without it, neither.
3. Add `css-v-bind-ban.test.ts` over `sourceFiles` with a Vue-only policy on `SCAN_ROOTS`, reading `descriptor.cssVars` from `@vue/compiler-sfc`'s `parse`, with its reviewed list (empty). Its self-test refuses a planted SFC with `color: v-bind(x)`, passes one with a template `v-bind="attrs"` and a `:style`, and refuses a reviewed entry that matches nothing.
4. Prove it red: run the ban test with `Icon.vue` from the base SHA; it must fail naming `Icon.vue`.

**Gate.** `bun run lint && bun run typecheck:all && bun run --cwd packages/design test && bun run test` exit 0; the red proof in `lessons/phase-1.md`. Layers: lint, typecheck, unit.

### Phase 2 — The windowed suggestion list (#1037; moved to recipient-cap-1, D11; not run here)

Kept as audited for that lane. 1. Add `suggestion-window.ts` and edit `RecipientField.vue` as in Architecture. 2. `suggestion-window.test.ts`, one table: unmeasured; top; middle; end; `scrollTop` past the end; a list shorter than the view; `nearestScrollTop` above, below and inside the view. 3. One `RecipientField.test.ts` block with stubbed geometry (row 54 px, view 156 px, 40 candidates): at most 12 rows render; a scroll event moves the window and ids stay full indices; Up from no highlight renders the last row (`optionId(39)`, `aria-posinset="40"`) and scrolls it into view; a scroll away drops `aria-activedescendant`, and Enter still picks that candidate; scrolled near the end, a narrower term renders its matches from the tail, and a click picks the right one. 4. One smoke scenario in `send-keyboard.test.ts` (D9), testid-only: 40 seeded contacts plus "Account 1" match "Acc"; the row pitch from two consecutive `recipient-suggestion-address` tops; wait until `scrollHeight` equals `Math.round(41 * pitch)`, then fewer than 41 address rows render; sweep in whole rows, keying each address by its row index from its box, the 41 texts equal as a multiset the seeded addresses' and the account's trimmed forms; back at the top after two frames the account's address is not rendered; Up from no highlight shows the row `aria-activedescendant` names, `aria-posinset="41"`; Enter sets the destination to the account's address.

### Phase 3 — Evidence and full gates (3 h) ✓

1. **Pixel sheets.** Copy pxe-limits-1's probe tooling into `~/.cache/nulo-backlog/list-perf-1/`; re-point `run-tree.sh`'s namespace and recorded SHA. Export the base SHA and the arc head with `git archive`; add a scratch smoke probe to both. Import one fixed recovery phrase (the flow `import-paths.test.ts` drives) and seed fixed contacts, so captures compare unmasked. If the address cannot be fixed, mask only its element box, read by its testid in the same capture. Capture with `page.screenshot` and a clip, the pointer off any list, animations frozen the same way in both arms, two frames after any scroll.
   - Home, Holdings, Settings → Contacts with 5 contacts, and the bottom bar, at DPR 1 and 2, light and dark, Chrome and Firefox. Also the EditFpc copy icon, hovered after the probe strips `icon_btn` from it in both arms, so `Icon`'s own rule paints; record its computed `color` against `--txt-primary`.
   - Compare decoded RGBA pairs. If a pair differs, capture that screen twice on base (A/A): a difference A/A also shows is method noise, removed from the method, never masked.
2. **Measurements**, A/B/A (head, base, head), Chrome, proverless, retry 0, through `run-tree.sh`: contacts and activity opens at 1,000 and 5,000 rows. Write every number with its load1, closes and timeouts to `lessons/phase-3.md`.
3. Run the full gates below.

**Gate.** Every pair has zero differing pixels (outside the address box only where step 1 masked); `screenshots/pixel-compare.md` lists each pair and its count, beside Chrome's DPR 2 dark head captures; the hovered icon's computed colour matches in both arms. In both head runs, the 5,000-row opens are at most half of base. If the base run shows document closes, timeouts or a spread that prevents attribution, run one more base run (predeclared); a result still unresolved is reported as inconclusive and stops the arc for the panel. The probe is never tuned to pass. `bun run audit:vue` and `bun run test:all` exit 0; `cd apps/extension && bun run test:e2e -- --retry=0` green on Chrome and on Firefox, never while deps-audit-1's soak is in flight. Layers: all of the above plus e2e-live-network (probe only).

## Decision ledger

| Id | Decision | Why | Rejected |
|---|---|---|---|
| D1 | The hover colour reaches `Icon` as an inline `--icon-hover` | the house pattern (F2); #1036's A/B; same value on the same element (both legs) | utility classes per colour role (a generator change for one caller); deleting the prop (removes a design-package capability to fix a compiler side effect, and the caller's 0.2 s transition competes with `Icon`'s 0.3 s) |
| D2 | A scan refuses CSS `v-bind` in every SFC under `SCAN_ROOTS`, with a reviewed allowlist (content-keyed, a reason per entry, only shrinks; empty at landing; A4) | the cause is per-instance cost in any component a list repeats, which no static check can name; invisible to every functional test; 21-41 s at 5,000 rows; the compiler's `cssVars` is exact (Opus; the issue's own proposal); the list makes a future deliberate `v-bind` a decision, never a regression | an `Icon`-only guard (Codex's smaller choice; it stops this instance, not the cause) |
| D3 | (window) A hand-written fixed-height window with a pure helper beside its one caller | about 40 lines; keeps the listbox → option DOM | a virtual-list dependency (wraps rows in a positioned box, breaking F3; supply chain); a composable (one caller); appending rows on scroll (Up to the last row renders them all) |
| D4 | (window) Off-window height on the listbox's `::before`/`::after`, `flex: none` (an empty item would shrink to 0), `align-self: stretch`, `overflow-anchor: none` | rows stay its only children (F3, ARIA's owned options); a spacer is never a scroll anchor | spacer elements; padding (end padding in a flex scroller's overflow is an engine difference to prove) |
| D5 | (window) Row and view heights read after each change to the matches or the shown state; unmeasured renders 12 | a CSS change cannot desync the window | a 54 px constant; a `ResizeObserver` (a lifecycle no traced failure needs) |
| D6 | (window) Arrow keys write the target's offset to the listbox and the ref, then `scrollIntoView` after the render | one source of truth (the element), so a list change in the same task cannot undo the reveal; the page scroller still follows (F4) | a ref-only prediction (Opus P9: a same-task list change reads 0 back and the reveal is lost) |
| D7 | (window) Accessibility (delegated): rows carry `aria-setsize`/`aria-posinset`; `aria-activedescendant` names only a rendered row | a screen reader keeps "n of N"; the attribute must name an element in the DOM | leaving it on an absent id |
| D8 | (window) `:key` is the full index | a filter change still patches in place; a window shift adds and drops one node; no collision when a contact and an account share an address | no key; the address (not unique) |
| D9 | (window) One new smoke scenario, both browsers: spacers, scroll events, the keyboard reveal and the pick in a real engine | jsdom has no layout; estimated 8 s on Chrome, 13 s on Firefox (5.0 / 9.2 s launch) | none (the pixel sheet proves it once, not on later changes) |
| D10 | (window) Fade (delegated): a row the keyboard brings in from outside the window shows its highlight at once instead of fading 0.2 s | it is created already highlighted; avoiding it would add an ordering step to `moveHighlight` | that ordering step; a `known-limit` issue (with Opus P8: an unlaid-out list would show 12 rows), filed by the lane that ships the window |
| D11 | #1037 leaves this plan for recipient-cap-1, with Phase 2, D3-D10 and the 1,000-contact seeds | that lane measured with real captures and holds the owner's pick between a cap and a window (decision page 84); building the window here would ship a choice the owner is making; its arc reuses Phase 2 if the window wins; D10's known limit needs the window's code, so it is filed only where that ships (orchestrator, 2026-10-22) | keeping Phase 2 here; filing D10's limit against code this arc does not ship |
| D12 | The ban also refuses a hand-written `useCssVars` call, found by syntax (`callsTo`) in `.vue`, `.ts` and `.js` sources under `SCAN_ROOTS` | the auto-imported helper costs the same per instance and the compiler's `cssVars` cannot see it (Opus r1); a text match refused comments and strings and missed `useCssVars /* c */ (` (Codex r2) | a regex over script text; leaving hand calls unguarded |

## Audit verdicts

- **Codex r1** (gpt-6.1-sol, high; session `01a162a2`): *conditional approve* (no incomplete-data timing pass; unmasked pixels or the exemption quoted; first-visible assertions; a scrolled list that shrinks; the long-list pick). All accepted: readiness and the full-count end condition, the runner re-pointed, the predeclared extra base run (Phase 3); the brief's mask rule quoted and a fixed phrase (A2); the D9 sweep and pick; the stale-offset and reveal-then-Enter cases (Phase 2); D5 narrowed; the `useCssVars` timing corrected. D2: Codex preferred an `Icon`-only guard, not blocking; decided against it (D2, A4).
- **Opus r1** (Plan agent): *conditional approve*. Accepted: D9 waits on the 41-row extent, testid-only, order-agnostic, `Math.round` (P2-P4); the hover pair made real by stripping `icon_btn` and reading the computed colour (P1); the spacers' `align-self` and `overflow-anchor`, heights from `start`/`end` (P6, P7); a conditional A/A control; the redundant reset on hide dropped; F3's range. P9 removed by D6; P5 and P8 are D10's known limit. Rejected: asking the owner about P5 (fade states are delegated). Noted, no change: `fade` translates the list (`base.css:302-305`), which moves boxes but not their heights, the only thing the window reads.
- **Codex r2** (resumed `01a162a2`, verification): *conditional approve* (D9 must return to the top and show the account row unrendered before Up). Accepted: Phase 2 step 4. Every r1 condition verified met; D6 checked against the unit mock and the 4-row scenario.
- **Codex r3** (resumed `01a162a2`): *approve*; the r2 condition met, no regression.
- **Orchestrator** (2026-10-22): approved as committed; A3 confirmed; A4 approved with the reviewed allowlist; D7 and D10 stand; #1037 moved out (D11).
- **Post-implementation** ([lessons/phase-4.md](lessons/phase-4.md); Codex session `01a164bf`, Opus beside r1). Codex r1 *approve*; Opus r1 *conditional approve*: the Icon test ties the inline property to its rule, `review()`'s open path tested, a comment reworded, hand-written `useCssVars` calls refused (D12). Codex r2 *conditional approve*: the hand-call check by syntax, not text. Codex r3 *approve*, no new material finding. Rejected (both legs, shared by every source guard): SFCs outside `SCAN_ROOTS`; an aliased or computed callee.

## Delivery

One arc, one branch (`worktree-list-perf-1`), one PR against `dev`, opened only after the Phase 3 gate and the fix loop: `gh pr create --base dev --title "perf(ui): icons drop their css v-bind, and a test refuses one in any component"` (78 characters). Open it without labels; add `e2e:extension-smoke` only if the path filter skips smoke. The body states what changed and why, the A/B table, the pixel-compare result, the per-browser suite wall-clocks (no e2e scenario is added), and `Closes #1036` (never #1037). The close-out lands as the PR's final commits. No stack (the orchestrator's D-orch-1); no parallel lanes (one arc).

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `5711a1bc3` is the contract; plan-specific values:

- Step 1 is absent (`code_review: off`). Step 2 runs once over `git diff <base SHA>...HEAD` after Phase 3: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; the prompt carries the plan, this ledger, the adversarial ask and the standard's two rules verbatim; one Opus diff review beside round 1. Hard stop at three rounds, then report. Log each round in `lessons/phase-4.md`.
- Step 3: `gh pr checks <n> --watch`; one rerun for a known flake. Do not merge: the orchestrator merges.
- Step 4: merge `origin/dev` first; Outcome, lessons, `STATUS.md` deleted, `git mv` into `archive/`, `bun run check:plans` green.
- Step 5: `agent-worktree done list-perf-1 --merged` once `implementations-plan/archive/list-perf-1/plan.md` is on `origin/dev`.

## Seeds

```
/goal Phases 0, 1 and 3 of implementations-plan/list-perf-1/plan.md marked ✓, each backed by its gate reported passing in the transcript with `LESSONS_FILE=implementations-plan/list-perf-1/lessons/phase-N.md` printed; /code-review NOT run (code_review: off); the Codex fix loop converged on the whole diff (a resumed pass with no new material finding, quoted); one PR against dev with `Closes #1036`, opened only after the loop, carrying the close-out (`git show --stat` of the archive move); `bun run test` and `bun run lint` exit 0.
```

```
/loop 15m Drive implementations-plan/list-perf-1 forward in its worktree. Each firing: read plan.md and lessons/ (not the chat); if `implementations-plan/archive/list-perf-1/plan.md` is on origin/dev, run `agent-worktree done list-perf-1 --merged` and stop; if a PR exists, babysit its checks only. Else take the next unchecked phase (Phase 2 is not run here), run its gate, mark ✓, log lessons. Decide with Codex (run-codex.sh ... high read-only gpt-6.1-sol), never wait for me; never merge, never widen scope. After Phase 3: the Codex loop (≤ 3 rounds), the PR, the close-out, then report and stop.
```

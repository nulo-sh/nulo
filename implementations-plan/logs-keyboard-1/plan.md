---
plan: logs-keyboard-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev @ d0551f7a
standard: implementations-plan/README.md § Post-implementation standard, read at d0551f7a
---

# logs-keyboard-1: the logs filter panels from the keyboard

One issue, one arc, one PR against `dev` (D-orch-1, no stack). Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none).

| Arc | Issue | Branch | PR line |
|---|---|---|---|
| 1 | #851 | `logs-keyboard-1-a1` off `origin/dev`, carrying this plan | `Closes #851` |

The direction is the orchestrator's accessibility call on #851, made under the owner's 2026-10-19 delegation: every row a native control that Space and Enter toggle, ringed only on `:focus-visible`; a keyboard open moves focus in (Source's search field as today, Level's first row); Tab and Shift+Tab walk the rows; Tab past the last row or Shift+Tab before the first closes the panel and goes on to the next or previous toolbar control; Escape stays as #823 left it.

## Outcome & Quality Bar

- **For whom**: a person who filters the logs window with the keyboard only, and the maintainer of `Popover`.
- **Excellent**: (1) from the Level trigger, Enter, Space, Tab, Shift+Tab and Escape alone change every filter and leave the panel by any edge, and no panel stays open behind focus that left it, on Chrome and Firefox; (2) a mouse sees no change: each pointer-opened panel, at rest and on hover, is pixel-identical to `dev` in both themes.
- **Good enough**: the panels get no new roles beyond `aria-pressed` (D12).

## Assumptions

**Facts** (verified at `d0551f7a`; detail in [recon.md](recon.md)):
- F1 #851 holds: each row is a `Flex` div with only `@click` (`LogsToolbar.vue:81-106`), and `Popover` closes only on Escape, an outside press or a document scroll (`Popover.vue:58-96`).
- F2 The panel is teleported to `#popover`, which precedes the header and the routed window in DOM order (`app.vue:544,558,574`), so the browser's Tab from a panel's edge goes to the window's start or before it, never to the trigger's neighbour.
- F3 `opener` is the trigger's control focused at open, read before the content mounts (`Popover.vue:51-52,71-72`); the Source field focuses itself on every mount (`Input.vue:168-172`).
- F4 `Popover`'s only consumer is the logs toolbar; `.filter_content_item` also styles the more menu's items (`LogsToolbar.vue:130,136`).
- F5 Spike (recon): in both browsers, refocusing the trigger inside the Tab keydown lets the browser's Tab go on from it; a control focused by script after a mouse click does not match `:focus-visible`, after Enter it does.

**Inferences**: I1 A native `button` with the row's class and `font: inherit`, `text-align: inherit` draws as the div does; only the capture proves it (Phase 3). I2 Vue's flush after the keydown listener runs before the browser's Tab, so a forward hand-off emits `onClose` once (spike: the hiding microtask ran first).

**Asks**: none. Every call here is keyboard reach, Tab order, a focus ring or ARIA wiring, delegated to the panel.

## Architecture & Implementation

`Popover.vue` gains the keyboard half of its light dismiss; `LogsToolbar.vue`'s rows become native buttons. No new module, prop, state, dependency or persisted value.

Three rules in `Popover`, for every consumer (D2): the panel sits in the Tab order right after its trigger, and focus leaving both closes it, as an outside press does.

### Phase 1: `Popover`'s keyboard rules ✓

- `packages/design/src/ui/Popover.vue`:
  - A local `tabbables(root)`: `button, input, select, textarea, a[href], [tabindex]`, `tabIndex >= 0`, not `:disabled`, in DOM order (D7).
  - Focus in (D5): in the open branch's `nextTick`, if `opener` is set and the card holds no focus, focus the card's first tabbable.
  - Tab hand-off (D3, D4), in the document keydown, for `e.key === "Tab"` and not `isComposing(e)` (`../composables/keys`): with focus in the card and a connected anchor (`opener`, else the trigger's first tabbable), Tab on the last tabbable focuses the anchor, leaves the key to the browser and calls `onClose()`; Shift+Tab on the first calls `preventDefault()`, focuses the anchor and calls `onClose()`. Escape keeps its code.
  - Focus out (D6): a document `focusin` while open; a target outside both the trigger and the card calls `onClose()`. Add and remove it beside the other two listeners, the unmount included; in the close branch, remove every listener before the pinned `removeOutside()` call, so its throw leaks none.
  - Keep the hand-off and the focus-in in named helpers, so the `watch` callback and `onKeydown` stay inside the complexity budgets.
  - A leaving panel is out of the keyboard path (D14): the `Transition`'s `@before-leave` sets `inert` on the leaving element. A reopen mounts a new element, so nothing resets it.
- Tests (`packages/design/src/ui/Popover.test.ts`, a new `describe("Tab")`):
  - `mountPopover` takes a component slot as well as a string. Opened from its focused trigger, focus moves to the first control; content whose `mounted` focuses its second control keeps it there (control); opened with focus elsewhere, focus stays (never-happens).
  - Tab on the last control: the trigger focused, the key not prevented, one `onClose`. Shift+Tab on the first: prevented, trigger focused, one `onClose`. A card with one control: Tab and Shift+Tab each hand off as above. Controls: Tab from the first and Shift+Tab from the last do nothing; Tab while the panel is open and focus is on `body` does nothing.
  - Opened with focus elsewhere, then Tab on the last control: the trigger's button focused (the anchor fallback).
  - Focus on an outside button closes; focus on another card control does not (control); after `setProps({ open: false })`, an outside focus emits nothing.
  - With the real `Transition` (`stubs: { transition: false }`): right after a close the leaving card is still connected and `inert`; the open card is not (control).
- **Gate**: `bun run lint`; `bun run typecheck:all`; `bun run --cwd packages/design test -- src/ui/Popover.test.ts`. Pass: exit 0 each; each new behaviour case reds on the base `Popover.vue`, and its paired control stays green there.

### Phase 2: the rows as native toggle buttons ✓

- `apps/extension/src/components/JsonViewer/LogsToolbar.vue`: "Select All" and each row become `Flex tag="button" type="button"` with `:aria-pressed` (`allOptionsSelected[kind]`, `filters[kind][k]`), `@keydown.enter="refuseRepeatEnter"` (D9, imported from `@/composables/usePopupEntity`) and testids `logs-filter-<kind>-all` and `logs-filter-<kind>-item-<key>` (D11). A new class `filter_toggle` beside `filter_content_item` (D10): `font: inherit; text-align: inherit;` and `&:focus-visible { outline: 2px solid var(--nulo-accent); outline-offset: -2px; }` (D8). Attributes, icons and texts stay as they are.
- Tests (`LogsToolbar.test.ts`, a new `describe` whose own mount passes a `Popover` stub that renders both slots, so the triggers test still counts three buttons): each panel's rows are `button[type=button]` whose `aria-pressed` reads the filter, Select All's reads `allOptionsSelected`; a click emits `selectAll` or `toggleFilter` with its key (control); a repeat Enter on a row is prevented, a fresh Enter is not (control).
- **Gate**: lint; typecheck; `cd apps/extension && bun run test -- src/components/JsonViewer/LogsToolbar.test.ts`. Pass: exit 0 each.

### Phase 3: the browser proofs, pictures and docs

- E2E (`apps/extension/tests/e2e/viewers-csp.test.ts`), one scenario after the toolbar's keyboard one. Failure mode: a row out of the Tab order, a key that does not toggle it, a clipped or missing ring, or a panel edge that does not close onto the right control; jsdom has no Tab order, no key activation and no computed outline, and only a browser runs its own Tab from the refocused trigger (F5). Steps: `tabTo` Level, Enter, `waitForFocus` on `logs-filter-level-all` and its ring `solid 2px -2px` in the accent; Space then Enter each flip its `aria-pressed`; Tab to `logs-filter-level-item-DEBUG`, Space flips its `aria-pressed`, Space again restores it; Tab to `logs-filter-level-item-ERROR`; Tab: the panel hidden, focus and ring on `logs-more-trigger`; Shift+Tab to Level, Enter, Shift+Tab: the panel hidden, focus on `logs-filter-level`; Shift+Tab to Source, Enter, type `pxe`, Tab twice to `logs-filter-source-item-pxe-client`, Tab: the panel hidden, focus on `logs-filter-level`; Shift+Tab, Enter: `logs-filter-source-all` shows (the search cleared), Escape. Then `pointerClick` Level: focus on `logs-filter-level-all` with `focusRing(...).ring` matching `/^none /`, which needs a clicked button to take focus, as Chrome and Firefox do on the harness's Linux (a comment says so); Escape. In the Firefox picture run, note whether Source's scroll box is a Tab stop between the field and Select All (it is never at an edge). Estimate 6 s per browser, measured in the PR.
- Docs: one bullet in `CLAUDE.md` § Keyboard & focus order (a popover's panel sits after its trigger in the Tab order, and focus leaving closes it); in `packages/design/README.md`, `Popover`'s keyboard contract and its content rule (no hidden control, D7).
- Pictures, by #852's method: a scratch spec under `~/.cache/nulo-backlog/logs-keyboard-1/`, copied into `apps/extension/tests/e2e/` for the run only and removed before lint and commit; armed builds of `d0551f7a` (before) and the head (after); 400x600 at DPR 1; light and dark; Chrome and Firefox. Each panel pointer-opened, at rest and with a row hovered, clipped to its card: sha256 equal and each row's box equal. Keyboard shots (after only): Level's first row and a Source row ringed. A differing pair fails the gate: set on `filter_toggle` only the property shown to differ; never relax the comparison.
- **Gate**: check `cat /proc/loadavg` reads a 1-minute load under 150 before each build or e2e run; build both armed bundles (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<chrome|firefox>`); `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 [NULO_E2E_BROWSER=firefox] bun run test:e2e -- tests/e2e/viewers-csp.test.ts --retry=0` per browser, on the base build and the head. Pass: exit 0 on the head; the new scenario reds on a head build with the base `Popover.vue`; every clip and box equal; the file's wall-clock per browser, base and head, in `STATUS.md`.

### Phase 4: the full gate

- **Gate**: `bun run audit:vue`; `bun run test:all`; both armed builds of the final head; smoke on Chrome and Firefox for `viewers-csp` and `keyboard-guards` (Phase 3's run command); `bun run check:plans` after staging. Pass: exit 0 each; a red re-run once only for a named known flake (#849 is one on Firefox).

## Security & Adversarial Considerations

- No trust boundary moves: no dApp input, storage, message, permission, log line or dependency. Log source names reach the DOM as text, as before; the new testids interpolate only the fixed `LOG_SOURCES` and `LOG_LEVELS` keys.
- A `<button type="button">` submits nothing. The hand-off moves focus only between the trigger and its own panel; Escape's rule is untouched. The new `focusin` listener lives only while a panel is open and leaves with the component.

## UI impact

The lane's whole visible budget is focus rings. Logs window, Source and Level panels: each row and Select All shows the 2 px accent ring, inset, on keyboard focus only. Mouse path pixel-identical (Phase 3). Accessibility calls D1-D9 and D12 are stated in the PR body as made under the owner's 2026-10-19 delegation, with two consequences named: a pointer open now puts focus on the panel's first control (no ring), so a key pressed next acts there; and a held Enter that opens Level toggles nothing.

## Decision ledger

| Id | Decision | Rejected | Why |
|---|---|---|---|
| D1 | Rows are `button` + `aria-pressed` | the design `Checkbox` | the rows draw a 12 px glyph; the `Checkbox` draws an 18 px box, a visible change |
| D2 | The three rules live in `Popover` for every consumer, no prop | an opt-in prop; handlers in the toolbar | the teleport is `Popover`'s and alone breaks the Tab order; the rules restore the order an in-place panel has, and a focus exit is the keyboard twin of the outside press it already closes on. A consumer that wants focus held wants a modal (`Popup`). A prop for one caller is config nobody asked for; the toolbar owns neither the card nor `opener` |
| D3 | Forward edge: refocus the anchor in the keydown, the browser's Tab goes on; the anchor is `opener`, else the trigger's first tabbable | computing the next tabbable after the trigger; focus sentinels; `opener` only | the browser owns the order, shadow roots (the CodeMirror host) included; sentinels add nodes to the accessibility tree (spike F5); a browser that does not focus a clicked button (Firefox on macOS) leaves `opener` empty after a pointer open |
| D4 | Backward edge: back onto the trigger, closed | going on to the control before the trigger | the panel sits after its trigger, so the trigger is the previous stop; skipping it loses the stop the person came from |
| D5 | Focus moves in on any open from a focused trigger | keyboard opens only (`opener.matches(":focus-visible")`, Opus's alternative; `detail === 0`) | Source already does it on pointer opens; script focus after a click shows no ring (F5); a screen reader's activation can focus the trigger without keyboard modality, and a modality test would leave that person outside the panel they opened. Consequence disclosed (UI impact) |
| D6 | Close on a document `focusin` outside trigger and card | `focusout` + `relatedTarget` | a null `relatedTarget` (window blur, a click on a non-control) must not close; `focusin` does not fire then |
| D7 | Local selector query for tabbables; a panel holds no hidden control (stated at the query and in the design README) | the `tabbable` package | a new direct dependency of `@nulo/design` for one caller, with layout checks jsdom must stub. A hidden control at an edge would hide that edge from the hand-off, and a Shift+Tab past it can leave the page with the panel open: no panel today has one, so it is a known limit, filed at close-out |
| D8 | Inset ring (`-2px`) on the rows | `2px` outset | Source's rows sit in a scroll box and the card clips; inset rows are house (`settings-row.module.css:35`) |
| D9 | Rows refuse a repeat Enter | nothing | Enter on Level moves focus to Select All, which then takes the held key's repeats (CLAUDE.md § Keyboard) |
| D10 | A new `filter_toggle` class for the button resets and ring | editing `filter_content_item` | that class also styles the more menu's items, another surface |
| D11 | Testids `logs-filter-<kind>-all`, `logs-filter-<kind>-item-<key>` | text selectors | e2e selects by testid only |
| D12 | No `aria-expanded` or panel role | adding them | as #852 decided for the triggers; not in #851 |
| D13 | One arc, one PR | two PRs | one issue, about 80 lines |
| D14 | A leaving panel is `inert` | leave it focusable for its leave (Opus: harmless) | Codex's trace: the card stays connected for its leave (a frame or two, `fastfade` has no CSS), and a held Tab or Shift+Tab can reach a closed panel's control, whose removal drops focus to the page. The consequence is small, the fix one attribute with no state: taken |

## Audit verdicts

**Round 1.** Codex (gpt-6.1-sol, high, session `01a15493`): `conditional approve (with conditions: make leaving panels inert and correct the red-test gate)`. Opus 5.5 Plan: `conditional approve` (the gate wording, a self-focus control that can fail, the stub on its own mount). C = Codex, O = Opus; all accepted unless marked:
- C1 a leaving card stays focusable → D14. O (harmless, two frames) → rejected, reason in D14.
- C3/O1 the red gate contradicts its controls → each behaviour case reds on base, its control stays green.
- C2 D7's fallback claim → corrected; the content rule stated at the query and in the README; a known limit at close-out.
- C4 the e2e toggles no single row and never reopens Source → both added.
- O2 the self-focus control could not fail → a component slot that focuses its second control on mount.
- O3 the both-slots stub would add buttons to the triggers test → its own mount.
- O4 a composing Tab could hand off and wipe the composition → `!isComposing(e)`.
- O5 a listener removed after the pinned `removeOutside()` throw leaks → removed before it.
- O6 D5 goes past "from the keyboard" → kept, reason in D5; the pointer step's focus premise commented.
- O8 Firefox may stop on Source's scroll box → checked in the Firefox picture run.
- O9 the trigger-focus control was redundant → dropped; a one-control card, a Tab from `body` and the anchor's `isConnected` added.
- O10 complexity → named helpers.
- Driver: F2 was wrong, `#popover` precedes the window in DOM (`app.vue:544`); corrected, no design change. O facts: F1's range 81-106.

**Round 2** (Codex, resumed, verification): `approve`, no finding.

## Delivery

- PR title: `fix(logs): filter panels from the keyboard, closed when tab leaves them` (74 characters). Opened ready, no label; add `e2e:extension-smoke` only if the path filter skipped smoke.
- Body: the call and its delegation, D1-D9 and D12 as accessibility calls, the two consequences, the pictures, the e2e wall-clock per browser before and after, the gates with outcomes, `Closes #851`.
- Lane viewer-flake-1 (#849) edits `viewers-csp.test.ts`: if it lands first, merge `origin/dev` and keep both.

## Post-implementation

The standard is `implementations-plan/README.md` § Post-implementation standard at `d0551f7a`. Plan-specific values:
- Step 1 is absent (`code_review: off`).
- Step 2 once, after Phase 4, over `git diff origin/dev...logs-keyboard-1-a1`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh` until a round has no material finding; hard stop at three. One Opus 5.5 diff review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1.
- Step 3: one PR against `dev`, then `gh pr checks <n> --watch`.
- Step 4 as this PR's final commits: merge `origin/dev`, read `index.md` and `lessons.md`; the Outcome; D7's known limit filed as a `known-limit` issue closed as not planned (dedupe first); the lessons pass; `STATUS.md` deleted; `git mv` into `archive/` in its own commit; the index line moved; `bun run check:plans` green.
- Step 5 after the merge: `agent-worktree done logs-keyboard-1 --merged`, once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/logs-keyboard-1/plan.md` succeeds.

## Seeds

`/goal` (recommended): `implementations-plan/logs-keyboard-1/plan.md is done: Phases 1-4 marked ✓, each backed by its gate reported passing in the transcript; LESSONS_FILE=implementations-plan/logs-keyboard-1/lessons/phase-N.md printed per phase; the Codex loop converged on the arc's diff, quoted; the PR exists against dev, opened after the loop, with the close-out's archive commit on it; bun run test and bun run lint exit 0.`

`/loop 15m Drive implementations-plan/logs-keyboard-1 per its plan.md (read it and lessons/ first; plan.md is the state). Take the next unchecked step, run the fast gates after each edit, commit signed. Decide open questions with Codex (gpt-6.1-sol high) and log each consult. After Phase 4, run the Post-implementation loop, open the PR against dev, watch checks, report and stop. Never merge.`

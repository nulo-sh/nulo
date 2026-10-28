---
plan: networks-ux-1
tier: light (the orchestrator's spawn: one Codex audit round-trip and the Opus Plan leg)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 843d27f75
trunk: dev
status: approved (Codex round 3, its one condition met by the orchestrator's scope call of 2026-10-28); arc 1 in progress
issues: "#1325"
post_implementation_hardening: not scheduled
---

## Goal

#1325: every inactive row of Manage Networks carries an outlined Switch button that activates that network in place, through the guarded activation the detail page uses. The row still opens the network's settings. One arc, size S. `E` is `apps/extension`, `X` is `E/src`; recon in [recon.md](recon.md).

## Outcome & Quality Bar

- **For whom:** a person on the networks list who wants another network now, by pointer or keyboard.
- **Excellent:** (1) one press on Switch moves the dot and the Active badge to that row and toasts "Active network updated", the page stays on the list, and every refusal reads as it does on the detail page; (2) each inactive row has two Tab stops in reading order, the row link then its Switch, and every point of the row outside the button still opens the detail page.
- **Good enough:** no change to the detail page, the header chip, the activation path or the service; `switchToNetwork` keeps its path.

## Assumptions

**Facts** (verified at the base):
- F1. A link-mode `SettingItem` row is one `<a>` holding everything (`X/components/ui/Settings/SettingItem.vue:95-104`); a button in its `#right` would sit inside the link. Click mode already draws a `div` root over a stretched `RowTarget` (`:114`), and `RowTarget` has a link form (`X/components/ui/RowTarget.vue:30-40`).
- F2. Six e2e sites dispatch a synthetic click on `[data-testid="network-row"][data-network-name=…]` and need that element to navigate; seven more read its data attributes (recon § Constraints). `querySelector` returns an ancestor before its descendant, so the testid must sit on one element only.
- F3. `useNetworkActivation` (`X/composables/useNetworkActivation.ts:17-39`) holds the in-flight-send refusal, `activateNetworkGuarded` and the refusal and unconfirmed toasts; success feedback is the caller's (`[id].vue:122-124`).
- F4. `@nulo/design` `Button` `primary_outline` is the outlined variant (`packages/design/src/ui/Button.vue:300-310`); `mini` is 26 px tall with 10 px side padding (`:225-230`). `Button` is `position: relative`, so it paints above an earlier `RowTarget`.
- F5. Two boxes would paint above a stretched link and take its presses: `.icon_wrapper` (`position: relative`, `SettingItem.vue:231-239`), which every row renders because the list fills `#dot` (`networks/index.vue:63-65`), and the divider's absolute `::after` hairline (`settings-row.module.css:4-16`). `Icon`, `Flex`, `Text` and `Badge` are not positioned.
- F6. Every new profile holds Testnet, Local Network and Alpha V6, Alpha V6 active (`X/wallet/services/network/seeds.ts:44-66`); the list sorts Testnet, Local Network, then by name (`networks/index.vue:33-38`).
- F7. A focused element that Vue removes leaves focus on the body (a jsdom probe; browsers do the same). `settings/proving.vue:44-47` hands focus on from a row that a state change removes, in a pre-flush watcher.

**Inferences** (to attack):
- I1. A switch in the smoke harness logs no console error. No current spec proves it: none of the specs that switch in smoke checks `consoleErrors`, and the collector also catches the browser's own load failures (`E/tests/e2e/fixtures/wallet-pages.ts:124-127`). The step keeps the file's error assertions, so 1.3 is the evidence. If it is red, the implementer reads the error: a product error is filed as an issue and stops the arc; a harness stand-in gap is fixed in the spec.
- I2. The 6 px a 26 px button adds to an inactive row (52 to 58 px, from the CSS) follows the picture the owner chose, whose inactive rows are drawn taller than the active one. The captures show the result.

**Asks:** none about a surface: the surface is signed (§ UI impact) and accessibility calls are the panel's (D4, D7). **Resolved:** the orchestrator accepted D1's two files outside the brief's list on 2026-10-28 (D1).

## Architecture & Implementation

- **`SettingItem` (adapt, D1).** A new boolean prop `controls`: with an internal `to`, the row holds its own controls in `#right`. The root becomes a `div` keeping the caller's `class` and `style`, and the link is a stretched `<RowTarget :to :labelledby="titleId">` carrying every other attribute, so `network-row` stays on the element that navigates. In this form `.icon_wrapper` and the divider let the pointer through. `disabled` still decides first and `external` ignores `controls`; every other mode renders as today.
- **List page (`X/popup/pages/settings/networks/index.vue`).** Inactive rows pass `controls`. Their `#right` shows `<Button variant="primary_outline" size="mini" :aria-label="`Switch to ${network.name}`" data-testid="network-row-switch" :data-network-name>Switch</Button>` before the chevron. The active row keeps today's form: one `<a>` holding the dot, the badge and the chevron. One handler: `useNetworkActivation` wired as the detail page wires it, then on `"activated"` the success toast (D2). A pre-flush watcher on the active network's id notes whether focus sits inside the row becoming active; after `await nextTick()` it focuses that row's new link from a function-ref map keyed by id, unless the page is gone or focus has moved to a live element (D7).
- **Flow.** Press, then `activate(row network)`. The in-flight-send refusal toasts and stops. Otherwise `activateNetworkGuarded` moves `appStore.network` and persists. The list re-renders: the dot and badge move, the Switch moves to the old row, and the popup's network-switch handler runs as after any switch (stale takeover, accounts reload).
- **Change map.** `SettingItem.vue` (prop, mode, root, `RowTarget` binding, two CSS rules); `Settings.test.ts` (one case); `networks/index.vue`; `networks/index.test.ts` (mounts the real `SettingItem`); `E/tests/e2e/settings-crud.test.ts` (one step); plan folder (screenshots included).
- **Not taken.** A hand-built row as on Connected Apps: copies `SettingItem`'s layout, or changes the row's padding and type. Click mode with `router.push`: the row stops being a link. A stretched link for every link-mode row: changes the DOM and the accessible names of every settings link. A button laid over the row from outside: breaks the dividers and splits the hover.

## Decision ledger

- D1. Row shape: `SettingItem`'s `controls` form (§ Architecture). Codex r1: architecturally defensible, but outside the brief's file list, so it needs an amendment; the in-scope option is a page-built row. Decision: keep D1. The brief hands the lane the row's shape and bounds the arc's size; its exclusions (detail page, chip, activation path, service) hold. The page-built row copies `SettingItem`'s layout, which the owner's standing instruction rules out. The prop is opt-in, so every other consumer renders as before, and `Settings.test.ts`'s existing cases prove it. Codex r2 held that review at merge does not authorize it. **The orchestrator's call of 2026-10-28** (a scope call, not a surface call; the surface stays the owner's signed D): Option A accepted, `SettingItem.vue` and `Settings.test.ts` join the change map, on two conditions. (1) The form is opt-in and no other consumer passes it: the existing `Settings.test.ts` cases stay unchanged and pass, and one new case pins the default form's rendered shape (no `controls`: the same root element, link and classes as today). (2) The default form's padding, type role and layout do not change. An explicit prop beats auto-detection (`#right` also holds passive badges) and a new slot (a second place for controls).
- D2. One handler: the list calls `useNetworkActivation` and toasts "Active network updated" on `"activated"`, as the composable's contract assigns. A shared success toast would need the detail page or the composable to change, both outside this lane. Codex r1 agrees.
- D3. `primary_outline` at `mini`: the outlined variant at the size nearest the picture's button that keeps the 24 px target size; `micro` (20 px) is below it.
- D4. Accessibility (owner's 2026-10-19 delegation): a native `<button>`; the name "Switch to {name}" holds the visible "Switch"; two Tab stops per inactive row in DOM order, one on the active row; Enter and Space natively; the ring is `Button`'s 2 px accent `:focus-visible`; the row link keeps the title as its name.
- D5. Tests: the component test proves the composed DOM; the e2e step proves the real popup's stacking and switch, which jsdom cannot (no layout, no hit test). Host: `settings-crud.test.ts`'s first test, which already walks the list.
- D6. `switchToNetwork` stays (41 files). No follow-up issue: its path is the only e2e cover of "Set as active network", and the button would save one navigation per call.
- D7. Focus (owner's 2026-10-19 delegation): a press activates its row, whose Switch then leaves the DOM while it holds focus. The watcher moves focus to that row's link once the row has re-rendered: before the render the row's old link is about to be replaced too (Codex r2). It acts only when focus sat inside the row that became active, so focus elsewhere never moves (Codex r1). Opus r1 would accept the loss, as the detail page's `network-set-active` loses focus too (`[id].vue:259`); rejected: matching an existing gap is no reason, and `proving.vue` already hands focus on. The detail page is out of scope.

## Phases and gates

Write each test first and run it at the base: it must fail there. Record red and green in `STATUS.md`. Root commands run from the repo root; `E` commands from `apps/extension`. `index.vue` imports `useNetworkActivation`, `useToast` and `managers` explicitly, since vitest auto-imports only `vue` and `vue-router`.

- [x] **1.1 `SettingItem` link row with controls.** Add the prop and the form (D1). Add a case pinning the default link form: without `controls`, the root is the `A` with the row's classes and attributes and holds no `RowTarget` (it passes at base and after). Add a case to `Settings.test.ts`: a `div` root keeping a passed `class`; the link target has the route's `href`, carries the row's other attributes and is named by the title; a click and Space each navigate once; exactly one element carries the testid, and it is the `A`; a plain `h("button")` in `#right` (no `stopPropagation`, like the list's `Button`) is the link's sibling after it in DOM order, and its press runs its handler once and never navigates. *Gate:* `cd E && bun --bun vitest run src/components/ui/Settings/Settings.test.ts`, red at base on the new case and green after, every existing case unchanged and green; root `bun run lint` and `bun run typecheck:all` exit 0.
- [x] **1.2 The list's Switch.** Change `index.vue`. Rewrite `index.test.ts` on the real `SettingItem` (in `global.components`) and `RowTarget` with an unstubbed `RouterLink` and a memory router, attached to the document, over Testnet, Local Network and Alpha V6. Mock `@/utils/core`, the composable and the toast as `[id].test.ts:20-28` does; keep the `Button` stub. Cases:
  - three `network-row` elements, each an `A` linking to its page with its data attributes; the dot and badge sit on the active row only;
  - a Switch on each inactive row and none on the active one, named "Switch to {name}", outside every link, variant `primary_outline`;
  - the Tab stops in reading order;
  - a click, Enter and Space (`pressOn`) each call `activate` with that row's network and leave the route alone;
  - `"activated"` toasts success; `"blocked"`, `"unconfirmed"` and `"stale"` do not;
  - after the render completes, focus on a Switch whose row becomes active lands on that row's new link; focus on another row's Switch stays.
  The Developer Mode cases stay. *Gate:* `cd E && bun --bun vitest run src/popup/pages/settings/networks/index.test.ts`, red at base on the new cases and green after; root lint and typecheck exit 0.
- [x] **1.3 The e2e step and captures.** Extend "networks page lists the default networks":
  - a Switch on each inactive row and none on the active one;
  - on Testnet's row (not the last), whole-pixel points from its left edge + 1 to its right edge - 1 on its midline and on its bottom hairline, skipping the Switch's box ± 1 px, each reach the row's link (`elementFromPoint`); the Switch's centre reaches the Switch;
  - `shotSend(page, "networks-list-switch", "network-row-switch")`, before any press, so no toast or hover shows;
  - note the selected account; assert the first `network-row-switch` names Testnet, then `pointerClick(page, "network-row-switch")`: the chip reads Testnet, the dot and badge sit in Testnet's row, Alpha V6 has a Switch, the hash is still the list, the toast shows, and the selection moves off the noted account;
  - assert the last `network-row-switch` names Alpha V6, then `pointerClick(page, "network-row-switch", { last: true })` restores the start: the chip reads Alpha V6 and the selection returns to the noted account;
  - the file's console and page error assertions stay.
  Estimate: +3 to 5 s per browser on the file.
  *Gate:* before each run, the armed build for that browser (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<browser>`). Then `cd E && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/settings-crud.test.ts --retry=0`, red at base and green after, on Chrome and with `NULO_E2E_BROWSER=firefox`. Record the file's duration on each (base: 19.2 s Chrome, 33.5 s Firefox). Then the captures, with `NULO_E2E_SHOT_DIR` set to `implementations-plan/networks-ux-1/screenshots/`.
- [ ] **1.4 Final gates on the head.** Root `bun run audit:vue`, `bun run test:all` and `bun run --cwd apps/extension build-storybook`, each exit 0. The full smoke suite on each armed build, sharded as CI shards it (`--shard=i/n`), each shard green. Root `bun run check:plans` after staging.

## Security & Adversarial Considerations

- **Surface:** a network name, typed by the person or seeded, reaches an `aria-label` and `data-network-name` through Vue attribute binding, which escapes it; no `v-html`. Backups carry no network rows.
- **Authority:** only the person's press moves the pointer (mainnet-arrival-1 D18); the press goes through the in-flight-send guard and the serial queue, so a switch during a send still refuses, and a repeat press queues an idempotent activation.
- **Clickjacking, logging, crypto, supply chain:** no new surface, log line, primitive or dependency.

## UI impact

Manage Networks list only. **Sign-off** (the owner, 2026-10-28, decision page 90, P90-02 = D): "regarding the lanes: you can already send "D" to a small lane although I have not signed, I have not signed just because the other twos were missing, but Networks D is my final answer." The option read: "Every inactive row in Manage Networks gets an outlined Switch button, and the active row keeps its dot and Active badge. The row itself still opens the network's settings, so the drill-in you decided stays. In e2e, switchToNetwork keeps its path and the button gets network-row-switch."
- **Before:** each row shows a name and a chevron; the active row adds a green dot and an "Active" badge; a row opens its settings.
- **After:** the same rows. Each inactive row shows an outlined "SWITCH" button between its name and its chevron: the design package's outlined button at its 26 px size, in the button type. The 26 px button makes inactive rows 58 px tall instead of 52. A press makes that row active in place and toasts "Active network updated". The active row and the rest of the screen do not change. Light and dark captures go in the PR.

## Delivery

One arc on `worktree-networks-ux-1`, one PR into `dev` with `gh pr create`, opened ready after the loop converges, no label. Title: `feat(networks): a switch button on each inactive row of manage networks`. The body carries the sign-off quote, the D4 and D7 accessibility calls, D1's two files outside the brief's list, red and green runs, the smoke suite wall-clock per browser before and after, the captures linked at a SHA, and `Closes #1325`. The close-out is the PR's last commits.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `843d27f75`, with:
- Loop over the net diff from `843d27f75`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; one Opus review (`Agent`, `opus`, `general-purpose`) beside round 1. Three rounds at most.
- `/code-review`: off.
- Close-out: merge `origin/dev`, read `index.md` and `lessons.md`; the Outcome; lessons; `STATUS.md` deleted; `git mv` into `archive/` in its own commit; `bun run check:plans`.
- Teardown once the PR merges: `agent-worktree done networks-ux-1 --merged --trunk dev`; a `/loop` checks each firing, a `/goal` arms one wait after its report.

## Review verdicts

Each finding was checked against the tree; detail in lessons/phase-0.md.

- **Codex, round 1:** reject; 5 findings. Accepted: the divider hairline is a second dead box (F5, D1); smoke loads the armed `dist` build, so each run follows its rebuild, with root commands and the full suite named (1.3, 1.4); a keyboard press drops focus with its Switch (D7); the restore waits for the selection to move out and back (1.3); `class` and `style` stay on the wrapper (D1). Argued: D1's file-list scope (D1).
- **Opus, round 1:** conditional approve; 9 findings. Accepted: the testid on one element only, proven (1.1, 1.2); a 1.1 control that does not stop the click (1.1); each `pointerClick` asserts which Switch it presses (1.3); the settle waits (1.3); F2's count and I1's evidence corrected, with the red path stated (F2, I1); the scope deviation recorded (Asks, D1); the hairline (F5); the capture before the press (1.3); test mechanics (1.2, 1.3). Rejected: accepting the focus loss (D7).
- **Codex, round 2 (resumed):** conditional approve (with conditions: hand focus off after rendering; obtain the scope amendment before implementation). Accepted both: D7 focuses after `nextTick`; the amendment is the open Ask.
- **Codex, round 3 (resumed, the final pass):** conditional approve (with conditions: the orchestrator accepts `SettingItem.vue` and `Settings.test.ts` before implementation); otherwise approved, the focus fix verified, no regression. The orchestrator accepted on 2026-10-28 (D1), so the verdict counts as approve for arc 1.

## Seeds

```
/goal Every phase in implementations-plan/networks-ux-1/plan.md marked ✓, each backed by its gate reported passing in the transcript with its red run at the base; LESSONS_FILE printed per phase; the Codex loop converged (a resumed pass reporting no new material finding, quoted); the PR and its close-out on GitHub, opened after the loop; `bun run test:all` and `bun run lint` exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/networks-ux-1 forward per its plan.md and the README's Post-implementation standard: reality check from plan.md and lessons/ (the archived path present on dev means merged: tear down and stop); next pending step; fast gates after each edit; Codex consult instead of waiting; five failures on one step: reassess with Codex; never merge.
```

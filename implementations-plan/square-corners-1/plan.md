---
plan: square-corners-1
tier: light
status: arc 1 in review; arc 2 waits on OA-1
issues: "#928 (arc 1 refs; closed by arc 2 after OA-1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev @ e6a68cd5
standard: implementations-plan/README.md § Post-implementation standard, read at e6a68cd5
---

# square-corners-1: the notice card goes square; the other rounded corners go to the owner

Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (OA-1).
Size: 154 lines, over the 150 target by the record of five review rounds, which nothing else restates.

| Arc | Issue | Branch | PR line |
|---|---|---|---|
| 1 | #928, the notice card | `square-corners-1-a1` off `origin/dev`, carrying this plan | `Refs #928` |
| 2 | #928, the rest | after OA-1 is answered; planned then | `Closes #928` |

**Sign-off for arc 1**, the owner's note on decision page 71 (P71-07, 2026-10-20), on the notice's pictures for #914: "That dialog has rounded corners: on Nulo if I'm not wrong there are NO rounded corners. But other than that the screenshot looks great."

## Outcome & Quality Bar

- **For whom**: a person who meets a notice ("Profile import failed", "Profile creation failed", "Import completed with errors") in the popup or in onboarding; the next contributor who edits the card.
- **Excellent**: (1) the card has four square corners in both themes, in the popup and in onboarding, and nothing else on it moves (hairline, shadow, padding, width, words); (2) a rounded corner put back in the card's own file, in any spelling, fails `bun run test`.
- **Good enough**: every other rounded corner stays until the owner answers OA-1; no new e2e scenario.

## Assumptions

**Facts** (at `e6a68cd5`; detail in [recon.md](recon.md)):
- F1 `NotificationManager.vue:115` is the card's only radius: `.card { … border-radius: 16px; }`, a local literal. The card is a `Flex` with `$style.card`; its template has one inline style, `font-style: italic` (`:65`).
- F2 The one component renders every notice in both shells (`popup/app.vue:578`, `onboarding/app.vue:105`), so one edit squares all five notice callers.
- F3 A `div` has no user-agent radius, so deleting the declaration renders 0. `border-radius: 0` appears 15 times where a primitive or a native control needs it.
- F4 The current Vitest config gives jsdom no module CSS (`apps/extension/vitest.config.ts:31-33` processes only `editor-shadow.css`). `a11y-css.test.ts` pins such rules in their sources with `parseSource` (`apps/extension/scripts/type-roles/source-scan.ts`).
- F5 `@nulo/design` has no radius token and no doc states the rule; `AccountAvatar.vue:19` is the one written statement.
- F6 #928's surfaces hold with four line numbers drifted; it misses the JSON viewer's editor theme (`creator.js`), now OA-1 item 6. No open PR touches `NotificationManager.vue`.
- F7 The toolbar popup is 360x600 (`--base-width: 360px`, `base.css:68`; `tests/e2e/fixtures/wallet-pages.ts:140`), not the brief's 400x600.

**Inferences**: I1 Today's styles leave the card's own sheet and inline styles as its only radius source (no global or `Flex` rule names it); a later global rule would bypass the pin (its stated blind spot). I2 The note signs the card only, so the other radii are OA-1.

**Asks**: none open for arc 1. OA-1 (Q1 the corners, Q2 the guard) is the owner's; arc 1 ships without it.

## Architecture & Implementation

One CSS line removed and one source pin added. No token, component, dependency or e2e scenario. The pin lands first, so its red run reads the untouched card; the rejected order, change first, would prove nothing red.

### Phase 1: The pin ✓

- Add `apps/extension/src/components/NotificationManager.test.ts`, a source test (D2). A private `roundedCorners(source?)` parses the SFC with `parseSource`. It returns a finding for each declaration, in the sheet or a static inline `style`, whose property matches `/(^|-)radius$/i` and whose value is not all zeros; for each `:style` or `v-bind` spread whose expression names a radius (`/radius/i`); and for a script that names one, since a binding is not evaluated.
- Tests: (a) the file yields `[]`; (b) a `test.each` of snippets, each yielding one finding: `border-radius: 16px`, `border-top-left-radius`, `border-start-end-radius`, `BORDER-RADIUS`, `-webkit-border-radius`, a nested `&:hover`, a static `style`, a bound `:style`, a `v-bind` spread, a script style; and four zero forms, inline included, yielding `[]`; (c) non-vacuity: `declarationsOf(parsed, ".card")` holds `background`, and the template holds `notification-description`. A header sentence names the blind spots: a global or shared rule, a `composes`, `clip-path` rounding.
- **Gate**: `bun run --cwd apps/extension test -- src/components/NotificationManager.test.ts`. Pass: exactly one failure, (a), naming `.card { border-radius: 16px }`; (b) and (c) pass. Record it in `lessons/phase-1.md`. Layers: unit.

### Phase 2: The harness, the patch, pictures before ✓

- **Warning**: before each build or run, wait until `/proc/loadavg`'s first field is under 150, polling inside one tool call.
- Write the scratch harness in `~/.cache/nulo-backlog/square-corners-1/capture/`, adapted from `~/.cache/nulo-backlog/exists-notice-1/capture/`. Retarget every root and import to this worktree. Never copy it into the repo. Each shot sets `theme` on `<html>`, waits on `settleThemeTransitions` (`tests/e2e/fixtures/shots.ts:7`), shoots at `deviceScaleFactor: 2`, and logs the target's computed `border-radius`:
  - `notice-popup`: the popup at 360x600 (F7, D9); register a passkey profile, lock, import the same passkey; the notice.
  - `notice-onboarding`: `import-errors-scroll.test.ts`'s `onErrorsScreen("local", "onboarding")` route, then `import-full-backup-view-errors-btn`; the notice.
  - `oa1-logs`: `#/windows/logger`; open the Level filter (its rows are static) and hover a row. One shot holds items 1-4. `oa1-logs-search`: Ctrl-F in the same window; the search buttons (item 6).
  - `oa1-json`: the popup route of `onErrorsScreen`; open the error viewer; hover the copy icon (no testid: a structural selector, scratch only).
  - `oa1-search`: the same viewer; select a word with matches, then press Ctrl-F; item 6.
  - `oa1-awaiting`: after the worker starts, write one `dapp_execute` row with `terminalAt: null` and a stage before `submitting` (D10); Tab to `tx-awaiting-cancel`; the ring.
  - `oa1-boot`: set `document.querySelector("#app")._vnode.component.provides.bootOutcome.value = "failed"`; the forced banner (OA-1 says so).
- Write `~/.cache/nulo-backlog/square-corners-1/oa1-square.patch`, option A in code: delete the eight CSS lines and ten `creator.js` entries; set the JSON theme's `.cm-button` to `"0"` and give the logs theme a `.cm-button` of `"0"`, since the library's own 1px shows through otherwise (recon).
- Build the armed Chrome bundle: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`. Run the spec with `SHOT_STATE=before NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1`, retry 0.
- **Gate**: exit 0; 16 PNGs (`<shot>-before-{light,dark}.png`); each logged radius matches recon; `git apply --check` passes on the patch and its `--numstat` names exactly the seven files of recon's tables; `git status --porcelain` lists only this plan's files. A missing picture fails the gate. After three failures on one route, reassess it with Codex; never drop the picture.

### Phase 3: The change ✓

- `NotificationManager.vue`: delete `border-radius: 16px;` from `.card` (D1).
- **Gate**: `bun run --cwd apps/extension test -- src/components/NotificationManager.test.ts`; `bun run lint`; `bun run typecheck:all`. Pass: exit 0 each; `git diff --stat origin/dev...HEAD` shows code only in the `.vue` and its test. Layers: lint, typecheck, unit.

### Phase 4: Pictures after, smoke, full gate ✓

- Rebuild; run the two notice shots with `SHOT_STATE=after`. Copy the eight notice PNGs to `implementations-plan/square-corners-1/screenshots/` (D4).
- In one tool call: `git apply` the patch under a `trap` that runs `git apply -R` on exit, build, and let the trap reverse it. Then `git diff --quiet` must pass. Shoot the six `oa1-*` shots with `SHOT_STATE=after` from that bundle. Rebuild the arc head.
- Add each `after` reading to OA-1's items. Run `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/import-errors-scroll.test.ts --retry=0`. No Firefox twin: no fixture, focus, window, activation or WebAuthn path moves.
- **Gate**: every `after` radius logs `0px`; 16 `after` PNGs; `git status --porcelain -- packages apps` is empty (index and tree); `git diff origin/dev...HEAD -- packages apps ':!apps/extension/src/components/NotificationManager.*'` is empty; `import-errors-scroll.test.ts` exits 0; `bun run audit:vue`, `bun run test:all`, and `bun run check:plans` after staging, exit 0 each. Layers: lint, typecheck, unit, component, build, e2e smoke.

## Security & Adversarial Considerations

No trust boundary moves: no dApp input, storage, message, permission, log or dependency. The pin reads repo sources at test time. The trust that matters is evidence provenance: the right checkout, the right bundle, a forced or seeded state labelled as such. The OA-1 patch is reversed by a trap inside the call that applies it, before any shot, and the Phase 4 gate proves no OA-1 file differs from `origin/dev`. Notices keep their words, buttons and testids.

## UI impact

- **The notice card** (popup and onboarding; every notice): before, 16px rounded corners; after, square corners. Hairline, shadow, padding, width, words and buttons stay. Signed by P71-07's note (quoted above). Pictures: Phases 2 and 4, the popup at its real 360x600.

## Decision ledger

| Id | Decision | Rejected | Why |
|---|---|---|---|
| D1 | Delete the declaration | `border-radius: 0` | a `div` has no UA radius (F3); nothing is left to read or override |
| D2 | A colocated source pin of the one file, private helper, positive controls for every spelling | a computed-style test; extending `a11y-css` or `red-text-ban`; the tree-wide ban now | the computed route needs CSS config and a mount for one invariant (F4); those guards own focus and colour; the tree-wide ban is OA-1 Q2, which absorbs this pin |
| D3 | OA-1's after pictures from a real build with the patch applied, then reversed | styles injected at capture time | a build is what ships |
| D4 | Commit the eight notice pictures; OA-1's stay in the scratch dir | commit all | the notice pictures are the PR's evidence; arc 2 commits what ships |
| D6 | `Refs #928`; the plan stays open; close-out with arc 2 | close the plan in arc 1 | OA-1 is open; precedent `mainnet-arrival-1` |
| D7 | Circles stay; OA-1 names them | square them | a dot or a spinner is a shape, not a rounded corner; the owner can say otherwise |
| D8 | The focus ring (item 7) and the hover shape (item 5) stay in OA-1 | the panel decides them under the 2026-10-19 accessibility delegation | the lane brief lists them in OA-1, so the owner answers all at once |
| D9 | The popup notice at 360x600 | the brief's 400x600 | 360 is the popup's real width (F7); the PR body states it |
| D10 | A scratch `dapp_execute` row with `terminalAt: null` | widening `seedJournalRecord` | the helper writes terminal rows by contract; widening it serves one picture |
| D11 | `creator.js`'s editor radii join OA-1 (item 6; undrawn ones noted) | leave them out | the owner's rule covers what a person sees; the search box and match outline are drawn |
| D12 | The guard is its own question (Q2) | the guard bundled with A/B | keeping the corners and refusing new ones is coherent |

## Audit verdicts

**Round 1.** Codex (gpt-6.1-sol, high, session `01a15902`): `conditional approve (with conditions: correct the awaiting capture and OA-1 inventory, make missing pictures fail the gate, fix case-insensitive radius detection and its controls, qualify the CSS assumptions, separate the guard choice, and ensure scratch-patch cleanup on failure)`. Opus 5.5 Plan: `conditional approve (with conditions: OA-1 and recon add the creator.js radii and qualify the guard's reach; the awaiting route seeds a non-terminal row; the pin uses /(^|-)radius$/i and /radius/i with template, camelCase and -webkit controls; the popup is shot at 360x600 or the size stated; the patch written in Phase 2, reversed before shooting, the committed diff re-checked; theme flips settle)`. Every claim checked against the tree; all accepted (C = Codex, O = Opus):
- C1 = O-F-B, demonstrated: `seedJournalRecord` writes `terminalAt: at` (`activity-seeds.ts:281`); awaiting cards need `null` (`RecentActivityView.vue:327`) → D10, Cancel's ring (Focus needs an approval window).
- C2 = O-F-G, demonstrated: `.filter_button` and `.filter_content_item` also style Log actions, Export CSV and Clear logs; the full-screen icon needs `requestId`, which no mount passes; the copy hover is dark-only → OA-1 items 2, 4, 5.
- O-F-A, demonstrated: `creator.js` sets eleven `borderRadius` values, four drawn → OA-1 item 6, recon's absence claim corrected (D11).
- C3: F4 overstated jsdom's limit (a probe computes `16px`) → F4 qualified; D2's reason is config cost, not engine limits.
- C4 = O-F-D, demonstrated (Codex reproduced `BORDER-RADIUS`): the pin was case-sensitive and missed `-webkit-` and camelCase → Phase 1's patterns and controls.
- C5: I1 credited CSS modules with too much → I1 rephrased; blind spots in the test's header.
- C6: the "unpictured after three failures" escape contradicted the brief → a missing picture fails the gate.
- C7: the guard was bundled with A/B, and "your stated rule" overstated the note → Q2, neutral wording (D12).
- C8 = O-F-E: the patch had no author and no forced reversal → written and checked in Phase 2; `trap` reversal before shooting; Phase 4 re-checks the committed diff.
- O-F-C, demonstrated: the popup is 360 wide → D9. O-F-F: theme flips settle. O: open the Level filter (static rows); F4/F6 line numbers; label #928 `owner-decision`.

**Round 2** (Codex, resumed, verification): `conditional approve (with conditions: retain an explicit zero for CodeMirror search buttons and update patch counts, check staged source changes, and clarify OA-1's menu and dormant-radius mappings)`. All accepted, each verified:
- C9, demonstrated (an editor probe: deleted → `1px`): `@codemirror/view`'s base theme rounds `.cm-button` by 1px, so the patch sets `"0"`; the same default rounds the logs window's search buttons today → OA-1 item 6, a shot, recon.
- C10, demonstrated by git's semantics: a staged change passes `git diff --quiet` and the committed diff → `git status --porcelain -- packages apps`.
- C11: item 3 named Log actions' square menu as a `Popover`; the undrawn radii had no mapping under B → item 3 and the mapping line fixed.

**Round 3** (Codex, resumed, verification): `approve`, no new material finding.

**Post-implementation round 1** (diff `origin/dev...square-corners-1-a1`). Codex (gpt-6.1-sol, high, session `01a15930`) `findings: 2`; Opus 5.5 diff review `findings: 4`. All accepted and fixed:
- Demonstrated by trace: a style built in script or a `v-bind` spread rounded the card past the pin, and an inline `0` failed it (Codex 1-2, Opus 1) → Phase 1 as written now; Opus 2: non-vacuity reaches `notification-description`, not the note's italic literal.
- Opus 3-4: the index's count, this file's status and the helper's signature were stale → fixed. Red/green re-proved: the base card fails 1 of 16, head passes 16.

## Delivery

- One PR against `dev`, opened ready (P71-07 signs the card) after Phase 4 and the Codex loop. No label at creation.
- Title: `fix(ui): the notice card has square corners` (44 characters).
- Body: the sign-off quote; UI impact; the eight pictures by blob URL at the commit that adds them, at 360x600 (D9); the gates with outcomes; no e2e scenario added, so no suite wall-clock moves; OA-1 named as open; `Refs #928`; the Claude Code line.

## Post-implementation

The standard is `implementations-plan/README.md` § Post-implementation standard at `e6a68cd5`. Plan-specific values:
- Step 1 is absent (`code_review: off`).
- Step 2 once, after Phase 4, over `git diff origin/dev...square-corners-1-a1`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh` until a round has no material finding; hard stop at three. One Opus 5.5 diff review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1.
- Step 3: `gh pr create`, then `gh pr checks <n> --watch`. Do not merge.
- Step 4 deviates: the close-out ships with arc 2, after OA-1 (D6). If OA-1 squares nothing and adds no guard, a docs-only close-out comments the answer on #928 and closes it.
- Step 5 after the close-out merges: `agent-worktree done square-corners-1 --merged`, once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/square-corners-1/plan.md` succeeds.

## Seeds

`/goal` (recommended): `implementations-plan/square-corners-1/plan.md arc 1 is done: Phases 1-4 marked ✓, each backed by its gate reported passing in the transcript; LESSONS_FILE=implementations-plan/square-corners-1/lessons/phase-N.md printed per phase; the Codex loop converged on the arc's diff, quoted; the PR exists against dev, opened after the loop; bun run test and bun run lint exit 0.`

`/loop 15m Drive implementations-plan/square-corners-1 arc 1 per its plan.md (read it and lessons/ first; plan.md is the state). Take the next unchecked step, run the fast gates after each edit, commit signed. Decide open questions with Codex (gpt-6.1-sol high) and log each consult. After Phase 4, run the Post-implementation loop, open the PR against dev, watch checks, report and stop. Never merge.`

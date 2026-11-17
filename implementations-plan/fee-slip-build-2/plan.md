---
plan: fee-slip-build-2
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev at 33906a052
status: in progress
---

# fee-slip-build-2: the Fee sheet's warning under the payer group, and the warning glyph on its cap top

Two signed picks, one build. One arc, one PR against `dev`; closes no issue. It changes what users see, so it lands only after the orchestrator reads its captures against the frames the owner picked. Recon: [`recon.md`](recon.md). Owner asks: none ([`OWNER-ASKS.md`](OWNER-ASKS.md)).

> **P169-01 = P2b** (decision page 169, 2026-11-17 17:16 UTC), "Where the Fee sheet draws the public Fee Juice warning: inside the picked row as rejected (today), directly under the picked row as its own block (P2a), under the whole WHO PAYS THE FEE group above PRIORITY (P2b), or in YOU PAY under the fee figure (P2c)". As the page put it: "Under the whole WHO PAYS THE FEE group, 12 px below the last row and above PRIORITY, wherever the row that raised it sits: it cannot read as a row or part of one, in either theme, and it mirrors the page, which puts the same warning under the whole THEY RECEIVE IT group. Its place never moves, so its live region is a plain mounted one (already drawn), and the fix is still the next Tab stop after the radios." Note: "Align the warning icon correctly please."
>
> **P175-01 = B** (decision page 175, signed 2026-11-17 19:54 UTC at dev `28695db80`, no note), "The warning glyph beside its text, one rule for the four rows: as built, the 14 px glyph box centred on the first line (A); the 14 px glyph moved so its apex sits on the first line's cap top (B); or a 12 px glyph whose ink spans the cap height (C)". As the page put it: "The 14 px glyph kept, pushed down so its apex sits on the cap top (0.2 px under it) on all four rows, the nudge's on its title line. The base then hangs 2.75 px under the baseline, the glyph reading slightly low and heavy against the capitals. Heights unchanged; a one-line unconfirmed sentence would grow 1.5 px."

Proportion (lane brief): two drawn picks with their prototype patches (`fee-slip-2` P2b over `0dc22a9c5`, `glyph-align-1` B over P2b). No plan audit round; one Codex pass over the plan and the net diff after the build; no Opus review. Both patches re-applied by hand over #1831 and #1838 (P2b applies with offsets; B rides on it).

## Decision ledger

| ID | Decision | Why, and the alternatives |
|---|---|---|
| D1 | P2b as drawn: in `FeeSettingsCard.vue`'s Send branch, between `FeeMethodRadios` and `FeePriorityRow`, a `role="status" aria-live="polite" aria-atomic="true"` region (`send-fee-sheet-warning-live`) mounted with the card and hidden while empty (`:empty`), `padding-bottom: 12px`; inside it, while the `warning` prop holds text, the block (`send-fee-sheet-warning`), its glyph, the sentence and the fix. The text comes from `send.vue` as `feeWarning(facts, payeeSentenceName)`, the review's long words. | The prototype (`fee-slip-2` `cbbcde07f`). The card cannot word the warning itself: the destination side and the recipient's name live on the page, so the page hands it the one string the review shows. The card is mounted for the page's life and only teleported into the sheet, so the region exists before any warning lands (P2b: "a plain mounted one"). |
| D2 | The fix: `send-fee-sheet-warning-fix` ("Pay it from private Fee Juice") while `remedyMethod` holds; it runs `applyRemedy()`, then after the render moves focus to the radio it picked (`methodSelector.focus()`). Otherwise the bridge link `send-fee-sheet-warning-bridge` ("Get private Fee Juice", `FEE_JUICE_BRIDGE_URL`, new tab). | The page's rule for the same fix (`PublishLine`'s `remedy`, from the card's `remedyMethod`), so the two never offer different fixes. The pressed button leaves with the warning; focus would fall to the body. |
| D3 | The page's warning style has one source: `.warning_body` and the fix's `.fix` move from `PublishLine.vue` into `publish-mark.module.css` as `warning_body` and `warning_fix`, beside `warning_box` and `warning_mark`. `PublishLine` and the sheet's block use `mark.*` (the module imported, as `SendReviewSheet` already does). Declarations unchanged. | The prototype copied four rules into `FeeSettingsCard` that must stay identical to the page's ("in the page's warning style"); a copy drifts. Rejected: a shared `FeeWarning.vue` composite, an L3 component (and its ten-case test minimum) for eight template lines whose testids and handlers differ per caller. |
| D4 | The page's half as the frames show it: `feeWarningShort(facts)` in `publish-facts.ts` ("Paying the fee from public Fee Juice shows your address." / "… ties this payment to your address."), shown by `PublishLine` with the same fix; the sentence still yields to it. The review keeps `feeWarning`'s long words. | P2's page half, kept by every P2 option and drawn on page 169 (`fs2-warn-card`). The prototype also computed `feeWarning` in `PublishLine` only to hide the sentence; `feeWarningShort` is non-null exactly when `feeWarning` is (`you === "exposed"`), so that second computation goes. |
| D5 | Glyph rule B, as `glyph-align-1` `a7d63ad3c`: `.warning_mark` gains `margin-top: 2.5px` (rows 1, 2 and the review's `send-review-warning`, all composing it); row 3's two glyphs (`fee-juice-unconfirmed`, `fee-juice-shortfall`) take `.line_mark` (`margin-top: 1.5px`); the nudge's takes `.nudge_mark` (`align-self: flex-start; margin-top: 0.5px`). #1831's "centred on that line" comment goes. | The pick. Every other `name="warning"` glyph in the app (`ConfirmPopup`, `PayeeBlock`, settings pages and so on) is outside "the four rows" and unchanged; the `info` glyphs of `fee-init-degraded` and `fee-sponsor-short` share row 3's markup but are not warning glyphs, and stay. |
| D6 | Heights: B adds 1.5 px only where a row's text is one line, as the pick says (a one-line unconfirmed or shortfall sentence; a warning box whose sentence fits one line, which at 400 px none does). Measured on the captures: the sheet with the block at 517 px. | Rejected: `position: relative; top` offsets, which would keep a one-line row's height but are not the B the owner saw described; the 1.5 px is in the signed words. |
| D7 | The brief's "`send-keyboard.test.ts`'s Tab walk gains the fix" does not hold: the smoke wallet holds no Fee Juice (its node stub refuses every call), so Public Fee Juice is a disabled row and no warning can rise there. The real-browser Tab step goes into `network/fee-methods.test.ts`'s warned private send instead (public Fee Juice held, private read zero, so the fix is the bridge link): open the sheet, pick Public Fee Juice, focus its radio, one Tab lands on `send-fee-sheet-warning-bridge`, Done. `send-keyboard.test.ts` runs unchanged: its walk (radio, then the chosen priority) is the proof that the empty region adds no Tab stop. | jsdom has no sequential focus navigation, so "the next Tab stop after the radios" needs a browser; `fee-methods` already reaches the warned state, so this costs about a second inside an existing scenario, no new one. A smoke fixture that fakes a Fee Juice balance would be a new stand-in for one assertion. |
| D8 | Accessibility (the owner's 2026-10-19 delegation): the fix is a native button (or link) with the 2 px accent ring on `:focus-visible`, the first Tab stop after the radio group; the region is a plain mounted polite status region, empty while there is no warning, so no Tab stop and no space; the glyph stays `aria-hidden`. | P2b's own words; the house rules. |

## UI impact

- **Fee sheet on Send** (`FeeSettingsCard.vue`): before, no warning in the sheet (the page alone carries it); after, with Public Fee Juice paying a private send, the warning block under the whole WHO PAYS THE FEE group, 12 px below the last row and above PRIORITY, in the page's warning style (fill, yellow bar, glyph, the long sentence, PAY IT FROM PRIVATE FEE JUICE or GET PRIVATE FEE JUICE), no border. Sign-off **P169-01 = P2b**, quoted above.
- **Send page warning** (`PublishLine.vue`): before, the long sentence; after, the short one with the same fix, as drawn on page 169. Sign-off **P169-01 = P2b** (its page half).
- **The warning glyph** on the page warning, the sheet's block, the review's warning, the sheet's unconfirmed and shortfall rows and the Fee Juice nudge: the 14 px glyph moved down so its apex meets the first line's cap top. Sign-off **P175-01 = B**, quoted above, which also answers P169-01's note.
- Nothing else: no other copy, testid or role changes; the review's words, tooltips and the glossary are unchanged.

## Security & Adversarial Considerations

Display only. The sheet's sentence is `feeWarning`'s constant text plus the recipient's name already passed through `sentenceName` (`send.vue:283`), rendered by interpolation, never HTML; the same string the review shows today. The fix applies only the card's own `remedyMethod` (the derived PrivateFPC, never a sponsor), the page's rule. The bridge link is the constant `FEE_JUICE_BRIDGE_URL` with `rel="noopener noreferrer"`. No storage, message, permission, secret, dependency or log line changes.

## Phase 1: the block, the page's words, glyph B and their tests

1. `apps/extension/src/components/composite/send/publish-facts.ts`: `feeWarningShort` (D4). `.../send/publish-mark.module.css`: `warning_body`, `warning_fix` (D3); `.warning_mark` margin (D5). `.../send/PublishLine.vue`: the short words, `mark.*` classes (D3, D4).
2. `apps/extension/src/popup/components/modules/send/FeeSettingsCard.vue`: the `warning` prop, the region and block, `onWarningFix` (D1, D2); `.line_mark`, `.nudge_mark` (D5). `apps/extension/src/popup/pages/send.vue`: `feeWarningText` into the card.
3. Tests:
   - `publish-facts.test.ts`: `feeWarningShort`'s two sentences; non-null in exactly the cells where `feeWarning` is.
   - `PublishLine.test.ts`: the red test fee-slip-2 recorded ("a private send paid from public Fee Juice is the warning…") now pins the whole short sentence exactly (`toBe`, tighter than its old `toContain`); the private-to-public sentence beside it.
   - `FeeSettingsCard.test.ts`: on a private send with Public Fee Juice picked and `warning` set, the region sits between the group and the priority row and holds the block, with the fix when private Fee Juice covers the fee and the bridge when it does not; with `warning` null the region is mounted and empty (the success control); the fix picks Private Fee Juice, then focuses the radio; one assertion per shared rule that its class is on the glyph (`warning_mark` on the block's, `line_mark` on row 3's, `nudge_mark` on the nudge's).
   - `send.integration.test.ts`: the `settled` reader also requires the sheet's block exactly when the page's `you` is exposed, across the sweep and the transitions (the real card, the real page).
   - `network/fee-methods.test.ts`: D7's Tab step.
   - Deviation, the tree wins: `src/popup/pages/send.test.ts` also pinned the page's long words (`toContain`); now the whole short sentence, exact.

**Validation gate** (retry 0, one command at a time, from the worktree root): `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run --cwd apps/extension test:components`; `bun run check:plans` after staging; then from `apps/extension`, the smoke build and `bun run test:e2e -- tests/e2e/send-keyboard.test.ts tests/e2e/send-fee-privacy.test.ts --retry=0` on Chrome, then the same on Firefox (`NULO_E2E_BROWSER=firefox`, after the Firefox smoke build); then from the root one proverless run `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/fee-methods.test.ts tests/e2e/network/fee-sponsor-funding.test.ts` (the two of the six page-warning specs that open the sheet), then `fee-methods` alone under `NULO_E2E_BROWSER=firefox` (D7 adds a Tab assertion, and Tab order is where the browsers can differ). Pass: every command exits 0; the new pins fail on the base; no assertion loosened.

## Phase 2: captures and the PR

1. The two render kits copied into the lane's scratch dir (never edited in place); the nudge's capture-only override applied around the run and restored, never committed. Proverless `agent.sh` runs at 400 x 600, 2x, light and dark: one at the base for `fsb2-sheet-before` (Public Fee Juice picked: no block, the glyph as built), one at the build for `fsb2-sheet-after`, `-focus` (one Tab from the radio, the ring on the fix), `-private` (after the fix: Private Fee Juice picked, no block), `fsb2-page-after`, `fsb2-review-after`, `fsb2-nudge-after` (forced, labelled), and the 3x zooms `fsb2-page-zoom`, `fsb2-sheet-zoom` (row 2 over row 3, raised through the relay), `fsb2-nudge-zoom` with the cap-top and baseline guides. Each run records every row's height and the glyph's apex against the cap top.
2. `captions.json` beside the frames (keys `<id>-light`, `<id>-dark`, one sentence each, the point first).

**Validation gate.** `git status` clean after each run (no spec, no override); every frame in both themes; the sheet with the block at 517 px; apex within 0.5 px of the cap top on every row; rows 1 to 4 keep their measured heights.

## Delivery

One PR from `fee-slip-build-2-a1` (off `origin/dev`, carrying the plan commit) to `dev`, opened ready, no label. Title (90 characters): `fix(send): the fee sheet's warning under the payer group, the warning glyph on its cap top`. The body quotes both picks and the note under `## Sign-off`, embeds the sheet before/after pair from `pr-captures/fee-slip-build-2/` (committed in one commit, removed in the next), lists every difference from the P2b and B frames under `## Deviations`, the accessibility call (D8), the measured heights, the gates with outcomes, and the D7 step's measured cost (no scenario added). No `Closes` line. Merging is the orchestrator's.

## Post-implementation

Execution contract: this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `33906a052`. Plan-specific values:
- Step 1: `code_review: off`, so absent.
- Step 2, bounded work: after Phase 1 is green, ONE `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol` over this plan and `origin/dev...HEAD`, asking also about the Tab order, the live region, every row's height, the shared rule reaching the five sites and nothing else, and the updated test not being loosened. Rerun only the gates a fix touches. A second round only if the first says anything but approve (`resume-codex.sh`; hard stop at three). No Opus review.
- Step 3: `gh pr create` as Delivery says; `gh pr checks <n> --watch` once.
- Step 4, the close-out in the same PR's final commits, after merging `origin/dev` in: Outcome, lessons, `STATUS.md` deleted, `git mv` into `archive/` in its own commit, the index line to `archive/index.md`.
- Step 5: teardown is the orchestrator's.

## Seeds (not run; the orchestrator owns the ELI5)

- `/goal`: Build fee-slip-build-2 per `implementations-plan/fee-slip-build-2/plan.md`: Phase 1 green, captures, one Codex pass, PR open with captures; stop before merge.
- `/loop`: Each firing, read `STATUS.md`, run the next unfinished step of `plan.md`, record its gate, stop at the open PR.

## Audit verdicts

No plan audit round (lane brief, Proportion).

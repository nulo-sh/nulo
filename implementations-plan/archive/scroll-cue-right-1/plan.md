---
plan: scroll-cue-right-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev at 35c580901
status: completed
---

## Outcome

- **Date:** 2026-11-16.
- **Status:** completed. Ships in the PR titled `fix(execute): the more-below button sits at the bottom right of the request`, which carries this close-out and `Closes #1820`. It lands on the owner's approve of its captures.
- **Shipped:** P157-02's "right". The execute window's more-below button sits at the bottom right of the request's scroll area (12 px up, 16 px plus the scrollbar gutter in), the Terms sheet's rule; nothing else visible changed. The `execute-steps` case pins no glyph and no control but a step row's blank end under it at first paint, steps shut or open, and after press 1; two presses still reach the parse warning.
- **Gates (retry 0):** at `6f0fd13af` (the code's final head; later commits are docs only): lint, typecheck:all, test (1045 files), test:components (104 files) and check:plans green; Chrome `execute-steps.test.ts` green, 12 passed and 2 shot-only skips, the case at 2.7 s. No Firefox run: no fixture or helper under `tests/e2e/fixtures/` changed.
- **Deviations:** D4 (a step's toggle edge meets the right corner, so the scan leaves out exactly that control).
- **Lessons:** none promoted (`lessons.md` is near its 8 KiB budget, and both notes in [`lessons/phase-1.md`](lessons/phase-1.md) are local to this case).
- **Known limits:** none.
- **Open items:** none.
- **Seeds retired:** the `/goal` and `/loop` seeds under Seeds.

# scroll-cue-right-1: the execute window's more-below button moves to the bottom right

#1822 put the page-109 "more below" button on the execute window at the bottom left (16, 12). With the steps shut, as the window opens, its bottom 5 px can clip the first letters of a heading at the fold (#1820, frame `scb1-args-shut-left`). Page 157 was signed on 2026-11-16 at 20:45 UTC, dev `f6290e89e`:

> **P157-02** (#1820) = Approve, note: "Feels like it'd be better at the right?"; the owner's answer in chat, 2026-11-16: **"right"**.

That is the pick and the whole visible budget: the button goes to the bottom right of the request's scroll area (the placement page 155 drew as `sc4-args-cue`), accepting that at first paint it can sit over the right-aligned argument values until the first scroll or press. Nothing else moves. One arc, one PR against `dev`, `Closes #1820`. The PR changes what users see, so the orchestrator lands it on the owner's approve of its captures.

Proportion (lane brief): a placement change on one shell, drawn and measured before. No plan audit round, no Opus. One Codex pass over the plan and the net diff after the gates. Recon: [`recon.md`](recon.md). Owner asks: [`OWNER-ASKS.md`](OWNER-ASKS.md) (none).

## Decision ledger

| ID | Decision | Why, and the alternatives |
|---|---|---|
| D1 | `.more_below` in `execute/index.vue` drops `left: 16px`; the button takes `:style="{ right: \`${16 + moreGutter}px\` }"` from `useMoreBelow`'s `gutter`, exactly as `LegalAcceptanceSheet.vue` does. Bottom 12 px, `z-index: 1`, the frame, the marks, the 48 px end room and the testid stay. | The brief: mirror the sheet's rule. The scroll area has `scrollbar-gutter: stable`, so where scrollbars take space the button clears them; with overlay scrollbars the gutter is 0. The prototype `b37363ab5` had the same expression. A CSS-only `right: calc(16px + …)` cannot read the gutter. |
| D2 | The e2e case in `execute-steps.test.ts` pins, at first paint with the steps shut and then open, no control and no glyph (`svg`) under the button; text is no longer pinned there. A success control brings a control under the button and proves the scan reads it. Two presses with the steps open still bring the parse warning into view, and the button leaves. | The brief. At the right the values column may sit under the button, the trade-off the owner accepted; asserting text-free would pin the opposite of the pick, asserting nothing would let a control slip under it. The left case's text control (the parse-warning line) proved the text branch, which no longer gates anything; the controls branch is what the case now asserts, so its control must exercise that branch. |
| D4 | Deviation from D2 and the brief, from the Phase 1 measurement: with the steps open, step 3's toggle row (a `StepRow` button spanning the card, x 53–377) ends about 2 px into the button's top edge. The case's scan therefore leaves out a step's toggle (`coveredControls`) and still counts every other control and every glyph, the toggle's chevron included. The success control levels step 4's toggle (below the fold) under the button and reads it. | Asserting "no control" would pin a geometry the pick itself draws: any toggle row that lands at the fold meets the right corner, and only its blank right end can sit there (its chevron ends its sentence, and an svg still reds). Dropping the control check would let a chip, a raw-values toggle or a chevron slip under it. A pixel bound on the overlap would break on Firefox's 1/60 px layout. The left corner was clear of the toggles by 1 px, which is why the old case could say "no control". Put to the Codex pass. |
| D3 | Accessibility (the owner's 2026-10-19 delegation): nothing changes. `ScrollMoreButton` stays `tabindex="-1"` with its `mousedown` prevented, its focus ring and its click-through fade; no Tab stop moves. | Placement only. |

## UI impact

The sign-off is **P157-02 = Approve, "Feels like it'd be better at the right?", and the owner's answer, "right"**, quoted above.

- **Execute window** (`popup/windows/execute/index.vue`): the more-below button moves from the bottom left (16, 12) to the bottom right (16 px plus the scrollbar gutter in, 12 px up) of the request's scroll area. At first paint it can sit over the right-aligned argument values (on `batch` with the steps open, step 3's From and To) until the first scroll or press. Measured under Phase 1, step 3.
- Nothing else: no copy, row, role, tooltip, stored key, mark, end room or Tab stop changes. The Terms sheet and onboarding are untouched.

## Security & Adversarial Considerations

- **Approval surface.** The button stays inside `.frame`, which ends above the request-log row and `DappApprovalFooter` (Confirm, Reject); it is absolute in that frame, so at no scroll can it reach the footer. It shows only while more than 48 px is left and lets clicks through while it fades. The Codex pass is asked to confirm.
- **dApp content.** A dApp shapes the payload, so it decides what lands under the corner at first paint; at the right that is typically a value a person checks. It cannot pin it there: any scroll moves the content, and the button leaves at the end. The e2e proves no control or glyph the wallet draws on `batch` sits under it at first paint.
- No storage, permission, secret, dependency, listener or log line changes.

## Assumptions

**Facts** (checked at `35c580901`):
- F1. #1820's claims hold at HEAD: the rule is `left: 16px; bottom: 12px` inside the non-scrolling `.frame`; the footer sits outside it.
- F2. The prototype commits `b37363ab5` (right) and `119a45227` (left) still resolve; `b37363ab5` placed the button with `right: 16 + gutter`.
- F3. `collapsing-hero.scan.test.ts` pins only the shell's `useMoreBelow(` call and the testid, so it needs no edit.
- F4. No other spec reads `execute-scroll-more` (`git grep`).

**Asks.** None.

## Phase 1: the placement, the e2e case, the captures, the PR

1. Branch `scroll-cue-right-1-a1` off `origin/dev` carrying this plan's commit.
2. Change map:
   - `apps/extension/src/popup/windows/execute/index.vue`: take `gutter` from `useMoreBelow`, bind the button's `right`, drop `left` from `.more_below`, rewrite its comment as the invariant (D1).
   - `apps/extension/tests/e2e/execute-steps.test.ts`: the case and its comment, per D2.
3. Measure through the smoke harness (a scratch probe, never committed), with `elementsFromPoint` at the button's centre and corners and rect intersection against every control, glyph and text line, on `batch` at 400 × 800: the steps shut and open at first paint, and after press 1. The result goes here and in the PR body.

   **Measured** (Chrome, 2×, gutter 0; the button at x 348–384, y 679–715; the footer starts at y 744, the scroll area ends at 727):
   - Steps shut, first paint: nothing. No control, glyph or text line meets it; its centre is over the authorizations block's blank right side and its right edge over the card's border.
   - Steps open, first paint: step 3's From and To values ("Account 1" x 309–371, "0x1e6f12..7a8b" x 262–371) and the top of "TST" in its Amount; the bottom 2 px of step 3's toggle row (y 635–681, blank there; its chevron is at x ≈ 314). No glyph.
   - After press 1 (scrollTop 188): step 1's values "Account 1" and "7"; no control or glyph. Press 2 reaches the end (scrollTop 843) with the parse warning in view, and the button leaves.
4. Captures at 400 × 800 (2×), light and dark, from the armed smoke build: `scr1-args-cue-right` (steps open, first paint), `scr1-args-shut-right` (steps shut, first paint), `scr1-args-end` (after the presses, the warning in view, the button gone), into the lane's scratch `shots/` with `captions.json`. The scratch spec is copied from scroll-cue-build-1's and deleted after.
5. The Codex pass (gpt-6.1-sol, high, read-only) over this plan and `git diff origin/dev...HEAD`: did anything but the corner change; does the e2e still pin no control or glyph under the button; can the button reach the footer at any scroll. A second round only if it does not approve.
6. Push; open the PR ready, no labels. Title (73 characters): `fix(execute): the more-below button sits at the bottom right of the request`. Body: the pick as sign-off, the measurement (the accepted trade-off), the D3 accessibility call, gates with outcomes, the first capture pair embedded from `pr-captures/scroll-cue-right-1/` (committed, then removed in the next commit), `Closes #1820`. Then `gh pr checks --watch` once.

**Gate** (retry 0, once, in order, from the root): `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run --cwd apps/extension test:components`; `bun run check:plans` (staged); then from `apps/extension`, Chrome, `NULO_E2E_EXECUTE_FIXTURE=1 bun run test:e2e -- tests/e2e/execute-steps.test.ts --retry=0`. No fixture or helper under `tests/e2e/fixtures/` changes, so no Firefox run; no full suite (CI's required lanes are the gate of record). Pass: every command exits 0. No red/green proof against the left rule: it has no control under it either, so the case's success control is what proves the scan reads.

**E2E budget.** No scenario is added; the one case changes its assertions and keeps its runtime (2.8 s at #1822; 2.6 s here).

**Gate run** (retry 0, at the arc's code commit): lint, typecheck:all, test (1045 files), test:components (104 files) green; `execute-steps.test.ts` on Chrome: the first run red on the case's own success control (it levelled step 3's toggle, which sits above the button, so the scroll clamped at 0 and nothing moved under it), fixed to step 4's toggle; the rerun green, 12 passed and 2 skipped (the shot-only cases), 49 s.

## Delivery and post-implementation

One arc, one PR. The Post-implementation standard (`implementations-plan/README.md` at `35c580901`) applies with the bounded-work clause: one Codex pass, then targeted verification. The close-out (Outcome, archive move, index line) goes in this PR's final commits after merging `origin/dev`. The orchestrator lands the PR and tears down the worktree.

## Seeds

- `/goal`: Ship P157-02's "right" on the execute window as this plan says; PR open, ready, checks green, close-out committed.
- `/loop`: check the PR's checks; on red, read the failure, fix at the cause or rerun one known flake, and stop when green.

## Audit verdicts

- Plan audit: none (the lane brief's proportion).
- Codex pass 1 (gpt-6.1-sol, high, read-only), over the plan and the net diff at `3efa90321`: `approve`. Only the corner changed, and the binding is the sheet's rule; D4 is proportionate and narrow (it cannot hide a chip, a chevron or a raw-values toggle), and the success control proves the scan is not vacuous; the button cannot reach the footer or the request-log row at any scroll, size or payload. One wording nit accepted: the case's title said "no control" although a step toggle's blank end is left out; renamed. Chrome `execute-steps` green again on the rename. No second round (the pass approved). Detail in [`lessons/phase-1.md`](lessons/phase-1.md).

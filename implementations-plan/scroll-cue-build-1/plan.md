---
plan: scroll-cue-build-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev at 1f94c0938
status: in progress
---

# scroll-cue-build-1: the more-below button on the three warning screens (B)

#1658: a footer action waited on a field below the fold with no cue. Page 109 signed the round "more below" button and #1666 shipped it on the ten screens of `CollapsingHeroLayout`. Lanes scroll-cue-4 and scroll-cue-5 prototyped the three screens that hide a warning, and page 155 was signed on 2026-11-16 at 19:08 UTC:

> **P155-01 = B** (no note). "The three warning screens only. The same button, on the Terms sheet (one press scrolls 111 px to the end and shows the hint whole), in the execute window and in onboarding, mounted in the shell so the Import profile page and the Terms gate both get it (one press shows the note, Import profile and the reuse link; on the Terms gate one press shows Continue and the hint whole). Two placements the build settles, drawn by scroll-cue-5: the execute button at the bottom left, since at the right it covered step 3's From and To, the values a person is checking; measured at the left, it sits over the step rail's line and the card's border with no control, text or glyph under it at first paint or after a press, and two presses reach the parse warning (the build can mark that line so one press does). The onboarding button at the window's corner, 268 px right of the column, over blank page (the column's edge is the alternative: a Note). What B still covers: at first paint on the Terms sheet the button overlaps the consent box's bottom-right corner by about 21 px. […]"

One arc, one PR against `dev`, `Closes #1658`. The twelve content-only screens stay as today: the pick is B, not A. The PR changes what users see, so it does not land on its own; the orchestrator lands it on the owner's approve of its captures. Start: the prototype commits `ff0a10655` and `119a45227`, cherry-picked. Recon: [`recon.md`](recon.md). Owner asks: [`OWNER-ASKS.md`](OWNER-ASKS.md).

Proportion (lane brief): a measured prototype made a build. No plan audit round, no Opus. One Codex pass over the plan and the net diff after the gates, on the brief's five questions plus D1 and D5 below.

## Decision ledger

| ID | Decision | Why, and the alternatives |
|---|---|---|
| D1 | `useMoreBelow(scroller, { barBottom })` in `src/composables/` (C0). `scroller` is an element ref or the literal `"document"`. It returns `shown` (more than `MORE_FOOTPRINT_PX` = 48 left), `gutter` and `press`. The press goes through `nextScrollTop` and respects `isCalm`. The prototype's `coveredBottom` edge is dropped. | A shell never switches between the document and an element, so a static literal replaces the prototype's `ref("document")` and its computed juggling. `coveredBottom` served A's nav and Send footer, and no B shell has an overlay inside its scroller, so it would be an option with no caller. This departs from the brief's "with … covered bottom", and the Codex pass is asked about it. |
| D2 | `nextScrollTop` and `NextSectionGeometry` move to `src/utils/next-scroll-top.ts` with their tests. `collapsing-hero.ts` keeps `revealMove` and the `COLLAPSING_HERO` key. | One rule for every shell. `src/utils/` is an auto-import dir, so the generated d.ts files gain the name. |
| D3 | `CollapsingHeroLayout` calls `useMoreBelow(computed(() => moreBelow ? scrollEl : null), { barBottom: header bottom })`. Its end room becomes `MORE_FOOTPRINT_PX - 20`. | The inline `showMore`, `FOOTPRINT_PX` and `useScrollRemaining` call go away. What is shown, the 28 px of room and the press stay identical: the four existing button cases pass unedited, and they prove the ten screens unchanged. |
| D4 | Each host keeps its own non-scrolling `.frame` and places the button with its own class: the sheet bottom right (`right: 16 + gutter`), execute bottom left (`left: 16px`), the layout as today. No shared `ScrollMoreFrame`. | The two new frame hosts sit at different corners, and the frames differ (`flex: 1` or not). A wrapper would need a side prop for one caller. This is the brief's "let the host's own class pick the side". |
| D5 | Execute marks as prototyped: `SendTxSummary`'s summary, its authorizations slot when it holds rows, and `OperationCard`'s leaves block, app-fee block and `FeeSettingsCard`. On `batch` with the steps open, two presses reach the parse warning. | With the steps closed, which is how the window opens, the warning shows at first paint on every fixture (scroll-cue-4). Marking the line alone moves nothing: the summary that holds it is the first section below the fold. One press would need the summary unmarked, which drops the "What this does" stop from every request to save one press in a state the person chose to open. The Codex pass is asked to challenge this. |
| D6 | End room: the sheet body's bottom padding goes 16 → 48, execute's sections 16 → 48, onboarding gets none. | Each host keeps the 48 px footprint blank after its last content. In onboarding the shell's 64 px bottom padding already does. |
| D7 | Onboarding mounts the button in `src/onboarding/app.vue` after the `RouterView`: `useMoreBelow("document")`, the button `position: fixed; bottom: 12px; right: 16px + gutter; z-index: 1`, testid `onboarding-scroll-more`. `pages/import.vue` stays as dev has it. | The pick: "mounted in the shell". The router resets scroll on each route, and the ResizeObserver on `body`'s children re-measures. Every modal layer sits above z 1: `Popup` ≥ 400, `Popover` 2005, toasts and dropdowns 2000, the passkey dialog and migration barrier 10000, tooltips 50000. |
| D8 | New testids `legal-sheet-scroll-more`, `execute-scroll-more`, `onboarding-scroll-more`. No existing testid moves. | `security.test.ts` reads the layout's `scroll-more`, which is unchanged. |
| D9 | Accessibility (the owner's 2026-10-19 delegation): `ScrollMoreButton` is untouched. It stays `tabindex="-1"`, its `mousedown` default stays prevented, it keeps its `:focus-visible` ring and its click-through while fading, and no Tab stop is added. | Page 109's button, a pointer shortcut. Keyboard users scroll as before. |
| D10 | E2E: two cases in `legal-acceptance.test.ts`, one in `execute-steps.test.ts` (Phase 2). The overlap scan stays local to the execute case. | No spec in the repo is "the onboarding spec": the Terms gate's cases live in `legal-acceptance.test.ts` (recon). |
| D11 | Execute with the steps shut: the build measured the window's opening state, which the page had not. On `batch` at 400 × 800 the button's bottom 5 px overlaps the top of "Leaves your account". The e2e asserts no control or glyph under the button in that state, and nothing at all with the steps open or after press 1. A success control proves the scan reads a line brought under the button. Owner ask A1; the left placement ships as signed. | Demonstrated (Phase 2, `scb1-args-shut-left`). No end room or mark moves a first-paint overlap, and moving the button is the owner's call. Asserting text-free in the shut state would pin a defect the signed placement causes; asserting nothing would let a control slip under it. |
| D12 | Onboarding in a 720 px wide window: the corner meets the 640 px column. On the phrase step at 720 × 900 the button covers about 12 × 27 px of I saved it. Owner ask A2; the corner ships as signed. At 1280 × 720 every page is clean, with 63–64 px of end room. | Demonstrated (Phase 3 probe, `scb1-onb-phrase-narrow`). No right-side placement clears the column below about 750 px. |
| D14 | Onboarding shows its button only while more than its 64 px end room is left (`remaining > 64`). The composable also returns `remaining`. | Codex round 1, demonstrated: with the 48 px rule the button showed over the last 16 px of blank room, against page 109's "hidden once the end is in view". Shrinking the shell's padding to 48 px would change every onboarding page; a composable option would serve one caller. |
| D13 | `execute-steps.test.ts`'s `tabbableCount` now skips a `tabindex="-1"` button. | Its selector counted every `button`, so the new button made 26 read 27. The same test's Tab walk passed, which shows the button is no Tab stop. The fix is at the helper's cause; no expected number moved. |

## UI impact

The sign-off is **P155-01 = B**, quoted above.

- **Terms sheet** (popup, `LegalAcceptanceSheet.vue`): the round button at the bottom right while more than 48 px is left. One press scrolls to the end (111 px at 360 × 600). The body's bottom room grows from 16 to 48 px. At first paint the button covers about 21 px of the consent row's corner, as the page states.
- **Execute window** (`execute/index.vue`): the button at the bottom left (16, 12), over the step rail's line and the card's border. The sections' bottom room grows from 16 to 48 px.
- **Onboarding** (every page whose document scrolls more than 48 px): the button at the window's bottom-right corner. On the Terms gate one press shows Continue and the hint whole. On Import profile one press shows the note, Import profile and the reuse link.
- Nothing else: no copy, row, role, tooltip, stored key or Tab stop changes. The ten layout screens are unchanged.

## Security & Adversarial Considerations

- **Approval surface.** The execute button sits inside the scroll frame, never over the footer that holds Confirm and Cancel, so it cannot stand in for or cover a decision control. It shows only while more than 48 px is left, and while it fades it lets clicks through.
- **dApp content.** A dApp shapes the payload, so it decides what scrolls under the corner. It cannot pin anything there: any scroll moves the content, and the button leaves at the end. The e2e scan proves that at first paint nothing the wallet draws on `batch` sits under it.
- **Listeners.** The element path detaches on a scroller swap and on scope dispose. The document path adds `window` scroll and resize listeners and a ResizeObserver, all removed by `onScopeDispose`. The sheet uses the element path, so nothing stays on `window` after it closes.
- No storage, permission, secret, dependency or log line changes. `snapshot.json` is untouched.

## Assumptions

**Facts** (checked at `1f94c0938`):
- F1. Since `9e2124ddb` only #1817 touched these files (`OperationCard.vue`'s fee row). The cherry-picks should apply with at most a small conflict there.
- F2. The brief's "six tests" for `nextScrollTop` did not hold: there are eight table cases and one two-press test (`collapsing-hero.test.ts`). All nine move.
- F3. `openOnboarding` sets 720 × 900, where the Terms gate does not scroll (it hides 156 px at 720 tall). The new onboarding case sets 1280 × 720.
- F4. Onboarding's `html` and `body` are `height: 100%`, so the document scrolls and `#app` grows with the content (`onboarding.scss`).
- F5. Existing onboarding specs click by DOM `click()` (`clickByTestId`), and `pointerClick` centres its target first. A corner button cannot cover what they press.
- F6. At 720 px wide the 640 px column runs to x 680, and the corner button spans about x 668–704. Measured in Phase 3 (D12).

**Asks.** A1 (D11) and A2 (D12) in [`OWNER-ASKS.md`](OWNER-ASKS.md). What ships now: both placements as signed.

## Phase 1: the composable, the moved rule, the layout and the three shells ✓

1. Cherry-pick `ff0a10655` and `119a45227` onto `scroll-cue-build-1-a1`; resolve by hand.
2. `apps/extension/src/utils/next-scroll-top.ts` (+ `.test.ts`, the nine cases moved); `components/composite/collapsing-hero.ts` and `.test.ts` lose them (D2).
3. `apps/extension/src/composables/useMoreBelow.ts` (+ `.test.ts`), per D1.
4. `apps/extension/src/components/composite/CollapsingHeroLayout.vue`, per D3.
5. The shells and marks, per D4–D8:
   - `components/LegalAcceptanceSheet.vue` and `components/composite/LegalConsent.vue`;
   - `popup/windows/execute/index.vue`, `SendTxSummary.vue` and `OperationCard.vue`;
   - `onboarding/app.vue`;
   - the regenerated `src/types/auto-imports.d.ts` and `.eslintrc-auto-import.json`.
6. Tests:
   - `useMoreBelow.test.ts`, at least ten cases: the element path's show and hide across 48, gutter, press smooth and calm, `barBottom`, a null scroller, a scroller swap; the document path's window scroll, gutter, press, the body's children observed; dispose removing every listener and disconnecting the observer.
   - `collapsing-hero.scan.test.ts`: one row per shell (its `useMoreBelow(` call and button testid), and the mark counts of `LegalConsent.vue`, `SendTxSummary.vue` (the bound mark included) and `OperationCard.vue`.
   - `CollapsingHeroLayout.test.ts` and `onboarding/app.test.ts` green, unedited.

**Gate** (retry 0, in order, from the root): `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run --cwd apps/extension test:components`. Pass: all exit 0. The new tests fail on the base, and every existing assertion passes unedited.

## Phase 2: the three e2e scenarios, both browsers ✓

| Case | Failure mode it proves | Why no cheaper layer | Estimate |
|---|---|---|---|
| (i) `legal-acceptance.test.ts`, the Terms sheet at 360 × 600, `missing` | A real-pointer press keeps focus on the consent box, the hint ends whole and uncovered, the button leaves | Layout, hit testing and focus need a browser; jsdom lays nothing out | ~15 s (launch and register dominate) |
| (ii) `execute-steps.test.ts`, `batch`, steps open, 400 × 800 | At first paint (steps closed, then open) the button's box meets no control, text line or glyph; two presses bring the parse warning in view and the button leaves | Geometry of a dApp-shaped payload under a fixed corner | ~6 s (shares the file's fixture) |
| (iii) `legal-acceptance.test.ts`, the onboarding Terms gate at 1280 × 720 | One press shows Continue and the hint whole and the button leaves; the document path works in a real window | Document scroll, fixed positioning, routing | ~8 s (fresh launch) |

**Gate** (retry 0, one run at a time, from `apps/extension` with `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_EXECUTE_FIXTURE=1 NULO_E2E_CSP_REPORT=1`):
1. Chrome: `bun run test:e2e -- tests/e2e/security.test.ts tests/e2e/legal-acceptance.test.ts tests/e2e/execute-steps.test.ts tests/e2e/rows.test.ts tests/e2e/token-list.test.ts tests/e2e/shipped-token-list.test.ts --retry=0`. These are the specs that read `scroll-more` or pass the onboarding gate.
2. Chrome: `type-roles.test.ts -t "onboarding's every page"`, the one test that visits the gate.
3. Firefox: `NULO_E2E_BROWSER=firefox`, the three new cases by `-t`.

No network spec reads the button. Pass: every run exits 0, and each case's measured time is recorded here.

Measured at `a86314fcb`, in-file on Chrome then filtered on Firefox: (i) 6.7 s and 11.7 s; (ii) 2.8 s (the file's fixture shared) and 12.5 s (fixture setup included); (iii) 4.9 s and 9.7 s. Every gate run exited 0 once D13 landed; `shipped-token-list` skips off an artifact run, as on dev.

## Phase 3: probe, captures, the Codex pass, the PR

1. A scratch probe and capture spec, copied from scroll-cue-5's `spec/` into `tests/e2e/`, run with the same env plus `NULO_E2E_SHOT_DIR`, then deleted and never committed. It probes:
   - the onboarding pages the shell now reaches (Welcome, Create's two tabs, the full-backup import, the phrase step, Ready) at 1280 × 720 and at the harness's 720 × 900: the end footprint is blank, and no control or text sits under the button at first paint;
   - the execute fixtures `raw`, `listed` and `deep` with the steps closed.

   A defect is fixed in end room or marks, or goes to `OWNER-ASKS.md`.
2. Frames, light and dark, into `~/.cache/nulo-backlog/scroll-cue-build-1/shots/` with `captions.json`:
   - `scb1-terms-cue` and `scb1-terms-end`;
   - `scb1-args-cue-left` and `scb1-args-end`;
   - `scb1-onb-terms-cue` and `scb1-onb-terms-end`;
   - `scb1-import-cue`.
3. The one Codex pass (gpt-6.1-sol, high, read-only) over this plan and `git diff origin/dev...HEAD`. It is asked the brief's five questions (listeners end with the scope on every shell; the 48 px footprint is blank at each end; nothing sits under the execute button at first paint or after press 1; the onboarding button is never over a modal or a Tab stop; the ten layout screens are unchanged), plus D1 and D5. Take its findings and rerun only what a fix touches. A second round runs only if it does not approve.
4. `bun run check:plans` staged, push, then open the PR ready without labels. Title (88 characters, lower case for commitlint's `subject-case`): `feat(popup): the more-below button on the terms sheet, the execute window and onboarding`. The body carries the pick as sign-off, page 109 and #1666, the twelve screens left as they are, the D9 accessibility call, gates with outcomes, each browser's smoke wall-clock before and after from CI's job envelopes, the Terms pair embedded from `pr-captures/scroll-cue-build-1/` (committed, then removed in the next commit), and `Closes #1658`. Then `gh pr checks --watch` once.

## Delivery and post-implementation

One arc, branch `scroll-cue-build-1-a1` off `origin/dev` carrying this plan's commit. The Post-implementation standard (`implementations-plan/README.md` at `1f94c0938`) applies, with the bounded-work clause: one Codex pass, then targeted verification. The close-out (Outcome, archive move, index line) goes in this PR's final commits after merging `origin/dev`. The orchestrator lands the PR and tears down the worktree.

## Seeds

- `/goal`: Ship P155-01 = B on the Terms sheet, the execute window and the onboarding shell as this plan says; PR open, ready, checks green, close-out committed.
- `/loop`: check the PR's checks; on red, read the failure, fix at the cause or rerun one known flake, and stop when green.

## Audit verdicts

- Plan audit: none (the lane brief's proportion).
- Codex round 1, over the plan and the net diff at `1a6de01d6`: `changes`. Four findings were accepted and fixed in `96b3ef5be`: onboarding's end room (D14), test scopes stopped, the steps-shut exemption narrowed (D11), and one comment removed. D1, D5 and the brief's five questions were approved.
- Codex round 2, resumed over `96b3ef5be`: `approve`. Detail in [`lessons/phase-1.md`](lessons/phase-1.md).

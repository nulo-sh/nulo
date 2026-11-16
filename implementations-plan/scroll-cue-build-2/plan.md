---
plan: scroll-cue-build-2
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev at 35c580901
status: in progress
---

# scroll-cue-build-2: the onboarding more-below button hidden where the window is narrow (H)

#1822 put the page 109 "more below" button on the onboarding shell at the window's bottom-right corner. At 720 × 900 it covers the right end of the primary button on the phrase step (I saved it, 12 × 27 px) and on Import profile (12 × 25 px); at 1280 × 720 it marks a hidden way on over blank page on four pages (scroll-cue-6's measurements). Decision page 158 was signed on 2026-11-16 at 21:10 UTC, no note:

> **P158-01 = H.** "The onboarding more-below button: as shipped at the window's corner (C), removed (N), hidden below 750 px wide (H), at the column's edge (E), or inset beside the column when narrow (I)" = H. "Hidden when narrow: the corner as shipped at wide windows, nothing below 750 px wide (one media rule in the prototype; a build gates it in script from the room beside the column, so a classic 15 px scrollbar does not bring the overlap back). Both collisions go. At 720 × 900 the phrase step's countdown and its off switch sit below the fold unmarked, as before #1822. The lane's recommendation."

One arc, one PR against `dev`, `Closes #1821`. The PR changes what users see, so it does not land on its own: the orchestrator lands it on the owner's approve of its captures. Start: prototype `4b7416948` (a `@media (max-width: 749px)` rule), rebuilt as a script gate. Recon: [`recon.md`](recon.md). Owner asks: [`OWNER-ASKS.md`](OWNER-ASKS.md) (none).

Proportion (lane brief): a one-rule change, drawn and measured. No plan audit round, no Opus. One Codex pass over the plan and the net diff after the gates.

## The threshold

Every onboarding page renders `OnboardingPage`, a column of at most 640 px centred inside the shell's symmetric 24 px padding, so the room right of the column is `(clientWidth − 640) / 2`. The button needs its 36 px, its 16 px inset from the window's edge, and the same 16 px again from the column: 68 px. So it shows only at **`clientWidth ≥ 776`**, where it stands 16 px clear of the column.

- `clientWidth` excludes a classic scrollbar: the gate holds at a 776 px window with overlay scrollbars (the harness, macOS), 791 px with Chrome's 15 px classic bar and 788 px with Firefox's 12 px one (probe, D3).
- **Claims that did not hold.** The lane brief's "about 640 + 2 × 16 + 36 = 708 px" counts one side of a centred column; centred, the same terms give 776. The shell's padding adds nothing above 688 px, since it sits inside that room. The prototype's 750 left 3 px to the column; the narrower reading (52 px of room, 744) leaves 0 px and lays the button's 12 px shadow over the column's control (D1).

## Decision ledger

| ID | Decision | Why, and the alternatives |
|---|---|---|
| D1 | `moreShown = moreLeft > 64 && (width − 640) / 2 ≥ 16 + 36 + 16`, in `app.vue`. | The brief: "the room beside the 640 px column is at least the button's footprint plus its 16 px inset". In this codebase a footprint already counts the edge offset (`MORE_FOOTPRINT_PX` = 36 + 12), so the horizontal footprint is 36 + 16 and the inset again makes 68, the brief's own terms (two 16s and a 36). Rejected: 52 px (744), which puts the button flush against a full-width primary button at the threshold. Codex is asked. |
| D2 | `useMoreBelow` returns `width`, the scroller's client width (scrollbar excluded), measured with `remaining` and `gutter` on both paths. | The document path already re-measures on scroll, resize and `body`'s children resizing, which also hears a classic scrollbar appear as content grows (no window resize fires then). A listener in the shell would miss that and duplicate the composable's. Both paths return it so the return keeps one shape; the element path's is one line. |
| D3 | The corner's right offset is `16px`, not `16 + gutter`. | **Demonstrated** (scratch probe, a static page copying the shell's layout, `--hide-scrollbars` dropped in Chrome 155 and `ui.useOverlayScrollbars: 0` in Firefox 158): a fixed box's `right` already counts from the root's scrollbar. At 1280 wide, `right: 16px` ends at `clientWidth − 16` (1249 of 1265; 1252 of 1268) and `16 + gutter` at `clientWidth − 31` (`− 28` in Firefox). Visible only with a classic scrollbar: the corner moves 15 (12) px right, to the 16 px every overlay-scrollbar system already shows. The brief authorizes it (point 3). The Terms sheet and `CollapsingHeroLayout` keep `16 + gutter`: their buttons are absolute in a frame whose scroller's bar does take room. |
| D4 | The 640 is a constant in `app.vue`; `app.test.ts` pins it to `OnboardingPage.vue`'s `max-width: 640px`, read from source. | Rejected: one TS constant bound into `OnboardingPage`'s CSS. No SFC here uses CSS `v-bind`, and its test pins no inline style; it would change a component every page renders to share one number. The pin fails the day the column changes. |
| D5 | The gate lives in `shown`, so the button never mounts while narrow. | `ScrollMoreButton` nudges on its first show only; under `display: none` it would mount and spend that nudge unseen. Its own tests pin the first-show nudge. |
| D6 | E2E: one assertion pair in `onboarding-tab.test.ts`'s happy path, no new scenario. On the phrase step at 1280 × 480 the button is drawn (success control); back at 720 × 900, with more than 64 px still below the fold, it is gone. S13 in `legal-acceptance.test.ts` stays as it is. | That test already runs the phrase step at both widths. The page-height check keeps the assertion about the width gate, not the end room. jsdom lays nothing out, so only a browser proves the gate reads the width the window really has. |
| D7 | Accessibility (the owner's 2026-10-19 delegation): no change. The button stays `tabindex="-1"` with its mousedown default prevented and its focus ring, and adds no Tab stop. | Page 109's pointer shortcut. A keyboard user scrolls as before at every width. |

## UI impact

The sign-off is **P158-01 = H**, quoted above.

- **Onboarding shell, narrow windows** (every page): no more-below button where the document's client width is under 776 px (a window under 776, 791 or 788 px, D1). The phrase step's countdown and its off switch sit below the fold unmarked at 720 × 900, as the pick says.
- **Onboarding shell, wide windows**: the corner as shipped. With a classic scrollbar it now stands 16 px from the scrollbar, not 16 px plus the scrollbar's width (D3).
- Nothing else: the Terms sheet, the execute window and the ten `CollapsingHeroLayout` screens are untouched; no copy, row, role, testid, stored key or Tab stop changes.

## Security & Adversarial Considerations

No new surface. The gate reads layout only; no storage, permission, message, dApp input, secret or log line changes, and `snapshot.json` is untouched. Listeners are the composable's existing three, removed with the scope. The button only ever disappears in more windows, so it can cover nothing it did not cover before; at wide windows it sits over blank page, beside no decision control.

## Assumptions

- F1. jsdom's `documentElement.clientWidth` is 0, so the existing end-room case gains a wide width in its setup; its assertions stay as they are.
- F2. The harness's browsers draw overlay scrollbars (scroll-cue-6 measured gutter 0 in Chrome); the classic case is proven by the probe and the unit test, not the e2e.
- **Asks:** none.

## Phase 1: the gate, its tests, the captures and the PR

Branch `scroll-cue-build-2-a1` off `origin/dev` carrying this plan's commit.

**Change map**
1. `apps/extension/src/composables/useScrollRemaining.ts`: `width = current.clientWidth`, reset with the others (D2).
2. `apps/extension/src/composables/useMoreBelow.ts`: the document path measures `width = root.clientWidth`; `useMoreBelow` returns it.
3. `apps/extension/src/onboarding/app.vue`: the gate (D1, D4, D5) and the static `right` (D3).
4. Tests:
   - `src/composables/useMoreBelow.test.ts`: the document case reads `width` 1265 beside its 15 px gutter; the scroller case 352.
   - `src/onboarding/app.test.ts`: the end-room case at a 1280 px client width; a new case that holds 280 px below the fold and steps the client width 775 → 776 → 775 by resize, with `innerWidth` 15 px wider each time: hidden, shown, hidden, and `right: 16px` while shown; the column pin (D4).
   - `tests/e2e/onboarding-tab.test.ts`: the D6 pair.
5. Scratch, never committed: the capture spec from scroll-cue-6's kit, run through the smoke harness on the armed build, light and dark, into `~/.cache/nulo-backlog/scroll-cue-build-2/shots/` with `captions.json`: `scb2-terms-wide`, `scb2-phrase-wide` (1280 × 720), `scb2-phrase-narrow`, `scb2-import-narrow` (720 × 900), `scb2-edge` (the Terms gate at 776 × 720). Each phrase step is a fresh throwaway profile.

**Gate** (retry 0, once, in order, from the root): `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run --cwd apps/extension test:components`; `bun run check:plans` after staging. Then the armed smoke build (`global-setup-smoke.ts`'s `ARMED_BUILD`) and, from `apps/extension` with `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_EXECUTE_FIXTURE=1 NULO_E2E_CSP_REPORT=1`: `bun run test:e2e -- tests/e2e/legal-acceptance.test.ts tests/e2e/onboarding-tab.test.ts --retry=0`, Chrome, then the Firefox build and the same with `NULO_E2E_BROWSER=firefox`. Pass: every command exits 0; the new unit cases fail on the base. No full suite: CI's five required lanes are the gate of record. No scenario is added, so no wall-clock comparison is owed.

**Measured** at `6160f1f38`: lint, typecheck:all, test (1045 files) and test:components (104 files) green; the three new unit cases fail on the base code. Chrome: both smoke files green, 24 tests, the happy path 7.1 s and S13 4.4 s. Firefox: green, 24 tests, 17.2 s and 7.1 s. Captures (Chrome, the armed build): the corner at x 1228–1264 at 1280 wide, as scroll-cue-6 measured it shipped, with nothing under it on the Terms gate, the phrase step or Import profile; at 776 × 720 and 776 × 900 the button spans x 724–760 beside a column ending at x 708, 16 px clear; at 775 and at 720 nothing is drawn, on the phrase step (115 px hidden) and Import profile (135 px) too.

Then the one Codex pass (gpt-6.1-sol, high, read-only) over this plan and `git diff origin/dev...HEAD`, asked about the threshold's derivation under a classic scrollbar (D1), the nudge never spent unseen (D5), nothing changing at wide windows but D3, and the right-offset finding (D3), with the standard's two verbatim rules. A second round only if it does not approve. Then push, and open the PR ready without labels. Title (84 characters; the brief's suggestion runs 94): `fix(onboarding): the more-below button hides where no room is left beside the column`. The body carries the pick as sign-off, the threshold and D3, the D7 accessibility call, the gates with outcomes, the narrow pair embedded from `pr-captures/scroll-cue-build-2/` (committed, then removed in the next commit), and `Closes #1821`. Then `gh pr checks --watch` once.

## Delivery and post-implementation

One arc, one PR. The Post-implementation standard (`implementations-plan/README.md` at `35c580901`) applies with its bounded-work clause: one Codex pass, then targeted verification of material fixes. The close-out (Outcome, archive move, index line) goes in this PR's final commits after merging `origin/dev`. The orchestrator lands the PR and tears down the worktree.

## Seeds

- `/goal`: Ship P158-01 = H on the onboarding shell as this plan says; PR open, ready, checks green, close-out committed.
- `/loop`: check the PR's checks; on red, read the failure, fix at the cause or rerun one known flake, and stop when green.

## Audit verdicts

- Plan audit: none (the lane brief's proportion).

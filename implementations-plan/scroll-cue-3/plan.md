---
plan: scroll-cue-3
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev 040334f53
---

# A "more below" button on the screens whose content runs past the fold

Part of #1658. One arc, one PR to `dev`. Recon: [recon.md](recon.md).

## Outcome & Quality Bar

- **For whom**: a person in the 360 × 600 toolbar popup on Delete profile, Change password or New profile, whose next field sits under the fixed footer while the footer's button stays disabled.
- **Excellent**: the button shows exactly while real content is below the fold and is gone once the end is in view; one press on Delete profile brings the name field above the footer; it never covers a control at the end, never takes focus from a field, and never moves under reduced motion or Disable animations.
- **Good enough**: no text, no per-screen tuning, no other shells (#1658 keeps Send, the Terms sheet, onboarding and the execute window).

## UI impact

The owner signed decision page 109 on 2026-11-04 (15:45 UTC, head `fa6913668`): **P109-01 = A**, "a round 'more below' button at the bottom right of the scroll area. It nudges twice when it first appears, lifts on hover, and a press scrolls to the next section (or to the end when a screen marks none); it hides once the end is in view. Under reduced motion: no nudge, no lift, and the press jumps instead of scrolling smoothly." **P109-02 = A**, "A, and if A does not include the three blocked today, please include the blocked ones too, obviously." P109-03 does not apply (no visible text).

- The nine signed screens (Delete profile, Change password, New profile, Import profile, Import account, Unlock method, the three export pages): before, nothing marks the content below the footer. After, a 36 px round chevron button sits at the scroll area's bottom right while more than its 48 px footprint is left below. 28 px of empty room follows the last section (48 px with the section's own 20 px padding, D3), so a screen that fits today with less slack scrolls by that much blank room, with the button hidden.
- Restore again (`restore-again.vue`), the tenth screen on the layout, stays as today until the owner answers OWNER-ASKS.md Q1.
- No other surface changes. Home's balance animation keeps its behaviour (D6 only moves its helper).

## Assumptions

**Facts**
1. `CollapsingHeroLayout.vue` owns the scroller (`.wrapper`, `overflow: auto`, `scrollbar-gutter: stable`), a sticky `SubPageHeader` inside it (`z-index: 10`) and the footer `.bottom` outside it (`CollapsingHeroLayout.vue:88-120`).
2. Ten pages use the layout, not nine (recon); their section blocks are the element children of the layout's `.content`, after the hero (recon § The ten pages).
3. `leftToScroll` (`snackInset.ts:124`) and `isCalm` (`BalanceView.vue:129`) exist, both private.
4. jsdom has no `ResizeObserver`, `matchMedia` or `Element.scrollTo`; `snackInset.ts:169` guards the first.
5. `a11y-css.test.ts` pins reduced-motion and `.noanimations` rule bodies per file, since jsdom evaluates no media query.
6. Smoke e2e clicks with `element.click()` (`fixtures/dom.ts:266-281`), so the button cannot intercept an existing test's click.
7. The prototype (`worktree-scroll-cue-1`) overlapped Delete profile's "Confirm deletion" rule; its hide threshold (24 px) had no room behind it, so up to 24 px of content could stay hidden with the button gone.
8. `.noanimations` is already honoured inside `@nulo/design` (`packages/design/src/ui/Skeleton.vue:54`).

**Inferences**
- I1: a press that lands each section under the header, and pages down within a section taller than the view, is the owner's "scrolls to the next section"; a screen with no marks goes to the end, as signed.

**Asks**: Q1 in [OWNER-ASKS.md](OWNER-ASKS.md), Restore again. What ships now: Restore again unchanged.

## Architecture & Implementation

- **`useScrollRemaining(el: Ref<HTMLElement | null>)`** (new, `src/composables/useScrollRemaining.ts`, C0): returns `{ remaining, gutter }` refs. It attaches when `el` gets a value: a passive `scroll` listener, and one `ResizeObserver` on the scroller and its element children (the scroller's size and the content's height, which is the content-change signal). It re-attaches when `el` changes and detaches in `onScopeDispose`. `gutter` is `offsetWidth - clientWidth`. It exports `leftToScroll`, which `snackInset.ts` then imports.
- **`ScrollMoreButton.vue`** (new L2 in `@nulo/design/ui`, exported from `packages/design/src/index.ts`, added to `NULO_DESIGN_COMPONENTS`): props `shown`; emits `press`. A native `<button type="button" tabindex="-1" aria-label="Show more below" data-testid="scroll-more">` with `Icon name="chevron" rotate="90"`, inside a fade `<Transition>`. `@mousedown.prevent` keeps focus where it was. It nudges (two 0.6 s cycles) on its first show per instance. Hover lifts it 3 px. The leave phase has `pointer-events: none`. A 2 px accent ring on `:focus-visible` is present. Under reduced motion or `.noanimations` there is no nudge, lift or transition.
- **`nextScrollTop(g)`** (new, pure, `collapsing-hero.ts`): `g = { scrollTop, maxScroll, barBottom, viewBottom, sections: { top, bottom }[] }`, `h = viewBottom - barBottom`. Take the first section not visible within 1 px (`bottom > viewBottom + 1`). If its top is below the bar (`> barBottom + 1`), move by `min(top - barBottom, h)`: this aligns it under the bar when it is within one visible height and the clamp allows, else moves toward it. Otherwise it is taller than the view and already at the top, so move by `h`. With no such section, go to the end. Clamp to `[0, maxScroll]`. A press moves down by at most one visible height while a marked section remains, so no unseen part of a marked section is skipped.
- **Section marks**: `data-scroll-section` on each section container (the element that carries the section label) on the nine pages and the shared forms they render (`ImportSecretForm`, `ImportFullBackupForm`, `ImportMethodPicker`, `NewProfileCredentials`, `NewProfileMethodTabs`, `SecretUnlockSection`, `FilePasswordSection`). No nested marks: a field inside a marked section is not a stop (D9).
- **Layout wiring**: a boolean prop `moreBelow` (default off; the nine pages pass it, D1). A `.frame` (`position: relative`) wraps the scroller; the button sits in it at `bottom: 12px`, `right: 16px + gutter`. `shown = moreBelow && remaining > FOOTPRINT` (48 px: 36 px tall, 12 px inset); with `moreBelow`, `.content` gets `padding-bottom: END_ROOM` (28 px, so with a section's 20 px bottom padding the footprint stays blank at the end). On press the layout measures the bar and `[data-scroll-section]` inside `.content` again (steps swap their sections), then calls `scrollEl.scrollTo({ top: nextScrollTop(...), behavior: isCalm() ? "auto" : "smooth" })`. `scrollEl` becomes a `shallowRef` fed to the composable; `handleScroll` and `reveal` are unchanged.
- **`isCalm()`** moves to `src/utils/motion.ts`; `BalanceView.vue` imports it.
- **Alternatives not taken**: sections as the content's element children (no marks): it drops the signed "a screen marks none" case and ties the stops to DOM shape. The prototype's 40 px peek rule: it scrolls a half-seen section's lower part past unseen (Codex trace: view `[56, 500]`, sections `[300, 700]` and `[740, 1400]`, the peek rule targets 676 where 244 shows the rest).

## Decision ledger

| Id | Decision | Why |
|---|---|---|
| D1 | Opt-in `moreBelow` prop, passed by the nine signed pages; Restore again is the owner's call (Q1) | the signed list names nine; a visible change on a tenth surface is not ours to make, and opt-in pairs with each page marking its sections |
| D2 | Button in a non-scrolling frame, offset by the measured gutter | absolute inside the scroller would scroll away; Firefox's panel scrollbar width differs |
| D3 | Visible iff `remaining > FOOTPRINT` (48 px), and `.content` keeps 28 px of room, which with the last section's 20 px padding makes 48 | then "hidden" means only blank space is hidden, and at the end the button's footprint is blank; fixes Fact 7. Was 48 px of room until the Opus diff review showed the button showing over a just-revealed warning with only padding left |
| D4 | `ResizeObserver` on the scroller and its children, no `MutationObserver` | `.content` is the scroller's persistent normal-flow child, so content growth past the fold resizes it; a subtree observer fires on every countdown tick. Premise: no fixed-height inner scroller on these pages (Codex Q5 found none) |
| D5 | Explicit `data-scroll-section` marks on section containers | the signed text has marks ("a screen marks none"); stops follow the page author's sections |
| D6 | `isCalm` (media query or `.noanimations`) shared from `src/utils/motion.ts` | the house treats Disable animations as reduced motion; removes a private copy |
| D8 | The button in `@nulo/design/ui` | a host-free L2 primitive; the design package already honours `.noanimations` (Fact 8) |
| D9 | Stops are sections, not fields; Change password's repeat field is reached through its section | at 360 × 600 the New password section's top sits 369 px below the bar and the maximum scroll is 169 px with the room (measured on Chrome), so one press clamps to the end with the repeat field's bottom at 433 of a 501 px fold. A `nextScrollTop` test pins this geometry. Marking fields inside the shared `NewPasswordPair` would scroll the "New password" heading under the bar and spread the contract into onboarding, which also renders it |
| D7 | Accessibility (owner's 2026-10-19 delegation): native button, out of the Tab path, the name "Show more below", `mousedown` default prevented, `:focus-visible` ring | CLAUDE.md § Keyboard & focus order (secondary control); a press must not move focus out of a field |

## Security & Adversarial Considerations

- No trust boundary: no input, storage, message or service client; page content is the wallet's own. The button reads layout only.
- Clickjacking-shaped risk is UI overlap, not an attacker: D3 guarantees nothing sits under the button at the end, and the leave phase passes clicks through. Approval windows are not on this layout.
- Supply chain: no new dependency.

## Phase 1: the button on the layout (arc 1)

Change map:
- add `packages/design/src/ui/ScrollMoreButton.vue` + `.test.ts` (export in `src/index.ts`); `apps/extension/src/composables/useScrollRemaining.ts` + `.test.ts`; `apps/extension/src/utils/motion.ts`
- edit, under `apps/extension/`: `scripts/design-resolver.ts`; `src/components/composite/CollapsingHeroLayout.vue` (+ `.test.ts`), `collapsing-hero.ts` (+ `.test.ts`); `src/composables/snackInset.ts` (import `leftToScroll`); `BalanceView.vue` (import `isCalm`); `src/utils/a11y-css.test.ts` (pin the new rules); the nine pages (`moreBelow` + marks) and the seven shared forms (marks); the generated `src/types/components.d.ts` and `auto-imports.d.ts`
- e2e: one test in `tests/e2e/security.test.ts`

Tests (smallest set):
- composable (10): `remaining` reads `leftToScroll`; scroll event; scroller resize; content growth then shrink; fractional measurements; `null` element; element swap leaves the old one inert while the new one updates; dispose detaches; no `ResizeObserver` in the environment; `gutter`.
- `nextScrollTop` (6): half-seen section aligned under the bar; fully visible sections skipped; the two-press trace through a section taller than the view (`0 → 44 → 488`); a far section capped at `h`; no section → end, and Change password's geometry (D9) clamps to the end; the 1 px tolerance on both sides.
- button (5): name, type, `tabindex`, testid; hidden when not `shown`; press emits; `mousedown` default prevented; nudge class on first show only.
- layout (4): no button and no room without `moreBelow`; button absent at `remaining = 48` and present at 48.5; press calls `scrollTo` smooth, and `auto` under `isCalm`.
- marks (1): a table test of the expected stops: each of the nine pages passes `moreBelow`, and Delete profile marks its agreements and its confirmation; Change password its current and new password sections; the shared forms their section roots. It reads the SFC sources.
- e2e (1): in the 360 × 600 popup, Delete profile at first paint. `coveredAt` (`tests/e2e/helpers/pointer-probes.ts`) finds the button uncovered, and the name field lies under the footer. After a checkbox gets a real click, a real pointer press on the button keeps that checkbox focused (`activeTestId`). Once the scroll settles, the button is gone, the name field's whole box lies between the header and the scroller's bottom, and a real click focuses its input. It proves geometry, hit testing and focus, which jsdom cannot. Estimate 4 s per browser, then measured.

Validation gate (root commands from the repository root; `NULO_E2E_BROWSER` applies to the e2e commands only):
- `bun run lint && bun run typecheck:all && bun run test && bun run test:all`, all exit 0; no new complexity suppression; commit the regenerated `src/types/*.d.ts`, then `git status --porcelain apps/extension/src/types` is empty after a build.
- `cd apps/extension && bun run test:e2e -- tests/e2e/security.test.ts tests/e2e/auth-flows.test.ts tests/e2e/type-roles.test.ts --retry=0`, then the same with `NULO_E2E_BROWSER=firefox`; all green at retry 0.
- `bun run audit:vue`, `bun run --cwd apps/extension build-storybook`, `bun run lint:actions`, and `bun run test:e2e` (full smoke) on Chrome, then on Firefox; all green. Record each browser's smoke wall-clock before and after.
- Screenshots: light theme, Chrome, first paint, before (base build) and after, for the ten screens, plus Delete profile after a press. The export pages are shown only at their password step. Commit them under `implementations-plan/scroll-cue-3/screenshots/`. No picture shows Manage networks, an `https://` node address or a recovery phrase.

## Delivery

One arc on `worktree-scroll-cue-3` → `dev`, `gh pr create`. Title: `feat(popup): a "more below" button on screens whose content runs past the fold` (82 chars). The body has the UI impact quote, the D7 accessibility call under the owner's 2026-10-19 delegation, the validation runs and the e2e wall-clock before and after per browser, the screenshots, and `Part of #1658` (the issue stays open for the after-1.2.0 shells). It opens ready, with no label at creation. Nothing merges before the orchestrator's word.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at `040334f53`. Plan-specific values:
- Step 1 is absent (`code_review: off`).
- Step 2: one Codex loop over `git diff origin/dev...HEAD` after Phase 1 is green: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then resume until clean, with a hard stop at three rounds. One Opus `general-purpose` review runs beside round 1. Log each round in `lessons/phase-1.md` and under Audit verdicts.
- Step 3: `gh pr create`, then `gh pr checks <n> --watch`.
- Step 4 (close-out) and step 5 (teardown, slug `scroll-cue-3`, trunk `dev`) run when the orchestrator says.

## Audit verdicts

Codex plan audit, `gpt-6.1-sol` at `high`, read-only.

- **Round 1: revise**, four material findings, all accepted:
  1. Automatic sections drop the signed "a screen marks none" case and tie stops to DOM shape (demonstrated: the DOM differs from the field groups on Change password and New profile). Fix: explicit marks, D5.
  2. Restore again is a tenth surface the signed list does not name (demonstrated). Fix: the opt-in prop, D1, and OWNER-ASKS Q1.
  3. A section taller than the view was skipped past on the second press (demonstrated trace: section `[100, 1100]`, view `[56, 500]`, max 848). Fix: cap each step at one visible height (`nextScrollTop`).
  4. An extension-local L2 justified by `.noanimations` is wrong, since the design package already honours it (demonstrated, Fact 8). Fix: D8.
- Also accepted from round 1: the Fact 7 wording; D4's premise written down; the threshold tests either side of 48 px; the e2e asserts hit testing and kept focus; the gate adds generated-file freshness, `build-storybook`, `lint:actions` and the measured wall-clock.
- **Round 2: revise**, one finding: a separate stop for Change password's repeat field. Rejected as D9 with the page's geometry; Codex withdrew it in round 3. Also accepted: wording precision, the e2e probes (`coveredAt`, `activeTestId`), the threshold tests at the layout, the expected-stop table, command locations.
- **Round 3: approve**, no material findings (the capture run must still measure D9's geometry).
- **Diff review round 1** (Codex, fresh session): one finding, demonstrated: a hide mid-nudge left `nudging` set, so the nudge replayed on a later show. Fixed with a test; two comments tightened. **Round 2: clean.**
- **Opus diff review** (beside round 1), accepted: the button showed while only the last section's 20 px padding was left (trace: Import profile's error screen after its own reveal scroll leaves 68 px of blank, the button over the warning); fixed by cutting the room to 28 px (D3). Two listener tests could not fail (spies on `removeEventListener` added); the marks test missed marks with no label (per-file counts added); the nudge comment named the wrong cause; the Change password test now uses the measured geometry; CLAUDE.md's L2 list names the button.
- Kept as is: D3's room equal to the threshold equal to the threshold (Codex agreed; it discloses the near-fit effect in UI impact); `ResizeObserver` without `MutationObserver` (Codex Q5 found no case it misses); the composable in `src/composables/` exporting `leftToScroll`.

## Seeds

- `/goal`: implement implementations-plan/scroll-cue-3/plan.md Phase 1 to its gate, then its Post-implementation and Delivery.
- `/loop`: each firing, read plan.md and STATUS.md, run the next unticked gate, and stop at the PR.

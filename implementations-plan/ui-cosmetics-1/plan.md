---
plan: ui-cosmetics-1
tier: light
status: planned, Codex approve, awaiting the orchestrator's approval
issues: "#1019 (one arc; item 2's code waits for OA-1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); one Codex audit (gpt-6.1-sol, high) and its resumes; one Opus Plan leg
base: origin/dev at 6d507c611
trunk: dev
post_implementation_hardening: not scheduled
---

# ui-cosmetics-1: onboarding titles hold still; the Presto step is done on open; icons paint once

One arc, one PR against `dev`, `Closes #1019`. Recon: [recon.md](recon.md). Probe and consults: [lessons/phase-0.md](lessons/phase-0.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (OA-1). Pictures: `screenshots/`. Over the light target (about 175 lines): three items, two audit legs and the measured UI shifts.

## Findings

- **Item 1, demonstrated by trace.** The person goes welcome → terms → create → phrase → done (or terms → import → done). Each step stacks its back link, `StepIndicator` and title with its own page gap (28, 32, 32, 24, 40), phrase and done have no back link, and done pads its hero 48 px (recon fact 1). So the step row and the title jump at every step.
- **Item 2, demonstrated by probe; the issue's facts did not hold.** The set is Tabler Icons 3.49.0, drawn verbatim since #790, not an in-house set: the owner's recollection is right. The "weird opacity" is double painting. `Icon.vue` draws each glyph path as its own `<path>`, and the paint carries alpha (`--txt-tertiary` is 56 %, recon fact 7). Where two paths of one glyph overlap, the overlap is painted twice: up to 0.807 coverage against 0.559 for a single paint, on 6 to 100 pixels per glyph, at every size, theme and ratio. Sub-pixel softness at 1x is a second, smaller effect (lessons/phase-0.md).
- **Item 3, demonstrated by trace.** `firstProfileSteps` marks Presto done only on `prestoReached` (`utils/get-started.ts:121`), which only a probe that reaches Presto writes (`usePrestoCheck.ts:49`). The Aztec step is done once its link is opened (`general.vue:118`). So "Optional" reads as a step the person must finish.

## Outcome & Quality Bar

For a person creating or importing a wallet in the onboarding tab, then landing on Home:

- Moving through the steps after welcome, the step row and the title stay at the same place. The title's top on terms, create, phrase, import and done reads one value in Chrome and in Firefox, and an e2e assertion fails on any difference.
- Opening Presto's page from Get started checks the step at once, as How Aztec works does; a Presto that is reached still checks it. The card's copy stays.
- Item 2 ships exactly what the owner picks from the pictures (OA-1) and nothing before it. Good enough: no glyph is redrawn, and the weight stays at Tabler's stroke 2 (`icons-1`, its D3).

## Architecture & Implementation

**Item 3** (Phase 1). `prestoOpened` is the twin of `aztecOpened` in every place that names it:
- `utils/profile-ui-keys.ts`: `GET_STARTED_PRESTO_OPENED_ROOT = "nulo:ui:getStartedPrestoOpened"`, its prefix in `PROFILE_UI_KEY_PREFIXES`, and `getStartedPrestoOpenedKey`. Profile deletion and row commit then clear it.
- `utils/get-started.ts`: the flag joins `GetStartedFlag` and `KEYS`. The step becomes `{ item: "presto", done: i.flags.prestoOpened || i.prestoReached }`.
- `composables/useGetStarted.ts`: `NOTHING_DONE` gets `prestoOpened: false`.
- `wallet/storage/stored-shapes.ts`: `uiGetStartedPrestoOpened: uiFlag(GET_STARTED_PRESTO_OPENED_ROOT)`. `goldens.json` gets its `.full` and `.minimal` rows, and `bun run baseline:storage` rewrites `snapshot.json` (unfrozen baseline, no migration, recon fact 5).
- `popup/pages/general.vue`, `onGetStartedSelect`: a `presto` click starts `getStarted.mark("prestoOpened")` and pushes Proving at once, unawaited. The mark starts before the push and its write lands after it (`storageLocalSet` first awaits the migration barrier), which is safe because the popup stays open; no navigation waits on storage. `aztec` keeps its awaited mark, because the new tab closes the popup.

**Item 1** (Phase 2). A new `apps/extension/src/onboarding/components/OnboardingStepHeader.vue` owns everything above a step's content:
- Props: `current: OnboardingStep`, `path: OnboardingPath`, `back?: string` (the back link's testid), `main`, `sub`, `align?: "left" | "center"` (forwarded to `BrutalistTitle`). It renders three things in a flex column with gap 32, create's gap today. The column stretches to the page's width, also on done's centred page, so `StepIndicator` keeps its full width:
  1. A back row of fixed `height` `H` that does not shrink. It holds `OnboardingBackLink` at its own width when `back` is set, and stays empty otherwise. `H` is create's back link box today (`B`), measured after fonts load in both browsers, the larger rounded up to a whole pixel. So font metrics cannot move what is below it.
  2. `StepIndicator`, which keeps its own 16 px bottom margin.
  3. A `<header>` with `padding-top: 8px`, as on every step today. It holds `BrutalistTitle` with `data-testid="onboarding-step-title"`, the accent bar, and a default slot. With `left`, the bar is 40 px, 12 px under the title, and the slot sits 12 px under the bar (create and import today). With `center`, the bar is 56 px with 16 px steps (done today).
- The spacing under the title block stays each page's own: `class` falls through to the `<header>` (16 px on terms, create and import; none on phrase; 24 px on done), so nothing below the title moves except by the alignment itself.
- `inheritAttrs: false` with `v-bind="$attrs"` on the `<header>`. So `legal-terms-page`, and phrase's `tabindex="-1"` and `onboarding-phrase-title`, stay on the element they mark today. The component exposes `focus(options)`, so phrase's `title.value?.focus({ preventScroll: true })` still lands on that element. The header's `:focus { outline: none }` moves in with it: a focus target, not a control.
- Pages: `terms.vue`, `create.vue`, `import.vue` (its subtitle in the slot), `OnboardingPhraseStep.vue` and `done.vue` (`align="center"`, subhead and tagline in the slot) replace their back link, `StepIndicator` and `<header>` with the component. They drop their title CSS and done's 48 px top padding, and keep only the bottom spacing above. Each keeps its `OnboardingPage` gap for the content below. `welcome.vue` does not change.

**Item 2** (Phase 3, after OA-1). Only `packages/design/src/core/Icon.vue` changes; `glyphs.ts` stays verbatim and the drift test stays green:
- C1: the stroke paths draw as one `<path fill="none">` whose `d` is a computed join of `glyph.s`, rendered with `v-if` so an unknown name still draws nothing. Fill paths keep one element each: every filled glyph has one path, and joining fills could change nonzero winding. A stroke is painted once per element, so its overlaps take the paint's alpha once; a comment states that invariant. The parser already makes a glyph stroke-only or fill-only (`packages/design/src/internal/render-glyphs.ts:65-72`).
- The join's precondition: every path opens with an absolute `M` (all 162 do), so no path moves relative to the previous one's end. `readPaths` in `render-glyphs.ts` refuses a path that does not, beside its existing refusals.
- C3 = C1 plus the bottom navigation at 24 px (`Navigation.vue:45`), the one size where Tabler's integer lines land on whole pixels.
- C2 (`shape-rendering="crispEdges"`) is pictured, but the plan does not recommend it: curves turn into stairs.

**Alternatives not taken.**
- Item 1: one shared page gap and a spacer on each page. Each page would keep its own copy of the header, which is the drift that caused the bug, and the gap would also move every page's content.
- Item 1: a `visibility: hidden` back link as the spacer. A dead control in the DOM; the fixed row says the same with no hidden control.
- Item 2: snapping the geometry to the pixel grid. It would edit Tabler's paths, which `glyphs.drift.test.ts` and the README forbid. No single snap holds at 14, 16, 18 and 22 px, and the stroke would still be painted twice.
- Item 2: a mask per icon instance that paints once. It needs a unique id per instance and adds markup for nothing that C1 does not already fix.

## Phases

Warning: run every e2e through its runner at `--retry=0`: smoke through `bun run test:e2e`, which claims ports in `~/.agents/ports.md`. Run one e2e at a time in this worktree.

### Phase 1 — the Presto step is done on open (#1019 item 3) ✓

1. Apply the item 3 changes. Run `bun run baseline:storage`, add the two golden rows, and run it again: the second run changes nothing. Warning: if `stored-shapes/pins.ts` holds a pin by then (migration-rule-1 freezes the baseline), run it with `-- --additive "a new per-profile UI flag; every stored row still reads"` and add the pin it prints.
2. Tests. Update the exact fixtures, never loosening them: `get-started.test.ts`'s `getStartedKeys` list and `NONE`, and `useGetStarted.test.ts`'s flag objects.
   - `get-started.test.ts` adds three rows: Presto done on `prestoOpened` alone, done on `prestoReached` alone, open on neither.
   - `useGetStarted.test.ts` extends one storage-event case to `prestoOpened`.
   - `general.test.ts` adds "Make proofs faster opens Proving and marks the step": with the storage write held pending, the route is already `/popup/settings/proving`; once it resolves, `nulo:ui:getStartedPrestoOpened@p1` is stored.
   - `stored-shapes.writers.test.ts` adds `prestoOpened` to its marks table.

**Validation gate.** `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`. Pass: each exits 0, the new rows pass, and the presto row reds when the `prestoOpened ||` term is removed (uncommitted control).

### Phase 2 — one header geometry on every step after welcome (#1019 item 1) ✓

1. On the base build, measure create's back link box height `B` after `document.fonts.ready`, in Chrome and in Firefox. Record both in `lessons/phase-2.md`.
2. Add `OnboardingStepHeader.vue` and its test `OnboardingStepHeader.test.ts`, with four rows:
   - With `back`, the row holds the link with that testid. Without it, the same row is present and empty: the pair of a never-happens assertion and its success control.
   - Attributes land on `<header>`, not on the root.
   - `focus()` focuses the `<header>`.
   - The slot renders under the bar.
3. Move the five pages onto the component. Register the real component in the page tests' mounts: `create.test.ts` (which also mounts the phrase step, `:51-56`), `import.test.ts` and `done.test.ts`. The phrase focus row (`create.test.ts:298`) then runs against it.
4. e2e (`tests/e2e/legal-acceptance.test.ts`):
   - S1 reads the title's top on terms, create, phrase and done and expects one value.
   - S3 reads it on terms and import and expects one value.
   - Before each read, wait for the step's own testid: `legal-consent-checkbox`, `onboarding-create-page`, `onboarding-phrase-later`, `onboarding-done-open`, `onboarding-import-page`. The shared title testid alone could match the step being left.
   - A local `titleTop(page)` then, in one `evaluate`, awaits `document.fonts.ready`, scrolls to the top and returns `getBoundingClientRect().top` of `onboarding-step-title`. Pinning the scroll keeps create's autofocus and Firefox's rounded `scrollY` out of the number. Exact equality within each browser: identical geometry above the title gives identical numbers, so no tolerance.
   - Failure mode: a step's title off the shared line. A unit test cannot prove it, because jsdom has no layout. Estimate: under 1 s per scenario, no new scenario.
   - Control: on the base build with a scratch patch that only adds the title testid to each page, S1 must red on unequal numbers, not on a missing selector. Drop the patch afterwards.
5. Take before and after screenshots of terms, create, phrase, import and done, for the PR body.

**Validation gate.** `bun run lint`, `bun run typecheck:all`, `bun run audit:vue`. Then from `apps/extension`, at `--retry=0` on Chrome and on Firefox (`NULO_E2E_BROWSER=firefox`): `legal-acceptance`, `onboarding-tab`, `onboarding-import`, `keyboard-guards`, `passkey-retry` and `import-paths`. These files give fast feedback. Before delivery, run the full smoke suite once per browser: `bun run test:e2e --retry=0`, and the same with `NULO_E2E_BROWSER=firefox`. Pass: each exits 0, and the S1 control reds on unequal numbers. Record each touched file's wall-clock and each suite's, before and after, per browser.

### Phase 3 — the icon pick (#1019 item 2), only after OA-1 is answered

1. Read OA-1's answer in `OWNER-ASKS.md` or the orchestrator's message.
2. C0: no code; the PR body records the answer.
3. C1, C2 or C3: change `Icon.vue` (and `Navigation.vue` for C3).
   - `Icon.test.ts:12` and `:39` assert the joined drawing: `settings` draws one stroke path whose `d` is its paths joined. `square-check` still draws one fill path. No row is deleted.
   - `readPaths` refuses a path opening with a relative `m`, with one row in `render-glyphs.test.ts`.
4. Take before and after crops of the bottom navigation, both themes, ratios 1 and 2, in Chrome, plus one Firefox crop, for the PR body.

**Validation gate.** `bun run lint`, `bun run typecheck:all`, `bun run test:all`, `bun run --cwd apps/extension build-storybook`. Then the full smoke suite on Chrome and on Firefox at `--retry=0`. Pass: each exits 0, and `glyphs.drift.test.ts` is green with no edit to `glyphs.ts`.

## UI impact

Items 1 and 3 are signed by the owner's words in #1019 (2026-10-21), within the lane's no-ask budget. Item 2 waits for OA-1. Below, `B` is create's back link height today and `H` the fixed row (`H − B` under 1 px):
- **Onboarding, every step after welcome** ("the titles move around instead of being fixed"). Shifts down, of the step row then the title: create `H − B` and `H − B`; terms `H − B + 4` and `H − B + 8`; import `H − B + 8` and `H − B + 16`; phrase `H + 32` and `H + 32` (about 55 px); done `H + 32` (about 55 px) and `H − 16` (about 7 px), as it loses its 48 px top padding. Done's title stays centred, so at Ready it still sits mid-page; the owner asked about the vertical place only. On phrase and done an empty back row sits above the step row. The spacing under each title block does not change. Welcome does not change.
- **Home → Get started → "Make proofs faster"** ("if the user clicks on it … we should mark it as done"). Once opened, the row shows Done, as How Aztec works does, and counts in "N of M done". The card closes when every step is done, as today. The copy does not change.
- **Every glyph** (item 2): only the OA-1 pick, with its pictures in the PR.

## Security & Adversarial Considerations

No new input, message, permission or log line. `prestoOpened` is a per-profile boolean UI flag, like `aztecOpened`. It is read as done only when it is stored as `true`, it is never backed up, and profile deletion clears it through the prefix list. A hostile or corrupt value reads as not done, and the only consequence is a reminder that stays up. A forged `true` can only dismiss this optional reminder: nothing reads it as Presto's health, permission or proving capability. The stored-shape registry entry and its goldens keep `stored-shapes.scan.test.ts` green. The header and icon changes are presentational; the page's `<header>` keeps its testids and focus target, so the keyboard guards are unchanged. Supply chain: no dependency change.

## Assumptions

- **Facts:** recon.md facts 1–8, and the probe in lessons/phase-0.md.
- **Inferences.**
  - I1: the owner's "hand-drawn" read is the darker or brighter blots at path joins in C0's pictures. The probe shows them, but the owner's eye is not measured.
  - I2: the owner's display ratio is unknown. The pictures show ratios 1 and 2.
  - I3: a fixed back row matches create's back link to within a pixel on both browsers. Phase 2 step 1 measures it.
- **Asks.** OA-1, the icon pick. The PR opens as a draft with items 1 and 3, and Phase 3 waits for the answer.

## Decision ledger

- D1: the header is one component that owns the back row, the step row and the title block. A shared gap value cannot stop five copies from drifting apart.
- D2: create's geometry is the reference: the default page gap, the most common step, and the one that moves no pixel.
- D3: phrase and done reserve the back row rather than gain a control: phrase cannot go back, and done has nowhere to go back to.
- D4: one e2e assertion inside the existing S1 and S3, no new scenario. jsdom cannot measure layout, and S1 already walks all four steps of the password path.
- D5: the Presto mark sits at the card's click, not on the Proving page's mount. The Aztec step does the same, and a visit to Proving from Settings is not the card's step.
- D6: item 2 recommends C1. It fixes the demonstrated cause at every size, changes no geometry or weight, and keeps the drift pin. C3 adds crisp lines at ratio 1 for the navigation only, and it is the owner's layout call.
- D7: the Presto mark is started, then Proving is pushed at once (Codex). Opus found awaiting harmless; Codex's point decides it: an awaited push is a navigation that can land after the person has left Home. The mark starts before the push; the test proves the push does not wait for the write and the flag is stored after it.
- D8: join stroke paths only; fill paths stay one element each (both legs). The planned mixed-paint refusal is dropped as impossible (the parser already splits stroke from fill). Codex's absolute-`M` refusal stays (Opus would drop every refusal): it guards the join's one precondition, in the validator that already refuses unfaithful drawings, at one line.
- D9: the title read pins the scroll and reads `rect.top` in one `evaluate` (Opus), after waiting for the step's own testid (Codex). Exact equality per browser, no tolerance (both legs).
- D11 (implementation): `B` measured 22 px on both browsers, so `H` = 22 px and create moves 0; the shifts land as UI impact says (lessons/phase-2.md).
- D10: spacing under the title block stays each page's own (Codex); the empty back row on phrase and done is the alignment itself, shown in the PR's screenshots (Opus).

## Delivery

One arc, one PR against `dev` from `worktree-ui-cosmetics-1`, opened as a **draft** once Phases 1 and 2 are green and the Codex loop has converged on them. No label: smoke runs on `apps/extension/**`.
- Title: `fix(ui): onboarding titles hold still; the presto step is done on open; icons paint once` (88 characters; drop "icons paint once" if OA-1 is C0).
- Body: what changed and why, item 2's corrected facts with the probe numbers, the validation runs, each browser's smoke suite and touched-file wall-clock before and after, the onboarding screenshots (Phase 2 step 5) and Home's card with Presto done, the new `onboarding-step-title` test hook, `UI impact` quoting #1019's sign-off and, after OA-1, the pick quoted by id and text, and `Closes #1019`.
- After the pick: Phase 3, then one resumed Codex round over its diff. The orchestrator readies the PR.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at `6d507c611`. `code_review: off`.
- Codex loop: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh` on the same session. Prompts live under `~/.cache/nulo-backlog/ui-cosmetics-1/`. The loop runs once over Phases 1–2 before the draft PR, then one resumed round over Phase 3. Hard stop at three rounds in all. Log every round in `lessons/phase-N.md` and under Audit verdicts.
- Placement deviation: Phase 3 follows the draft PR, because the owner's pick gates it (lane brief).
- Close-out per the standard's step 4, as the PR's final commits after Phase 3. Comment on #1019 with the corrected facts if the PR body does not reach it.
- Teardown after the merge: `agent-worktree done ui-cosmetics-1 --merged`.

## Audit verdicts

- **Round 1, Codex** (gpt-6.1-sol, high, session 01a16023): conditional approve. Accepted, all verified against the tree: complete the Presto fixtures (`useGetStarted.test.ts`, `get-started.test.ts`'s key list and `NONE`); the base control must red on geometry (scratch testid only); join strokes only, keep fills, refuse a path that does not open with an absolute `M` and drop the impossible mixed-paint refusal; full smoke suites on both browsers; the header fills the width on done, `H − B` measured; wait for each step before reading; keep the spacing under the title; screenshots of onboarding and Home; "items 1 and 3 signed, item 2 waits"; 0.807/0.559 on light; title 88 characters; done's hero is a `Flex`. Changed on its argument: D7.
- **Opus leg** (Plan agent, opus): conditional approve. Accepted: the base control (same as Codex); an `Icon.vue` that cannot throw on a missing `s` or an unknown name, with `Icon.test.ts:12,39` rewritten; `align-self: stretch` on done; pin the scroll inside the read; the phrase and done shifts in numbers; five-step screenshots; `left | center` from `BrutalistTitle`; a fixed `height` at the larger measurement; a Firefox icon crop; OA-1 says Chrome measured it. Rejected: dropping every glyph refusal (D8). Not a fact: "create has no subtitle slot" (the plan gives the slot to import).
- **Codex verification** (two resumes of 01a16023): all six conditions met; one new defect, demonstrated by trace and fixed (the unawaited write lands after the push, D7); final verdict **approve**.
- **Fix loop round 1, Codex** (gpt-6.1-sol, high, session 01a1606b): clean. One non-material comment trim on `OnboardingStepHeader.vue`, accepted.
- **Fix loop round 1, Opus diff review** (general-purpose, opus): no bug, nothing seen beyond UI impact. Two test gaps, accepted: the phrase row must not mark Presto (a never-happens row beside the Presto test; it reds with the `item === "presto"` guard dropped), and `align` must reach the title.
- **Fix loop round 2, Codex** (resume of 01a1606b): the accepted fixes verified, no regression; **clean**. The loop converged on Phases 1–2.
- No high-severity finding is open. Security: both legs found nothing material; a forged flag only hides an optional reminder.

## Seeds

```
/goal Phases 1 and 2 of implementations-plan/ui-cosmetics-1/plan.md marked ✓, each gate reported passing in the transcript; the Codex loop converged on their diff (a resumed pass with no new material finding, quoted); a draft PR against dev with Closes #1019; after OA-1, Phase 3 ✓ and its resumed round clean; close-out committed; checks green; nothing merged.
```

```
/loop 15m Drive implementations-plan/ui-cosmetics-1 forward per plan.md: reality check from plan.md and lessons/, run the next pending phase and its gate, the Codex loop per Post-implementation, the draft PR per Delivery, Phase 3 only once OA-1 is answered; never merge; stop and report on a red gate failed three times.
```

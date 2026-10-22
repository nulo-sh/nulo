---
plan: fit-gate-1
tier: light
status: closed with its one PR; the merge closes the plan
issues: "#1023 (arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet) plus a scratch probe on both browsers; one Codex audit (gpt-6.1-sol, high); one Opus Plan critique
base: origin/dev at 60ecd6cc3
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-22.
- **Status:** closed with its one PR (`worktree-fit-gate-1` → `dev`, `Closes #1023`), which carries this close-out; the merge closes the plan.
- **Shipped:**
  - **The repaired gate.** At 240 px, `expectInsideView` fails every shown box past the view and every light-DOM scroller wider than its box. `textFates`' compare cuts at a sideways scroller that has a box.
  - **The proof.** A planted page with its controls: it was red on the base, and now runs green on Chrome and Firefox. The four planted tests share `withPlanted`.
  - **Two fits below 359 px:** the token metadata popup's capability marks, and Developer → Senders' row actions. The built CSS and a 360 px pixel compare show no change at 360 px. The 240 px sheets are in [screenshots/](screenshots/).
- **Dispositions:**
  - The orchestrator approved the plan as committed, with D1, D3 and D7 in force.
  - Review round 1: Codex approved, and so did the Opus leg. Every finding was accepted, except Codex's request to delete the two Vue media-rule comments; they follow #986's narrow-rule comments.
  - Round 2: Codex approved, with no new material finding.
  - Details: [lessons/phase-3.md](lessons/phase-3.md).
- **Lessons:** the one generalizable gotcha, a page scroller's `overflow-x` computing to `auto`, went to the `e2e-testing` skill's harness behaviours, its owning domain. `lessons.md` is unchanged at its budget.
- **Known limits:** #1030 (a box positioned past a page scroller whose containing block lies outside it could read as cut at 240 px; a false red, no instance).
- **Open items:** none.
- **Seeds retired:** the `/goal` and `/loop` below.

# fit-gate-1: the 240 px gate fails a page that scrolls sideways inside its own scroller

One arc, one PR against `dev`, `Closes #1023`. At 240 px the gate lets nothing in the page scroll sideways: a scroller whose content is wider than its box fails, and so does every box past the view, whatever holds it. Two surfaces the old rule let through get a narrow fit. Recon and the measured inventory: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## The claims and what did not hold

- **Held, demonstrated**: `expectInsideView` excuses any box an in-view ancestor with `overflow-x: auto|scroll` holds (`apps/extension/tests/e2e/fixtures/type-roles.ts:545-556`), and every vertical page scroller computes `overflow-x: auto`. `textFates`' `span` stops at the same scroller (`:623-629`). The probe found two real surfaces this hides (recon § The probe).
- **Did not hold**: "a `scrollbar-gutter: stable` page loses about 17 px once a classic scrollbar shows". `base.css` hides every scrollbar (`* { scrollbar-width: none }`), so the gutter is 0 px with classic scrollbars forced on both engines (recon § Scrollbars). `security-backup.test.ts`'s 17 px model is therefore stricter than any measured engine; it stays (a stricter check costs nothing).
- **Did not hold as a list**: the logs and JSON viewers scroll sideways inside shadow roots the gate does not read, and the capabilities Details table is no scroller. No light-DOM scroller is meant to scroll sideways (D1, D2).

## Outcome & Quality Bar

- **For whom**: the next contributor whose page overflows at 240 px, and a person on Firefox's sidebar at its narrowest.
- **Excellent**: a box pushed past its scroller at 240 px turns the gate red with the scroller and the box named, on both browsers; the fixes keep the popup at 360 px pixel-identical.
- **Good enough**: the light DOM only; vertical scrolling is judged as today.

## UI impact

The owner's P71-01 B (decision page 71, 2026-10-20): "Fit every page down to 240 px everywhere: one layout for every width; the popup looks the same." The lane brief's no-ask record is the whole budget here: "(1) a fit that nobody would notice (a `min-width` that becomes `max-width: 100%`, a box that wraps) ships in the arc with before/after pictures at 240 px, light and dark, both browsers". Both fits are a box that wraps, below 359 px only, each a pattern #986 shipped and P78-11 approved as pictured:

- **Token metadata popup** (a token's menu → Token Metadata), 240 px. Before: on the two rows whose key is `hasPrivateToPublicTransfers` or `hasPublicToPrivateTransfers`, the mark icon sits 2.6 px past the view and the card scrolls sideways by 3 px. After: on those rows the icon goes under the key, at the right, as the execute window's "a detail's value goes under its name, at the right"; every other row is unchanged.
- **Developer → Account state → Senders**, 240 px. Before: a sender row's copy and delete actions sit 19 px past the view. After: they go under the address, at the right, as "a contact's actions go under its name and address" (`ContactRow.vue:124-144`), with Developer → Notes' rule (they move only when they do not fit beside it).
- At 360 px both surfaces are unchanged (every rule sits under `@media (width < 359px)`; Phase 2's pixel compare).

## Architecture & Implementation

**The rule at 240 px** (`fixtures/type-roles.ts`, light DOM only, as every reader of the pass):
1. `readInsideView(page)` (new export; `expectInsideView` asserts it): `past`, every box past the view's sides (≥ 2 × 2 px, displayed, visible), the outermost only, with the `scrolledInView` excuse removed; `sideways`, every element not a field (`input, textarea`), with `past`'s filter (displayed, visible, ≥ 2 × 2 px), whose computed `overflow-x` is `auto|scroll` and whose `scrollWidth > clientWidth`, with its own testid (else the nearest), tag and both widths; `scroll`, the document's `scrollWidth`. The assertion: `past` and `sideways` empty, `scroll ≤ view`.
2. `textFates`: the record at the page's own width keeps today's reachability (a scroller stops the walk on both axes). The compare at 240 px cuts at a scroller on x like a clip and walks on; on y it still stops (text below the fold is reachable). The set shown at the record is unchanged and the set shown at 240 can only shrink, so the fates reported are a superset of today's. `expectLaidOut` already counts a scroller's edge as a cut on x (`cutBy`, `type-roles.ts:200-215`), so today every fate this adds also comes with an `expectLaidOut` red; the change makes the comment at `:621-622` true at 240 px and the fates reader right on its own.
3. The compare's cut applies only to a scroller with a box: a `display: contents` ancestor keeps today's treatment in both modes, so a zero rectangle never cuts text and the record stays literally today's.
4. The inventory, as a comment next to `NARROW_ACCEPTED` (the brief's place): no light-DOM scroller is meant to scroll sideways; the logs and JSON viewers' CodeMirror scrollers do, inside shadow roots the pass does not read (`viewers-csp.test.ts:625-650` checks the log's box in its root; the JSON viewer's light-DOM host, `JsonViewer.vue:134`, holds its editor at 100% and has no 240 px check); the capabilities Details table is no scroller.

**File map**: `apps/extension/tests/e2e/fixtures/type-roles.ts` (the rule); `apps/extension/tests/e2e/type-roles.test.ts` (the planted test); `apps/extension/src/popup/components/popups/TokenMetadataPopup.vue` and `apps/extension/src/popup/pages/settings/developer/account-state/senders/index.vue` (a `<style module>` rule under `@media (width < 359px)` and a class on the row and its trailing box). No new helper, no new list.

**Alternative not taken**: keep the excuse and add only the sideways sweep. It leaves a box past the view's left edge unreported when an in-view scroller holds it (cut, not reachable; `scrollWidth` ignores overflow to the left) and keeps two rules for one fact. Not closed by either: a box with no text past an inset scroller's left edge but inside the view (pre-existing, no instance found).

## Decision ledger

- **D1, the inventory now, the runtime list with its first entry.** The brief asks for a list next to `NARROW_ACCEPTED`. The inventory has no light-DOM entry: the two scrollers that scroll sideways at 240 are defects with a fit (D6). An empty list read by three readers is machinery with no caller, and keying a generic wrapper (`PopupCard`, the settings shell) by its nearest testid would exempt every page that uses it. So the inventory is a comment beside `NARROW_ACCEPTED` (Architecture 4), and the list (`{ testid, why }`, matched on the scroller's own `data-testid`, never the nearest; it only shrinks) arrives with its first entry: a Phase 3 red a person would notice, or a later scroller meant to scroll sideways. Codex r1: accepted, provided the inventory sits beside the acceptance rules now; a deviation from the brief, raised to the orchestrator.
- **D2, the light DOM only.** Walking shadow roots would widen all three readers for two editors that are right as they are and have their own check.
- **D3, no gutter pass.** The wallet hides every scrollbar, and with classic scrollbars forced a stable gutter measured 0 px on Chrome 152 and Firefox 153 (Linux); other platforms are not measured, but the gutter's width is the scrollbar's, which `scrollbar-width: none` removes. A 17 px pass would turn 13 of 56 Chrome checks red for a width no measured engine takes. `base.css.test.ts` pins the rule by hash and names it. The one `thin` scroller, the logs source list (`LogsToolbar.vue:224`), was measured with classic scrollbars: its bar takes 10 / 6 px and every row still fits (recon), so no residual and no known-limit issue (the Opus leg asked for one while it was unmeasured). Codex r1: keep the decision, scope the claim; done.
- **D4, the excuse goes** (§ Architecture): it served a sideways scroller (firefox-sidebar-1 Fact 23), and the light DOM has none. Probe: the boxes it hides are the token icons (Chrome smoke) and, by construction, the Senders actions (network); removing it adds no red beyond the two scrollers.
- **D5, x-scrollers cut in `textFates`' compare only**, matching `expectLaidOut`; y unchanged. Codex r1: cutting in the record too would hide text that its own width shows only past a scroller's edge, so its loss at 240 would go unreported (a weaker gate); the record keeps today's rule.
- **D6, both reds are class (1) fits**, an owner-approved narrow pattern (#986: "a contact's actions go under its name and address", "a detail's value goes under its name, at the right") applied where the bug hid it. Alternatives for the token rows: let the key break mid-word (`overflow-wrap: anywhere`), which changes how an identifier reads; or list it and ask the owner, which leaves the icon cut. Codex r1: fits the brief's permitted pattern if the pictures show content and actions kept. Opus: defensible, quote the owner's records (done in UI impact).
- **D7, local suites**: the 12 e2e files that run the pass (smoke: `type-roles`, `rows`, `legal-acceptance`, `restore-outcome`, `registration`, `viewers-csp`, `backup-imported-account`, `passkey-backup`, `security-backup`; network: `type-roles-windows`, `in-flight-send-guard`, `cancel-mid-prove`), plus `firefox-sidebar.test.ts` on Firefox (a page at the sidebar's own width), on both browsers at retry 0. `tx-transfer-row` imports the fixture but never runs the pass. This substitutes for the brief's whole suites: a spec that never lays a page out below 359 px cannot see the fits, and one that never runs the pass cannot change verdict. The PR's CI runs all four e2e lanes (`apps/extension/**` trips each path filter), with CI's retries. Codex r1: acceptable if surfaced; surfaced here and in the report.

## Security & Adversarial Considerations

Test code and two CSS rules; no runtime logic, storage, message or permission changes. The risk is a weaker gate: a rule that reports less than the old one. Phase 1's planted test fails on the base and passes after; the suites prove no surface was exempted to get green. No new dependency.

## Assumptions

**Facts** (recon.md cites each):
1. No source rule sets `overflow-x: auto|scroll` or `overflow-inline` alone; the scrollers come from `overflow: auto` (ten rules, `PopupCard.vue:21` among them) or `overflow-y`, on pages, cards, lists and the JSON viewer's host.
2. The probe's only light-DOM `scrollWidth > clientWidth` at 240 px on both browsers: the token metadata card (243/240) and the Senders page (259/240).
3. On Chrome smoke the old excuse hides only the two token-metadata icons, nothing on a left edge; on the network suite it hides the Senders actions by construction (not logged).
4. `* { scrollbar-width: none }` makes a stable gutter 0 px with classic scrollbars forced (Chrome 152, Firefox 153).
5. `expectLaidOut` treats a scroller's edge as a cut on x already (`type-roles.ts:182-215`).
6. fit-240-2 (#1025) added six `expectFitsNarrow` checks in `backup-imported-account`, `passkey-backup` and `security-backup`; under the repaired rule the probe found no sideways scroller and no excused box there, on both browsers.
7. The e2e configs retry twice by default (`vitest.e2e.config.ts:30`, `vitest.e2e.network.config.ts:31`); `--retry=0` overrides it, and `e2e:agent` passes extra arguments to vitest.

**Inferences**:
- I0. Every light-DOM scroller is meant to scroll vertically only: their selectors, comments and contents say so (recon); none holds content meant to be read sideways.
- I1. The sweep costs under 50 ms per narrow check (one `getComputedStyle` per element, as `expectInsideView` already does); Phase 3 measures it.
- I2. A Firefox scroller does not report `scrollWidth` one over `clientWidth` from 1/60 px rounding: none did in 84 checks. Before a red is classified, its fractional geometry and scroll reach are read; no tolerance is added.

**Asks**: none. OWNER-ASKS.md stays "none" unless Phase 3 finds a red a person would notice.

## Phase 1: the repaired rule and its proof

1. Write the planted test in `type-roles.test.ts`, beside the fates test, on its pattern (a fixed host on Home, CSSOM styles, removed in `finally`). Plant two vertical scrollers (`overflow-y: auto`, 120 px tall, full width), every box 20 px tall. Scroller A, the defect: a `min-width: 300px` box, and a box 60 px wide at `margin-left: 250px` with text. Scroller B, the controls: a box `0.5px` narrower than B, a `display: contents; overflow: auto` wrapper around a 20 px tall span with text, and text 400 px down.
2. Assert, through `textFates` and `expectInsideView` (both on the base), in that order: at 240 px the compare reports `gone` for the pushed text only, and `expectInsideView` rejects; at the page's own width it passes.
3. Run it on the base, both browsers. The old fates reader reports nothing for the pushed text, so the first assertion fails; also log that the old `expectInsideView` passes the page at 240 px.
4. Change the rule (§ Architecture). Add the exact assertions: at 240 px `sideways` is A alone, `past` A's two boxes alone, and B's texts report no fate.
5. Run it green on both browsers, with the fates test and the logs window's 240 px test unchanged.

**Validation gate**: `bun run lint`, `bun run typecheck:all` exit 0. Armed build per browser (`tests/e2e/global-setup-smoke.ts:20`), then in `apps/extension`: `NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/type-roles.test.ts tests/e2e/viewers-csp.test.ts --retry=0`, and the same with `NULO_E2E_BROWSER=firefox`. Pass: the planted test green, the token metadata check red with its card's scroller named (the fit comes in Phase 2), the rest green. Layers: lint, typecheck, smoke e2e on both browsers.

## Phase 2: the two fits, with pictures

1. Capture "before" at 240 px, light and dark, Chrome and Firefox: the token metadata popup (smoke) and Senders with one sender (network, `e2e:agent`), from a scratch capture in the visits that already exist. Never commit the capture code.
2. Add the fits (UI impact). Capture "after" the same way, and both surfaces at 360 px before and after.
3. Compare the 360 px pairs pixel for pixel: zero differing pixels. Commit the 240 px sheets under `implementations-plan/fit-gate-1/screenshots/`, as fit-240-2 did.

**Validation gate**: `bun run lint`, `bun run typecheck:all`, `bun run test` exit 0. Both checks green on both browsers at retry 0 (`type-roles.test.ts` smoke; `NULO_E2E_PROVERLESS=1 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/type-roles-windows.test.ts --retry=0`, and the Firefox twin). The 360 px compare at zero. Layers: lint, typecheck, unit, smoke and network e2e on both browsers.

## Phase 3: every surface the pass reads

1. Run D7's files on both browsers at retry 0. Smoke: the armed build, then `bun run test:e2e -- <files> --retry=0`. Network: `NULO_E2E_PROVERLESS=1 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent <files> --retry=0`. Then the Firefox twins.
2. For a red, read its fractional geometry and scroll reach first. A fit nobody would notice ships with pictures (Phase 2's steps). Anything a person would notice is not changed: add the list (D1) with its entry and reason, and an OWNER-ASKS.md entry with pictures in the "what ships now" form.
3. Merge `origin/dev` and rerun the three fit-240-2 files unedited: green.
4. Record, per browser, the local time of `type-roles.test.ts` (the planted test and the sweep's cost) at the base and after; the PR body adds each browser's CI suite wall-clock before and after.

**Validation gate**: `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all` exit 0; D7's files green on both browsers at retry 0. Layers: all, network e2e included.

## Delivery

- One PR, `worktree-fit-gate-1` → `dev`, opened after the Codex loop converges, without labels. Title: `test(e2e): the 240 px gate fails a page that scrolls sideways inside its own scroller` (84 characters).
- Body: what and why; the inventory and D1-D3 in a line each; the two fits with the before/after sheets (permalinks at the branch commit) and the 360 px compare; validation with outcomes; the e2e budget (failure mode: a page that scrolls sideways inside its scroller passes the gate; no cheaper layer lays out; the planted test estimated 4 s per browser, then measured; each browser's suite wall-clock before and after from CI envelopes); `Closes #1023`.
- Close-out as the PR's final commits: Outcome, `Known limits:`, `Open items:`, `STATUS.md` deleted, `git mv` into `archive/` with the index line moved.

## Post-implementation

[README § Post-implementation standard](../../README.md#post-implementation-standard) at `60ecd6cc3` binds. Plan-specific parts: single arc, so the review loop runs once over the diff from the base after Phase 3 is green. Consult: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; hard stop at three rounds. Log each round in `lessons/phase-3.md` and § Audit verdicts. Teardown after the merge: `agent-worktree done fit-gate-1 --merged`, trunk `dev`.

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| r1 | Codex, gpt-6.1-sol, high | conditional approve | D5 cuts in the compare only (the record keeps today's reach, so no fate is lost); a behavioural base red; the inventory beside `NARROW_ACCEPTED` (D1); D7's count, `--retry=0` and the substitution surfaced; D3 scoped and the `thin` list measured; a `display: contents` ancestor never cuts in the compare (r2: not skipped in the record); reds read for fractional geometry first | transformed ancestors of fixed boxes (pre-existing in `holders`, not widened); a tolerance (none added) |
| r1 | Opus 5.5, Plan | conditional approve | planted boxes sized and the controls in their own scroller; `sideways` gets `past`'s filter; Facts 1 and 3, D4, D7, citations; owner records quoted (D6); the future list keyed on the scroller's own testid; D5 stated as adding no case beyond `cutBy` | a step to restore the probe (restored before the commit); a known-limit issue for the `thin` list (measured: it fits) |
| r2 | Codex, resumed (verify) | conditional approve | r1 conditions met; the compare's cut skips a box-less ancestor, so the record stays literally today's; the `display: contents` control wraps a sized span | none |
| r3 | Codex, resumed (verify) | approve | none | none |
| impl r1 | Codex, gpt-6.1-sol, high | approve | the planted test runs `expectInsideView` on a sideways-only case; `OVER_PAGE`'s restating doc deleted | deleting the two Vue media-rule comments (the #986 narrow-rule precedent; they say what 359 px means) |
| impl r1 | Opus 5.5, general-purpose | approve | the control moved 0.4 px past its scroller's edge (`past`'s allowance proved; I2 measured on both engines); the scroller-naming comment; `LAYOUT_STYLES`' duplicated doc; the site test folded into `withPlanted`; the containing-block limit filed (#1030) | none (D5's missing control and the key's 10 px into the padding noted, no action) |
| impl r2 | Codex, resumed (verify) | approve, no new material finding | none | none |

## Seeds

`/goal Phases 1-3 of implementations-plan/fit-gate-1/plan.md green with their gates in the transcript; the Codex loop converged (gpt-6.1-sol, high, at most three rounds); the PR against dev open with Closes #1023, the pictures and the timings; not merged.`

`/loop Continue implementations-plan/fit-gate-1/plan.md from STATUS.md: run the next unchecked step, its gate at retry 0, and log it; stop at the PR or a red gate after three tries.`

---
plan: p116-build-1
tier: light
status: completed (delivered in #1709)
issues: "#1563, #618 (both already closed; the PR says `Closes` for each as the program asks)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex gpt-6.1-sol high audit
base: origin/dev at 002b76fc7
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-11-06.
- **Status:** completed; delivered in #1709, whose merge closes the plan.
- **Shipped:** #1709. The Receive QR is 240 px, and the sheet fits without a scroll (P116-10 A). The Holdings header is one row, and the meta reads the count alone (P116-11 C with the owner's note). The tests are unit tests plus smoke checks on Chrome and Firefox.
- **Dropped or rejected:** the frame sampler (D7), replaced by a one-off measurement in both browsers; a full-suite runtime comparison (D6), replaced by per-file times at base and head.
- **Left as it is:** Home's hero keeps "priced assets only", which the pick did not cover.
- **Known limits:** none.
- **Open items:** none.
- **Lessons:** none promoted. Both harness gotchas met here are already documented: Firefox's privileged-scope commands in `apps/extension/tests/e2e/FIREFOX.md`, and the popup CSP's `style-src-attr` in the `e2e-testing` skill.
- **Seeds retired:** no `/goal` or `/loop` seed of this plan is live.

# p116-build-1: the Receive QR at 240 px; the Holdings header counts tokens on one row

One arc, one PR against `dev`, no stack. It builds the two picks of decision page 116 (signed 2026-11-06) with tests. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are under `apps/extension/`.

## Decision ledger

- **D1 (owner, P116-10, #1563): A.** "QR at 240 px, centred, with the address and the network line beneath; the sheet fits with room to spare at every network name length."
- **D2 (owner, P116-11, #618): C, amended.** "One row, the meta right-aligned as '2 tokens · 1 unpriced'; a shorter suffix, same place." with the owner's note: "Let's do "C" but let's not mention the unpriced tbh." So the Holdings meta reads the count alone in every state that carried a suffix: one unpriced holding of two (`$17.31`, `2 tokens`), and a wallet whose holdings the list prices none of (`$0.00`, `1 token`, as `flagged-holdings` shows). Home's hero keeps its own "priced assets only" (`BalanceView.vue:323-333`): it was not part of the pick, and the owner can ask for it later.
- **D3 (panel): baseline in the page's module rule.** `Flex` has no `baseline` value; the summary drops `align="end"` and `.summary` sets `align-items: baseline`, as seven module rules already do. No new `Flex` option for one caller.
- **D4 (panel): the fit measures the live meta.** The meta becomes `white-space: nowrap; flex-shrink: 0`, so its rendered width is its whole width; `fitTotal` reads it through a template ref, and the ruler's meta copy, `metaRuler` and `.summary_ruler_meta` go. Kept, the copy would need `nowrap` too and would only repeat the live box. Without `nowrap` a long total fitted beside the narrowest word ("tokens") would push "2 tokens" onto two lines, which breaks the "one row" pick.
- **D5 (panel): `max-width: 100%` beside `width: 240px`.** The type-roles sweep lays the open sheet out at 240 px (`NARROW_WIDTH`), where a fixed 240 px code plus the 40 px body padding passes the view; `max-width` keeps the code inside the column there and changes nothing at 360 px.
- **D6 (panel, revised after Codex A1-C): no new e2e scenario, but the added browser work is costed.** Two existing tests take the real-layout checks jsdom cannot make (below). Their added steps (a rename, a second popup page, a second Receive, the one-row checks) are e2e cost, so the PR body reports both touched files' wall-clock at base and at head, per browser; nothing else in the suite changes, so their delta is the suite's. A full-suite before/after is not run: on this shared host its noise exceeds the few seconds measured.
- **D7 (panel, Codex A1-B): one summary height.** Baseline alignment changes how the empty meta, the skeleton and a shrunk figure share the line. Traced: the total's 26 px strut sets both the ascent and the descent in every state (the empty meta's synthesized baseline is its bottom edge, so it rises 1lh, less than the total's ascent; the shrunk figure is an inline box inside the full-size line), so the height should not move. No committed e2e checks the transitions: the smoke harness can hold incoming polls, proofs, projections, restores, passkey requests, mining and node stubs, but not the balance-list or price replies, and with a cached quote the states can resolve inside one frame, so a frame sampler would pass without seeing them (Codex round 2). A reply-holding seam is test infrastructure out of proportion to a cosmetic, traced-stable risk. Instead, phase 2 measures it once in both browsers (below) and fixes any difference in CSS before its gate passes. "Prices unavailable" at the 240 px sweep is not tested: 18 mono characters at 13 px are about 140 px, beside a 16 px dash, in a 192 px line.
- **D8 (implementation deviations).** The still-pointer test aims at the network line, because the 240 px sheet moved the snack off the address's last line; its `covered` assertion stays (phase 1). The canvas takes `data-testid="receive-qr"`, so the e2e reads it by testid; that adds no visible change. The PR's captures sit in `screenshots/` here: before frames from the page-116 lane's dev renders, after frames from this arc's smoke run.

## Outcome & Quality Bar

- **For whom:** a person who opens Receive to show the code or copy the address, and a person who reads the Holdings total.
- **Excellent:** (1) the Receive sheet shows the code, the name, the whole address, the network line and Close without a scroll at 360 × 600 in both browsers, with the longest name the field takes; (2) the Holdings total and "N tokens" share one row on one baseline, the count right-aligned and never wrapped, at any total the fit draws.
- **Good enough:** the code's modules keep today's non-integer CSS scale (4.9 px at 240, 6.5 at 320); no Storybook story is added.

## Assumptions

- **Facts:** (F1) `.qrcode { width: 100% }` draws the code at 320 px (`ReceivePopup.vue:132-133`); (F2) the sheet scrolls 33 px today and fits at 511 px with A (prototype measure, recon); (F3) the name fields cap a name at 25 characters (`NewNetworkPopup.vue:167`, `EditNetworkPopup.vue:121`); (F4) `summaryMeta` adds " · priced assets only" on `aggregate.partial` (`holdings.vue:133`); (F5) `fitTotal` subtracts the ruler copy's `min-content` width (`holdings.vue:152,224`); (F6) the narrow sweep runs at 240 px (`fixtures/type-roles.ts:722`); (F7) no popup code hears `onNetworkUpdated`, so a service rename shows on a new page only.
- **Claims that did not hold:** #1563 and #618 are closed already (completed 2026-11-03 and 2026-10-17); their titles name the full address and the $0.00 total, and page 116 reuses them for the two follow-ups. `Closes` on a closed issue changes nothing. The brief's "smoke through `agent.sh`" does not fit: `agent.sh` runs only the network config; smoke runs through `bun run test:e2e`, whose guarded launches claim their ports in `~/.agents/ports.md`. `PopupCard` itself has no 560 px cap; the frame gives it 558 px.
- **Inferences:** (I1) a 25-character name of the widest glyph wraps the network line to two lines (about 17 px), inside A's 47 px spare: proven by the e2e step, not by arithmetic. (I2) A name over 25 characters reaches the wallet only through a crafted backup; there the sheet scrolls as it does today, and Close stays reachable.
- **Asks:** none. [OWNER-ASKS.md](OWNER-ASKS.md) says so.

## Architecture & Implementation

CSS and one computed in two SFCs, plus tests. No new state, storage key, RPC, dependency or copy beyond D2's removal.

### Phase 1: Receive

- First, before any code change: build the armed Chrome and Firefox bundles at base. Run `bun run test:e2e -- tests/e2e/snackbar.test.ts tests/e2e/type-roles.test.ts --retry=0` on each, for D6's base times. Record them in `STATUS.md`.
- `src/popup/components/popups/ReceivePopup.vue`: `.qrcode` takes `width: 240px; max-width: 100%` (D1, D5). The column centres it; the dark `invert(1)`, the border and `pixelated` stay.
- `tests/e2e/snackbar.test.ts`, the test "in the Receive sheet a copy's snack sits 12px above where the sheet's Close button stops":
  - At rest, assert the card does not scroll (`scrollHeight <= clientHeight` on `popup-card-body`'s parent, as `reviewFit` reads it), Close lies inside the viewport, and `#my-qr-code` is 240 px wide. Then take `sheet-receive`.
  - Remove the "scroll a little" comment and the `scrollToEnd` call; delete `scrollToEnd`, which has no other caller.
  - Then rename the active network to `LONG_NETWORK_NAME` through `callService(..., "renameNetwork", ...)`, assert the first page's error arrays (a new page clears them, `fixtures/wallet-pages.ts:172`), open a new Home page (F7: the boot reads the active network again, `popup/app.vue:514`), open Receive and assert the line reads the whole name and the card does not scroll. Restore the name in a `finally`, because the fixture is file-scoped.
- Test assumptions: the success-snack test at `:391` still finds the snack over the address's last line; it asserts that (`:420`), so a moved snack fails loudly. Then aim the pointer at the line the snack covers, keep the assertion, and record the deviation.
- Unit: `ReceivePopup.test.ts` stays as it is. Its 27-character typed-name case covers whole rendering, and jsdom has no layout to measure a fit.

**Validation gate 1.** Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/popup/components/popups/ReceivePopup.test.ts`; the armed Chrome build, then `bun run test:e2e -- tests/e2e/snackbar.test.ts --retry=0`. Pass: exit 0 on each; the no-scroll assertions run green at both names. Layers: lint, typecheck, unit, smoke e2e.

### Phase 2: Holdings

- `src/popup/pages/holdings.vue`:
  - `summaryMeta` returns `""`, `"Prices unavailable"` or `"N token(s)"`; the suffix and its `aggregate.partial` read go (D2).
  - The summary `Flex` drops `align="end"`; `.summary` sets `align-items: baseline` (D3).
  - `.summary_meta` adds `white-space: nowrap; flex-shrink: 0`. `fitTotal` measures the live meta through a `ref`; delete the ruler's meta span, `metaRuler` and `.summary_ruler_meta` (D4).
  - Rewrite the three comments that describe a wrapping meta: `totalScale`, `TOTAL_GAP` and the ruler's.
- `src/popup/pages/holdings.test.ts`:
  - The pick's two cases in one `test.each`: two holdings, one unpriced, show the priced sum and the meta exactly `2 tokens`; two priced holdings show both summed and `2 tokens`. The summary text never contains "priced"; the all-priced row is the success control.
  - The pins at `:180`, `:540` and `:604` read the count alone.
  - Replace the narrowest-word fit cases (`:629-653`). The spy answers the meta's whole width. The total keeps 26 px when the room holds it plus the whole count (also a hair short, by `LAYOUT_ROUNDING`). It shrinks when the room holds it beside "tokens" but not beside "2 tokens"; the old measure kept 26 px there.
- `tests/e2e/type-roles.test.ts`, the seeded Holdings visit (`:897`; `refuseTestnet` stays armed through it, so the long seeded balance survives):
  - Wait for `holdings-meta` to read `1 token` and the inner figure's `--hero-scale` to be below 1 (`openHoldings` waits only for the page).
  - At 360 px and at `NARROW_WIDTH` (`atWidth`), assert one row: the summary's computed `align-items` is `baseline` (bottom alignment would pass the box checks); a text `Range` over the meta gives one line; its box lies inside the total's vertical span; its right edge is the summary's (± 0.5 px, for Firefox's 1/60 px layout).
  - Then `shotSend(page, "holdings-header", "holdings-summary")`.
- One-off height check (D7), not committed: on the head build in Chrome and Firefox, a scratch `page.evaluate` clones the live `holdings-summary` five times, with its own module classes, into the same column. It fills the clones as the states render: an empty meta beside the skeleton; the count beside the skeleton; the count beside the full figure; the count beside a figure at `--hero-scale: 0.5`; "Prices unavailable" beside the dash. It records each height in `lessons/phase-2.md`. A spread over 0.5 px is a CSS fix, re-measured, before gate 2 passes.
- `token-list.test.ts`'s existing `flagged-holdings` shot captures the unpriced-only header (D2); no change.

**Validation gate 2.** Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/popup/pages/holdings.test.ts`; the armed Chrome build, then `bun run test:e2e -- tests/e2e/type-roles.test.ts tests/e2e/token-list.test.ts --retry=0`. Pass: exit 0; the one-row and height assertions run (not skipped by `skipUnlessListPrices`) on both widths. Layers: lint, typecheck, unit, smoke e2e.

### Phase 3: both browsers, captures

- Run every gate once, in order: `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run --cwd apps/extension test:components`, `bun run test:all`.
- Build the armed Chrome and Firefox bundles at head. On each browser, run `bun run test:e2e -- tests/e2e/snackbar.test.ts tests/e2e/type-roles.test.ts tests/e2e/token-list.test.ts tests/e2e/navigation.test.ts tests/e2e/home-links.test.ts --retry=0`; Firefox adds `NULO_E2E_BROWSER=firefox`.
- Run once more on Chrome with `NULO_E2E_SHOT_DIR` under the lane's scratch dir, then copy `sheet-receive`, `holdings-header` and `flagged-holdings` in both themes to the lane's shots dir.
- After staging the plan files, run `bun run check:plans`.

**Validation gate 3.** Pass: every command exits 0 at retry 0 on both browsers. A red gets one rerun only when it is a known flake; a host-saturation red waits for load1 to fall, then reruns once. Layers: lint, typecheck, unit, component, smoke e2e on Chrome and Firefox, the plans gate.

## Security & Adversarial Considerations

- **Surface:** two popup screens; no trust boundary moves. The network name is person-typed text, and a crafted backup row can carry any length; Vue renders it as text (`ReceivePopup.test.ts:94-100`), and a long one only scrolls the sheet (I2). The code still encodes `appStore.account.address`, the same value the button copies; only its drawn size changes, and the modules shrink from 6.5 to 4.9 CSS px; that a phone still scans them is an inference no gate proves (the pick fixes the size).
- **Supply chain, crypto, privilege:** no dependency, key, permission, workflow or token changes. `lean-qr` stays at its locked version.
- **Logging:** no log line is added or changed.
- **Accessibility (owner's 2026-10-19 delegation):** no focus, Tab or ARIA change. The meta stays plain text in reading order after the total.

## UI impact

- **Receive sheet:** before, a 320 px code fills the column and the sheet scrolls 33 px to Close. After, the code is 240 px and centred, with the name, the address and the network line beneath; the sheet does not scroll. Sign-off D1, quoted above (frames `p116-10-a-01`, `p116-10-a-02`).
- **Holdings header:** before, "$17.31" with "2 tokens · priced assets only" wrapping beside it. After, one row on one baseline: the total left, "2 tokens" right-aligned; no unpriced suffix in any state. Sign-off D2, quoted above with the owner's note (frames `p116-11-c-01`, `p116-11-c-02`, less the suffix).
- **Home hero:** unchanged; it keeps "priced assets only".

## Post-implementation

Execution contract: this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `002b76fc7`. Plan-specific values:

- Step 1 is absent (`code_review: off`).
- Step 2, single arc: once, over `git diff origin/dev...HEAD` after gate 3 is green. Run `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then resume with `resume-codex.sh`. Send both verbatim rules and the adversarial ask. Stop at three rounds and report. Alongside round 1, run one Opus `general-purpose` review of the same diff.
- Log each round in `lessons/phase-3.md` and under Audit verdicts below. Rerun gate 3's unit and smoke commands on the final head.

## Delivery

- One arc, branch `p116-build-1-a1` off `origin/dev` carrying the plan commit; `gh pr create --base dev`, ready, no label, no stack. Title: `fix(popup): the Receive QR at 240 px; the Holdings header counts tokens on one row` (84 characters).
- Body: what changed and why; D1 and D2 quoted as the sign-offs; Home's hero left as it is; the validation runs; both touched files' wall-clock at base and head per browser (D6); light and dark captures; `Closes #1563` and `Closes #618`, each on its own line.
- Then `gh pr checks <n> --watch`. Close-out (standard step 4) lands as the PR's final commits; teardown (step 5) after the merge. Parallelism: none; three phases, one critical path.

## Audit verdicts

**Codex round 1** (gpt-6.1-sol, high, read-only; plan as first drafted): approve-with-changes. No new exploitable path; D4 and D5 judged right; F7's fresh-page read confirmed (`useProfileBootstrap.ts:178`).

| # | Finding | Label | Disposition |
|---|---|---|---|
| A | The box checks pass with `align-items: end` too, so they do not prove the baseline pick; the visit must wait for the count and the fitted figure | demonstrated | accepted: computed `align-items`, a text `Range`, both widths, explicit waits (phase 2) |
| B | The summary's height across loading states is unverified under baseline alignment; also "Prices unavailable" at 240 px | plausible but unverified | accepted: a frame sampler (D7), later replaced (round 2); the narrow "Prices unavailable" case rejected by the width trace in D7 |
| C | D6 hid the added browser work from the runtime budget | demonstrated | accepted in part: base and head wall-clock of both touched files per browser, not a full-suite run (D6) |
| — | The success-snack test is `:391`, not `:542`; a second page clears the error arrays; "scans well" is an inference | demonstrated | accepted (phase 1, Security) |

**Codex round 2** (resumed): A, C (the per-file delta judged proportional: files run sequentially, `vite.shared.ts:134`) and the minor fixes verified. One gap: the sampler can pass without seeing a loading state, since a cached quote can resolve inside one frame (`usePrices.ts:92`, `price/service.ts:201`); Codex asked for held replies inside the test. Plausible but unverified. Disposition: the sampler is dropped; no seam holds those replies, and building one is out of proportion (D7); a one-off measurement in both browsers replaces it.

**Codex round 3** (resumed): approve. The one-off measurement of the five states with the head build's classes establishes the height invariant without claiming transition coverage; Codex withdrew the held-reply ask, which assumed a seam it had not verified. Round 4 (resumed) confirmed the file records it: approve.

**Post-implementation, Codex round 1** (gpt-6.1-sol, high, fresh session over `git diff 002b76fc7..HEAD -- apps`): changes-required. The first rename sat before the `try`, so a lost answer after the service stored it skipped the restore (demonstrated by fault injection). Fixed by moving it inside. Four comment trims taken.

**Opus review** (general-purpose, alongside round 1): changes-required, three test-only findings, all taken. The QR canvas was read by its id, which breaks the e2e selector rule; it now has a testid. `receiveFit` had no success control; the lengthened sheet now reads `scrolls: true`. No case refit on a count-only change; a unit case was added, and it fails with `summaryMeta` dropped from the watch.

**Post-implementation, Codex round 2** (resumed over the fix diff): clean. It confirmed the restore under the same fault. An optional nit (the `receiveFit` doc restated its name) was taken.

## Seeds

Not run: the orchestrator owns the session. `/goal` and `/loop` would name this plan, `bun run test` and `bun run lint`, and the trunk `dev`.

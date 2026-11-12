---
plan: fee-window-1
tier: light
status: completed
issues: none (page 116 names #1571, closed, about other questions; no `Closes`, no `Part of`)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev 1593cf027
trunk: dev
post_implementation_standard: implementations-plan/README.md § Post-implementation standard at 1593cf027
---

## Outcome

- **Date:** 2026-11-12.
- **Status:** completed. Ships in #1803, `feat(fee-window): fee row strikes the approved figure, send button takes two lines`, which carries this close-out. It lands only on the owner's approve of its captures; that merge closes this plan.
- **Shipped:** P116-20 D in the raised-fee window's card: the block goes; the Fee row reads the new fee in `meta` (dollars in `fiat`), "was ~X FJ" struck through in the same `meta` role, an amber `--yellow` dot and the payer under the figures; the drawn row is `aria-hidden` and a hidden sentence in the old block's words is read. P116-21 A on its confirm: "Send" over "for ~X FJ ($Y)" in `caption`, wrapping instead of clipped, a 6 px inset holding 40 px until the line wraps (51 px at ~12.345678 FJ). Every `data-testid` stays; other footers unchanged.
- **Gates (retry 0):** at `87701c186`, `lint`, `typecheck:all`, `test`, `test:components`, `audit:vue`, `test:all`, `check:plans` green; `tx-sendTx-default` through `e2e:agent` green on Chrome (225.0 s; base 174.1 s) and Firefox (328.8 s; base 255.8 s) at `f8c0d13d5`, the unchanged canary moving with host load; `execute-steps` smoke green on Chrome and Firefox. Later commits touch only captures and plan files.
- **Deviations:** I1 did not hold at 400 px (Confirm is 176.9 px wide; page 116's 157 px was a 360 px viewport). The narrow e2e width is 320 px with the detail's computed `white-space` read at 560 px, not 359 px (D11). The footer test pins the `caption` class, not the inset, which the e2e height branches pin both ways.
- **Left out:** none of the picks.
- **Review:** plan audit conditional, five findings taken; final fresh pass approve on round 2; fix loop approve on round 2 (Audit verdicts).
- **Lessons:** none promoted: `lessons.md` sits at its 8 KiB budget. Two gotchas stay in `lessons/phase-0.md`: vitest leaves `composes … from global` unresolved, and the design Button's 359 px breakpoint wraps every label.
- **Known limits:** none.
- **Open items:** none filed. A1 (`OWNER-ASKS.md`) goes to the orchestrator with the report and ships (a).
- **Seeds retired:** the `/goal` and `/loop` seeds under Seeds.

# fee-window-1: the raised-fee window's fee row and its Send button, as page 116 picked them

Page 116 (signed 2026-11-06 17:04 UTC) picked D for the raised-fee card and A for its confirm; p110-build-1 closed without building them. This lane builds both in the window a dApp send opens when its fee came out above the approved figure (`apps/extension/src/popup/windows/fee/`), with tests, and brings captures back to a decision page. One arc, one PR; it lands only on the owner's approve.

## Outcome & Quality Bar

- **For whom**: a person approving a dApp send again because its fee rose, in a 400 px window, about to press the button that pays.
- **Excellent**: (1) the fee row alone says the fee rose, from what to what, in one face and size, and a screen reader hears both figures; (2) the button names the full fee and its dollars at every fee length the helper prints, never cut, 40 px tall when the two lines fit; (3) nothing else on the window moves: every `data-testid`, the arming rules and the keyboard path stay.
- **Good enough**: the struck figure drops under the new one when the two do not fit one line, at 400 px from two whole digits (OWNER-ASKS A1 holds its words).

## Sign-offs (verbatim; the visible budget)

- **P116-20 = D**: "No separate block: the fee row itself reads 'Fee 0.0024 FJ' with 'was 0.0021' struck through beside it and an amber dot on the row; the sheet is one card shorter." Its frame `p116-20-d-01`: "the method moved under the figure, and the card one row shorter". The owner's note: "I think I like "D" but what it looks pretty weird is the new "0.0024 FJ" font at the side- of "was 0.0021" with another font? … it's that ok?" The recorded answer (D2, same day): the struck was figure takes the same type role as the fee figure (one face, one size, struck through); every fee prints through the one helper (`~X FJ ($Y)`), so the row keeps that shape with the was figure beside it.
- **P116-21 = A**: "Two lines by design: 'Send' on the first, 'for ~0.021 FJ ($0.042)' as a smaller second line in the detail role; the button grows only when both lines are present; nothing is ever truncated." Its frames: `p116-21-a-01` ("at the button's usual 40 px"), `p116-21-a-02` ("at ~1.314209 FJ the second line wraps before "($2.628)" and the button grows instead of cutting anything").

## Assumptions

### Facts (at `1593cf027`; `recon.md` has the map)

- F1. `send/FeeRaisedCard.vue` renders, in order: a header row "Fee" + method title (`fee-raised-method`), `FeeMethodRow` (Available, hidden when the app pays), the block `fee-raised` ("Fee went up", `fee-raised-was` "Was ~X FJ", `fee-raised-now` "Now ~X FJ", `meta` role), the Priority row. It owns the window's quote and hands the new fee up (`v-model:now`).
- F2. `windows/fee/index.vue:136-139`: `confirmLabel` = `Send for ${feeFigure(...)}` from the question; `confirmDetail` = `(${nowFee.usd})` from the card's quote. `DappApprovalFooter` prints the detail as a `display: block` span after a space, so the button's name is one string; the fee window is its only `confirmDetail` caller.
- F3. The design `Button`'s `.medium` sets `min-height: 40px` and no height; `.wrapper` sets `white-space: nowrap; overflow: hidden`, so a too-long line is clipped, never wrapped.
- F4. The approval window's fee row prints the figure in `type--meta` (`--txt-primary`) and the dollars in `type--fiat` at 11 px (`--nulo-secondary`) (`send/FeeCostReadout.vue:120-129`).
- F5. No `data-testid` reader outside the two unit files, the footer test and `network/tx-sendTx-default.test.ts`; no smoke spec opens this window. The sandbox run gives about 0.66 → 1.31 FJ (`p116b` render notes); the spec seeds $7 per FJ (`fixtures/fee-quote.ts:14`).
- F6. `FeeCostReadout`'s sponsored row is the house pattern for a struck fee: visual `aria-hidden`, a `visually_hidden` sentence spoken instead.
- F7. `Text` defaults to `lh--100` (`line-height: 1`), so today's label is 13 + 4 + 13 px; with a `caption` detail two lines take 28 px and a wrapped detail 39 px, under `min-height: 40px`: growth needs an inset (Codex, verified).
- F8. This window asks only on a rise of at least one readout unit and over 10 % (`wallet/services/execution/fee-reask.ts` `feeRiseAsks`, from `dapp-send-executor.ts` `overCeiling`), so the two six-decimal figures always differ.

### Claims that did not hold

- C1. "the detail role and the button role exist": no type role is named `detail`. A's frames draw the second line in `caption` (11 px body), the render lane's reading of "the detail role" as the footer's detail span. The build follows the signed frames (D6).
- C2. "no issue is linked on page 116": both items name #1571, closed, about the execute window's six questions. Nothing to link.
- C3. "the e2e README names the fixture that raises a fee": the spec raises it inline (approves half the estimate as `feeCeiling`); the README names none.

### Inferences, as measured

- I1. Did not hold at 400 px: the e2e window's viewport is 400 px, so Confirm is 176.9 px wide (page 116's 157 px was a 360 px viewport) and the sandbox's "for ~1.314209 FJ ($9.199)" fits one line; ~12.345678 FJ wraps. The spec never relied on it: its two widths make both line counts occur (D8, D11).
- I2. Held: 40 px with one detail line and 51 px with two (Chrome captures); the e2e branches hold the same on Firefox.

### Asks

- A1 (`OWNER-ASKS.md`): the struck figure's words. Ships `was ~0.0021 FJ`, the helper's figure, without its dollars.

## Architecture & Implementation

- **Row (`FeeRaisedCard.vue`)**: the header row becomes the D row, `data-testid="fee-raised"`, `align="start"`. Left: a 7 px round `.dot` (`var(--yellow)`, `aria-hidden`) and "Fee" (`label-section`). Right, a column aligned to the end: a wrapping line of `FeeAmount` (`fee-raised-now`, `.fee_value` composing `type--meta`, `.fee_usd` composing `type--fiat` 11 px secondary) and `<s>` (`fee-raised-was`, `.fee_was` composing `type--meta`, secondary) reading `was {{ feeFigure(was) }}`, both inside one `aria-hidden` span; a `visually_hidden` span reading "Fee went up. Was ~X FJ. Now ~Y FJ ($Z)." (today's words, D5); the method title under them (`fee-raised-method`, `meta`, secondary: `d-01` draws it in that mono grey, and the page's render notes say "I kept it as a meta line under the figure"). The figures' line sets `overflow-wrap: anywhere`, as the detail does, so no fee length can clip in either place. The block goes; Available and Priority stay. `.method_size` goes.
- **Button (`windows/fee/index.vue`, `DappApprovalFooter.vue`)**: `confirmLabel` is "Send"; `confirmDetail` is `for ${feeText(...)}` once the question exists: the amount from the question (so it names the fee before the card mounts), the dollars from the card's quote (one quote, as today). The footer's `.detail` composes `type--caption` first, then `display: block`, `white-space: normal`, `overflow-wrap: anywhere`; with a detail the label takes a 6 px block inset (F7), so it reads 40 px when the two lines fit and grows with the text off the edges when the detail wraps, as `a-01`/`a-02` draw. Windows without a detail (execute, discover, capabilities) render as today.
- **Not taken**: a new `detail` type role (a contract record, regenerated utilities and inventory tests for one caller; the frames drew `caption`); a fee-window fixture seam for smoke (a new armed path in a production window to prove a CSS wrap the sandbox spec already exercises); lifting `EndpointStatusDot` (it carries its own testid and settings scope).
- No new tooltip, glossary term, stored key or shape; no copy beyond the picks and today's words.

## Security & Adversarial Considerations

- **Threat model**: the figures come from the worker's re-estimate of the held send (`feeQuestion.fee`, `approved`), parsed by `feeDisplay` (`BigInt`); the dApp controls only the transaction, so at most a large fee. The rendering stays text interpolation (no `v-html`).
- **Deception by truncation** is what A removes: today a fee of ~12.345678 FJ loses digits at both ends of the button. After A every printed digit stays visible, and the row and the button read the same figure from the same question.
- **Rounding**: in this window the struck and the new figure always differ by at least one readout unit (F8); #381's equal-figure limit is the Send page's cap rule, untouched.
- **Least privilege, crypto, supply chain**: N/A: no dependency, permission, key or network read changes. The captures run on the local sandbox only (never Testnet, never a funded account).

## Phases

Every phase closes with `bun run lint` and `bun run typecheck:all`, exit 0. Unit gates: `bun run test` and `bun run --cwd apps/extension test:components`, exit 0.

### Phase 1: the fee row (D) ✓

- **Change map**: `send/FeeRaisedCard.vue`, `send/FeeRaisedCard.test.ts`, `windows/fee/index.test.ts`, `tests/e2e/network/tx-sendTx-default.test.ts`.
- **Tests (component, card)**: with a quote: `fee-raised-now` "~0.021 FJ ($0.042)", `fee-raised-was` "was ~0.016 FJ" inside an `<s>`, no dollars; both carry `type--meta` (D2's same role); the dot and the visual line are `aria-hidden`; the hidden sentence reads "Fee went up. Was ~0.016 FJ. Now ~0.021 FJ ($0.042)."; "Fee went up" appears in no other element (paired with the sentence present); the method title follows the figures; Available and Priority unchanged. The window test reads the row through the same ids.
- **Network**: `fee-raised-now` = `pinnedFeeText(fee)`, `fee-raised-was` = `was ${feeFigure(approved)}`; each of `fee-raised-now`, `fee-raised-was` and `fee-raised-method` has at least one text line box of positive size (a `Range` over its contents), and every one lies inside `fee-raised-card`'s box.
- **Gate**: the change map's unit files green; unit gates.

### Phase 2: the Send button (A) ✓

- **Change map**: `windows/fee/index.vue`, `components/composite/DappApprovalFooter.vue` (+ test), `windows/fee/index.test.ts`, `tests/e2e/network/tx-sendTx-default.test.ts`.
- **Tests (component)**: window, one `test.each` over ~0.021, ~1.314209 and ~12.345678 FJ at $2 and ~0.021 FJ unpriced: label "Send", detail `for ${feeText(...)}` whole, row figures whole, the button's `textContent` `Send for ~X FJ ($Y)`. Before the card mounts the detail names the figure; before the question loads, "Send" and no detail. Footer: the detail carries `type--caption` and the label the inset class; without a detail neither (existing one-line test). The repeat-Enter, disabled and grant-arming tests stay green unchanged.
- **Network**: the confirm text stays `Send for ${pinnedFeeText(fee)}`. At two window widths set through the driver's `setViewport` (one where the detail wraps, one where it fits, both at or above the design's 359 px breakpoint), then restored with `null`: the detail has positive-size line boxes, all inside `fee-confirm-btn`'s padding box; the spec asserts one line at the wide width and more at the narrow one, then the button's height equals `fee-reject-btn`'s (±0.5 px) at the first and exceeds it at the second. Chrome and Firefox.
- **Gate**: the change map's unit files green; unit gates.

### Phase 3: gates, captures, PR ✓

- **Gates, once, in order, retry 0**: `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run --cwd apps/extension test:components`, `bun run audit:vue`, `bun run test:all`, `bun run check:plans`; `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/tx-sendTx-default.test.ts`, then the same with `NULO_E2E_BROWSER=firefox`, each against its base duration. Smoke: no smoke spec opens this window; `execute-steps.test.ts` (the footer's only smoke reader, armed build `VITE_NULO_E2E_EXECUTE_FIXTURE=1`, run env `NULO_E2E_EXECUTE_FIXTURE=1`) through `bun run test:e2e -- execute-steps --retry=0` on Chrome then Firefox. No scenario is added, so no full-suite budget run.
- **Captures** (D10), light and dark, into `~/.cache/nulo-backlog/fee-window-1/shots/` with `captions.json`: the window at 400 px with the row and the button at a short fee, at ~1.314209 FJ, at ~12.345678 FJ and with no price, plus the committed spec's natural `fee-window-raised`. Each caption records the button's measured height (40 px at the short fee) and states any figure substituted. `formatFeeJuice` has no length cap; `overflow-wrap: anywhere` makes the no-clip guarantee length-free, and ~12.345678 FJ is the longest case measured.
- **PR**: body quotes the sign-offs, embeds the captures from `pr-captures/fee-window-1/` (committed in one commit, removed in the next), lists the gates with outcomes and durations, and states the accessibility calls (D3, D5) as made under the owner's 2026-10-19 delegation.

## UI impact

- **Raised-fee window, fee card**: before: "Fee" + method title, Available, the block "Fee went up" / "Was ~0.016 FJ" / "Now ~0.021 FJ", Priority. After: "• Fee" with an amber dot, "~0.021 FJ ($0.042)" and "was ~0.016 FJ" struck beside it in the same role, the method title under them; Available; Priority. One row shorter. Sign-off: P116-20 = D, its D2 answer; A1 covers the struck figure's words.
- **Raised-fee window, confirm**: before: "SEND FOR ~0.021 FJ" over "($0.042)", cut at ~12.345678 FJ. After: "SEND" over "for ~0.021 FJ ($0.042)" in the smaller caption role; the button grows when that line wraps; nothing cut. Sign-off: P116-21 = A.

## Delivery

| Arc | Branch | Phases | Stacks on | PR title | Lands |
|---|---|---|---|---|---|
| 1 | `fee-window-1-a1` (off `origin/dev`, carrying the plan commit) | 1 to 3, close-out | `dev` | `feat(fee-window): fee row strikes the approved figure, send button takes two lines` | no `Closes`; on the owner's decision page |

`gh pr create`, ready, no labels; add `e2e:extension-network` only if the path filter skips the network lane. The close-out (Outcome, archive move, index line) is the PR's final commits. Parallelism: none; phases share files.

## Post-implementation

Cite `implementations-plan/README.md` § Post-implementation standard at `1593cf027`. Single arc: one Codex loop over `1593cf027..tip` (`~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`), the standard's two rules verbatim, hard stop at three rounds; one Opus review (`Agent`, `general-purpose`) beside round 1. Anything visible beyond the UI impact lines goes to `OWNER-ASKS.md` and is left out. Merge and teardown are the orchestrator's.

## Decision ledger

| # | Decision | Codex (plan audit) | Call and reason |
|---|---|---|---|
| D1 | The fee figure's role | agree: established roles | `meta` + `fiat` 11 px, as the approval window's fee row (F4). |
| D2 | The struck figure's role | agree | The same `meta` role, secondary, as the D2 answer says. |
| D3 | The dot | agree | Local 7 px `--yellow` span, `aria-hidden`: decorative; the struck figure and the sentence carry the meaning (accessibility call). |
| D4 | Reuse `EndpointStatusDot` | agree: no | Its testid and scope are the endpoints list's; five CSS lines. |
| D5 | Spoken form | agree | `aria-hidden` visual plus a hidden sentence in today's words (F6; accessibility call). |
| D6 | The second line's role | agree | `caption`, as the signed frames (C1); no new role. |
| D7 | Growth | conditional: line-height 1 means `min-height` alone never grows; specify the inset | Taken: 6 px block inset with a detail (F7, I2). |
| D8 | The fit proof | revise: measure text bounds; pair growth with the short control; then (final pass) observe both line counts in a browser and refuse empty rectangle lists | Taken: positive-size line boxes inside the button and card; two window widths through the driver's `setViewport` make both branches occur on the same held question, each asserted; one `test.each` for the lengths. No fixture seam. |
| D9 | The `.fee_value`/`.fee_usd` classes | agree: local | Restated in `FeeRaisedCard`; `FeeCostReadout` (shared with the Send page) untouched. |
| D11 | The narrow e2e width (fix loop) | 359, to stay above the breakpoint | 320 plus the computed `white-space` at 560: a 359 branch would pass or fail on the sandbox fee's digits; Codex approved in round 2. |
| D10 | Captures at fixed lengths | agree: disclosed, disposable, out of delivery | A throwaway local branch substitutes the question's figures in the real window over the sandbox, never pushed; captions say so. |

## Audit verdicts

- **Codex plan audit** (session `01a1d04c`, gpt-6.1-sol, high): conditional approve. Accepted: the rounding paragraph was stale (F8, verified in `fee-reask.ts`); growth needs an inset under `line-height: 1` (F7, verified); the fit proof measures text line boxes and pairs growth with a one-line control (D8); `overflow-wrap: anywhere` on the row's figures makes the guarantee length-free, in place of measuring an unbounded maximum; the length cases are one `test.each`. Agreed with the rest (D1-D6, D9, D10, the `confirmDetail` composition, the method title's placement and role as `d-01` draws them, A1 as the only ask). Rejected: none.
- **Codex final fresh pass** (session `01a1d051`, gpt-6.1-sol, high): conditional approve. Taken: both height branches observed in a browser (two widths through `setViewport`, D8); positive-size rectangles before containment; recon's stale #381 line corrected. Answered with evidence: the method title's mono grey is drawn in `d-01` and named in the render notes, so no ask. Round 2 (resumed): **approve** ("No remaining material finding"; it traced the driver's `setViewport` on Chrome and Firefox popups).

- **Fix loop** (Codex session `01a1d06c`, gpt-6.1-sol, high; one Opus `general-purpose` review beside round 1): round 1 changes requested, both legs finding the narrow width (320 px) under the design Button's 359 px breakpoint, where its own `white-space: normal` would hide a missing `.detail` rule. Taken by cause: each width records the breakpoint and the detail's computed `white-space`, read `normal` at 560 px; a 359 px branch was not used, since its 129.5 px room sits at the sandbox detail's own width (D8). Also taken: the strikethrough comment, a stale e2e comment, the visible "Fee" label inside the hidden drawing (the sentence is heard once; accessibility call). Not taken: a unit check of the footer's hashed inset class (the e2e height branches pin the inset both ways). Round 2 **approve**.

## Seeds

```
/goal All phases marked ✓ in implementations-plan/fee-window-1/plan.md, each gate reported passing in the transcript; the Codex loop converged; one PR open, ready, carrying the close-out; bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/fee-window-1 forward per its plan.md; decide with Codex at high on gpt-6.1-sol; never merge; stop once the PR is open with checks read.
```

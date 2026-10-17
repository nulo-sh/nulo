# Phase 0: planning consults

## Recon (Sonnet Explore, one sweep, six capabilities)

Returned the reuse map in `recon.md`. Its one gap (whether `rows.test.ts`'s nameless row is in flight or terminal) was closed by reading the spec: it is a terminal journal row (`progress.stage: "cancelled"`).

## Browser probe: selection inside a native button

Question: does `user-select: text` on a child of a native `<button>` (whose own rule is `user-select: none`, `packages/design/src/base.css`) make the child drag-selectable, as it does inside ScopeAddress's `span role=button`? A plain page, headless Puppeteer, Chrome 152 and Firefox 153:

- a drag inside the child selects `0x09cb...b7d0` in both, and ends in a `click` on the button with the selection still set;
- a drag from text above into the button selects both;
- Enter and Space on the focused button dispatch `click` with `detail` 0, a mouse click with `detail` 1, in both.

So the issue's proposed fix works on the native button unchanged, and `detail` tells a key-made click from a pointer one.

## Codex plan audit (gpt-6.1-sol, high, session 01a14a3d)

Verdict: approve with changes. C1 (medium): the header copy test clicks with `detail 0`, so a guard refusing every pointer click would pass; the drag e2e crossed the address but never started inside it. C2 (low): F1, I1 and one security sentence overstated. Both accepted; see plan.md § Audit verdicts.

## Opus 5.5 plan audit (Plan agent)

Verdict: approve with changes. Two demonstrated defects accepted: smoke needs an armed build that `audit:vue` disarms (O1), and the orphan card never shows a dApp task, so the planned change there could only be tested by bypassing the account containment (O2). O3/O4 duplicated C1. O5 (the Holdings meta line's form) rejected against the signed drawing. O6, O7 accepted; O7's optional `tokenHeroCandidates` cleanup rejected. O8 (a dApp named " ") is a known limit, filed at close-out.

## Codex verify round (resumed session 01a14a3d)

Approve, no new material finding: the accepted fixes are reflected, the gates and the smoke recipe are runnable as written (static check), the #628 boundary and the #618 reactive view match the source. One recon remnant on `showFullBalance` fixed.

## Amendment: #583 B (P35-08), Codex round on Phase 6 (session 01a14a5d, gpt-6.1-sol high)

Approve with changes. The flex line-break argument holds for a given container width (direction's hypothetical width + 6 + the slot's 19 px decides the wrap); no `align-content` regression with an auto height. A1 (qualify the extreme case) and A3 (assert the 4 px gap and the left edges) accepted; A2 (a dApp on the nine-digit fixture) rejected as a committed test, measured once in the scratch ladder instead. Details in plan.md § Audit verdicts.

## Phase 2 (#639): a click inside an existing selection

The plan's e2e control ("a plain mouse click after the drag writes the full address once") failed on Chrome: no write. A probe logged the selection at each event of a click inside a selected address: Chrome 152 still holds the selection at `mousedown`, `mouseup` and `click`, and drops it after; Firefox 153 drops it before `click`. So on Chrome the first click on a selected address only clears the selection and the next one copies, as on every `selectedWithin` site (ScopeAddress, ScopeClassId). Not a new behaviour; the control now clears the selection first, and the PR body says it.

## Post-implementation: Codex round 1 and the Opus review

Codex (session 01a14a8e, gpt-6.1-sol high): approve with changes, two lows (a predicate table that passed a `.some` mutant; five comments). Opus (general-purpose): approve with changes, lows only (test placement and a false title, a dead parameter, test cleanup, wrapping). Both folded except the `DAPP_LABEL` doc deletion and two out-of-scope notes; plan.md § Audit verdicts has each disposition.

## After the PR opened: #649 merged into `dev`

#649 (the type scale) conflicted with the PR on one comment in `TransactionCard.vue`; the merge kept the wrap and #649's 10px chip rule. Its 13 px dollar figure narrows the chips' room, so on Chrome the wrap now starts at about $250 (row 71 px, the one-line row 68 px) and from about $10K the direction chip breaks above the dropped chip (84 px). `rows`' large transfer at 12,345.67 failed its one-line direction read; it now seeds 1,250 USDC, and OA-3 (#677) carries the new figures. The one-line rows below the point stay byte-identical to the base's rules.

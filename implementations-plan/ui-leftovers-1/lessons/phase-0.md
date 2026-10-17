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

# fees-display-1 owner asks

## OA-1 — a fee inside a button's label: the button's face or mono

**Surface:** two buttons gain the fee grammar: the Send review sheet's submit when a queued send asks again, and the dApp fee window's Confirm. The lane's rule says a fee value renders in a mono role; a button's label renders in the button's role (Space Grotesk, upper case, bold: `type--button` at 14 px on the review's CTA, `type--button-md` at 13 px on the fee window's Confirm).

| Option | Label |
|---|---|
| **A (ships now)**: the label keeps the button's face | SEND FOR ~0.021 FJ ($0.001), all in the button's face |
| B: the figure in mono inside the label | SEND FOR in the button's face, then ~0.021 FJ ($0.001) in mono, regular weight |

**Recommendation:** A. A button's label reads as one control; a figure in another face and weight inside it reads as two pieces. Every other fee figure in the arc is mono either way.

**What ships now:** A. B needs a content slot on the shared approval footer (`DappApprovalFooter`) and markup in the review sheet's submit; no other change.

**Answered: A** (orchestrator, D-orch, 2026-10-17). The lane's mono rule covers fee values shown as values (rows, lines, cells), not the text of a control; the review's re-ask submit and the fee window's Confirm keep their face with the fee figure inside their label.

**Observed after the answer** (tracked in #734): the Send review's full-width re-ask submit, `SEND FOR ~0.000032 FJ (<$0.001)`, reaches the button's edges at 360 px; the button is `nowrap` with `overflow: hidden`, so a figure one or two characters longer (a fee of 10 FJ or more, or $10 or more) would clip.

Not asked: the pick (P36-04 A) is applied as written, so a figure after "About", "up to" or "at most" also takes `~` ("About ~X FJ ($Y)"); plan.md D5 records why.

## OA-2 — the approval window's app-paid fee figure: weight 400 or 600

**Surface:** the approval window's line for an app that pays its own fee, "Fee up to ~X FJ ($Y)". The figure moves from the body face into a mono role under the lane's rule, at its old 12 px. It was the `name` role, weight 600; the 12 px mono role (`fiat`) is weight 400, and no mono role is 12 px at 600.

| Option | Figure |
|---|---|
| **A (ships now)**: the mono role's weight | ~X FJ ($Y) in mono, 12 px, weight 400, primary color |
| B: keep the emphasis | ~X FJ ($Y) in mono, 12 px, weight 600: a new type role in `@nulo/design` |

**Recommendation:** A. Every other fee figure in the arc is mono at weight 400; the primary color still sets the figure apart from the secondary words around it. B adds a type role for one figure.

**Open, tracked in #734.** **What ships now:** A. B needs a 12 px, weight 600 mono role in `packages/design/src/token-contract.ts` and the figure's class moved onto it; no other change.

## OA-3 — the fee window's Confirm: the figure alone, or with its dollars

**Surface:** the dApp fee window's Confirm (`DappApprovalFooter`, a half-width button beside Reject, `type--button-md`). The plan wrote it as the review's submit, "Send for ~X FJ ($Y)". Rendered, that label overflows the button: the arc's first screenshot shows "D FOR ~0.00451 FJ ($0.0", clipped on both sides.

| Option | Confirm |
|---|---|
| **A (ships now)**: the figure alone | SEND FOR ~0.00451 FJ; the card above reads "Now ~0.00451 FJ ($0.032)" |
| B: the dollars too | SEND FOR ~0.00451 FJ ($0.032), with the footer's label allowed to wrap onto two lines |

**Recommendation:** A. The dollars sit one line above the button, and a two-line button label in the shared footer reaches every approval window.

**Open, tracked in #734.** **What ships now:** A. B needs `DappApprovalFooter` to let its confirm label wrap, and the window's label built with `feeText`; no other change.

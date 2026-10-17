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

Not asked: the pick (P36-04 A) is applied as written, so a figure after "About", "up to" or "at most" also takes `~` ("About ~X FJ ($Y)"); plan.md D5 records why.

# p126-build-1: owner asks

One ask, raised by arc a2's browser gate. Every other visible change in this lane is inside the owner's picks on pages 126 and 130, quoted in `plan.md`'s decision ledger and `UI impact` lines; the focus, keyboard and ARIA calls are made under the owner's 2026-10-19 accessibility delegation.

## OA-1: an open step's details below 300 px

- **Surface**: the approval window at its narrowest (a 240 px side panel), an open step's or authorization's details (`apps/extension/src/popup/windows/execute/SendTxSummary.vue`, `.guide`).
- **Why ask**: the rail's number column and the guide under an open step (3 px, a 1 px line, 11 px) leave 137 px at 240 px. A shortened 32-byte value (`0x00000000..000064`, 18 glyphs in the mono role) needs 140.4 px, so every raw field and every authorization's inner hash broke over two lines, which the window's type-role sweep refuses on Chrome. At 400 px nothing changes.
- **Options**: (a) below 300 px the guide indents by its line alone (no margin, 1 px before the text), as the value tree's levels past the fourth already do there: 150 px, every raw field, inner hash and top-level value on one line on Chrome and Firefox; an address three levels down a struct still breaks (`deep`: 109.2 px in 105). (b) below 300 px an open step's details run under the number column, the guide on the rail's own line: about 171 px, which also holds that address. (c) as drawn: the identifiers split and the gate stays red, so it cannot ship.
- **Recommendation**: (a): the smallest change, a rule the window already follows below 300 px; it holds every top-level shortened value, raw field and inner hash, and leaves a nested address deep in a struct breaking at 240 px, which a dApp can send; (b) holds that too but changes how the narrow rail reads.
- **What ships now**: (a). Captures: `execute-batch-all-open-240` and `execute-deep-all-open-240`, light and dark, in the PR body.
- **Answer**: pending.

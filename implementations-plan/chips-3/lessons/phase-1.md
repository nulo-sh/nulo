# chips-3 phase 1-2: build log

- 2026-11-06 An absolutely positioned badge's `right: -6px` is measured from the icon box's padding edge, so it sits 5 px past the 1 px border box: rows.test compares the way badge with the status badge instead of a literal.
- 2026-11-06 The dApp transfer's lone app chip has room for its 96 px cap at 360 px with "USDC" and $1,250, so the 20 px floor is not reached by any seeded row; the floor ladder is measured once in phase 3.

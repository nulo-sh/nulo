# sheet-1, arc 1, phase 1: the sheet

- The card needs no explicit `flex`: a column flex item's default is `0 1 auto`, and `overflow: auto` makes its automatic minimum height 0, so it shrinks to the frame and scrolls.
- Two comments outside the change map named the 40 px rise: `tests/e2e/helpers/legal-drivers.ts` (`pointerClick` and `waitUntilStill`); both now say what still moves (a card sits back 15 px when the stack changes).
- Gate: unit layers, storybook build, 8 smoke files on Chrome (37 tests, 3:54) and 3 on Firefox (18 tests, 3:17), all green at retry 0.

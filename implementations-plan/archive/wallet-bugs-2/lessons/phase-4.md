# wallet-bugs-2: phase 4 (#638, a drag is not a click)

- `endsSelection(e)` in `utils/selection.ts`; every click-to-copy handler in the change map returns on it (the hero "Copy hash" links stay as they are: `user-select: none`). `AddressDisplay` takes the event as a parameter instead of reading the global `event`.
- Red on base, unit: `TxHashRow`, `AddressDisplay` and the transaction page's From card each copied or flipped on a drag's click (the components reverted, the helper kept); `selection.test.ts`'s detail-1 case failed with the helper absent.
- Red on base, browser: with About's guard removed (testids kept), Chrome's drag inside the wallet version line copied (`expected [ …(2) ] to have a length of 1 but got 2`).
- The About case first sat in the middle of the drag test: its copy's toast then covered the Legal note the next drag starts from (Chrome). It moved to the end of the test, the version line scrolled to the centre (scrolled to `nearest`, the sticky header covered its first character).
- Gate: unit 1751/1751 (`selection`, `components`, `modules/tx`, `pages`), lint 0, typecheck:all 0, `navigation.test.ts` Chrome 8/8 (file 23.1 s, run 34 s), Firefox 8/8 (file 45.6 s, run 57 s).
- Host load sat above 150 for several minutes before the Chrome build; the helper waits for it.

# Phase 7: proof that 360 is unchanged

## The CSS diff

The built CSS of `dev` at `e7192fa8d` against the branch's, both armed builds, flattened to (block path, declarations) entries with CSS-module hashes and line suffixes stripped, compared as multisets (scratch `css-diff.ts`). Chrome and Firefox give the same list: 79 entries added, 1 removed, 77 of them inside `@media (width < 359px)`. On the earlier base (`e36474acd`), before the rebase, it was 78 and 1. Outside `@media (width < 359px)` only the `body` rule (`min-width: var(--base-width)` becomes `max-width: 100%`) and `.trailing_inline { display: contents }` changed.

## The pixel compare

A scratch spec run from `dev`'s test tree loads either build through `EXTENSION_PATH`, seeds the same wallet (a token, a transaction from a dApp with a long name, a receipt, a failed send record, the FPCs, all four authwit kinds, a USD quote, a long contact, Developer Mode) and shoots 42 pages, surfaces and the logs window at 360, light and dark.

Stabilised:
- the extension's CSP refuses an inline `<style>`, so a constructed stylesheet turns animations, transitions and the caret off;
- `document.fonts.ready`, a blur, two frames;
- the seeded rows carry fixed times against one `now`, written to a file once; pinning `Date.now` itself broke the UI's timers, so it is not pinned;
- each run's own ids (account, profile, receipt, network) differ by run: hex runs of those ids are rewritten to one fixed id of the same length, and the QR canvas is hidden.

Counts (sharp raw buffers, any channel difference counts):
- noise control, `dev` against a second `dev` run: 0 changed pixels on 84 pairs, on Chrome and on Firefox;
- positive control: one planted pixel is found (1 of 1);
- `dev` against the branch: Firefox 0 on 84; Chrome 0 on 83, and 5 on Home in light. On the earlier base the branch read 0 on 84 on both.
- Chrome's 5 are a raster state, not the branch: Home's first light frame comes in one of two states at two glyph edges (the empty-value dash, the "G" of "Get started"), and the branch's run caught the other one. A second capture of the branch repeated it. A probe that shot Home on its first visit and again after leaving it, in each build, found the builds identical in every pass and each build's two visits 5 px apart, at those pixels; every box it measured (the body, the fee juice label, Send, the Get started header and their ancestors) matched to 0.001 px.
- Earlier, one Firefox capture showed 1,102 changed pixels on two pages: a seeded hash's last four digits rewritten by the id normaliser, since that run's random ids held the same four hex digits. A second capture found 0.

Not pixel-compared: the dApp windows at their own widths (400 px and wider). No rule the branch adds matches there, and the CSS diff shows the `body` change is the only other one.

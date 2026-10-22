# fit-gate-1 phase 2: the two fits, with pictures

- Pictures: a scratch hook in `expectFitsNarrow` (`shotSend` at 360 and at 240 px, both themes), applied for the captures and reverted, never committed. Token metadata from the seeded smoke visit; Senders from `type-roles-windows`' authwit test (network, proverless).
- The fits: `TokenMetadataPopup.vue` (a capability's mark goes under its key, at the right) and Senders (a sender's actions go under its address, at the right), each `flex-wrap: wrap; row-gap: 6px` with the trailing box `margin-left: auto`, under `@media (width < 359px)` only.
- Built CSS, before and after, Chrome and Firefox builds (byte-identical CSS between the two): two bundles change. `popup-*.css` gains only the `@media (width<359px)` block; `senders-*.css` gains it and renames its module hash (the hash follows the file). No rule outside the media query changes.
- 360 px pixel compare, before and after, per browser and theme: the popup and the page body are identical. The only differing pixels are the dimmed header's account address (token metadata dark: rows 36-39; Senders: rows 36-44, x 83-169), which the seeded wallet generates per run (`0x07fc…e8e5` before, `0x2dbe…7f2f` after); in the light token-metadata pair the popup's ledge covers it, so that pair is identical outright.
- Sheets, `screenshots/<browser>-<surface>-240.png`: before light, after light, before dark, after dark.
- Gate, retry 0: lint, `typecheck:all`, `bun run test` (903 files) exit 0. `type-roles-windows` network: Chrome 5 passed (289 s), Firefox 5 passed (391 s). `type-roles` smoke: Chrome 14 passed, 1 skipped (132 s; tests 125.7 s), Firefox 15 passed (218 s; tests 193.0 s).
- One armed Firefox build died at a 50 s `timeout` under load (load1 ~145); rebuilt with a longer bound.

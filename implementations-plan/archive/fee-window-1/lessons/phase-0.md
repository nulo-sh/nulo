# Phase 0: planning consults

- Recon: one Explore sweep on sonnet (reuse map in `recon.md`).
- Codex plan audit (session `01a1d04c`, gpt-6.1-sol, high, read-only): conditional approve. Five findings, all verified and taken: stale rounding paragraph (`feeRiseAsks` asks only on a rise of at least one readout unit); `Text`'s `line-height: 1` means `min-height` alone never grows the button, so a 6 px inset; fit proof by text line boxes, not element scroll sizes; growth paired with a one-line control against Reject; `overflow-wrap: anywhere` on the row too.
- Codex final fresh pass (session `01a1d051`, gpt-6.1-sol, high, read-only): conditional approve, then **approve** on resume. Taken: both height branches observed in a browser through two `setViewport` widths; positive-size rectangles before containment; recon's #381 line corrected. The method title's mono grey kept on the frame and render-note evidence.

# Phase 1-2: build consults

- Fix loop round 1 (Codex `01a1d06c` + one Opus review): both flagged the 320 px e2e width under the design Button's 359 px breakpoint, where `@media (width < 359px) { .wrapper { white-space: normal } }` would mask a missing `.detail` rule. Fixed by reading the detail's computed `white-space` at 560 px. Round 2: approve.
- Network runs (retry 0): Chrome 213.6 s then 225.0 s after round 1; Firefox 351.6 s then 328.8 s. The 560/320 branches met level/taller on both.
- Gotcha: vitest runs with CSS processing off (`apps/extension/vitest.config.ts` `css.include`), so a module rule's `composes: type--x from global` never reaches the DOM in a unit test; a test that pins a role needs a static `type--x` class on the element.
- Gotcha: `packages/design/src/ui/Button.vue`'s `@media (width < 359px)` sets `white-space: normal` on every button, so an e2e that narrows a window under 359 px to force a wrap cannot see a missing wrap rule; read the computed `white-space` above it.

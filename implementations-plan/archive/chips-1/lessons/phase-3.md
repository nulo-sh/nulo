# chips-1 phase 3: full gates, captures, review

- `test:all` 0 (178 s); `audit:vue` 0 (199 s). `audit:vue` builds an unarmed `dist/chrome`, so rebuild the armed smoke dist after it.
- Captures (Chrome, 360 px, after): ALPHA 39.3 px whole, TESTNET 53.1 whole, LOCAL NETWORK 100.9 cut to 89.6 (61.1 before); Lock 29 × 28, the network chip 28 tall.
- Full smoke, Chrome, retry 0: 62 files passed, 11 opt-in skipped, 33 min at load average ~150.
- Review round 1 (Codex `01a18d6c`, Opus diff review): both found the dot crossing the network chip's border at 240 px. The scratch spec measured it on the head before the fix: chip 18 px wide at x 175.4, dot at x 190.4 to 196.4, so 3 px past the border. A zero-width name still takes the 6 px gap. The narrow sweep checks text and the view's edges, not a dot inside its chip. Fix: the `<359px` rule keeps 3 px sides and a 4 px gap (D6). `appearance.test.ts` at 240 px after the fix: dot 8 px from the left edge, 1.6 px from the right.
- The scratch spec's `waitForSelector(..., { visible: true })` on the name times out at 240 px, where the name's box is 0 wide: switch at 360 px, then resize.
- Review round 2 (Codex, resumed 01a18d6c, over 633375807): clean. Converged.
- The final head's `test:all` failed `header-layout.test.ts`: `declarationsOf` (42 callers) merges every rule with a selector, the last winning, so the new `(width < 359px)` rule's `6px 3px` replaced the base `6px 8px`. A test-local `declarationsAt(selector, media?)` reads them apart; the shared helper is unchanged. Round 3 (Codex, resumed): clean.
- Final head: lint 0, `typecheck:all` 0 (51 s), `test:all` 0 (16 workspaces, 174 s). Firefox full smoke 66 passed / 7 skipped (3148 s); network files Chrome 7/7 (350 s with setup), Firefox 7/7 (383 s).

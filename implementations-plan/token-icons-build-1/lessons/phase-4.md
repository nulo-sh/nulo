# Phase 4: list rows, Send's asset row, token page

- Mocked price clients that omit `tokenIcons` throw in `iconFor` (`Object.hasOwn(undefined, …)`); only the tests that mount a surface drawing the mark were given the field. The other mocks stay as they were, as they already omit `flaggedTokens`.
- Send's picker lists token balances, not tokens: a seeded token row with no balance row and no worker restart shows no picker row. The held-list spec reads the listed token's mark on Send's asset row (which reads tokens) and the added token's on its token page header.
- `agent.sh` runs the network config only; the smoke spec runs through `bun run test:e2e` after the armed build (phase 2's lesson), its list host claiming its port from the host registry (`listenClaimed`).
- Captures come from a throwaway spec kept outside the repo, copied into `tests/e2e/` for one Chrome run under `NULO_E2E_SHOT_DIR` and removed: six seeded token rows with balances, a price row, then a worker restart (the balance service reads its token map only as it starts). Home shows three rows (`HOME_TOKEN_ROWS`) ordered by value then name, so the captured names were chosen to put a logo, initials and a flagged row in those three.

## Arc 2 review loop

- Codex round 1 (session `01a1c73e`) and an Opus diff review ran in parallel. Both found the stale `keyOf` in `auto-imports.d.ts`'s `declare module 'vue'` block (`skipLibCheck` hides it; the build's generated-sources check does not): hand-editing a generated file leaves its second block behind, so rebuild and compare instead.
- The overflow both legs traced was checked with a throwaway spec (32 `W`s for a symbol, 12,345.67 on each side): after `min-width: 0` on the two left wrappers the symbol shrinks to 88 px with its ellipsis and the split ends at the row's edge.
- Codex round 2 (resumed over the fix commit): clean. The loop converged at round 2.

## The rows' mark against the row's dollar figure

- The full Chrome smoke suite after went red on `type-roles.test.ts`: the token row's figure for $123,456,789,012,345.68 read 3 lines, where P46-08's guard allows 2. The touched spec and every unit and component gate were green, because only that sweep seeds a figure past $1T on a row.
- A throwaway probe measured the row in Chrome. The row is 312 px and the balance column 101.4 px (its nowrap split). The mark and gap take 44 px, leaving 166.6 px for text. The figure breaks after "≈ " and needs 179.4 px for the rest (13 px mono, about 7.8 px a character). So it has a 12.8 px deficit, and a mark and gap fit only within 31.2 px. A realistic split (12,345.67 on each side) leaves the figure 89 px, so "≈ $24,691.34" wraps too.
- A cap is a ceiling: `max-width` cannot give room the row does not have. With `min-width: 0` on the left wrappers the text already yields everything flex can give. Every remaining lever is visible: the type size, the mark's size or gap, the figure's format or wrap point, or the balance column.
- Codex consult (session `01a1c81b`): no cause-level fix keeps both picks; leave out the rows' mark. Done as D17, with the owner's options in OWNER-ASKS A4 and captures of option (a) kept outside the repo.
- For arc 3: Activity rows take a 16 px mark inside rows that also carry an amount and a dollar figure. Measure their text column against the widest figure the type-roles sweep seeds before building.

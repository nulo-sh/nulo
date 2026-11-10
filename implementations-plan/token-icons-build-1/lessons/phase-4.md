# Phase 4: list rows, Send's asset row, token page

- Mocked price clients that omit `tokenIcons` throw in `iconFor` (`Object.hasOwn(undefined, …)`); only the tests that mount a surface drawing the mark were given the field. The other mocks stay as they were, as they already omit `flaggedTokens`.
- Send's picker lists token balances, not tokens: a seeded token row with no balance row and no worker restart shows no picker row. The held-list spec reads the listed token's mark on Send's asset row (which reads tokens) and the added token's on its token page header.
- `agent.sh` runs the network config only; the smoke spec runs through `bun run test:e2e` after the armed build (phase 2's lesson), its list host claiming its port from the host registry (`listenClaimed`).
- Captures come from a throwaway spec kept outside the repo, copied into `tests/e2e/` for one Chrome run under `NULO_E2E_SHOT_DIR` and removed: six seeded token rows with balances, a price row, then a worker restart (the balance service reads its token map only as it starts). Home shows three rows (`HOME_TOKEN_ROWS`) ordered by value then name, so the captured names were chosen to put a logo, initials and a flagged row in those three.

## Arc 2 review loop

- Codex round 1 (session `01a1c73e`) and an Opus diff review ran in parallel. Both found the stale `keyOf` in `auto-imports.d.ts`'s `declare module 'vue'` block (`skipLibCheck` hides it; the build's generated-sources check does not): hand-editing a generated file leaves its second block behind, so rebuild and compare instead.
- The overflow both legs traced was checked with a throwaway spec (32 `W`s for a symbol, 12,345.67 on each side): after `min-width: 0` on the two left wrappers the symbol shrinks to 88 px with its ellipsis and the split ends at the row's edge.
- Codex round 2 (resumed over the fix commit): clean. The loop converged at round 2.

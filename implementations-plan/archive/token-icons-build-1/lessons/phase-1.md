# Phase 1: format and reader

- The issuer-file success controls run in the host's tree test (phase 2), which strictly parses the real source; `icon.test.ts` uses structural samples (a letter mark, clip paths with a same-file `url(#…)`, fill rules) so the package never reads `infra/`.
- `readTokenList` drops a price id with no feed, so a signed-list expectation reads `entry(0, { priceId: undefined })`.
- Gate: `bun run --cwd packages/token-list test` (86 passed), `bun run lint`, `bun run typecheck:all`, `bun run test:all`, `bun run test` (1,023 files passed): all exit 0.

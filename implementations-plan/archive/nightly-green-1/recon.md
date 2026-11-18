# nightly-green-1 recon

Read directly at `90c2f61ab`; no explorer agents.

## Probe at the base (production Chrome, artifact leg)

`build:chrome` with no `VITE_NULO_E2E_*` flag (no `NULO_E2E_TOKEN_SEEDS_BUILD_STAMP` in the output), copied out of `dist/`, then `NULO_E2E_ARTIFACT_RUN=1 EXTENSION_PATH=<copy> bun run test:e2e -- tests/e2e/rows.test.ts tests/e2e/type-roles.test.ts --retry=0`: 3 failed, 20 passed, 2 skipped, 313 s.

- `rows.test.ts`: `expected 31.609375 to be close to 20`. The log line: the floor transfer's chip `width 31.609375, cut true, besideTitle true, edge 0`. Every other dApp-row assertion on Home and History passed.
- `type-roles.test.ts`: `expected '≈ $123,456,789,012,345.68' to be '≈ $99,999,999,999,999.99'`, then the coverage test's 32 unobserved sites.

With the fix (same build): 23 passed, 2 skipped, 294 s; the floor chip reads `width 20, cut true, besideTitle true`.

## Traces

- `helpers/activity-seeds.ts`: `readActivityScope(page)` returns `E2E_LIST_TOKENS[0]` unless `priced`; `priced` returns the held list's first priced entry on the scope's chain (`heldListEntries()`, which on an artifact run decodes `infra/token-list/public/v1/list.json`). `secondToken` searched only `E2E_LIST_TOKENS` by address.
- Published list, Testnet: USDC `0x2490…` (`usd-coin`), USDT `0x0927…` (`tether`), EURC `0x10b4…` (`euro-coin`), GBPC `0x28af…` (unpriced). Fixtures: USDC `0x…a1` (`usd-coin`), USDT `0x…a2` (`tether`), with the published Testnet icons.
- `TransactionCard.vue`: a transfer's symbol comes from its record (`txAmount` → `displaySymbol(token.symbol)`); its mark is drawn for any symbol (`tokenMarkOf`); its fiat line needs the list to price its contract (`fiatLabel`). So the artifact row differs from the source row by the fiat line alone.
- `type-roles.test.ts` `readTokenFiat` picks the first `tokens-card` whose `token-symbol` has the wanted `data-symbol`.
- `secondToken` callers: `type-roles.test.ts` (priced, held scope) and `home-links.test.ts` (fixture scope on a fresh profile's Mainnet).

## RP host

Base `live.test.ts` against the deployed host, 2026-11-18: 5 pass, 1 fail, `Expected: 404, Received: 400` on the challenge path. With the fix: 11 pass across both files.

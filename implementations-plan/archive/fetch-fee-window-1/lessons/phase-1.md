# Phase 1: one private-fetch recipe (#1475)

- 2026-11-01: `privateFetchInit` added; both services build their init from it. The new price redirect case and the scan were red with the base's services (`git show 3af5f7840:<path>`), green after.
- 2026-11-01: the live CoinGecko test passed with `redirect: "error"` (`COINGECKO_REAL_TESTS=1`): the endpoint answers without a redirect today.
- 2026-11-01: gates: lint, typecheck:all, wallet-core and service suites green; smoke `token-list.test.ts` Chrome (21 s) and Firefox 158.0 (36 s) green; network `hero-prices-unavailable.test.ts` Chrome green (39.7 s test).
- 2026-11-01: a first lint run failed on a formatter line in the new scan test; `biome format --write` fixed it.

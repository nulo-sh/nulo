# Phase 1: build, tests, gates

- **Reproducer for D2** (base `f7b78cc5e`, deleted after): a scratch vitest against the real balances store, two subscribers, two concurrent `ensure(scope, { forceRefresh: true })` with deferred `getGasBalances`. Resolving the first RPC printed `calls 2 first card sees undefined`: the first ensure settled while the second run was still fetching, with `gas.verified` undefined and the slice not degraded.
- **Co-mount fixture.** `fee-cards.comount.test.ts` listed a sponsor on chain 11155111, which production gives none; once D1 made that card read forced, its first test's premise (an unforced fee card joining the gas card's forced flight) no longer held. The fixture moved to `CHAIN_IDS.TESTNET`, where a sponsor is offered and the premise is real.
- **Smoke run.** `test:e2e` refuses a dist that is not the armed smoke build; build it with the `VITE_NULO_E2E_*` variables its error prints, then run with the matching `NULO_E2E_*` ones.
- **Codex consult** (gpt-6.1-sol, high, session `01a1f9a3`): 0 material, 2 minor, both taken; see the plan's Audit verdicts.

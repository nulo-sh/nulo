# pxe-flag-1, phase 0: planning consults

## Recon (2026-11-06)

- Two Sonnet explorers: (1) the lab's mechanics (the stale-anchor real test, `agent.sh`, the e2e fixtures, the balance refresh path, the node client's batching, Route A, where stats are dropped); (2) the extension on Testnet (the live smoke lane, the egress guard, fees for a fresh account, the default list, settled-balance selectors, log reads) and unleashed's faucet and bridge. Persisted in [../recon.md](../recon.md).
- Planner's own reads: `@aztec-labs/pxe` 6.0.0's sync service, call graph, recording node and operation queue; `@aztec-labs/wallets` 6.0.0's PXE options; `env-exec`'s pin checks.

## Codex round 1 (gpt-6.1-sol, high, session 01a1b1fb)

Verdict: **reject** (unrepresentative lab execution, incomplete operation-cost accounting). Nine findings; dispositions in plan.md § Audit verdicts. Verified against the tree: `operation_lifecycle.js:19-27` settles after the stats snapshot; `vitest.e2e.config.ts:30` retries twice; `gas-balance-reader.ts:63-106` invalidates by epoch.

## Opus 5.5 leg (Plan agent, round 1)

Verdict: **conditional approve**. New beyond Codex: per-stage D2, ABBA with sends last, the keyed PATH's Node (`KEYED_RUN_PATH` puts `/usr/bin` ahead of any nvm Node), CSP-derived hosts, the key out of Chrome's environment, PXE's own hash-pinned cache (`caching_aztec_node.js`).

## Codex round 2 (resumed)

Verdict: **conditional approve**, five conditions, all accepted (plan.md § Audit verdicts). Verified: `SendWizard.vue:97-106` (unleashed) refuses a private token-only claim without private gas; the SDK's deposit sends no ETH value.

## Codex round 3 (resumed)

Verdict: **approve**; no new material defect. Panel approval: Phase 1 next.

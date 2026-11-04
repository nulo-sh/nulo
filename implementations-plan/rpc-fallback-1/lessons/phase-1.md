# Phase 1 (arc 1): typed transport failures

## Base facts re-checked against `origin/dev` at `040334f53` (2026-11-04)

The plan was written at `3b845ef02`; `dev` moved twelve commits. Every base-dependent fact was re-read:

| Fact | At `3b845ef02` | At `040334f53` | Design change? |
|---|---|---|---|
| `packages/aztec-runtime/**` (the adapter and its three builders, `fetch.ts`, `chain-runtime.ts`, the offscreen PXE's clients) | as the plan states | unchanged (no commit touches the package) | no |
| `BATCH_CAPS` / `maxBatchSizeFor` (`apps/extension/src/wallet/services/network/seeds.ts`) | 3 per keyless dRPC origin | 25 (#1643); lane `batch-cap-100` moves both to 100 in parallel | no: the router takes `maxBatchSizeFor(url)` as given; the package's adapter test injects its own cap |
| `NetworkService` (`network/service.ts`) probes, `nodes`, `getNodeForUrl` | as the plan states | unchanged | no |
| Egress guard (`tests/e2e/fixtures/egress-guard.ts`) | `DECLARED_REFUSALS` | gains each release's Testnet host (#1650) | no: the relay listens on claimed loopback ports |
| The six `primaryEndpointUrl` send stamps | `dapp-send-executor.ts:749,902,1135,1302` | `:751,904,1137,1305` (#1649) | no: arc 3 re-reads the lines |
| `assertLiveChainIdentity` in the build | `tx-request-builder.ts:259-265` | `:264` and `:443` | no |
| Privacy head (Fact 9) | 1.2.8, unpublished | 1.2.9, unpublished (#1625) | no: arc 3's OA-2 text bumps from 1.2.9 |
| Relay Worker (`infra/rpc-proxy`) | on #1622's branch | merged (#1638) | no: arc 5 only |

## Runs

- 2026-11-04, Phase 1 gate at `f592601e6`: `bun run lint` 0 (after `biome format` on the two touched files); `bun run typecheck:all` 0; `(cd packages/aztec-runtime && bun --bun vitest run src/utils --retry=0)` 55/55, the 20 new rows seen red first; `bun run test:all` run 1: one red, `apps/extension/src/utils/copy-dash-ban.test.ts` timing out at 5 s while load1 was about 170 on this shared host (the file passes alone in 1.9 s; nothing in `apps/extension` changed); run 2: every workspace exit 0.

# Phase 2 (arc 1): the routed node

- Deviations, both recorded as D26 and D27 in the plan's ledger: a sync read with no other qualifying endpoint keeps today's rounds on the active one, stopping once another endpoint holds the role; admission probes run once per call before its rounds, and a round with nothing to try ends the call.
- Parity is per call, not per wall-clock millisecond: each routed retry re-enters the SDK client's zero-delay batch window (`setTimeout(sendBatch, 0)`), so a lone endpoint's failing call takes up to 1 ms per retry longer than the retrying fetch did. Requests, sleeps and outcomes are identical (`aztec-node-factory-adapter.test.ts`, seven reply shapes against `createNode`). Concurrent calls that fail together retry in separate batch windows only if their sleeps straddle a millisecond; nothing pins batching across retries.
- A primary that loses the role through a refused sync read is probed again on the next call (its `nextProbeAt` is "now"), the first of the two passing probes a return needs; the adapter test's request list shows it.
- 2026-11-04, Phase 2 gate on the final tree: `bun run lint` 0 (two cognitive-complexity reds fixed by splitting `walk`, `pickByAnchor`, `pinnedReceipt` and `walkRest`, no suppression); `bun run typecheck:all` 0; `(cd packages/aztec-runtime && bun --bun vitest run src/utils src/routing src/adapters --retry=0)` 161/161, the routing files red first (module missing) and the sync-retry guard red under a mutation; `bun run test:all` exit 0 (aztec-runtime 521, extension 17438; `bun run test` is its extension leg); `git grep -n createRoutedNode -- apps packages ':!*.test.ts'` lists the port, the adapter and `core/testing/fake-node-factory.ts` only.
- 2026-11-04, review round 1 on `dc4b24654`: Codex `revise` (5 findings), Opus 5.5 `approve with changes` (one major beyond Codex's: a timeout under a 5 s probe or caller budget downed an endpoint at once; the plan's at-once trigger is the 60 s call abort). Every fix has a test seen red under a targeted mutation of the fixed line (eight mutations). D28 records that D22's `PENDING` applies to a lone endpoint too.
- 2026-11-04, review round 2 on `7bcad3078`: Codex `revise`, both findings one gap (`await this.admit()` before the dispatch). `attempt` now probes inline and checks the stop and the floor with no await before `attemptOn`; the pinned read asks `retryWhile` after its sleep. The two race tests land the stop or the floor rise in a microtask after each question in turn; three mutations reinserting a gap all go red.

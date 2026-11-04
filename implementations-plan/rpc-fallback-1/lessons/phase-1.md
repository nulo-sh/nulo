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


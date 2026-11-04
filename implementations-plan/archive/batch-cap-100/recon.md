# Recon: batch-cap-100

One Explore agent (Sonnet), a batched reuse sweep at `fa6913668`. The planner checked each load-bearing line against the tree.

## Reuse map

| Capability needed | Existing code found | Verdict |
|---|---|---|
| The per-origin batch cap | `BATCH_CAPS` and `maxBatchSizeFor` (`apps/extension/src/wallet/services/network/seeds.ts:97-115`) | reuse as is: change two values and the comment |
| Threading the cap into every node client | `AztecNodeFactoryAdapter(maxBatchSizeFor)` (`packages/aztec-runtime/src/adapters/aztec-node-factory-adapter.ts:72-127`), `createWalletNodeFactory` (`node-factory.ts`), `createPreflightNodeClient` (`apps/extension/scripts/seed-preflight-node.ts:16-23`) | reuse as is |
| The live proof against the provider | `checkSeed` sends `maxBatchSizeFor(seed.rpcUrl) ?? 1` calls in one tick (`apps/extension/scripts/seed-identity.ts:21`); `check:seeds` (`apps/extension/package.json:11`); nightly `seed-identity-live` (`.github/workflows/nightly.yml:269`, advisory) | reuse as is: it sends 100 with no script change |
| Tests that pin dRPC's value | `seeds.test.ts:16-19` (`toBe(25)`); `node-factory.test.ts:10-20` and `scripts/seed-identity.test.ts:63-74` (60 calls, `[25, 25, 10]`); `seed-identity.test.ts:50-61` (refusal, `[25]`, an HTTP 500 fixture saying "more than 24") | adapt: move to 100 |
| A test that pins the threading for any value | `aztec-node-factory-adapter.test.ts:160-182` (an injected cap of 3, `[3, 3, 2]`; no cap, `[8]`) | reuse as is: it is not dRPC's value |
| The node request timeout | `DEFAULT_REQUEST_TIMEOUT_MS = 60_000` (`packages/aztec-runtime/src/utils/fetch.ts:19`) | report only (the lane brief) |

## Absence claims, with the search trail

- **No doc, skill, workflow or store text restates the cap.** `git grep -nIE 'BATCH_CAPS|maxBatchSize|batch cap|batch of|free plan|drpc|dRPC|25 entries|of 25|batch size|maxBatch'` over the tree, without `network-endpoints.ts`, `implementations-plan/archive`, `node_modules` and `dist`. The matches in `CLAUDE.md`, `ARCHITECTURE.md`, `CI.md`, `.github/`, `lessons.md` and `.claude/skills/` name dRPC but give no batch limit.
- **No other per-provider limit table** in `services/network`, `packages/aztec-runtime/src` or `scripts/seed-*.ts` (`rate.?limit|body.?size|MAX_BODY|bodyLimit`). The only hit is `infra/rpc-proxy`, whose `MAX_CALLS = 100` (`infra/rpc-proxy/src/body.ts:10`) fronts the paid keys and is out of scope.

## Other facts the plan rests on

- **The upstream client's own default is 100 entries.** `@aztec-labs/foundation` 6.0.0, `dest/json-rpc/client/safe_json_rpc_client.js`: `DEFAULT_MAX_BATCH_SIZE = 100` and `DEFAULT_MAX_REQUESTY_BODY_SIZE = 1 MiB`; the send loop stops at whichever comes first. (The explorer could not read the isolated store; the planner read the file.) The adapter's doc already says so (`aztec-node-factory-adapter.ts:69-71`).
- `MAX_NODE_RESPONSE_BYTES = 32 MiB` (`fetch.ts:21-24`) already budgets one reply for a batch of 100.
- Timeouts: `DEFAULT_REQUEST_TIMEOUT_MS` per attempt for `createNode` (`aztec-node-factory-adapter.ts:80`, retried after 1, 2 and 3 s), the single read (`apps/extension/src/wallet/services/network/service.ts:1069`) and the preflight (`seed-preflight-node.ts:18`); the probes use 5 s (`network/spec.ts:127`, `account-state/service.ts:39`, `execution/sponsor-funding.ts:19`).

## Open work and known limits

- #1609 (closed) is the origin; #1643 (merged) set 25. No open issue owns this change. #1624 (open, failover) is near but does not collide.
- `gh issue list --state closed --label known-limit --search "batch"`: #355 (artifact registrations), unrelated.

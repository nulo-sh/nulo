# Phase 0: planning log

## Live probe, 2026-11-04 about 15:00 UTC

A JSON-RPC batch of `node_getNodeInfo` entries, ids 1..n, POSTed with `curl -m 30` to each keyless origin:

| Origin | n | HTTP | Time | Body | Entries |
|---|---|---|---|---|---|
| `https://aztec-mainnet.drpc.org` | 100 | 200 | 0.45 s | 162,593 B | 100 answered, 0 errors |
| `https://aztec-testnet.drpc.org` | 100 | 200 | 0.67 s | 170,993 B | 100 answered, 0 errors |
| `https://aztec-mainnet.drpc.org` | 101 | 400 | 0.12 s | 17,568 B | an array of 101, each `{"error":{"code":31,"message":"Batch of more than 100 requests are not allowed on free plan, to use this feature register paid account at drpc.org"}}` |
| `https://aztec-testnet.drpc.org` | 101 | 400 | 1.34 s | 17,568 B | the same |

## Upstream default

`@aztec-labs/foundation` 6.0.0, `dest/json-rpc/client/safe_json_rpc_client.js`: `DEFAULT_MAX_BATCH_SIZE = 100`, `DEFAULT_MAX_REQUESTY_BODY_SIZE = 1 MiB`, and the send loop stops at whichever it reaches first. So a client with no cap already sends at most 100 entries per request. The lane brief said otherwise; recorded in plan.md.

## Consults

- **Codex plan r1** (gpt-6.1-sol, high, session 01a1a71d): conditional approve. Six findings, all accepted after I checked them against the tree. (1) At 100 the split tests cannot tell the cap from the client's default: a forwarding case per client, with the lookup answering 3. (2) A batch of 100 shares one 32 MiB reply and one 60 s attempt: a known limit (D6). (3) Fact 5 holds only for a 4xx body that parses (`fetch.ts:63` parses before it classifies). (4) The gate's `cd` leaked into later commands: now a subshell. (5) I1 is unknown, not an inference to lean on. (6) The timeout report said "request" where it means each attempt.
- **Codex plan r2** (resumed): approve. It confirmed the fixes; the forwarding cases set the override just before the client is built and stay outside `checkSeed`, which looks the cap up again.

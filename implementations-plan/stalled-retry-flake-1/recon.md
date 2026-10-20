# stalled-retry-flake-1: recon

Base: `origin/dev` at `a36fd2445`. Two Sonnet explorers (the e2e stub idioms; the product's Retry path), then traced runs of the spec at retry 0 through `agent.sh`.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| A stub that answers chosen methods and holds the rest | `tests/e2e/helpers/rpc-stub.ts` (`startStub`, `planBatchReplies`) | reuse |
| Release the stub's held calls | `dropUnanswered()` (`rpc-stub.ts:120-122`): destroys their sockets; one caller (`backup-import-stalled-network.test.ts:195`) | adapt: a reset is undone by the browser (below) |
| A terminal answer the node client does not retry | `tests/e2e/fixtures/node-stub.ts:12,26`: HTTP 400 with a JSON-RPC error body; its header says the client stops at once on it | reuse: share it |
| Wait for held calls to settle, or count them | absent: searched `drain`, `settle`, `pending`, `waitForQuiet`, `unanswered`, `socket` in `tests/e2e/{helpers,fixtures}` | not needed (the refusal settles them at once) |
| Server keep-alive knobs | absent: searched `keepAlive`, `closeIdleConnections`, `Connection: close` in `tests/e2e` | not needed |
| Unit tests of the stub | `tests/e2e/import-dead-rpc.test.ts:50-88`, `planBatchReplies (no browser)` | extend |
| Docs on this flake | none in the `e2e-testing` skill, `tests/e2e/README.md` or `FIREFOX.md` | add a ledger row at close-out |

History: `dropUnanswered` came with #838 (`19399c821`, D16 of the archived `ci-e2e-hygiene-1`), after Chrome shard 5/5 went red with six held calls; no Codex pass reviewed it. Its doc says the reset frees Chrome's six connections per host.

## Product path (verified)

- Retry: `retryAccountState` → `retryAccountStateStage` (`src/composables/full-backup-restore.ts:967-1003`) → `runImportChainSync` with a fresh 45 s deadline and fresh service clients, disconnected in `finally`.
- Probe: `probeNodeStatus` (`src/wallet/services/network/service.ts:889-903`) builds a new single-attempt client per call (`packages/aztec-runtime/src/adapters/aztec-node-factory-adapter.ts:85-95`); a timeout and a reset both map to `Inactive`. No status cache or breaker is consulted.
- Preflight: three attempts of at most 5 s, waits of 2 s and 4 s, in a 21 s budget (`src/composables/importPreflight.ts:18-19`, `importChainSync.ts:32`); "unreachable" becomes `ACCOUNT_STATE_SKIP_UNREACHABLE` (`importChainSync.ts:105`).
- The first pass at its deadline abandons its registration call: no abort reaches the background. Its PXE boot's node client retries a failed POST 3 times (60 s each, waits 1, 2, 3 s; `packages/aztec-runtime/src/utils/fetch.ts`), and stops at once on a 4xx (`NoRetryError`).
- Chrome's interception attaches no page, so a fetch from an extension page goes to the real origin, not the stub.

## Traces

A local trace patch (kept at `~/.cache/nulo-backlog/stalled-retry-flake-1/repro.patch`, never committed) logs every stub connection, request and close, and the spec's steps, with times. The forced fill calls `evaluateInBackground` with `fetch(getNodeInfo).then(fetch(getBlockNumber))` until the stub holds six calls, so each rides a connection that has carried an answered call.

| Run | Held at release | Came back on new sockets | Retry's probe | Row |
|---|---|---|---|---|
| CI job 118387660896 (Firefox) | not logged | not logged | Retry ran about 22 s | unreachable |
| Firefox, unforced, reset | 4 | 3, within 3 ms | +209 ms | deadline |
| Chrome, unforced, reset | 6 | 2 (both on reused connections) | +120 ms | deadline |
| Firefox, forced (page fill), reset | 6 | 6, within 3 ms | none in 21 s | unreachable (red) |
| Firefox, forced (background fill), reset | 6 | 6, within 4 ms | none in 21 s | unreachable (red) |
| Chrome, forced (background fill), reset | 6 | 4 | +133 ms | deadline |
| Firefox, forced (page fill), 400 | 6 | 0 | +90 ms | deadline |
| Chrome, forced (background fill), 400 | 6 | 0 | +64 ms | deadline |

In every run, nothing else reached the stub between the release and the probe except the copies and, in the 400 runs, one `aztec_getL1ContractAddresses` of the first pass's next registration launch.

## Open work and overlap

- `gh issue list --state all --search "stalled network retry"`: only #911 and the closed #272. Closed known limits searched (`import retry`): none on this path.
- Open PRs: #913, #907, #886 and #743 edit `.claude/skills/e2e-testing/SKILL.md` (ledger rows); expect an append conflict at close-out. migration-rule-1's #909 touches no file here.

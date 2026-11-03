# rpc-proxy-1 arc 1: implementation log (phases 1 and 2)

## Phase 1, the cap

- The cap test pins both seeds' origins, so the Testnet constant's two blind `sed` edits moved here from Phase 2; `grep -c 'drpc.live'` on the file prints 0.
- Making the four factory parameters required (D17) reddened three tests that built a service without one (TS2554); each now passes `FakeNodeFactory`, and the test that pinned the old uncapped default went with the default.
- `scripts/e2e/egress-guard.test.ts` hardcoded the retired Testnet host in its expectations; it now derives the host from `LIVE_NODE_HOST`, as `tests/e2e/egress-guard.test.ts` does.

## Phase 2, the retired rows

- `retireEndpoints(network, retired)` digests each URL itself (`bytesToHex` from `@nulo/wallet-core/utils` over `crypto.subtle`); the plan's third `digest` parameter had one value, so it went.
- The service test drives the real unlock announcement (`init`, then `onRowKeysReady`) with only the retired list swapped for the synthetic one, so it proves the wiring and the seal-then-move order; with the `runSealing` call removed it reds.
- `jsdom`'s `URL` is not Node's: `readFileSync(new URL(path, import.meta.url))` throws "URL must be a non-empty file: path" in an extension unit test; `join(dirname(fileURLToPath(import.meta.url)), path)` works.
- The update replay (`tests/e2e/fixtures/update/loopback-endpoints.ts`) moves every outside endpoint to a loopback stand-in on the old release before the new build runs, so the rewrite never sees the recorded URL there.
- The `aztec-update` skill's Phase 0 probe sent `node_getNodeInfo`; the node namespaces its methods `aztec_`. It now probes the keyless endpoint directly with `aztec_getNodeInfo` (checked live: rollupVersion matches `TESTNET_ROLLUP_VERSION`).

## Arc 1 review round 1, Codex (gpt-6.1-sol, high), session 01a1a242

Verdict: findings, all low. Accepted:
1. `check:seeds`' preflight client kept the SDK's batch of 100 (a mocked trace of eight reads to the Mainnet seed sent one request of 8): it now passes `maxBatchSizeFor(url)`, and a test asserts `[3, 3, 2]`.
2. The unlock test did not pin seal-then-move, since `storage.set` seals the row it writes: the spy now records that the row is no longer in the clear when the move starts; with the two steps swapped it reds.
3. `RETIRED_DEFAULT_ENDPOINTS`' comment claimed every stored endpoint moves (the journal and replacement skips say otherwise), and the preflight comment still said the Testnet endpoint carries a key: both reworded.

## Arc 1 review round 1, Opus 5.5 (diff review, general-purpose)

Verdict: findings, all low. Accepted:
1. `tests/e2e/README.md:99`'s third column still named the old host: fixed.
2. The adapter's lookup defaulted to uncapped, and `core/adapters` re-exported the adapter to no importer: the re-export went, and the lookup is required (the adapter tests pass an explicit `uncapped`), so a construction that forgets it fails the typecheck. This completes D17 at the adapter.
3. The profile filter had no test: the unlock test now holds a second profile's row on the retired URL, which stays; without the filter it reds.
4. The lesson's "proves the seal-then-move order" was false at the time: Codex finding 2's assertion makes it true.
Noted, not a change: the cap turns a large tick into many parallel requests, and a 429 is not retried; Assumption I4 and `rpc-fallback-1` own a provider's request-rate limit.

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

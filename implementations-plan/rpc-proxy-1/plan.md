---
plan: rpc-proxy-1
tier: mid
status: arc 1 phases 1 and 2 ✓; arc 1 review loop next
issues: "#1607 #1609 (arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 explorers (sonnet); Codex gpt-6.1-sol high audit + Opus Plan leg; final fresh Codex pass
base: origin/dev at ff395c3d0
trunk: dev
post_implementation_hardening: not scheduled
---

# rpc-proxy-1: keyless dRPC defaults with a batch cap, and a Nulo-run keyed reverse proxy

Two facts from early November: the Testnet default is a paid dRPC URL whose key ships in every bundle, and the free Mainnet default refuses a JSON-RPC batch above 3 entries, so a send that touches more than three contracts cannot prove there (#1607, #1609). The owner's direction: "Us doing the proxy reverse work + setting the defaults to dRPC … Once we have (2 - the multiple RPC thing) we add our proxy-reverse as a fallback." Arc 1 moves both defaults to dRPC's keyless endpoints with a per-endpoint batch cap and rewrites stored rows that hold the old Testnet default. Arc 2 builds `infra/rpc-proxy` for `rpc.nulo.sh` and `testnet.rpc.nulo.sh`, which nothing in the wallet references. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). No keyed URL appears in any committed file.

## The issues and the brief, checked

- **#1609, demonstrated** by the orchestrator's probes (batches of 1 and 3 answer 200, 4 and 8 answer HTTP 500 with a per-entry "Batch of more than 3 requests" error, on both free endpoints) and a probe build with `maxBatchSize: 1` that proved the same Mainnet claim. The code trace holds: the adapter passes no `maxBatchSize` (`aztec-node-factory-adapter.ts:74`), so the client's default of 100 applies, and the prover's per-contract fan-out (`private_kernel_execution_prover.js:257-267`) lands in one tick.
- **#1607, demonstrated;** its first write-up's cause (methods missing from the free plan) was corrected on the issue to #1609's batch limit, which this plan fixes.
- **Did not hold: "methods are namespaced `node_*`".** The 6.0.0 client sends `aztec_<method>` (`safe_json_rpc_client.js:144`, `namespaceMethods: 'aztec'`). A proxy that allowed only `node_*` would refuse every wallet call. The allowlist is `aztec_` + the schema's 58 names (D8).
- **Did not hold: "the one `createAztecNodeClient` call site".** The adapter has three client builders (`createNode`, `probeChainId`, `silentSingleAttemptNode`) and two default constructions (`NetworkService`, `ProductionPxeFactory`). The cap applies to all three builders (D3).
- **Did not hold: "a per-package PR workflow per CLAUDE.md § CI conventions".** No infra Worker has one: each rides `pr-quick.yml`, whose `unit-tests` and `lint-and-typecheck` cover every `@nulo/*` workspace inside the required `quality-status` (D13).
- **The brief's stamp and golden** assume a persisted cap. The plan derives the cap from the URL instead (D2), so no stored shape changes and no stamp is due.

## Outcome & Quality Bar

- **For whom:** a person sending on Alpha Mainnet or Testnet through the default node, and the owner, who rotates a key without a release once the proxy carries traffic.
- **Excellent:** a send that touches eight contracts proves on the free Mainnet endpoint (the client never posts more than 3 entries there); the old key leaves the bundle and every stored network endpoint that holds it (but D5's known limits), and nothing else a person set changes; the proxy forwards the wallet's calls byte for byte, refuses a malformed or foreign request with a 4xx the client does not retry, and passes the provider no header of the caller's (OS-6 checks what arrives).
- **Good enough:** the proxy is deployed and tested but unreferenced; its rate limit is a starting value that `rpc-fallback-1` tunes against measured traffic.

## Assumptions

**Facts** (verified at `ff395c3d0`; sources in [recon.md](recon.md))
1. `createAztecNodeClient` and `createSafeJsonRpcClient` accept `maxBatchSize`; the client caps a batch's summed item length (UTF-16 units) under 1 MiB, so an ASCII batch body, which every wallet call is (hex fields and numbers), is at most 1,048,676 bytes with a 100-entry array's punctuation.
2. The client retries a 5xx and a non-JSON error; a 4xx with a JSON body is a `NoRetryError`.
3. Seeding is once per kind; outside a network reset, which compares a primary with the seed's URL (`isSeedEndpointUrl`, `service.ts:134-146`), no code compares a stored row with the seeds later. Endpoint writes take the network lock, re-read the row, `storage.set`, evict `transientNodes` and `nodes`, and emit `onNetworkUpdated` (`service.ts:832-874`).
4. The old Testnet default is the only keyed default any release shipped; `apps/extension/src/wallet/constants/network-endpoints.ts` is five lines: line 1 a comment naming the key, line 2 `TESTNET_RPC_URL`, line 4 a comment, line 5 `MAINNET_RPC_URL = "https://aztec-mainnet.drpc.org"` (line metadata read without printing the file).
5. Network rows are outside every backup; an import reseeds from the build's seeds.
6. `edge-headers.test.ts` imports each public surface's header set; `bun-version.test.ts` checks every `@types/bun` pin and `BUN_VERSION=` line against `packageManager`.

**Inferences**
- I1. A Worker subrequest reaches the provider from Cloudflare's address with a `CF-Worker` header naming the zone, and with no header carrying the caller's IP (`CF-Connecting-IP`, `CF-Connecting-IPv6`, `X-Real-IP`, `X-Forwarded-For`). Unverified: Cloudflare documents destination-dependent behaviour. OS-6 reads the headers that actually arrive at an echo endpoint before the real secret is set; until then the plan claims only that the Worker adds none.
- I2. Workers Custom Domains issue a certificate for the second-level name `testnet.rpc.nulo.sh`, which Universal SSL alone would not cover; Cloudflare's Custom Domains documentation says they do, and OS-2 checks it.
- I3. A `JSON.parse` of a full 1 MiB batch fits the Workers Paid CPU budget; the Free plan's 10 ms per request may not. No local timing can show the Workers figure; OS-9 settles the plan before `rpc-fallback-1` relies on the proxy.
- I4. The free plan's other limits (a per-request time budget, a lagging pool) stay as #1607's comment found them; the owner chose the free defaults knowing them, and `rpc-fallback-1` adds the fallback.
- I5. dRPC's daily CU cap is a hard stop, not only an alert (OS-4 confirms). If it is only an alert, the hosts stay detached until the owner picks a global limiter (a plan change) or another ceiling.
- I6. The free endpoints accept a fan-out split into parallel requests of 3 (8 calls become 3 requests at once): the orchestrator's probe build sent the same claim as 8 parallel single-entry requests and it proved.

**Asks** (in [OWNER-ASKS.md](OWNER-ASKS.md); none concerns a surface arc 1 changes): OA-1 (privacy §§ 2 and 5.1 after the change); owner steps OS-1 to OS-10.

## Architecture & Implementation

### Arc 1: the wallet

- **The cap is a fact about the provider's endpoint, held in code (D2).** `seeds.ts` gains `BATCH_CAPS`, keyed by literal origin: `https://aztec-mainnet.drpc.org` and `https://aztec-testnet.drpc.org`, each `3` (the free plan answers a larger batch with HTTP 500). `maxBatchSizeFor(rpcUrl)` returns the entry for the URL's origin, else `undefined` (the client's 100); an unparseable URL gets `undefined`. Keyed by origin, not derived from the current seeds, so a row seeded on a dRPC host keeps its cap after a later build moves the seed, and a person who types the same host gets it too; local, custom and paid hosts get none.
- **One injection point, enforced by the type checker (D3, D17).** `AztecNodeFactoryAdapter`'s constructor takes `maxBatchSizeFor?: (rpcUrl: string) => number | undefined`, and every client it builds passes `maxBatchSize: this.maxBatchSizeFor?.(rpcUrl)`. `apps/extension/src/wallet/services/network/node-factory.ts` exports `createWalletNodeFactory()`, the adapter with `maxBatchSizeFor`. The silent uncapped defaults go: `NetworkService`'s `nodeFactory`, `ProductionPxeFactory`'s `nodeFactory`, `PxeService`'s `factory` and `createPxeOffscreen`'s `deps.factory` become required, so `runtime.ts` and the three constructions in `offscreen/index.ts` must pass `createWalletNodeFactory()` and a fourth construction cannot compile without a factory. Tests that relied on a default pass `new FakeNodeFactory()` (about six sites). The `NodeFactory` port and `NetworkInfo` stay as they are.
- **The keyless Testnet default.** Two `sed -i` edits on the constant's file, never printing it: line 2's whole literal becomes `"https://aztec-testnet.drpc.org"`; line 1 becomes `/** dRPC's free Testnet endpoint: keyless, so the bundle holds no provider key. */`. Verify with `grep -c 'drpc.live'` = `0` and the line-metadata `awk` from Fact 4.
- **The retired default (D4, D5).** `seeds.ts` exports `RETIRED_DEFAULT_ENDPOINTS: readonly { sha256: string; replacement: string }[]`, one entry: the SHA-256 of the old Testnet default as seeds stored it (`8c97d123e13121add8218c0240ca5f9af70cd57e2e50b9cfd1f9d5ef882f4ec5`) and `TESTNET_RPC_URL`. A pure `retireEndpoints(network, retired)` in `network/retired-endpoints.ts` returns the rewritten network or `undefined`: an endpoint whose `rpcUrl` digest is listed takes the replacement URL and keeps its id, label and primary role; if another endpoint of the network already holds the replacement, the retired one is left as it is, so no row disappears and no network holds one URL twice (a known limit, filed at close-out: that endpoint stops answering at OS-7's rotation, beside the keyless one its owner added). `NetworkService.retireDefaultEndpoints(profileId)` runs inside the existing `sealOnRowKeysReady` task right after `sealLegacyRows`, through its own `runSealing` with its own message (no URL logged), under the network lock: it skips a network a reset journal holds, writes with `storage.set`, evicts as `updateEndpoint` does and emits `onNetworkUpdated`. A second run finds nothing. A skipped or failed run waits for the next background start (a browser restart, an extension update or a crash): a later unlock in the same worker finds the row keys held and announces nothing (`seal-on-unlock.ts:6-9`), and the wallet's heartbeat (`runtime.ts:307-317`) keeps the worker from idling out, so no idle restart can be counted on. Such a row keeps the retired endpoint until then, and past OS-7 it stops answering until the person picks another endpoint in Settings or the background restarts (a known limit, with D5's, filed at close-out; a guaranteed retry would be a recovery policy for the owner). The code stays: a dormant profile can unlock on this build at any later time. Pending sends and history keep their `submittedEndpointUrl` (the transaction and journal roots, which also travel in full backups); they stay untouched and the URL in them is dead after OS-7 (a known limit, filed at close-out).
- **The live check (#1607's ask).** `check:seeds` also sends, per remote seed, `maxBatchSizeFor(seed.rpcUrl)` (else 1) `getNodeInfo` calls in one tick, which the client coalesces into one request of that many entries, and fails if any is refused, so a provider that lowers the cap reds the nightly `seed-identity-live`.

### Arc 2: `infra/rpc-proxy` (Worker `nulo-rpc-proxy`)

`src/worker.ts` (handler, `Env`), `src/respond.ts` (`SECURITY_HEADERS`, `refuse(status, code, message, cors)`), `src/body.ts` (`readCapped`, `parseCalls`), `src/methods.ts` (`NODE_METHODS`), `src/cors.ts` (`originVerdict`, CORS headers). Each request, in order, none of it touching the upstream before step 9:
1. **Host:** `rpc.nulo.sh` → `DRPC_MAINNET_URL`, `testnet.rpc.nulo.sh` → `DRPC_TESTNET_URL` (Worker secrets); any other host, or a path other than `/`: 404. Nothing a caller sends picks the upstream.
2. **Origin (D9):** absent, `chrome-extension://` + 32 letters `a`-`p`, or `moz-extension://` + a UUID → allowed (echoed in `Access-Control-Allow-Origin` with `Vary: Origin` on every later answer, refusals included); anything else → 403 without CORS headers.
3. **Kill switch:** `PROXY_OFF === "1"` → 503; nothing read, counted or called.
4. **`OPTIONS`** → 204 with `Access-Control-Allow-Methods: POST`, `Access-Control-Allow-Headers: content-type`, `Access-Control-Max-Age: 7200`. Any method but `POST` → 405 with `Allow: POST`.
5. **Rate limit (D12):** `IP_LIMITER.limit({ key: cf-connecting-ip })`, `{ limit: 100, period: 10 }`; no address → 400; over → 429.
6. **Body (D16):** `readCapped` at 1,049,600 bytes (1 MiB + 1 KiB: the proxy's budget, above Fact 1's maximum for the wallet's ASCII bodies); over → 413.
7. **Calls:** UTF-8 JSON that is one call object or an array of 1 to 100 call objects, each with a string `method` in `NODE_METHODS`; else 400 (code -32600, or -32601 for a method). One bad entry refuses the whole body.
8. **Secret:** the host's secret unset or not `https:` → 503.
9. **Forward:** one `fetch(secret, { method: "POST", body: <the read bytes>, headers: { "content-type": "application/json" }, redirect: "manual" })`. No retry, no timeout of its own. A thrown fetch → 502; a 3xx → 502.
10. **Answer:** the upstream's status and body stream through; response headers are built fresh: the upstream's `content-type` and `x-aztec-*` headers, `Access-Control-Expose-Headers` naming those, `Cache-Control: no-store`, `SECURITY_HEADERS`, and the CORS pair when the origin was echoed. Nothing else of the upstream's passes.

Every local refusal is `{"jsonrpc":"2.0","id":null,"error":{"code":<n>,"message":"<short text>"}}` with `content-type: application/json`, so a 4xx reaches the client as a `NoRetryError`. The kill switch and an unset secret answer 503 and the client retries them on its four-attempt schedule; they reach no upstream, so a retry costs nothing, and 503 is what they are: temporary. Nothing is logged (no `console.*`; `observability` off), since a message could carry the upstream URL.

`wrangler.jsonc`: `name: nulo-rpc-proxy`, `main: src/worker.ts`, the shared `account_id`, `workers_dev: false`, `preview_urls: false`, `observability: { enabled: false }`, `vars: { PROXY_OFF: "0" }`, `ratelimits: [IP_LIMITER]`, no `routes` (D14). `package.json` `@nulo/rpc-proxy`: `typecheck`, `test` (`bun test`), `deploy`, `deploy:dry`; devDependencies `@types/bun` 1.4.2, `typescript`, `wrangler` 4.129.1 and `@aztec-labs/stdlib` 6.0.0 (the drift test only; the bundle test refuses any import, and the drift test requires this pin to equal `apps/extension`'s, so an Aztec bump that misses it reds). `IP_LIMITER`'s `namespace_id` is `"1003"`, distinct from `nulo-subscribe`'s account-wide `1001` and `1002`.

### Trade-offs not taken

- **A persisted `maxBatchSize` on the endpoint row** (the brief's literal form, and the competing outline): needs an additive stamp and a golden, an at-unlock conversion to give every existing row its cap, `updateEndpoint` to drop or keep it on a URL edit (keeping it would cap a user's own node), and another conversion when dRPC raises the cap. The origin table has none of these and sits beside the seeds in `seeds.ts`.
- **Threading the cap through `NetworkInfo` and `NodeFactory.createNode`:** two types, the port, the fake and every caller, and `getNodeForUrl` (a pending send's pinned URL) still has no row to read it from.
- **Matching the retired default by host and path prefix** (the brief's form): it also rewrites a person's own `lb.drpc.live/aztec-testnet/<their key>` endpoint to the free one. The digest matches the one string the seed stored and keeps the key out of the source as the prefix would (a 44-character random key does not fall to a dictionary).
- **A per-package workflow for the Worker:** a new check that is not required gates nothing; making it required needs the owner's required-checks runbook for no gain over `quality-status`.
- **A global rate limiter beside the per-IP one:** the dRPC key's daily CU cap (OS-4) is the spend ceiling; a global limiter would cut every caller off the same way, sooner.

## Security & Adversarial Considerations

- **Threat model.** The proxy holds two paid keys; the attacker is anyone on the internet, a web page running in a visitor's browser, or another extension. Their gain is spending the keys' quota or using the proxy to reach other hosts. Boundaries: the secret URL never leaves the Worker (no log, no echo, no header, no redirect follow); a caller cannot choose the upstream (host table only, path `/` only); a web page cannot drive visitors' browsers at it (server-side Origin refusal, which CORS alone would not give: a simple `text/plain` POST reaches a server unpreflighted); a script without an Origin is allowed, since it could forge one, and is held by the per-IP limit and the CU cap.
- **Privacy.** Outbound headers are built fresh: no cookie, `Origin`, user agent, `CF-Connecting-IP` or `X-Forwarded-For` reaches the provider, which sees Cloudflare's address (I1) — a gain over a direct call. Cloudflare and the owner's account see the caller's IP in transit; observability is off, and that disclosure is `rpc-fallback-1`'s privacy text, once the wallet uses the proxy.
- **Input validation.** Streaming cap before any parse; strict UTF-8; a structural check of every entry; a 100-entry ceiling, so one request cannot carry more than the client ever sends. The bytes forwarded are the bytes checked.
- **Least privilege and supply chain.** No dependency in the bundle (the deploy test); the two secrets are new keys, one per network, never the shipped one (dRPC keys may serve every network: OS-3), set in the dashboard by the owner and in no file, CI or agent; Workers Builds deploys from `main`, its build token is narrowed to this Worker, and no other Worker's build token can edit it (a branch build of another Worker could otherwise redeploy this one and read its secrets: OS-1); no Cloudflare token anywhere in the repo. wrangler and stdlib are already locked; the 7-day gate and the frozen lockfile hold.
- **Wallet side.** The digest constant reveals nothing usable; the rewrite matches one exact string, touches only endpoints, never probes, never runs inside a reset, and leaves every other row alone. The cap only lowers what the client sends.
- **Shared quota (a known limit, filed at close-out).** A script with no Origin, or a forged extension Origin, from many addresses can spend each key up to its daily CU cap and then deny the proxy to everyone; each admitted HTTP request carries up to 100 calls, the limiter counts requests per Cloudflare location and approximately, and every request, refused or not, is a billed Worker invocation with no ceiling of its own. While nothing references the proxy no person is affected; OS-4's caps go on before OS-3's secrets. Reopen when `rpc-fallback-1` seeds the proxy or a spend alert fires.
- **Upstream bodies pass through unread.** An upstream error body that quoted the request URL would carry the key to the caller; OS-6 checks a refused call's body against the key before the hosts go live.
- **Residual (owner-visible):** until OS-7's rotation, the old key still works for anyone who copied it; after it, an install that never updated to arc 1's release loses its default Testnet node until it updates (Testnet only; OS-7 bounds the grace).

## UI impact

- **Settings → Networks → Testnet, endpoint row** (`settings/networks/[id].vue`) and the endpoint editor's prefill: the description changes from the keyed URL to `https://aztec-testnet.drpc.org` once the profile unlocks on arc 1's build. The brief records this data change as expected; no copy or layout changes, and no row appears or disappears (D5).
- Arc 2 touches no wallet surface.

## Phase 1 (arc 1): the cap ✓

1. Add tests first, and require each red on the base code: the adapter (`packages/aztec-runtime/src/adapters/aztec-node-factory-adapter.test.ts`, its `answering` fetch stub) builds a node with a cap of 3, fires 8 calls in one tick, and requires request bodies of 3, 3 and 2 entries; with no cap, one body of 8 (the control); the same for `createSingleAttemptNode`. `seeds.test.ts` (new): `maxBatchSizeFor` is 3 for both remote seeds' URLs and for their origins with a trailing slash, `undefined` for the local seed, a custom host, `https://lb.drpc.live/` and an unparseable string. `node-factory.test.ts` (new): `createWalletNodeFactory()` sends 8 calls to the Mainnet seed's URL as bodies of at most 3. `scripts/seed-identity.test.ts`: `checkSeed` sends one request of the seed's cap in entries (asserted on the stubbed request body) and reports a refused batch as a mismatch.
2. Make D2, D3 and D17 and the `check:seeds` batch; `typecheck:all` then proves every factory construction passes one. Require the tests green.

**Gate:** `bun run lint`; `bun run typecheck:all`; `(cd packages/aztec-runtime && bun --bun vitest run src/adapters --retry=0)`; `(cd apps/extension && bun --bun vitest run src/wallet/services/network scripts/seed-identity --retry=0)`; `bun run test`; `bun run test:all`. Pass: every command exits 0; each new assertion was red before the change.

## Phase 2 (arc 1): the Testnet default and the retired rows ✓

1. Add tests first: `retired-endpoints.test.ts` (new) with a synthetic retired entry (the digest of `https://lb.drpc.live/aztec-testnet/FAKEKEY`): the matching endpoint is rewritten, keeping id, label and primary; a person's own `lb.drpc.live/aztec-testnet/<another key>` endpoint, a custom node and a local endpoint survive unchanged; a network that already holds the replacement on another endpoint returns `undefined`; a second run returns `undefined`. In `service.test.ts`, calling the private `retireDefaultEndpoints(profileId, retired)` with the synthetic entry (its second parameter defaults to `RETIRED_DEFAULT_ENDPOINTS`): a sealed Testnet row holding the retired URL reads back rewritten, `onNetworkUpdated` fires once and the chain's node is evicted; a network the reset journal holds is left as it was. In `seeds.test.ts`: the production entry's replacement equals the Testnet seed's URL, and its digest matches the Testnet endpoint of the committed `tests/e2e/fixtures/update/v0.31.0.storage.json` recording, asserted as a boolean so a failure prints no URL.
2. Make the constant edit (Architecture), D4 and D5. In `tests/e2e/egress-guard.test.ts`, derive the host its Chrome close expects (`lb\.drpc\.live:443` today, line 265) from `LIVE_NODE_HOST`, escaped. Update `.claude/skills/aztec-update/SKILL.md` Phase 0 (probe `https://aztec-testnet.drpc.org` directly, with `aztec_getNodeInfo`; its `rg -o` would now print two URLs), `apps/extension/tests/e2e/README.md:99` and the `LIVE_NODE_HOST` comment in `tests/e2e/fixtures/egress-guard.ts`.
3. Run two network files on Chrome that build nodes through the network service and the offscreen PXE. Warning: `e2e:agent` writes its build into `dist/<browser>`, so run it before the armed smoke build. Then build the armed smoke build from the edited tree and run the smoke file the fixture serves; repeat both for Firefox.

**Gate:** Phase 1's commands; `grep -c 'drpc.live' apps/extension/src/wallet/constants/network-endpoints.ts` prints `0` (its exit status is 1 at a zero count); `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/endpoint-refused-recovery.test.ts tests/e2e/network/tx-sendTx-default.test.ts --retry=0` (a dApp send through the offscreen PXE's node and the pinned-URL tracker); then, per browser `<b>` in `chrome`, `firefox`: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<b>` and `(cd apps/extension && NULO_E2E_BROWSER=<b> NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/egress-guard.test.ts --retry=0)`; `bun run check:seeds` from `apps/extension` (live, both free endpoints); `bun run test:ci-gating`; `bun run audit:vue`. Pass: all exit 0 but the `grep`; no stored-shape test asks for a stamp; the e2e files' wall-clock is recorded (no scenario added). The full smoke and network suites, on both browsers, are the PR's required CI lanes; locally the gate runs the files that exercise the touched code, as the lane's validation answer sets.

## Phase 3 (arc 2): the Worker

1. Write `test/fakes.ts` (config reader, limiter fake, a fake upstream recording each request), then `test/worker.test.ts`, one case per rule: each host to its secret, an unknown host and path 404, a caller's header or query never picks the upstream; bytes forwarded unchanged and the outbound headers exactly `content-type`; one upstream call on an upstream 500 and on `aztec_sendTx`; the body at the cap forwarded, one byte over 413 (and a lying `Content-Length`); a bad method in a batch, a non-object entry, an empty array, 101 entries, non-JSON and a body that is not valid UTF-8 each 400 with no upstream call; `GET` 405; `OPTIONS` 204 with the preflight headers; a `chrome-extension://` and a `moz-extension://` origin echoed on a success, an upstream 500, a 413, a 429 and the kill switch; `https://evil.example`, `Origin: null` and a malformed extension origin 403 without CORS headers; no Origin served without them; the kill switch calls nothing and counts nothing; an unset secret 503; a thrown fetch and a 3xx 502; the upstream's `content-type` and `x-aztec-*` kept, its `set-cookie` dropped, `Cache-Control: no-store` on every answer. `test/deploy.test.ts`: subscribe's checks for this config (no routes, vars exactly `PROXY_OFF`, no `drpc` in the raw config, the limit on a namespace other than `1001` and `1002`, the self-contained bundle). `test/methods.test.ts`: the prefix a real `createAztecNodeClient` puts on a captured call, joined to every `AztecNodeApiSchema` key, is a subset of `NODE_METHODS`; the workspace's stdlib pin equals `apps/extension`'s.
2. Write the source until every test is green. Add the proxy to `scripts/ci-cd/edge-headers.test.ts` as the sixth surface with no exception. Write `infra/rpc-proxy/README.md` (threat model, the handler contract table, the owner checklist OS-1 to OS-10, operations: kill switch and rotation). Update `CLAUDE.md` (the Workers Builds Bun line, the `bun test` workspace lines, the deploy sentence under Branching), `CI.md:33`, `SECURITY.md` (a section beside the passkey host's, the audit-ack row), `scripts/ci-cd/audit-acks.json:84`'s reason, and the `aztec-update` skill (its pin sweep gains `infra/*/package.json`; the allowlist's drift test reds on a schema change). Run `bun install` and commit `bun.lock`.

**Gate:** `bun run lint`; `bun run typecheck:all`; `(cd infra/rpc-proxy && bun test)`; `bun test scripts/ci-cd/edge-headers.test.ts scripts/ci-cd/bun-version.test.ts`; `bun run test:all`; `bun run test:ci-gating`; `bun install --frozen-lockfile`. Pass: all exit 0.

## Delivery

- **Arc 1:** branch `rpc-proxy-1-a1` off this plan's commit; PR `fix(network): keyless dRPC defaults with a batch cap of 3, old testnet rows moved` (80), `Closes #1607`, `Closes #1609`. **Arc 2:** `rpc-proxy-1-a2` stacked on it, `feat(infra): rpc.nulo.sh reverse proxy in front of the paid dRPC endpoints` (77), no issue. **Close-out:** docs-only top layer `rpc-proxy-1-close-out`. `gh stack submit --auto`, base `dev`, PRs ready, no label at creation; `e2e:extension-network` added to arc 1 only if its path filter skips the network lane.
- Each body: what changed and why; the claims that did not hold; the UI impact; the runs and outcomes with each e2e file's wall-clock; the owner steps it depends on (arc 1: OS-7 and OS-10; arc 2: OS-1 to OS-6, OS-8, OS-9); ending `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. No keyed URL, local path, account name or launch day.
- Commits: conventional, lower case, signed, ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Parallelism:** the arcs touch disjoint files (arc 2 edits docs arc 1 does not), so they could run as lanes; serial is chosen because arc 1 is the urgent one and arc 2 adds no wallet dependency, so a lane saves nothing on the critical path to the fix.
- Before arc 1's first commit, post the `## Decision` comment on #1607 (what ships, where the proxy stands, `rpc-fallback-1` next), and a comment on closed known limit #570 that its prerequisite ships with arc 1 and the rotation follows OS-7.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `ff395c3d0`. Specific here:
- Step 1 is absent (`code_review: off`). Step 2 runs per arc at its boundary over `git diff <arc base>...HEAD`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; one Opus 5.5 diff review (`general-purpose`) beside round 1. After arc 2, one fresh Codex session over the net diff for cross-arc issues. Prompts under `~/.cache/nulo-backlog/rpc-proxy-1/`. Hard stop at three rounds; each round in `lessons/phase-N.md` and the table below.
- **Approval boundary (a plan change; stop):** a persisted field on a network row; a rewrite of any row but an endpoint whose URL digest is listed; a retry, timeout, cache or fallback in the proxy; a wallet reference to `rpc.nulo.sh`; any edit under `legal/`; a new workflow or required check; a new e2e scenario.
- Close-out: the Outcome; OA-1, if still open, filed as one `owner-decision` issue; the owner steps not yet done filed as one `blocked:external` issue; lessons promoted within the 8 KiB budget; `STATUS.md` deleted; `git mv` into `archive/`, index line moved. Teardown after the merge: `agent-worktree done rpc-proxy-1 --merged`, trunk `dev`; the archived plan is `implementations-plan/archive/rpc-proxy-1/plan.md`.

## Decision ledger

| # | Decision | Rejected | Why |
|---|---|---|---|
| D1 | Two arcs and a close-out: the wallet fix first, the Worker second | one arc (the brief's guess) | #1607 blocks Mainnet sends today; the Worker gates nothing and should not hold the fix in review |
| D2 | Cap by literal provider origin, in code (`BATCH_CAPS`) | a persisted field + stamp + golden; a lookup derived from the current seeds | Trade-offs above; a derived lookup drops the cap from rows seeded on a host a later seed leaves |
| D3 | Inject the lookup into the adapter; one composed factory | threading through `NetworkInfo` and the port; the table inside `aztec-runtime` | one parameter reaches every builder, the PXE's and a pinned URL's included; which providers Nulo ships is product data, passed down as Presto's host is |
| D4 | Match the retired default by SHA-256 | host + path prefix | a person's own key under the same prefix must survive |
| D5 | Rewrite in place at unlock after sealing; leave the retired endpoint when the network already holds the replacement | merging (drops a Settings row: an owner call); writing a duplicate | no row appears or disappears; the one-URL rule holds; the left endpoint is a known limit |
| D6 | Two blind `sed` edits (line 1's comment, line 2's literal) | the brief's one edit | line 1 names a key the file no longer holds |
| D8 | `aztec_` + every schema name; a superset drift test | `node_*`; an exact-equality test | the client sends `aztec_`; a superset keeps an older wallet's names after a bump |
| D9 | Server-side Origin check: extension schemes or none | CORS headers alone; pinning the Chrome store id | CORS does not stop an unpreflighted POST; Firefox's id is per install |
| D12 | Per-IP 100 per 10 s, no global limiter | a global limiter | the CU cap is the ceiling |
| D13 | No new workflow; `quality-status` covers the workspace | a per-package workflow | Trade-offs above |
| D14 | Deploy from `main`; domains attached in the dashboard | from `dev`; `routes` in the config | the released wallet is the proxy's consumer; the build token has no zone permission |
| D15 | No `legal/` edit; OA-1 | a § 5.1 patch now | the brief's scope; the over-statement shields no one's data |
| D17 | The four factory parameters become required | keeping the uncapped `??` defaults; a source-scan test | the type checker then refuses any construction without a factory; a scan pins text, not wiring |
| D16 | Body cap 1 MiB + 1 KiB; 100 entries | exactly 1 MiB | Fact 1's maximum is 100 bytes over 1 MiB |
| D18 | In the tree: the Testnet constant's edit lands in Phase 1, and `retireEndpoints` digests each URL itself | the edit in Phase 2; a `digest` parameter | the cap test pins both seeds' origins; the parameter had one value |

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| plan 1 | Codex, gpt-6.1-sol (session 01a1a1f6) | conditional approve | `tx-sendTx-default` for the proverless-only `failed-send-check`; the `grep -c` status; the retry boundary is the next worker start; the 503 kill switch's retry documented; Fact 1 in UTF-16 units; OS-6 reads headers at an echo endpoint and checks error bodies for the key; the shared-quota known limit, OS-4 before OS-3; D5 skips instead of merging (no row removed); OA-1 names § 2 | a terminal 4xx for the kill switch: it reaches no upstream and 503 is what it is; full local suites: the lane's validation answer sets the touched files, and CI runs the full lanes |
| plan 1 | Opus 5.5 (Plan) | conditional approve | the production digest checked against the v0.31.0 recording; the factory defaults made required (D17); `BATCH_CAPS` by literal origin (D2); the Worker's stdlib pin tied to the extension's and the sweep glob; OS-1's other build tokens, OS-3's new per-network keys, OS-4's hard cap as I5, OS-10; Fact 3 restated; the transaction and journal URLs as a known limit; a distinct limiter namespace; `Origin: null`; the timing test dropped; `test:ci-gating` in Phase 2; the rewrite's own log message; I6 | a service test of the reset-then-rewrite sequence: the skip test and the rewrite test cover both halves, and the reset adding a keyless endpoint lands in D5's known limit |
| final 1 | Codex, gpt-6.1-sol, fresh (session 01a1a20c) | conditional approve | `egress-guard.test.ts:265` expects the retired host: derived from `LIVE_NODE_HOST`; the smoke gate builds the armed build per browser after the network runs; the retry waits for a background restart (the heartbeat keeps the worker alive), a known limit; a malformed UTF-8 case; the Outcome names D5's exceptions. D2/D3/D17, D4, D5, the 503, D13 and OA-1 verified | none |
| final 2 | Codex, resumed | **approve** | the four conditions verified; no regression | none |
| arc 1 r1 | Codex, gpt-6.1-sol (session 01a1a242) | findings (3 low) | the preflight client's cap and its `[3, 3, 2]` test; the seal-then-move order pinned; two comments reworded | none |
| arc 1 r1 | Opus 5.5 (diff review) | findings (4 low) | README:99's host; the adapter's lookup required and the dead re-export removed; the other-profile row in the unlock test; the lesson corrected | none (the request-rate limit noted under I4) |

## Seeds (not run; orchestrator-owned)

```
/goal Phases 1 and 2 of implementations-plan/rpc-proxy-1/plan.md marked ✓ with their gates passing in the transcript; the arc 1 Codex loop (gpt-6.1-sol, high) converged; one ready PR against dev closing #1607 and #1609; bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/rpc-proxy-1 per its plan.md and the README § Post-implementation standard at ff395c3d0: run the gates, decide open questions with Codex (gpt-6.1-sol, high), open each arc's PR, never merge, never print the constant's file; stop once its checks are green and report.
```

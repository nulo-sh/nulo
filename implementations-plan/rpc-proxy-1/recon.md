# rpc-proxy-1 recon

Base `ff395c3d0` (origin/dev). Three Sonnet explorers (Worker infra and CI; network storage and the node path; the node client's internals), then the driver's own reads. No URL that carries a provider key is quoted here or anywhere in this plan.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Worker scaffold (wrangler, scripts, tsconfig, fakes, deploy test) | `infra/subscribe`: `wrangler.jsonc` (`workers_dev`/`preview_urls` false, `observability` off, `ratelimits`, `SUBSCRIBE_OFF`), `test/fakes.ts` (reads the config, a limiter fake), `test/deploy.test.ts` (no public origin, exact vars, no secret, a dry-run bundle built from `src/` alone with no imports) | adapt |
| Capped body read | `infra/subscribe/src/body.ts` `readCapped` (streams, never trusts `Content-Length`) | adapt (copied: a Worker bundle may hold only its own `src/`) |
| JSON refusal, security headers | `infra/subscribe/src/respond.ts` `failure`, `SECURITY_HEADERS`; `scripts/ci-cd/edge-headers.test.ts` holds five surfaces to one set | adapt; the proxy joins as the sixth surface |
| Rate limit, kill switch | `infra/subscribe/src/worker.ts` `admit` (method, Origin, `cf-connecting-ip`, `IP_LIMITER`), `SUBSCRIBE_OFF` checked first | adapt |
| Custom domain on a Workers Builds Worker | `infra/token-list/wrangler.jsonc:13`: attached in the dashboard, since the build token holds no zone permission; `infra/passkey-rp` declares its route but deploys by hand | token-list form |
| CORS, `OPTIONS`, host routing, streaming pass-through | none in `infra/*` (searched `Access-Control`, `OPTIONS`, `origin`, `hostname`) | build new |
| Node method allowlist | none (searched `AztecNodeApiSchema`, `namespaceMethods`, `node_get`); the schema has 58 methods (`@aztec-labs/stdlib` 6.0.0 `interfaces/aztec-node.js:38-391`) | build new, with a drift test against the schema |
| CI for an infra Worker | no per-package workflow exists for any Worker; `pr-quick.yml`'s `unit-tests` runs `test:all` and `lint-and-typecheck` runs `typecheck:all` over every `@nulo/*` workspace, both inside the required `quality-status` | reuse as is |
| Batch size on the node client | `createAztecNodeClient(url, { fetch, batchWindowMS, maxBatchSize, … })` (stdlib `aztec-node.js:392-405`); nothing in `apps/` or `packages/` passes `maxBatchSize` | adapt the adapter |
| Node construction sites | `AztecNodeFactoryAdapter` (`createNode`, `probeChainId`, `silentSingleAttemptNode`); constructed by default in `NetworkService` (`service.ts:253`) and `ProductionPxeFactory` (`chain-runtime.ts:160`), which `offscreen/index.ts:96-105` builds three ways with `undefined` | adapt |
| Seed data | `seeds.ts` `DefaultSeed`, `DEFAULT_SEEDS`, `seedForKind`; seeding is once per kind and nothing re-compares stored rows to the seeds later | adapt |
| At-unlock row work | `sealOnRowKeysReady` (`seal-on-unlock.ts:24`), wired in `NetworkService.init` to `sealLegacyRows`; endpoint writes follow `updateEndpoint` (lock, re-read, `storage.set`, evict `transientNodes`/`nodes`, emit `onNetworkUpdated`); `refuseWhileResetHolds` | reuse the hook; the rewrite is new |
| Live seed check | `scripts/seed-identity.ts` (`check:seeds`, nightly advisory `seed-identity-live`) reads each remote seed's identity once | adapt: one batch at the seed's cap |

## Facts the plan rests on

- The 6.0.0 client sends `aztec_<method>` (`namespaceMethods: 'aztec'`, `safe_json_rpc_client.js:144`), always as an array, coalescing one tick's calls up to `maxBatchSize` (default 100) and a summed item length under 1 MiB (`:39-54`); the batch body is at most 1,048,575 bytes of items plus 101 bytes of punctuation.
- The client's fetch treats a non-ok JSON body as `NoRetryError` when 4xx and retries a 5xx; a non-JSON non-ok body is retried whatever its status (`fetch.js:16-58`, the wallet's `utils/fetch.ts:40-75`, four attempts).
- The client sends only `content-type`; the wallet passes no `versions`, so no `x-aztec-*` response header is read today (`versioning.js:68-100`).
- `MAX_TX_LIFETIME` is 86,400 s (`@aztec-labs/constants` 6.0.0); a pending send is checked through the endpoint it was sent to (`submittedEndpointUrl`, `transaction/service.ts:585`).
- Network rows are not in a full backup: the `network` slice is retired and an import reseeds from the build's seeds (`services/backup/README.md:21`).
- The old Testnet default is one string in every release since the first commit (`git log` of the constant's file: two commits); its key part is 44 characters; the v0.31.0 update fixture's Testnet row holds the same string (digest compared, not printed).
- Settings shows an endpoint's URL under its label (`settings/networks/[id].vue:294-295`) and prefills it in the editor (`EditEndpointPopup.vue:40`).
- `legal/privacy.md` § 5.1 says the default Testnet endpoint uses the Developer's provider account (version 1.2.5).

## Collisions and open work

- Closed known limit #570 (the Testnet key in every bundle and on its Settings row): its missing prerequisite was "an endpoint that needs no key in the client"; arc 1 ships one.
- #143 (closed): incoming pollers spend about 4,000 node calls per unlocked hour; on the free plan each install spends its own IP's budget, not a shared key's.
- Lane `rpc-fallback-1` owns several endpoints per network, the proxy as a seeded fallback and the privacy edits; #1608 belongs to another lane.
- Docs naming the Workers or the Testnet key: `CLAUDE.md` (Bun line, test-runner lines, branching), `CI.md:33`, `SECURITY.md` (passkey host section, audit-ack table), `scripts/ci-cd/audit-acks.json:84`, `.claude/skills/aztec-update/SKILL.md:18-24`, `apps/extension/tests/e2e/README.md:99`, `apps/extension/tests/e2e/fixtures/egress-guard.ts:67-72`.

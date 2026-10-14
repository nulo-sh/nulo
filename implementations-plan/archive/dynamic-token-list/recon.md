# dynamic-token-list — recon

Read at `origin/dev` 1cb8d8b4. The worktree base, d01569a2, adds #353, which changes no token, price, CI or legal file. Two read-only Sonnet agents ran: a wallet-side reuse sweep, and a CI / hosting / legal / store mapper. Paths are repo-relative; `EXT` is `apps/extension/src`.

## Reuse map

| Capability | Existing code | Verdict | Why |
|---|---|---|---|
| Background JSON fetch | `EXT/wallet/services/price/service.ts:312-378` (`doRefresh`: 10 s abort, ±25% jittered backoff, injected `fetchFn`) | adapt | The only plain-JSON fetch in the worker. No shared helper, body-size cap, `credentials` or `referrerPolicy` option exists anywhere (searched `fetch\(`, `credentials\|referrerPolicy\|cache:\|redirect` over `EXT`, `packages/*/src`). |
| Ed25519 verify | none | build new | No `Ed25519`, `subtle.verify`, `@noble/*` import or `tweetnacl` (searched `apps packages scripts infra`, `bun.lock`). `@noble/curves@1.7.0` is transitive only. Bun 1.4.2 and Node 24 sign/verify Ed25519 natively (run by the agent). |
| Domain separator | `packages/wallet-crypto` `nulo-separators.ts` + `nulo-separators.test.ts` | reuse pattern | Separator labels are pinned by a test. |
| Daily schedule | `AlarmDispatcher` (`packages/wallet-core/src/utils/alarm-dispatcher.ts`), module-scope shim `EXT/wallet/index.ts:86-101` | adapt | `AlarmsPort` has `create/clear/onAlarm` only; `create` replaces a schedule, so a period alarm re-created on each worker boot never fires. Use a persisted `lastAttemptAt` and a one-shot `when`. A waking alarm reaches only module-scope listeners. |
| Persisted document | `ValueStorage` (`packages/wallet-core/src/storage/value-storage.ts`), key style `nulo:core:token-prices` | reuse | A device-global key is in no backup slice by default (`backup-migration-registry.ts:79-99`). Pre-production: no migration (`CLAUDE.md` § Persisted-storage). |
| Hostile JSON | `parseMarkerEntry` (`EXT/wallet/services/token/seeder.ts:103-124`), zod jitless (`EXT/utils/zod-jitless.ts`), `fieldAddressKey` (`packages/wallet-bridge/src/field-address.ts:13-30`) | adapt | `isTokenPresent` compares with `===` (`token/service.ts:811`) while `seedKey` lower-cases (`seeder.ts:699`): a list spelling that is not lower-case makes duplicate rows (#329's mechanism). |
| Seed list seam | `TokenSeederDeps.getSeeds()` (`seeder.ts:132-135`), wired at `token/service.ts:178`; armed e2e swap `EXT/wallet/runtime.ts:525-536` | adapt | Called per pass AND per status read, announce and continuation (`seeder.ts:401,580,598,636`): must be an in-memory read. |
| Seeder versioning | `getVersion` (4th ctor arg, `seeder.ts:193-197`); `rejectedAtVersion` / `cappedAtVersion` | adapt | "A seed-list fix ships in a release" (`seeder.ts:43-44`) stops being true: a re-pinned entry would stay `rejected` until the next release. |
| Default-delete tombstone | `deleteToken` (`token/service.ts:617-628`) uses `findSeed` | adapt | List membership is no longer stable; a delisted default deleted by the user must still tombstone. |
| Artifacts | `ArtifactRegistry` (`packages/aztec-runtime/src/pxe/artifact-registry.ts:21-23,88-100`), `artifact-catalog.ts:27-35` ("never fetched at runtime") | constraint | A seeded token resolves only a bundled artifact (`parseTokenInterface`, `token/service.ts:699`). One token class is seeded today: aztec-standards Token rc.1, `0x24c3…1505` (`default-tokens.ts:37`, pinned by `default-tokens.test.ts:15-19` to `getBundledTokenClassId()`). |
| Price map | `EXT/wallet/services/price/price-map.ts` | adapt | `TOKEN_ENTRIES` (`:53-57`) keys USDC/USDT/EURC on `TESTNET_TOKENS`; GBPC is unpriced. `getPriceMapEntry` is called synchronously in the popup (`composables/usePrices.ts:68`, `BalanceView.vue:216`) and in the worker (`incoming-transfer/service.ts:650`). `allCoingeckoIds` is derived from token entries. |
| "Nulo knows" names | `EXT/wallet/services/dapp-interaction/known-contracts.ts:19` (`seedsForChain`) | adapt | Called inside the async `requestCapabilities` (`dapp-interaction/service.ts:466-472`). |
| Seed status UI | `useSeedStatus.ts`, `TokenSeedRow.vue`, `home-slots.ts`, `BalanceView.vue:187-193` | reuse | Reads statuses over RPC, never the list; docs call the strings "compiled-in literals" (`token/spec.ts:155-190`): a comment edit. |
| Lifecycle hooks | `onInstalled` (`EXT/wallet/index.ts:35-38`, install only), `ProfileService.onProfileAdded` (`profile/service.ts:110`), service `init()` | adapt | No `onStartup`. The onboarding router gates every page but welcome and Terms on a current acceptance (`EXT/onboarding/legal-guard.ts:24-31`), so profile creation follows acceptance. |
| Preflight tooling | `apps/extension/scripts/seed-preflight*.ts` | leave | Manual, Testnet-only; no CI wiring (searched `.github`, `package.json`, `scripts`). Live entry checks are deferred by the owner. |
| Worker host | `infra/passkey-rp` (custom domain, `workers_dev:false`, policy-header tests, `test:live` + advisory nightly `rp-host-live`, `nightly.yml:284-299`) | adapt | Deployed by hand. The landing (`apps/landing/wrangler.jsonc:10-13`) is the Workers Builds pattern: domain attached outside the file, `BUN_VERSION` build variable. No Worker sets CORS today (searched `Access-Control`). |
| PR validation | `pr-quick.yml` `changes` + `quality-status` state machine; `aggregators.test.ts:208-215`, `behavior-gating.test.ts`, `action-pins.test.ts` | adapt | New filter key, job, `needs`/env/`expect` line. A new `@nulo/*` workspace is unit-tested by `test:all` with no filter change. |
| Gated environment | `npm-publish` (owner reviewer, branches dev+main); `firefox-add-ons` holds the only env secrets | reuse pattern | `store-check.yml:10-14`: a secret reaches one step, after every third-party action, checkout without credentials. |
| Commit from Actions | `scripts/release/lock-version-run.ts` (`createCommitOnBranch`, `expectedHeadOid`), `open-sync-pr-run.ts`; release-please App token | adapt | App-token commits are GitHub-signed and their PRs trigger CI; `GITHUB_TOKEN` PRs do not. `release-integrity.test.ts` lists every privileged job (`MINTS`, `THIRD_PARTY`, `NO_INSTALL`). |
| Public format | `scripts/publish/` (3 npm packages, lockstep `0.1.0` first-version rule) | defer | A 4th package touches ~10 files and the first-version rule; a doc + vectors meets "documented schema and verification steps". |
| E2E egress | `apps/extension/tests/e2e/fixtures/egress-guard.ts:66-69` `DECLARED_REFUSALS` | adapt | An undeclared host fails a smoke launch at close. |

## Constraints the plan must honour

- `CLAUDE.md` § The wallet repo: "Changing a seed or a link is an owner UI decision"; nothing here reads unleashed, data crosses by hand.
- `implementations-plan/chain-endpoints/plan.md:39,224,436-437`: decision P12-05 keeps the list built in for v1.0.0 and closes #79 by comment; "If it is changed, leave #79 open. A fetched list is its own blueprint." The owner's request for this plan (2026-10-13) is that change.
- Legal: `legal/privacy.md` § 2 says "I do not operate a backend for the wallet"; § 5.5 lists `nulo.sh` and `passkey.nulo.sh`; § 5.2 is the template for a feed. A material privacy change is a minor bump in `packages/legal` and never blocks (Terms drive re-acceptance).
- Store: `apps/extension/store/remote-code.md` (citations checked by `scripts/store-listing.test.ts:121-140`), `store/listing.md` data table and `#### alarms` ("three jobs"), `src/manifest.test.ts:77-81` pins host permissions exactly, `:124-130` the CSP. CSP `connect-src` already admits `https:`.
- Nightly is red (`smoke-against-artifact`, both browsers): `shipped-token-list.test.ts` checks the rc.1 seeds against a reset Testnet (#324).

## Open issues

- **Resolves:** #79.
- **Collides:** #324 (the Testnet reset re-points the seeds; after this plan that is a list publish plus the chain-identity release); #98 (tombstones are outside backups, unchanged by a list); #329 (the list becomes a second entry point for non-canonical hex unless the parse refuses it); `chain-endpoints` arc 2a (P12-05, `manifest.config.ts`, egress guard), `backup-import-export` arc 3 (#98).
- **Unaffected:** #262, #106.

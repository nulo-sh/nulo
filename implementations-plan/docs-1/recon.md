# docs-1 recon

One Explore sweep (sonnet) plus the driver's own read, at dev 2c0df3b9. Paths are relative to `apps/extension/src` unless they start with `apps/`, `packages/`, `scripts/`, `.github/` or a root document name.

## Claims

| Item | Claim | At 2c0df3b9 |
|---|---|---|
| #665 | `clear()` resolves after a failed removal | holds: report-form queue (`wallet/logger/store.ts:23`, `packages/wallet-core/src/utils/serial.ts:36-41`); pinned by `wallet/logger/store.test.ts:237-243` |
| #665 | the viewer reports success | holds in part: it empties its list; there is no success toast. The failure path already has its toast (`components/JsonViewer/LogsViewer.vue:156-170`) |
| #667 | the unknown word reaches the message and a debug log | holds (`packages/wallet-core/src/utils/mnemonic.ts:2131`, `wallet/services/profile/service.ts:1670-1680`, `packages/extension-messaging/src/core/base-service.ts:124`); no test covers an out-of-list word |
| #667 | the screen does not show it | holds: the seed form renders `error.title` only (`components/composite/import/ImportSecretForm.vue:99-102`) |
| #668 | the guard omits `VITE_NULO_FEE_MULTIPLIER` | holds (`.github/workflows/_build-extension.yml:78-100`); it also omits `VITE_NULO_E2E_PROVERLESS(_CONFIRM)`, `VITE_NULO_E2E_MIGRATION_FIXTURE`, `VITE_NULO_PRESTO_REQUIRED` and `VITE_LOCAL_NETWORK_RPC_URL`. The bundle grep covers the first three by marker |
| #672 | `refreshIfStale` runs without a session check | holds (`wallet/services/price/service.ts:143-161`; `SECURITY.md` § External price feed now at `:365-380`) |
| P38-11 | a raw hash is refused; an inner-hash intent always opens a confirmation showing its consumer | holds (`packages/wallet-bridge/src/wallet-schema-args.ts`, `method-scope-checkers.ts:259-312`, `dispatcher.ts:528-583`, `popup/windows/execute/OperationCard.vue:604-605`). `SECURITY.md:262-266` is stale; `:254,258` cite moved files |
| P38-12 | a password backup carries a per-backup key; older files restore | holds (`wallet/services/account/service.ts:1026-1050`, `popup/pages/settings/security/export/full.vue:222-231`, compat epoch 5 at `wallet/services/backup/backup-migration-registry.ts:80`). `packages/wallet-crypto/ATTACK-SURFACE.md:42,99,115-117` are stale. Also stale: "unless encrypted": a password profile's file leaves the page only encrypted (`full.vue:160-164`, `:425`) |
| P38-01 | the master derives from the passkey's PRF output and public credential id only | holds (`packages/wallet-crypto/src/passkey-credential.ts:31-35,53-90`). `SECURITY.md:30-35` cite `src/wallet/services/passkey/credential.ts`, which is gone; the labels live in `packages/wallet-crypto/src/constants.ts:10` and `passkey-credential.ts:31-32` |

## Reuse map

| Need | Found | Verdict |
|---|---|---|
| A queue that orders storage ops and lets one caller see a failure | `createSerialQueue()` propagate form (`serial.ts:48-56`); used the same way by `utils/guarded-network-activation.ts:20` and `wallet/services/token/seeder.ts:185` | reuse-as-is |
| Proof that a swallowed op raises no unhandled rejection | `apps/extension/tests/helpers/unhandled-rejections.ts` (`collectUnhandledRejections`), used by `wallet/services/account/serialize-per-tuple.test.ts` | reuse-as-is |
| "The message does not contain the secret" test shape | `packages/wallet-core/src/storage/entity_storage.test.ts:128-160`, `packages/extension-messaging/src/core/envelope-summary.test.ts` | reuse the shape |
| Running a workflow step's shell in a test | `scripts/ci-cd/gh-step-harness.ts` (`runStep`; stdout and exit code, no stderr), located with `steps.find((step) => step.name === …)` | reuse-as-is |
| Listing every `import.meta.env.VITE_*` key the bundle reads | no shared walker fits a `bun:test` under `scripts/ci-cd/` (the guard walkers are per-file vitest copies; `apps/extension/scripts/type-roles/source-scan.ts` is hardwired to its roots). `git grep -ohE 'import\.meta\.env\??\.VITE_[A-Z0-9_]+'` over tracked files needs no walker | build new: one `git grep` call, no walker copy |
| The "session is open" check | `ProfileService.getActiveProfile()` returns `undefined` while locked (`wallet/services/profile/service.ts:499-506`); the price service already uses it for the alarm (`price/service.ts:178-184`); no other primitive exists | reuse-as-is |
| Locked-wallet price test | `price/service.test.ts` harness `state.profile`, and "onAlarmTick while locked" (`:425-430`) | reuse the shape |

Absence trail: `grep -rlE "readdirSync|git.*ls-files|git grep|Bun\.Glob|globSync|walk\("` over `apps/extension/{scripts,src}`, `scripts`, `packages/*/src`; `grep -rnE "isUnlocked|hasSession|hasActiveSession"` over `wallet/`; `grep -rnE "dangerouslyIgnoreUnhandledErrors|onUnhandledRejection"` over the vitest configs (none: an unhandled rejection fails a run).

## Keys the bundle reads (`apps/extension/src`, tests excluded)

Test or CI only: `VITE_NULO_E2E_PRICE_MAP`, `_TOKEN_SEEDS`, `_TOKEN_SEEDS_CONFIRM`, `_CSP_REPORT`, `_PROVERLESS`, `_PROVERLESS_CONFIRM`, `_MIGRATION_FIXTURE`, `VITE_NULO_PRESTO_REQUIRED` (`presto/config.ts:7-17`: off for every production build), `VITE_NULO_FEE_MULTIPLIER` (`wallet/services/execution/fee/fee-strategy.ts:68-77`), `VITE_LOCAL_NETWORK_RPC_URL` (`wallet/services/network/seeds.ts:29-40`: the e2e runner's port). Secret: `VITE_COINGECKO_API_KEY`. Production build options: `VITE_FEE_JUICE_BRIDGE_URL` (`popup/components/modules/send/fee-helpers.ts:360-363`), `VITE_NULO_ALLOW_IFRAME_DAPPS` (`wallet/services/wallet-sdk/background.ts:106-115`). No package under `packages/` reads one. The four callers of `_build-extension.yml` pass `with:` inputs only; a reusable workflow inherits no caller env.

## Collisions

Branches of the running lanes, compared with `git diff --name-only origin/dev...<branch>` (no sibling worktree entered):
- ci-dedupe-1 edits `scripts/ci-cd/behavior-gating.test.ts` and adds `.github/workflows/_extension-network-e2e-lane.yml`. This lane adds its own test file and leaves both alone.
- test-infra-1 consolidates the vitest source-guard walkers in `apps/extension`; this lane adds no walker.
- onboarding-3, ui-dedupe-1, sheet-1, fees-display-1, type-roles-coverage: none of this lane's files.

## Seen, not taken

- `packages/wallet-core/src/migration/staging.ts:30` puts a `JSON.parse` message, which quotes a slice of a stored row, into an error. Not user-typed input and not in this lane's issues; `implementations-plan/lessons.md` already carries the rule (log a fixed category). Not traced further.
- `legal/privacy.md` § 5.2 already allows refreshes "when refreshing stale interface data"; the gate narrows behaviour inside that text, so no legal document changes.

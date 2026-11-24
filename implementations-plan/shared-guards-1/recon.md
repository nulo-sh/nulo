# shared-guards-1: recon

Base: `origin/dev` at `4a333b343`. Sources: an AST inventory (TypeScript compiler over every `.ts`, `.js` and `.vue` script block of the six workspaces that depend on `@nulo/wallet-core`, tests, stories and declarations skipped: 1,073 files), one Sonnet reuse sweep, and reads of every arc-1 site. The inventory used the pre-review matcher; the guard ships the polarity-aware one in plan § Architecture, and its counts are the plan's.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Non-null object guard | `packages/wallet-core/src/utils/guards.ts` `isObjectLike` | reuse as is |
| Non-null, non-array object guard | `guards.ts` `isRecord` | reuse as is |
| Plain-object guard (prototype `Object.prototype` or `null`) | none in wallet-core; `packages/legal/src/status.ts:66` (legal has no wallet-core dependency); `stored-shapes/emit.ts:108` (local) | adapt: pull `emit.ts`'s body up into `guards.ts` (D2) |
| 32-byte hex shape | `field.ts` `isHex32` over a private `HEX_32` | adapt: export `HEX_32` for the one Zod caller (D3) |
| Message of an unknown throw | `errors.ts` `errorMessageFromUnknown` | reuse as is |
| Delay | `sleep.ts` `sleep` | reuse as is |
| Base64 of bytes | `encoding.ts` `toBase64` (parity with `Buffer` pinned in `encoding.test.ts:44-65`) | reuse as is |
| Source-scan guard with a reviewed baseline | `apps/extension/src/utils/copy-dash-ban.test.ts` (TS AST, `REVIEWED` multiset keyed by file and text), `type-role-ban.test.ts` (`.reviewed.json`), `log-payload-ban.test.ts` (scans the packages), `apps/extension/scripts/type-roles/source-scan.ts` (`sourceFiles`, `parseSource`) | reuse the reader; build a new scan in the same shape (D1) |
| Proof that a mapping keeps a set | `guards.test.ts` (17-value table), `field.test.ts`, `errors.test.ts`, `encoding.test.ts` | adapt: add the inline forms to each table |

## Inventory at `4a333b343`

- 111 inline object guards outside `guards.ts` (94 `isObjectLike`-shaped, 17 `isRecord`-shaped) in 59 files; 14 bare `typeof x === "object"` tests with no null exclusion in their own expression, out of scope: some accept `null`, others follow an earlier `null` return (a guard split across statements, which the guard names as a blind spot).
- 9 regex literals with a hex class quantified `{64}`: `field.ts` (canonical), two identical to it (`extension-messaging/src/errors.ts:368`, `aztec-runtime/src/pxe/service.ts:102`), three lower-case only (`utils/pinned-tokens.ts:9`, `dapp-interaction/approval-delta.ts:36`, `e2e/chrome-storage-token-seeds.ts:26`), one case-insensitive with a `0X` prefix allowed (`popup/pages/send-submit.ts:9`), two un-prefixed lower-case digests (`utils/restore-outcome.ts:31`, `dapp-session/service.ts:65`, HMAC-SHA-256).
- `errorMessageFromUnknown` restated with identical output: `extension-messaging/src/errors.ts:90`, `aztec-runtime/src/fee-juice.ts:45`, `apps/extension/src/e2e/csp-report.ts:102`. Extractors that differ (not restatements, left alone): `composables/full-backup-restore.ts:978` (reads `.message` off any object), `dapp-interaction/service.ts:516` (constant for a non-Error), `wallet/utils/offscreen.ts:300` (`String(err)`), `aztec-runtime/src/utils/fetch.ts:129` (template coercion).
- `sleep` restated: `aztec-runtime/src/adapters/aztec-node-factory-adapter.ts:118` (production); test support only elsewhere (`core/testing/fake-node-factory.ts:90`, `wallet-sdk/test-ports.ts:24`, `e2e/migration-fixture.ts:41`, `wallet-core/src/testing/unhandled-rejections.ts:20`). Not restatements: `utils/abortable-sleep.ts`, `routing/routed-node.ts:131` (`realTimer`, cancellable), `testing/mock-clock.ts`.
- `toBase64` restated: `wallet-crypto/src/session-secret-box.ts:96-98` (three `Buffer` encodes, same output). Its decodes (`:128-132`) and `password-secret-box.ts:171` are lenient `Buffer` decodes, a different contract, left alone like `wallet/utils/lenient-base64.ts`.
- Prototype checks: `stored-shapes/emit.ts:109` (`isPlainObject`, local), `execution/operation-fingerprint.ts:55` (inline, after the array branch), `backup/row-map-migration.ts:193` (throws). Superseded by the plan audit: only the first two accept `isPlainObject`'s set; the third also passes a top-level function with a null prototype (plan K9).
- Naming traps: `content-script/approval-filter.ts:44` (`isRecord` with `isObjectLike`'s body), `dapp-session/spec.ts:92` (`tolerantRecord`, accepts arrays).
- Out of the issue's scope, recorded only: two `bytesToHex` restatements (`utils/restore-outcome.ts:53`, `stored-shapes/baseline.ts:516`).

## Constraints found

- **Published entries.** `@nulo-sh/wallet-crypto` publishes `src/public.ts`, which reaches `account-derivation.ts`, `encryption-key.ts` (already imports `@nulo/wallet-core/utils`), `secret-types.ts`. `session-secret-box.ts` is not reachable from it. `scripts/publish/stage.ts` inlines `packages/*/src` code and refuses anything else, so a reachable module that starts importing wallet-core changes the published bytes; none does here.
- **Content script.** `content-script/content.ts` imports only `@aztec-labs/wallet-sdk/extension/handlers` and `./approval-filter`; `approval-filter.ts` imports nothing. `apps/extension/scripts/content-script-isolation.ts` builds the script's graph as its own copy, never a shared chunk.
- **Accepted complexity functions holding sites** (`scripts/complexity-baseline/manifest.json`): `wallet/logger/utils.ts` `trim` (45; sites 216, 268), `wallet-core/src/utils/serialization.ts` replacer (23; sites 32, 34), `execution/operation-fingerprint.ts` `encodeValue` (25; the prototype check), `backup/row-map-migration.ts` `applyRowTransform` (39; line 300). Line 193 sits in `cloneJsonObject`, which is not accepted. The skill allows a lowered stamp when a function shrinks; the CI ratchet refuses only a raised one.
- **Every workspace that depends on `@nulo/wallet-core`** is exactly the six: `apps/extension`, `wallet-core`, `wallet-crypto`, `extension-messaging`, `aztec-runtime`, `wallet-bridge`. `@nulo/legal`, `@nulo/token-list` and the others do not depend on it.

## Collisions at 2026-11-23 21:30Z

| Holder | Files with sites |
|---|---|
| `backup-contracts-1` (plan approved, arc 1 next) | `wallet/services/backup/**`, `account-state/**`, `composables/full-backup-restore.ts`, `utils/full-backup-helpers.ts` |
| PR #1949 (`harden-security-fixes-5` arc 2) | `wallet/services/wallet-sdk/**`, `task/**`, `execution/helpers/batched-view-simulation.ts` |
| PR #1945 | `token/service.ts`, `token/seeder.ts`, `popup/pages/send*` (also `extension-messaging/src/errors.ts`, at lines 427 and 805, away from this lane's 90 and 368-379) |
| PR #1942 | `account/service.ts`, `popup/pages/settings/security/**` |
| PR #1948 | no file with a site |
| lane `dapp-estimation-extract-1` (#1934), added 2026-11-24 at arc 2 | `execution/dapp-send-executor.ts`, `execution/service.ts`, `execution/transfer-executor.ts`, `execution/estimate-reuse-shared.ts` and any new file beside them; only the first holds a site, which moved to arc 3 |

Closed `known-limit` issues searched ("guard", "isRecord", "hex", "duplicate", "inline"): none concerns an object guard; #372 (a token row stored in another hex spelling) concerns token-row keys, which no site here reads.

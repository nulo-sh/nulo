# security-fixes-1 — recon

Read against `origin/dev` at `90f4fb3`. Two read-only explorers (a batched reuse sweep over ten
capabilities, and a sink inventory plus e2e map) and the planner's own reads of every line each issue
cites. Paths are repo-relative.

## Reuse map

| Capability needed | Existing code found | Verdict |
|---|---|---|
| Refuse a method as a batch leg | `refusedInBatch` flag (`packages/wallet-bridge/src/method-descriptors.ts:107`), derived `BATCH_REFUSED_METHODS` (`:395`), pre-scan in `handleBatch` (`packages/wallet-bridge/src/dispatcher.ts:522-526`) | reuse as is: one flag |
| Batch-refusal tests | `describe("batch refusal")` in `packages/wallet-bridge/src/dapp-grant.characterization.test.ts:265-342` (`runBatch`, `batchRefusal`, a `test.each` per refused method, an exact-set test over `METHOD_REGISTRY`, a `(DRIFT PIN)` for `grantPublicAuthwit`, success controls) | adapt: add a row, flip the pin, widen the exact set |
| Canonical grant shape | `projectKnownCapability` (`packages/wallet-bridge/src/capability-negotiation.ts:234`) with per-type projectors (`:205-225`); throws `ValidationError("Malformed <type> capability")`, passes unknown types through | reuse as is for stored grants |
| Stored-grant validator | none. The session codec is deliberately tolerant on grants (`apps/extension/src/wallet/services/dapp-session/spec.ts:70`, `:93-94`); the row MAC (`dapp-session/integrity.ts`, `mac-storage.ts`) verifies the stored bytes, not the shape | build new: one pure helper over `projectKnownCapability` (justified: nothing projects a stored grant today; search trail below) |
| Where grants are interpreted on the dApp path | `dispatch()` reads the row once per invocation (`packages/wallet-bridge/src/dispatcher.ts:279`; a batch leg is its own invocation); `enforceCapability` (`:1014`) hands its grants to every scoped handler, `computeCapabilityDelta` (`capability-negotiation.ts:325`) reads them for coverage; the session service's writers and `queued-journal.ts:106` read raw records off this path | adapt: project at the two interpreting reads |
| Fixed-text refusal built only from wallet-owned words | `ScopeViolationMessage` + `scopeViolation()` (`packages/wallet-bridge/src/scope-violation.ts`) | adapt the idea: a builder whose only input is the policy; do not reuse the class (OA-2) |
| Secret stash with wipe-on-drop | `ExpiringStash` (`apps/extension/src/wallet/services/profile/expiring-stash.ts`): `sweep`, `take`, `drop` wipe; inherited `set` does not | adapt: make a replacing `set` wipe the old entry |
| Profile projection | `getProfileInfo` (`apps/extension/src/wallet/services/profile/service.ts:2184`), the only one; `backup()` hand-projects `{id,name,type}` (`:2190`) | reuse as is |
| Artifact class-id assert | `assertArtifactClassId(artifact, expected: Fr)` (`packages/aztec-runtime/src/pxe/artifact-class-id.ts:72`), exported from `@nulo/aztec-runtime/pxe`; used before registration at `apps/extension/src/wallet/services/execution/service.ts:854`, `:998` after `ContractInstanceWithAddressSchema` / `ContractArtifactSchema` parses | reuse as is |
| Real-data class-id fixture | `packages/aztec-runtime/src/pxe/register-contract.test.ts`: a genuine `NuloAccount` instance + `FrozenSchnorrAccountArtifact`, both serialized to wire form | reuse the fixture shape |
| Sponsor and chain identity binding for estimate reuse | `FpcIdentitySnapshot`, `fpcIdentityDrift`, the exact-pair chain check (`apps/extension/src/wallet/services/execution/operation-estimate-reuse.ts:51-57`, `:139-146`, `:167-181`); `getLiveChainIdentity` wiring (`execution/service.ts:303-308`) | adapt: move the two comparisons into `estimate-reuse-shared.ts`, use them from both ladders |
| The exact chain pair a build signed under | `BuiltStandardTx.chainIdentity` (`execution/tx-request-builder.ts:89`), inherited by `FeeEstimate` (`execution/fee/fee-strategy.ts:73`) | reuse as is |
| The sponsor row a build used | `FpcStrategy.buildAndEstimate` reads it once (`execution/fee/fpc-strategy.ts:116`); `FeeEstimate.sponsor` carries `{fpcId, address}` only for a Sponsored FPC that is the kernel's fee payer (`:99-104`) | adapt (see decision D6) |
| Chain-liveness fence on a writer | `NetworkService.isChainLive` (`network/service.ts:589`, lock-free, false while the network is reserved for deletion); pre-write check + post-write compensation in the token writers (`token/service.ts:881-891`, `:575-584`) | reuse the pattern |
| Per-row lock for account rows | `tupleLocks` keyed by `accountRowIdOf` (`account/service.ts:304`), held by rename/visibility, the chain and profile purges, the import compensation | reuse as is |
| Epoch re-checks on the incoming public arm | `resolveReceiptTrust(..., standDown)` and the checks at `incoming-transfer/service.ts:2113-2115`, `:2138`, `:2143` | reuse the same checks on the note arm |
| Incoming epoch scenario harness | the note and public "receipt epoch re-check matrix" in `incoming-transfer/service.scenarios.test.ts:5660-5790` (`instrumentReceipt`, `bumpedAfter`, `receiptFlags`) | adapt: flip the note rows that the fix closes |
| Userinfo refusal | inline in `RpcUrlSchema` (`network/spec.ts:155`); the shared transport rule `rpcTransportVerdict` (`packages/wallet-core/src/utils/rpc-url.ts`) does not judge it; the adapter (`packages/aztec-runtime/src/adapters/aztec-node-factory-adapter.ts:48-61`) applies only the transport rule | adapt: move the userinfo rule into the shared verdict |

## Absence search trails

- Stored-grant decoder: grepped `capabilityGrants`, `GrantedCapabilityRecord`, `projectKnownCapability`, `tolerantRecord`, `z.custom<GrantedCapabilityRecord>` over `apps/` and `packages/`. Only the negotiation path projects (`collectNewGrants`, `projectRequestedCapabilities`).
- Shared sponsor or chain comparison: grepped `fpcIdentity`, `chainIdentity`, `getLiveChainIdentity`, `FpcIdentitySnapshot` under `apps/extension/src/wallet/services/execution/`. Only the operation ladder and its stash site use them.
- Shared userinfo helper: grepped `username`, `password !==`, `userinfo` over `packages/*/src` and `apps/extension/src`. Only `RpcUrlSchema`.
- `ExpiringStash` tests: no `expiring-stash.test.ts`; coverage lives in `profile/service.integration.test.ts` (`:1423-1508`, `:3753-3804`).
- e2e for the selector binding, a batch with a refused leg, a userinfo URL, or the estimate-reuse path itself: none (grepped `batch`, `Scope violation`, `selector`, `estimateId`, `@` URL forms under `apps/extension/tests/e2e/`).

## Issue claims against the tree

| Issue | Claim | Holds? |
|---|---|---|
| #28 | `grantPublicAuthwit` lacks `refusedInBatch` and is popup-routed | yes (`method-descriptors.ts:289-297`). A characterization test pins it as `(DRIFT PIN)`. |
| #29 | a stored `contracts: {}` throws a TypeError in coverage and enforcement | yes, pinned at `dapp-grant.characterization.test.ts:208-217`. Correction: storage edits are not a realistic source, since a tampered row fails its MAC and is dropped (`dapp-session/spec.ts` `mac` field, `mac-storage.ts`). Realistic sources are the two RPC setters (any extension page; the only non-test caller passes `[]`) and rows written before projection existed (pre-production, so dev installs only). |
| #13 | the selector-binding refusal carries the claimed name, the resolved function name and the address, and reaches failed records and logs | yes. Correction: it does **not** reach the dApp. A plain `Error` is not on the code channel (`execution/rpc-cancel.ts:93-100`), so the dApp envelope is the constant `UNCLASSIFIED_ERROR_MESSAGE` (`wallet-sdk/error-envelope.ts:219`). |
| #30 | the type refusal precedes `take`, so the stash survives | yes (`profile/service.ts:2663-2670`, BUG PIN at `service.integration.test.ts:3770-3783`). Extension: a row whose `type` became `"password"` goes to the password branch, which never touches the passkey stash either; the `isActive` early return and the missing-row and tombstone refusals also leave it. |
| #31 | six RPCs return the stored row | yes (`:598`, `:738`, `:1007`, `:1173`, `:2129`, `:2176`). Extension: `deleteProfile` also returns the row (`:1499`, `:1506`). The `set`-over-live-entry leak is real in the class (`expiring-stash.ts:4-7`; `set` at `:2369`, `:2531`, `:2545`) but unreachable today: password restore allocates a new id (`:2349-2351`), passkey restore refuses an existing id (`:2490-2492`), and `deleteProfile` drops both stashes. |
| #27 | restore registers without a class-id check | yes (`account-state/service.ts:409-415`). The PXE seam checks only the address derivation (`packages/aztec-runtime/src/pxe/service.ts:451-476`), and upstream `pxe.registerContract` states it performs no validation (`@aztec-labs/pxe` 6.0.0-rc.1 `dest/pxe.js:538-543`). Extension: upstream's class hash interpolates an artifact-chosen private-function name into its error (`stdlib` `contract_class.ts:63`), and the restore's connectivity classifier matches `timeout`/`refused` anywhere in a message (`account-state/normalize.ts:215-222`). A restore error is rendered: it raises the import warning and the details viewer shows it. |
| #33 | the transfer ladder binds the sponsor only by `fpc:<id>` and never re-asserts the chain | yes (`transfer-estimate-reuse.ts:41-58`, `:123-198`). |
| #32 | create and import lack a chain-liveness fence; the reconcile delete skips the row lock | yes (`account/service.ts:289-290`, `:521-527`, `:856`). |
| #25 | the note arm lacks the public arm's re-checks | yes (`incoming-transfer/service.ts:1428-1429`, `:1486-1503`); the matrix pins N1-N7, N9-N11 as `(DRIFT PIN)`. |
| #35 | the adapter accepts userinfo | yes (`aztec-node-factory-adapter.ts:48-61`; table rows at `aztec-node-factory-adapter.test.ts:150-198`). |

## Sinks the selector-binding refusal reaches (#13)

| Sink | Where | What reaches it | Who sees it |
|---|---|---|---|
| Task record `error` | `task/wrapped-task.ts:29-31` via `task.fail` in `tx-request-builder.ts:215`, `:471` and the fee strategies | full message | popup clients receive it; no template renders it |
| Journal row `error.message` + `error.normalizedRaw` (stack included) | `dapp-send-executor.ts:267-268` → `mark-failed-unless-cancelled.ts:21-29` (kind `dapp_execute`) | full message twice | `popup/pages/journal/[id].vue:292-304`, debug or developer mode only |
| Operation result `error` | `execution/service.ts:726` → `classifyOperationCatch` | full message, no code | internal |
| Log line | `execution/service.ts:742` `logError(..., classified.error)` as a string | full message, URL-scrubbed only | log viewer and its CSV export (developer mode) |
| Popup RPC error | `extension-messaging/src/core/error-response.ts:25-33` on the estimate path | full message | `windows/execute/index.vue:154` `console.error` → logger (200-char cap) |
| Popup RPC error, authorization preview | `windows/execute/index.vue:177` `console.error` → logger | message, 200-char cap | log viewer (developer mode) |
| Fast-path mixed fallback | `execution/fast-path.ts:255` `logError(..., err)` | message via `trim()` | log viewer (developer mode) |
| dApp envelope | `unwrapOperationResult` → `toWalletResponseError` fall-through | constant text | the dApp; nothing of the call |

## e2e map (files that cover the touched paths)

- Batch: `network/batch-mixed`, `network/batch-partial-failure`, `network/meta-batch`.
- Grants and refusals: `network/scope-refusal`, `network/err-scope-and-cap`, `network/cap-widening`, `network/cap-request-repeat-noPopup`.
- Selector-binding happy paths: `network/sim-methods`, `network/authwit-variants`, `network/tx-sendTx-default`.
- Profiles: smoke `profile-rename`, `security`, `registration`, `onboarding-import`, `passkey-backup`, `passkey-paths`, `passkey-retry`.
- Backup restore with contracts: smoke `backup-roundtrip`, `import-dead-rpc`; network `backup-restore-integrity`, `backup-migration-roundtrip`, `profile-reimport-matrix`.
- Sponsor and estimate reuse: network `fee-methods`, `send-amount-exact`, `transfers`.
- Accounts: smoke `accounts`, `account-import-export`, `backup-imported-account`; network `account-balance-orphans` (reconcile).
- Incoming: network `incoming-transfers`, `incoming-public-transfers`, `incoming-arrival`.
- Endpoints: smoke `endpoints`, `settings-crud`; network `networks`.

No touched path changes a fixture, a window, focus, user activation or WebAuthn handling, so no Firefox twin is required.

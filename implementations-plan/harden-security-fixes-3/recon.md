# Recon: harden-security-fixes-3

Base `origin/dev` at f214e5cb. Three read-only explorers (sonnet) plus the lead's own reads. Paths are repo-relative.

## Reuse map

| Capability needed | Existing code | Verdict |
|---|---|---|
| Record a send's public authorizations, idempotently, tx-linked | `AuthRegistryService.recordPendingAuthwits` (`apps/extension/src/wallet/services/auth-registry/service.ts:233-275`) | reuse as is |
| Remove the pending rows of a send the node did not accept | `AuthRegistryService.reconcileAuthwits(scope, txHash, "dropped")` (`:277-300`) | reuse as is |
| The hook that runs after prove, before the send, with the tx hash | `ProveAndSendContext.commitSubmitting` (`execution/execution-coordinator.ts:340-346`), supplied by `DappSendExecutor` (`execution/dapp-send-executor.ts:376`, used at `:876`, `:1087`) | adapt: wrap at the two sites |
| Know whether the node accepted a send | `ProveAndSendContext.onSent`, fired after `node.sendTx` returns (`execution-coordinator.ts:277-308`) | reuse as is |
| A send's verdict after a worker death | the journal's send check (`operation-journal/send-check.ts`, `spec.ts:271-284`) | not used (HS3-D2) |
| A revoke of a row whose grant may still land | `awaitGrantBlocks` / `verifyRevoked` (`auth-registry/service.ts:557-600`) | reuse as is (no change) |
| A per-network figure for senders | `ACCOUNT_STATE_CAPS.maxSendersPerNetwork = 64` (`account-state/normalize.ts:14-18`, exported), applied today to backups | reuse as the basis of the figure |
| Count and write under one guard | `PxeService.registerSender`, `registerAccount`, `getSenders`, `getRegisteredAccounts`, each in `withPxeWrite` / `withPxeRead` (`packages/aztec-runtime/src/pxe/service.ts:342-389`) | adapt: an optional bound inside the write |
| A typed refusal across the offscreen hop | `PxeScopeUnregisteredError` in `@nulo/extension-messaging/errors`, serialized by `packages/extension-messaging/src/core/error-response.ts:29` and rebuilt from the errors table | reuse the pattern for one new class |
| The dApp registration handlers | `executeAztecRegisterSender` (`execution/service.ts:1189`), `executeAztecRegisterContract` (`:1198-1244`) | adapt: pass the bound; register the account before the contract |
| A refusal the dApp reads without request values | `ScopeViolationError` and its frozen envelope (`packages/wallet-bridge/src/scope-violation.ts:116-121`, `wallet-sdk/error-envelope.ts:126-133`) | reuse; one message literal |
| A call title's Fee Juice rule | `getMethodLabel` / `callTitle` (`apps/extension/src/utils/tx-enrichment.ts:32-71`) | adapt one condition |
| Journal retention | `operation-journal/gc.ts` (`DEFAULT_TERMINAL_CAP_PER_SCOPE = 50`, evictable set at `:128-141`) | adapt the evictable set |
| The token-list approval text | `SECURITY.md:584` | edit |

No new module is built. Reuse search for an existing registration bound (`MAX_SENDERS`, `maxSenders`, callers of `registerSender` and `getRegisteredAccounts`): the backup caps and `MAX_TRACKED_AUTHWITS_PER_ACCOUNT = 256` (`auth-registry/spec.ts:23`) are the only bounds of this kind.

## Conventions to match

- The executor's unit harness mocks `proveAndSend` (`dapp-send-executor.test.ts:166`), so Phase 2's ordering tests are composition tests with the real coordinator (`apps/extension/tests/COMPOSITION-TESTS.md`).
- Registration tests mock the PXE and stdlib as `execution/service.class-id.test.ts` does; `register-contract-account.real.test.ts` builds real keyed instances (`accountOf(seed)`).
- GC tests use the failed-transition helper at `operation-journal/gc.test.ts:54`.

## Collisions (running leads on 2026-10-19)

| Lead | Files this plan also needs | Consequence |
|---|---|---|
| tx-record-1 arc 1 (#860) | `execution/service.ts`, `execution/dapp-send-executor.ts` | arc 2 waits for #860 |
| test-infra-1 arc 4 (stacked on #743, unopened) | `execution/dapp-send-executor.test.ts` (Phase 2 adds a new file beside it), `incoming-transfer/service.scenarios.test.ts` (Phase 8); it also rewrites `packages/wallet-bridge/src/dispatcher.test.ts` | arc 2 and Phase 8 wait for it |
| execute-window-3 (#854) | `call-surface.ts` (Phase 6 only) | Phase 6 waits for #854 |
| onboarding-3 arc 2 (#743) | none (`profile/service.ts` is not touched) | none |
| send-estimate-1, logs-keyboard-1, viewer-flake-1, connect-split-1, firefox-sidebar-1 | none | none |

## Open issues read

`gh issue list --state open` and the closed `known-limit` list: #463, #661, #718, #843 border this lane's areas. #661 is the only one this plan acts on (its `SECURITY.md` caveat). The others stay as filed.

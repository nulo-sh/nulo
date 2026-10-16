# Recon: wallet-followups-8

Base `d59459ab` (origin/dev). Three Sonnet explorers plus the planner's own reads. Paths are repo-relative; line numbers are at the base.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Stop a node's retries (#277) | `packages/aztec-runtime/src/utils/fetch.ts:112-123` `makeFetchWithTimeout` wraps `fetchOnce` in the SDK `retry(fn, name, makeBackoff([1,2,3]), undefined, false)`; the SDK `retry` stops only on `NoRetryError` or an exhausted backoff, and its sleep cannot be interrupted | adapt: once the scope is stopped, the backoff ends and a retry woken from its sleep rethrows the previous error instead of dispatching |
| Who owns a runtime's node (#277) | `ProductionPxeFactory.createChainRuntime` builds it (`pxe/chain-runtime.ts:179`) and awaits `node.getL1ContractAddresses()` (`:189`) before the runtime exists; `ChainRuntimeRegistry.ensure/dispose/disposeProfile` (`:326-470`) own the runtimes | adapt: the registry carries the stopped scopes and hands each node it builds a predicate over them |
| Where teardown waits (#277) | `PxeService.clearChainState` (`pxe/service.ts:722-745`) waits on `barrier.read` then `chainGuard.write`; `clearProfileState` (`:757-790`) marks `deleting(gen)` synchronously, then `eraseProfile` waits on `barrier.enterWrite()` (`:796`). `NetworkService.purgeForProfile` (`network/service.ts:1085`) runs `purgeChain` → `clearChainState` per network before the coordinator's last step, `clearProfileState` (`profile-deletion/coordinator.ts:121-137`) | reuse: the stop is raised at those two entry points |
| Fail-fast precedent (#277) | `makeSingleAttemptFetch` (`fetch.ts:100`), `NoRetryError` for a 4xx (`classifyRpcFailure`, `fetch.ts:83-92`) | reuse |
| Refused-node e2e (#277) | `interceptRpc(browser, id, TESTNET_RPC_ORIGIN, { kind: "refuse" })` (`tests/e2e/fixtures/browser/index.ts:237`, used by `send-fee-privacy.test.ts:36`); `security-reset.test.ts` (15 s purge wait, 10 s redirect); `waitForProfilePurged` | reuse |
| #464 dead RPC | `ProfileService.confirmProfileOperation` (`profile/service.ts:1240`, method list `:105`), `spec.ts:317`, `client.ts:119`, `PasskeyRecoveryCoordinator.confirm` (`passkey-recovery-coordinator.ts:112-123`), tests (`passkey-recovery-coordinator.test.ts:229-284`, `service.integration.test.ts:386-397, 1175, 1183`); `reportToPasskeyWindow` has three other callers (`:744, :824, :879`) | delete; keep `reportToPasskeyWindow` |
| #465 field purpose | `Input` binds `autocomplete` (`packages/design/src/ui/Input.vue:81, 352`) and renders `spellcheck="false"` (`:351`); `expectNativeAttrs` (`tests/helpers/credential-pins.ts:63`); `ImportFullBackupForm.test.ts:245` is the shape | reuse |
| #339 typed refusal | `ContractNotFoundError` (`packages/extension-messaging/src/errors.ts:332`, in `BY_CODE` `:571`), rebuilt by `walletErrorFromPayload` (`:591`); thrown at `token/service.ts:708`; `auth.vue:131-140` maps typed errors with `instanceof` | reuse the `instanceof` idiom; no helper for one caller |
| #339 tests | `NewTokenPopup.test.ts:274-300` (`test.each` over a PXE store `Error` and `ContractNotFoundError`, both generic today); `tests/e2e/network/holdings.test.ts:130-136` waits for the generic text and shoots it | adapt both |
| #338 incarnation | `Profile.pxeGeneration` (`profile/spec.ts:80-86`, minted at every row creation); `ProfileInfo` (`spec.ts:66`) does not carry it; `usePinnedTokens` scopes by `profileId` and `chainId` only | not used: #338 is a known limit (plan D3) |

## Issue claims checked

- #464 holds: no production caller; `password-secret-box.ts:19-22` says `exportPlain` delegates to the method, and `profile/service.ts:1761-1763` says it does not. The method's doc ends "Only UI-local ConfirmPopup callbacks currently consume the return", which is also stale.
- #465 holds (`settings/accounts/import.vue:213-219`).
- #338 holds as a trace (`profile-ui-keys.ts` header states the limit). Password restore keeps a generated-shaped backup id (`profile/service.ts:2405`); passkey import uses the credential's user handle (`:2215-2231`); deletion reserves the id until the purge ends.
- #277: the symptom is demonstrated (`implementations-plan/chain-endpoints/lessons/phase-1.md`, § Stop rule: the same ten smoke tests fail with the node refused, pass with a 400 stand-in). Which awaits wait is a code trace: the PXE drains above, which include a runtime still being built, and two service locks the purge takes while a holder awaits node I/O (the incoming scan's block-time read, `incoming-transfer/service.ts:1573, 1765, 1806`; a token add's metadata read, `token/service.ts:416, 457, 797`), found by the panel.
- #498 holds, and is wider than filed: a rejected `initAccount` leaves `bootOutcome = "failed"` with the banner "The wallet could not finish starting up." and RETRY (`popup/app.vue:558-568`); `isLogined` stays false, so the Header's network chip and its Networks shortcut are hidden (`components/Header.vue:155-157, 280`). The network-switch watcher (`app.vue:242-247` → `popup/network-switch.ts:68`) calls `ensureDefaultAccount` again with no catch. PR #506 (open) changes only `setActiveNetwork`.
- #466: `auth.vue:173` closes only the toast whose id the screen recorded at its last failure (`:60, :194`); the existing test `auth.test.ts:492` pins that another surface's error toast stays.
- #339: the background half holds (`token/service.composition.test.ts:137, 143`: a node that cannot answer keeps its own error).
- #432 and #112: owner decisions (page 17 option B; page 15 OA-6 option A) say nothing is built.

## Collision risks

- PR #506 edits `packages/aztec-runtime/src/adapters/aztec-node-factory-adapter.ts` and `adapters/index.ts`, which arc 1 also edits: merge `origin/dev` before arc 1's final gate.
- `tests/e2e/fixtures/**` is shared with the e2e-harness-gaps lane; arc 1's scenario uses `interceptRpc` as is and edits no fixture.
- `NodeFactory` has a fake (`ports/node-factory-port.ts`); a lint rule keeps the adapter the only `createAztecNodeClient` call site.

## Closed known limits searched

`gh issue list --state closed --label known-limit --search` for "pin profile", "deletion node", "reset offline", "custom network" (#471, unrelated: node reset detection), "confirmProfileOperation", "token address" (#372, #427, #355, unrelated), "autocomplete": none covers this lane's issues.

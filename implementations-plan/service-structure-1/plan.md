---
plan: service-structure-1
tier: mid
status: arc 1 merged (#703); arc 2 merged (#741); arc 3 in review; arc 4 waits for release
issues: "#521 (arc 1); #545 (arc 2); #547 (arc 3); #549 #560 (arc 4)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet) plus the driver's read; dual audit (Codex gpt-6.1-sol high, Opus Plan leg); final fresh Codex pass
base: origin/dev at 0fe841be
trunk: dev
post_implementation_hardening: not scheduled
---

# service-structure-1: five structural refactors from decision page 37

Five refactors the owner picked on decision page 37 (P37-05 to P37-09, option A each). Four arcs, each one PR against `dev`, not stacked. An arc whose files a running lane edits waits until the orchestrator releases it, after that lane merges. Recon: [recon.md](recon.md) (claim checks, reuse map, collision map). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are relative to `apps/extension/src` unless they start with `apps/`, `packages/`, `scripts/` or `implementations-plan/`.

| Arc | Closes | Released when |
|---|---|---|
| 1 | #521 | now: no running lane edits its files |
| 2 | #545 | dapp-boundary-2 (PR #679, `wallet-sdk/background.ts`) has merged |
| 3 | #547 | storage-privacy-1 (`incoming-transfer/service.ts`, its scenario suite) has merged, and test-infra-1's #540 does not hold `service.scenarios.test.ts` open |
| 4 | #549 #560 | execution-integrity-1, dapp-boundary-1 and dapp-boundary-2 (all edit `execution/service.ts`; -2 also `background.ts`) have merged; the orchestrator also checks type-roles-coverage arc 2 against `popup/windows/execute/OperationCard.vue` |

Arcs 2 to 4 are independent of one another; the orchestrator may release them in any order. Each later arc branches from `origin/dev` at its release, so the plan is already on `dev` (arc 1 lands it). Every later arc re-reads its cited lines at its base: other lanes edit these files first.

## Issue claims that did not hold

Full table: [recon.md](recon.md#issue-claims-checked-against-the-tree).

- **#549.** The two `materialize.ts` send bodies are one arm already. `validateSession` has a `never` default. The window's switch moved to `popup/windows/execute/operation-display.ts`, whose default is not `never`. `materialize.ts`, `validateSession` and the execution dispatch are already compiler-exhaustive, and scope is type-enforced by the request shape (`chain` or `account`). What no compiler checks: `operation-display.ts`'s default, and which kinds carry fee settings. That pair is hard-coded at twelve sites, among them three gates (the popup fee-settings RPC guard, the approve gate, the executable assertion).
- **#549, "all four sites" (deviation).** The issue's fourth site, the execution dispatch, routes to executors, a fact the table does not name; it keeps its switch. The fourth reader is `execution/service.ts`'s `FEE_SETTINGS_OF` instead, plus every other site whose kind check only guards `feeSettings` (D4).
- **#545.** `admission` is not session-keyed; it has its own `onSessionGone`. The registry owns five holders, not six.
- **#560.** The owner's pick covers four signatures, so the two restore commits are in scope. The issue proposed leaving them.

## Outcome & Quality Bar

For the maintainer who next changes one of these files: an engineer or an agent session that reads one module, not 2,900 lines. Excellent means:

1. Every refactor keeps behaviour. The existing tests pass, with only mechanical edits (an import, a call shape, a private member a test reached).
2. Each new shared piece has a test that fails if its contract breaks: the import wait's failure path, the stale-record retirement, the session teardown, the outbox's ticket check, the trait table's refusals.
3. A future change meets the compiler or a test first. A new session holder without a teardown fails a test. A new operation kind does not compile until its traits exist and agree with its request shape. A fee option's name is visible at every call site.

Good enough: no further split of `IncomingTransferService` (the decomposition map is an issue); sites whose kind check is about something other than fee settings keep it (D4).

## Assumptions

**Facts** (read at 0fe841be):
- F1. Popup import waits through `waitForProfileActive` (`popup/pages/import.vue:77-81`, 30 s). The shell records a failed activation in `appStore.bootstrapFailure` on that path (`popup/app.vue:282-308`, `popup/profile-bootstrap.ts:19-29`). The record is cleared only by `auth.vue:180` and by a later current run that does not throw.
- F2. Recovery (`hydrateKnownProfile`) joins a same-profile bootstrap only while its core runs; the slot clears in `.finally`, before the run's last session read (`composables/useProfileBootstrap.ts:189-212,239,258-280`).
- F3. Restore keeps a backup's id when it is free (`profile/service.ts:2340`), and passkey import uses the credential's userHandle (`:2160-2165`). An imported id can equal an earlier one.
- F4. The SW posts an event to every client port during the call that causes it (`packages/extension-messaging/src/background/service.ts:121-128`); session open emits before the call returns (`profile/session-manager.ts:328`). A client dispatches events synchronously and responses through a promise (`background/client.ts:164-173`). Seed and passkey import call through `managers.profile`, the port the shell listens on (`popup/app.vue:392`), so the activation handler's synchronous part runs before the import's continuation. Full-backup import finalizes through its own client (`composables/useFullBackupImport.ts:631,362`): no order holds between that response and the shell's event. Recovery, though, reads the active profile over `managers.profile` (`composables/useProfileBootstrap.ts:259`), behind the event already posted there.
- F5. `waitForProfileActive` is auto-imported: `src/types/auto-imports.d.ts:480,614-615,1203` and `src/types/.eslintrc-auto-import.json:175,687`. The extension build regenerates both; CI checks they are fresh (`.github/workflows/_build-extension.yml:116`).
- F6. The discovery block uses only `DiscoveryDeps` plus stateless constants. `discoveryDeps()` reads `state.late.*` at call time (`background.ts:336-340`; `background.init-order.pins.test.ts`).
- F7. Every `markBalanceDirty` call runs under the service lock. The drain takes the lock once per row, and `anchorFreshTask` re-reads, compares and checks its ticket before it writes (`incoming-transfer/service.ts:2586-2720`; #443).
- F8. `finalizeGasLimits` reads `feeMultiplier ?? DEFAULT_FEE_MULTIPLIER` (`execution/fee/fee-strategy.ts:307`): an omitted multiplier and an explicit `1` differ.
- F9. Operation kinds are wallet literals: the dispatcher builds every request (`packages/wallet-bridge/src/dispatcher.ts:619,654`), and `execute` is no RPC method. A page controls the fields, not the kind string.
- F10. `REDACTED_KEYS` (`wallet/logger/utils.ts`) holds `sourceDek` and `entropy` but not `plainSecret`, `plainEntropy` or `destinationDek`.

**Inferences** (an audit may attack these):
- I1. With a stale record for a reused id (F3), the shared waiter would reject at once while the new run is live. Recovery would then start a second bootstrap if the first core settled during its profile read (F2), and a failing second run would route to `/popup/auth` after a good activation (plausible, unverified; Codex round 1). Retiring the profile's earlier record at the activation's synchronous entry removes the trigger for seed and passkey import (F4). For a full backup, a completion that beats the shell's event can still meet the stale record. Recovery's profile read then queues behind that event on the shell's port, but the SW answers it only after the profile lock and initialization (`profile/service.ts:499-505`), so the shell's core can settle first; recovery then starts a second core (plausible, unverified; final Codex pass). It needs a failed bootstrap of P, its recovery, P deleted, the same backup restored in the same popup document, and that timing; the consequence is the unlock screen after a good restore. Disposition: a closed `known-limit` issue (arc 1 files it), reopened on a user report of that route or on new evidence of the interleaving. No further guard.
- I2. `KeyedLock.delete(id)` keeps its effect when the registry calls it. The registry only moves the call.

**Asks**: none. P37-05 to P37-09 decide scope and shape. The one visible effect, import after a failed bootstrap, is what P37-09 signs (see UI impact).

## Architecture & Implementation

### #521, the import activation waiter (arc 1)

- `popup/pages/import.vue`: `waitForActive: (ms) => awaitProfileActivation(appStore, profile.id, ms)`, imported from `@/composables/unlockWait`. No options: no start-only deadline and no supersede, as today. `timeoutMs: 30_000` stays. Edit the block comment at `:61-75` and the template note at `:294-298` to say a recorded failure ends the wait.
- `popup/profile-bootstrap.ts` `runFencedBootstrap`: a new dep, `readFailure: () => { profileId: string } | null`. At entry, before `bootstrap()` runs, a record that names this run's profile is cleared (`setFailure(null)`). Invariant: a failure record names the latest activation of its profile, so a waiter that starts after the activation sees only that run's outcome. `popup/app.vue:290` passes `readFailure: () => appStore.bootstrapFailure`. Another profile's record stays.
- Delete `composables/waitForProfileActive.ts` and its test. `unlockWait.test.ts:19-125` covers each of its five cases: at once, later, timeout, another profile, teardown.
- Regenerate the auto-import declarations through the build (F5).
- **Not taken:** clearing the record in `completeImport`, which would erase a genuine failure that landed first; a hook in `useProfileImportFlow`, which has one caller.

### #545, discovery out of `background.ts` (arc 2)

- New `wallet-sdk/discovery-flow.ts`, following the sibling convention: free functions and an exported `DiscoveryDeps`. Move the cap constants, `discoveryDeadline`, `isLegalCurrent`, and `handleDiscovery` through `persistAndApprove` (`background.ts:844-1373`, without `discoveryDeps()`). `DiscoveryDeps` spells the `handedOver` type itself, so the module imports nothing from `background.ts`. Export only what `background.ts` calls. `discoveryDeps(deps, state)`, `wireDiscoveryDrain`, `drainQueuedDiscovery` and `onPendingDiscovery` stay, so the late-bound reads keep their timing (F6).
- The dedupe key gets two helpers in that module. `discoveryKey(origin, chainId)` returns `` `${origin}|${chainId}` ``. `isOriginKey(key, origin)` returns `` key.startsWith(`${origin}|`) ``. The `:989` and `:1165` sites and every other reader of `pendingDiscoveryPromises` keys use them; the strings do not change.
- New `wallet-sdk/session-holders.ts`: class `SessionHolders`, owning `readonly` `sessionProfiles`, `sessionQueues`, `establishmentStatus`, `decryptLocks` and `holds`. Its `end(sessionId)` runs today's deletes in today's order, then `holds.end(sessionId, "wallet_refused")`. `SdkHandlerState.sessions` replaces the five fields. `onSessionTerminated` becomes `state.admission.onSessionGone(sessionId); state.sessions.end(sessionId)`. `stampSessionProfileGuarded`, `revokeLiveSessions` and the wiring at `:177-179` keep the same `Map` instance.
- Outside the registry, on purpose: `pendingVerification` (its tombstones outlive termination), `pendingDiscoveryPromises` and `dedupeWaiters` (keyed by `origin|chain`), `handedOver` and `admission` (keyed by request id).

### #547, the balance-refresh outbox (arc 3)

- New `incoming-transfer/balance-outbox.ts`: class `BalanceRefreshOutbox`, in the style of `ScanEpisodeStore` and `PublicEventIndexer`. Constructor deps:
  - `repo` (a `Pick` of the four outbox methods);
  - `activeProfileId: () => Promise<string | undefined>`;
  - `withLock: <T>(fn: (isCurrent: () => boolean) => Promise<T>) => Promise<T>`;
  - `tokenBalances: Pick<TokenBalanceService, "requestBalanceRefresh">` and `tasks: Pick<TaskService, "getTaskSync">`;
  - `warn`.
- Move `OutboxRowKey`, `RefreshRequestResult`, `anchoredRowAction`, `markBalanceDirty` (renamed `markDirty`), `drainBalanceOutbox` (renamed `drain`), `drainOutboxRow`, `settleAnchoredRow`, `requestRefreshOrKeep`, `anchorFreshTask` and `readTaskState` (`service.ts:117-118,158-162,2586-2720`). Keep every await, the per-row lock and the ticket checks (F7).
- The service builds the outbox in `init`, where TokenBalanceService and TaskService arrive (`:376-386`), and drops those two fields. The seven call sites (`:457,1169,1453,1702,1807,2393,2541`) call `this.outbox`. `clearScopeLocked` and `onTokenDeleted` keep deleting outbox rows through the repository: the rows belong to the repository, the refresh rule to the class.
- Deliverable for the owner: one `enhancement` issue holding the decomposition map of what remains. It lists each responsibility with its line range and count, the shared state, the seams, and which split would pay for itself next and why (recon's table, measured after the move). No further split ships.

### #549, one table of operation traits (arc 4)

- New `packages/wallet-bridge/src/operation-traits.ts`, exported from the package index, beside `OperationKind`. Every reader already imports `@nulo/wallet-bridge`; elsewhere, `execution/` would import `dapp-interaction/` and the window a service folder.
  ```ts
  export const OPERATION_TRAITS = {
  	register_contract: { scope: "network", feeSettings: false },
  	// … all 18; send_transaction and aztec_sendTx: { scope: "account", feeSettings: true }
  } as const satisfies Record<OperationKind, { scope: "network" | "account"; feeSettings: boolean }>
  export function operationTraits(kind: unknown): OperationTraits | undefined // own properties only
  export function isNetworkScoped<O extends { kind: string }>(op: O): op is Extract<O, { kind: NetworkScopedKind }>
  export function isAccountScoped<O extends { kind: string }>(op: O): op is Extract<O, { kind: AccountScopedKind }>
  export function carriesFeeSettings<O extends { kind: string }>(op: O | null | undefined): op is Extract<O, { kind: FeeSettingsKind }>
  ```
- Compile-time equalities (a two-way check, unlike the one-way `AssertExtends` at `method-descriptors.ts:64-67`), each with a negative control that must fail to compile:
  - the kinds whose request carries `chain` equal `NetworkScopedKind`, and those carrying `account` equal `AccountScopedKind`;
  - the kinds whose `DraftOperation` declares the `feeSettings` key equal `FeeSettingsKind` (a key test, not an optional-property `Extract`);
  - the kinds whose request carries `actions` are exactly `send_transaction` and `simulate_transaction`; those carrying `eventFilter` are exactly `aztec_getPrivateEvents`.
  So a table entry that disagrees with a shape, or a new kind that carries `actions` or `eventFilter`, does not compile until `validateSession` is looked at.
- Scope readers branch three ways: `isNetworkScoped`, then `isAccountScoped`, then a refusing `never` arm. The account branch is never the default.
  1. `dapp-interaction/materialize.ts`: an unknown kind keeps today's throw (`materialize.test.ts:163`). Fee-settings kinds get the `feeSettings` key, embedded when `isEmbeddedFeePayment`, otherwise `undefined`; other kinds get no key, as today. `assertSilentExecutable` reads `carriesFeeSettings`.
  2. `dapp-interaction/service.ts` `validateSession`: an unknown kind still throws "Unsupported operation kind". Network runs `checkMethodPermission(chain)`; account runs `checkAccountPermission`, then `checkMethodPermission`. The scopes check (`aztec_getPrivateEvents`) and the per-action check (`send_transaction`, `simulate_transaction`) then run in today's order, pinned by the equalities above.
  3. `popup/windows/execute/operation-display.ts`: the same branch; the refusing arm keeps its message.
- Fee-settings readers, every site whose kind check only guards `feeSettings`: `materialize.ts` and `operation-display.ts` (the seed); `index.vue` `isAppPaid` (`:173`), the guard (`:390`) and the approve delta (`:427`); `OperationCard.vue` `isSendTx` (`:121`); `operation-validation.ts` `requiresFeeSelection` (`:31`) and `assertExecutableOperation` (`:66`); `approval-delta.ts` `applyFeeSelection` (`:36`); `execution/service.ts` `FEE_SETTINGS_OF.executeOperations` (`:163`). The guard is null-safe, as `op?.kind` is there today.
- Unchanged (D4): `isEmbeddedFeePayment` and `isConfirmationNeeded:821` (per-kind field logic), `estimateOperationFee` (`dapp-send-executor.ts:492`) and `waitsForFeeFigure` (`fee-figure.ts:35`) (kind-specific code follows), `BROADCASTING_OPERATION_KINDS` and `scope-mismatch.ts:30` (a broadcast), `OPERATION_ACCESS_LEVEL`, `method-descriptors.ts` (RPC routing), the execution dispatch.

### #560, named parameters and one deps type (arc 4)

- `finalizeGasLimits(node, txRequest, simulatedTx, opts: FinalizeGasOptions)`, with `{ gasPadding: number; maxFeesPerGas?; customLimits?; feeMultiplier?; txsLimits? }`, mirroring `feeCapFor(node, rule)`. Carry each caller's values literally (F8):
  - `embedded-strategy.ts`: `feeMultiplier: 1`;
  - `fpc-strategy.ts`: no `customLimits` and no `feeMultiplier` (reword its comment at `:62-67` to the option names);
  - `dapp-send-executor.ts`: `gasPadding: 1, feeMultiplier: 1`.
  About 30 test calls change shape, in `fee-structural-parity`, `fee-strategy-clamp` and `fee-strategy-clamp-properties`.
- `handleWalletMessage(request: { session; message; live; hooks? }, deps: WalletMessageDeps)`, where `WalletMessageDeps` is `{ dispatcher, profileService, operationJournal, sessionProfiles, switchEpoch, logger, legal, resetRun? }`. `runEstablishedMessage`, its one caller, passes an object literal that reads `state.late.switchEpoch` at call time. The four test files change their call shape only.
- `commitRestoredPasswordProfileHoldingLock(input, scratch)` and `commitRestoredPasskeyProfileHoldingLock(input, scratch)`. Each `input` is a `Readonly` object naming today's seven fields. `scratch` stays separate and mutated, because the caller's `finally` reads it to decide what to zero. The buffers travel by reference; nothing copies them beyond the stash copies that exist today. The zeroing protocol (`profile/service.ts:2299-2304,2465-2473`) is unchanged. Add `plainSecret`, `plainEntropy` and `destinationDek` to `REDACTED_KEYS` in the same commit (F10; the `logging-policy` skill gives the spellings).
- `EstimateReuseDeps` in `execution/estimate-reuse-shared.ts` replaces the two identical interfaces. `execution/service.ts:346-363` builds one object and passes it to both constructors. The six test files import the shared name.

## Security & Adversarial Considerations

- **Threat model.** A connected page controls the fields of the requests the dispatcher builds, never the kind string (F9). The boundary is the session's grants, checked by `validateSession`. Every refusal stays the same: an unknown kind, an account the session does not hold, a method without its grant, an event scope it does not hold, a nested action without its grant. Own-property lookup refuses `Object.prototype` names as defence in depth. The existing nested-action and unknown-kind tests stay (`service.test.ts:719,731-740`; `materialize.test.ts:163`). Arc 4 adds one prototype-name case per refusing site, carrying an account the session holds, so a fall-through to the account branch would pass a check and fail the test.
- **Fee-settings gates.** The RPC guard, the approve gate and the executable assertion read one declaration, so a future fee kind cannot pass one gate and skip another. `FEE_SETTINGS_OF` keeps today's contract: an unknown or null element yields no settings, and it refuses nothing.
- **Session teardown.** The registry clears exactly what `onSessionTerminated` clears, in the same order. The stamp guard's live check and the revocation's unstamp-before-terminate keep the same `Map`. Known limits #606, #681 and #682 stay as they are.
- **Outbox.** It takes no new lock and no new storage. The ticket checks for #443 move unchanged.
- **Activation record.** The entry clear writes the existing in-memory record, nothing persisted. Its compare-and-commit rule holds: the clearing run is current by construction.
- **Secrets.** The restore-commit inputs hold references to the secret buffers; nothing copies, spreads or logs them, and their new key names join the redactor. No log line is added; moved log lines keep their keys.
- **Supply chain.** No dependency changes. Least privilege and cryptography: not touched.

## UI impact

- Popup import after a recorded bootstrap failure: the page reaches recovery at once, not after up to 30 s. Every screen and word is unchanged. Signed by P37-09: "Build: import goes through the shared waiter and the copy is deleted; a test proves import stops at once on a recorded failure."
- The execute window, the connect window and incoming transfers: code moves, nothing a person sees changes. P37-06, P37-08 and P37-07 sign structural builds only. A step that would change a screen stops and becomes an `OWNER-ASKS.md` entry.

## Phases

Common gate for every phase, run from the repo root. Pass means exit 0 for each:
- `bun run lint`
- `bun run typecheck:all`
- the phase's files: `cd apps/extension && bun run test -- <files>`, or `bun run --cwd packages/wallet-bridge test`

The arc gate adds `bun run test:all`, then one e2e invocation, started only when `uptime` shows load1 < 150; pass means every test in it green. Record every gate in `STATUS.md`.

### Arc 1, phase 1: #521

- [x] Change `popup/pages/import.vue`, `popup/profile-bootstrap.ts` and `popup/app.vue:290`. Delete `composables/waitForProfileActive{,.test}.ts` and that module's mock in `popup/pages/import.test.ts`.
- [x] In `import.test.ts`, hoist the `hydrateKnownProfile` mock to one spy. Add a describe that runs the page's real `completeImport` with the real `completeImportWithRecovery` (`vi.importActual`, `mockImplementationOnce`) and the real `awaitProfileActivation` over the testing-pinia store. Mount first, then fake timers; flush with `vi.advanceTimersByTimeAsync(0)`; restore real timers in `afterEach`.
  - A failure for another profile routes nothing (never-happens); then a failure for the imported id calls recovery and routes to `/popup/auth` with no timer advanced (success control).
  - A healthy activation of the imported id routes to `/popup/general` with no recovery.
  - With no signal, nothing routes before 30 s; at 30 s recovery runs (the bound).
- [x] In `profile-bootstrap.test.ts`: a run retires its own profile's earlier record before `bootstrap()` starts; another profile's record stays (control).
- [x] Regenerate the auto-imports with `bun run build`, and commit the two generated files.
- [x] Before the PR opens, file I1's full-backup case as an issue labelled `known-limit` and close it as not planned (five sections: hypothesis, consequence, unverified step, disposition, reopening condition). The PR body names it; the close-out lists it under `Known limits:`.
- **Gate:** the common gate on `src/popup/pages/import.test.ts src/popup/profile-bootstrap.test.ts src/composables/unlockWait.test.ts src/composables/completeImportWithRecovery.test.ts`, then `bun run test:all`, then the armed smoke build (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`) and `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e tests/e2e/import-paths.test.ts tests/e2e/import-dead-rpc.test.ts --retry=0`; setup refuses an unarmed dist. Pass also needs `grep -rn waitForProfileActive apps/extension/src` empty.

### Arc 2, phase 2: #545

- [x] Re-read `background.ts` at the arc's base, and map the moved line ranges again (138e0ded: `:280-292`, `:859-876`, `:899-1401`).
- [x] Add `discovery-flow.ts` and `session-holders.ts`, and rewire `background.ts`. Every `background.*.test.ts` stays unchanged except the paths it imports.
- [x] Add `session-holders.test.ts`:
  - Seed every holder for sessions a and b; for `decryptLocks`, one held operation and one waiter. `end(a)` clears a everywhere and leaves b (the control); `holds.end` gets `"wallet_refused"`.
  - Walk the instance's own fields and fail on one the test did not seed.
  - Walk `createSdkHandlerState()`'s keys against an allowlist of the non-session fields, each with its reason, so a holder added beside the registry fails too.
- [x] Add `discovery-flow.test.ts`: `isOriginKey` does not count `https://a.com.evil|1` for `https://a.com`; the control counts `https://a.com|1`.
- **Gate:** the common gate on `src/wallet/services/wallet-sdk`, then `bun run test:all`, then `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/connect-dapp.test.ts tests/e2e/network/connect-one-window.test.ts tests/e2e/network/connect-locked-queue.test.ts tests/e2e/network/cold-wake-discovery.test.ts tests/e2e/network/session-tabClose.test.ts tests/e2e/network/session-explicitDisconnect.test.ts tests/e2e/network/session-profileSwitch.test.ts`.

### Arc 3, phase 3: #547

- [x] Re-read `incoming-transfer/service.ts` and its scenario suite at the arc's base (77aad1e5; shifts in D11).
- [x] Add `balance-outbox.ts`, and rewire the service.
- [x] Keep every outbox case in `service.scenarios.test.ts`; the `drain(service)` helper and the one `markBalanceDirty` cast point at `service.outbox`. No assertion changes.
- [x] Add `balance-outbox.test.ts` over an in-memory repository fake and stubs, for what the service fixture cannot reach: a `withLock` whose ticket goes stale between the re-read and the write makes the anchor write skip (#443), and its control writes the anchor.
- [x] File the decomposition-map `enhancement` issue (the five sections; `## Record` names this plan): #750 (D15).
- **Gate:** the common gate on `src/wallet/services/incoming-transfer`, then `bun run test:all`, then `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/incoming-public-transfers.test.ts tests/e2e/network/incoming-transfers.test.ts`.

### Arc 4, phase 4: #560

- [x] Re-read every site at the arc's base (244badd3; shifts in D16).
- [x] Change, one commit each: `EstimateReuseDeps`, `finalizeGasLimits`, `handleWalletMessage`, the restore commits with their redaction keys. No test assertion changes; only call shapes and imports do.
- **Gate:** the common gate on `src/wallet/services/execution src/wallet/services/wallet-sdk src/wallet/services/profile src/wallet/logger`.

### Arc 4, phase 5: #549

- [x] Add `operation-traits.ts` with its equalities and negative controls. Then change the scope readers and the fee-settings readers, one commit per file group.
- [x] Add `packages/wallet-bridge/src/operation-traits.test.ts`: `operationTraits` answers all 18 kinds and `undefined` for `"constructor"`, `"__proto__"`, `"toString"` and `"aztec_unknown"`; `carriesFeeSettings(null)` is false.
- [x] Add one prototype-name case, carrying a held account, in `materialize.test.ts`, `dapp-interaction/service.test.ts` and `operation-display.test.ts`. In `fee-settings-rpc-guard.test.ts`: a prototype-name element yields no settings, and a valid send still has its settings checked.
- **Gate:** the common gate on `src/wallet/services/dapp-interaction src/popup/windows/execute src/wallet/services/fee-settings-rpc-guard.test.ts src/wallet/services/execution` and the wallet-bridge suite, then `bun run test:all`, then `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/sim-methods.test.ts tests/e2e/network/data-privateEvents.test.ts tests/e2e/network/execute-scope-account.test.ts tests/e2e/network/execute-scope-chain.test.ts tests/e2e/network/tx-sendTx-default.test.ts tests/e2e/network/tx-sendTx-feePayer.test.ts tests/e2e/network/tx-sendTx-selfPay.test.ts tests/e2e/network/fee-methods.test.ts tests/e2e/network/backup-restore-integrity.test.ts`. The passkey restore commit is proven by `profile/service.integration.test.ts:1517`.

## Delivery

- One PR per arc against `dev`, no stack (D-orch-1). Arc 1 ships from `worktree-service-structure-1`, which carries the plan commit. Arcs 2 to 4 each branch as `service-structure-1-arc<N>` from `origin/dev` at release, and merge `origin/dev` again before their PR opens.
- Titles, all under 93 characters:
  - arc 1: `refactor(import): wait through the shared activation waiter, drop the copy`, `Closes #521`;
  - arc 2: `refactor(wallet-sdk): discovery in its own module, session holders in one registry`, `Closes #545`;
  - arc 3: `refactor(incoming): the balance-refresh outbox becomes its own class`, `Closes #547`;
  - arc 4: `refactor(execution): named fee and message parameters, one operation-trait table`, `Closes #549 #560`.
- Open each PR without labels. Add `e2e:extension-network` or `e2e:extension-smoke` afterwards only when the path filter skips a suite the arc ran.
- The close-out (README § Post-implementation standard, step 4) is the final commits of the last arc. That arc's cross-arc pass, close-out and PR wait until every other arc has merged; it merges `origin/dev` first.
- Parallelism: the arcs share no file except `background.ts` (arcs 2 and 4, distant regions; the later one merges `dev` first). The release conditions pace them.

## Post-implementation

The steps are `implementations-plan/README.md` § Post-implementation standard, read at 0fe841be. What is specific to this plan:

- Step 1 is absent (`code_review: off`).
- Step 2 runs per arc, each arc being a single-arc delivery: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` over the arc's diff against its base, with this plan and the arc map ("arc N of 4; the other arcs are independent PRs"); resume with `resume-codex.sh`; hard stop at three rounds, then surface. One Opus review of the final diff (`Agent`, `model: "opus"`, `general-purpose`) runs alongside round 1.
- Cross-arc pass: once every other arc has merged and before the last arc's PR opens, one fresh Codex session reads the merged arcs' diffs plus the last arc's diff for seams between arcs; its fixes ride the last arc.
- Log each round in `lessons/phase-N.md` and in Audit verdicts below.
- Teardown (step 5): `agent-worktree done service-structure-1 --merged` once `implementations-plan/archive/service-structure-1/plan.md` is on `origin/dev`.

## Decision ledger

| # | Question | Codex | Opus | Decision and reason |
|---|---|---|---|---|
| D1 | Arcs by whole issue (A) or by file (B)? | B: early files are free; later arc smaller | A: B mixes the visible change with the permission boundary, the FPC fee path and secret zeroing; halves stay migrated | **A.** The lane brief puts every issue whose files a running lane edits into a later arc. One issue per PR closes cleanly, and arc 1 stays one risk class. |
| D2 | #521: retire a stale failure record? | yes, at the activation's synchronous entry; not in `completeImport` | no clear needed; outcome mostly holds | **Yes, at entry** (I1, F4). A second bootstrap after a good activation can route to the unlock screen; the entry clear removes the trigger with no new state. |
| D3 | #549: build the table, given the claims that did not hold? | build; dispatch keeps its switch | build; the fee pair is at twelve sites | **Yes, P37-06 signs it.** Its value is one declaration of the fee-settings kinds behind three gates, plus three fewer copies of the scope partition. |
| D4 | #549: which sites read it | `FEE_SETTINGS_OF`; dispatch stays | also the three gates in reach; list the rest | **Every site whose kind check only guards `feeSettings`, plus the three scope switches.** Per-kind field logic, the broadcast fact, access levels, RPC routing and the dispatch keep their own checks: the table does not name those facts. |
| D5 | #547: where the drain cases live | move; keep wiring cases | keep in the service suite (the owner's "keeps its tests") | **Keep them in the service suite**, which proves the lock wiring. The class suite adds only what the service fixture cannot reach. |
| D6 | #560: `scratch` inside the input object? | separate | separate | **Separate.** It is the zeroing protocol's state, read in the caller's `finally`. |
| D7 | e2e: one invocation per arc, which files | name them; restore inside the network run | add `passkey-backup` smoke | **One invocation, named files.** The passkey restore commit has unit coverage through `restore()`; a second, smoke invocation would break the once-per-arc host rule. |
| D8 | `handleWalletMessage` deps builder | per-message deps fine | inline: one caller | **Inline literal.** `discoveryDeps` exists for two callers; this has one. |
| D9 | Arc 2: the tree already had `dedupeKeyOf` (dapp-boundary-2) | — | — | **Keep `dedupeKeyOf`**, moved with its callers; `isOriginKey` joins it. The plan's `discoveryKey` would rename a live helper for no gain. |
| D10 | Arc 2: `isLegalCurrent` moves, so `discovery-flow.ts` calls `assertCurrent()` | — | — | **Edit the pin deliberately**, as CLAUDE.md § Terms acceptance asks: `legal/call-sites.test.ts` names the file, CLAUDE.md's line about the pin says so. `useLogFilters.scan.test.ts` gains the new file's `OWNED` row so the moved log lines stay pinned to `wallet-sdk`. `createSdkHandlerState` is exported for the allowlist test. |
| D11 | Arc 3: the cited lines at its base (77aad1e5) | — | — | **Shifted, same content.** The outbox block is `:2582-2721` (plan `:2586-2720`), `anchoredRowAction` `:156-162` with its doc, the two fields' wiring `:384-385`; call sites `:1702,1807,2393,2541` are `:1703,1808,2394,2542` (`:457,1169,1453` unchanged). |
| D12 | Arc 3: constructor shape | deps object "appropriately narrow" | matches the plan | **One `BalanceRefreshOutboxDeps` object**, not `ScanEpisodeStore`'s positional parameters: six dependencies, named at the one call site. |
| D13 | Arc 3: the plan's `activeProfileId` dep | r1, medium, demonstrated: its async adapter adds a microtask before `listOutbox`, which a receipt writer's lock release can observe | low, same | **`activeProfile`, wired as a synchronous closure over `getActiveProfile()`**, so `drain` keeps its one await and `!profile` check. The moved body then differs from the original only in that call. |
| D14 | Arc 3: moved log lines still say `drainBalanceOutbox:` | — | strings and arguments unchanged: clean | **Kept verbatim.** A log line is behaviour a filter or a report may match; renaming it is not part of a move. |
| D15 | Arc 3: the decomposition map's "which split pays next" | the public arm next, after a shared commit collaborator; defensible, moderate confidence | rethink: the suite already runs on an in-memory repository and a fake reader, so a split saves no test cost; a collaborator first has one caller; the arm's churn is two PRs | **Stop at the map; the public arm, as one PR, when its next substantial change is scheduled.** Opus's points are verified in the tree; Codex's ranking survives as "which split" once one pays. The issue records both. |
| D16 | Arc 4: the cited lines at its base (244badd3) | — | — | **Shifted, same content**, except: the reuse wiring is `execution/service.ts:359-376` and `FEE_SETTINGS_OF` `:175-177`; `handleWalletMessage` is `background.ts:843`, its caller `:728`; `operation-validation.ts` is wallet-bridge's (the window's file is a re-export shim) and `approval-delta.ts` is `dapp-interaction/`'s; four test files name the reuse deps, not six. |
| D17 | Arc 4: where the negative controls live | — | — | **Beside their equalities**, as `@ts-expect-error` lines in `operation-traits.ts`, so the type helpers stay unexported. Three table mutations (a fee flag, a scope, a dropped kind) fail to compile. |
| D18 | Arc 4: `operation-display.test.ts` had no `resolveOperations` case | — | — | **Its first tests**: the prototype-name case, with a control that resolves account-scoped rows and pins which carry the `feeSettings` key. |
| D19 | Arc 4: other sites the plan did not list | — | — | `auth-registry` and `dapp-interaction` also have a `FEE_SETTINGS_OF`; neither reads a kind, so neither changes. `validateSession`'s nested-action `forEach` takes a block body: Biome's `useIterableCallbackReturn` warned on it at base. The new redaction keys are camelCase only: no backup JSON spells them, as with `sourceDek`. |
| D20 | Arc 4: `OperationCard.vue`'s `isSendTx`, on the plan's fee-settings list | — | low, plausible: it gates the whole send card, so a new fee kind would get a send card with no payload rows | **Keeps its literal kinds.** By D4's own rule it is per-kind display logic: it gates the From row, the payload and the fee card. A future fee kind then fails closed (the generic card; Confirm stays blocked). |

## Audit verdicts

- **Codex round 1** (gpt-6.1-sol, high): conditional approve. Accepted: the two-way fee equality (C1); `FEE_SETTINGS_OF` tested by its real contract (C2); no duplicate nested-action test (C3); the stale-record path and its entry fix (C4, D2); named e2e files, one invocation (C5); cross-arc pass before the last PR (C6). Rejected: outline B (D1); pinning the bootstrap interleaving with a test, since the entry clear removes its trigger and F4 cites the ordering.
- **Opus Plan leg**: conditional approve. Accepted: the eight further fee-pair sites, classified (O1, D4); drain cases stay in the service suite (O2, D5); `incoming-public-transfers` in arc 3's run (O3); the shape equalities for `actions`, `eventFilter` and scope (O4); the three-way branch, held-account refusal cases and the F9 threat-model fix (O5); null-safe guards (O6); I1 and F2 reworded (O7); `readonly` holders, the state-key allowlist, the lock's held-plus-waiter seed, no type import back from `background.ts` (O8); `Readonly` inputs and the redaction keys (O9); inline deps literal (O10, D8); wording fixes (O11). Rejected: the `passkey-backup` smoke run (D7).
- **Final fresh Codex pass** (new session, gpt-6.1-sol, high): conditional approve. Accepted: full-backup import finalizes on its own port, so F4 is narrowed; the last arc waits for every other arc before its cross-arc pass and close-out. Resumed: the close-out condition holds; my claim that recovery always joins was wrong (the SW answers recovery's read only after the profile lock), so I1's full-backup case is plausible and becomes a closed `known-limit` issue, not unsupported conditions. Resumed again: **approve** ("no regression found in this revision").
- **Arc 1, Codex round 1** (session 01a14b03): findings, minor. Accepted: the import comment's "the listener has given up" overstated (a slow live bootstrap); two narrating test comments deleted. **Opus review**: findings, minor. Accepted: the entry clear checks `isCurrent()` itself, pinned by a test; same comment fix. Accepted gap: `app.vue`'s `readFailure` wiring has no test (a shell mount; `setFailure` is equally unpinned). **Round 2**: clean.
- **Arc 1 known limit**: #700, I1's full-backup case, filed and closed as not planned.
- **Arc 2, Codex round 1** (session 01a14c56): one low finding, demonstrated: the PriceService exposure pin read only `background.ts`; it now reads `discovery-flow.ts` too, each case with an entry-point control. **Opus review**: findings, low. Accepted: two e2e headers and a moved comment named the wrong file, and the decrypt lane's comment stated history, not its invariant. Its stale store citation was already fixed (found by `test:all`). Kept: the allowlist test imports the real `background.ts` graph (about 24 s cold), since a mock would fence another object. **Round 2**: clean ("no regression found").
- **Arc 3, Codex round 1** (session 01a14cbb): findings. Medium, demonstrated: the `activeProfileId` adapter added a microtask before `listOutbox` (D13). Low: the class suite's header overclaimed. **Opus review**: findings, low and nit: the same two, and the class doc omitted the delete on a gone balance pair. All fixed in a036c0d1. **Round 2**: clean ("both fixes are verified; no new findings").
- **Arc 4, Codex round 1** (session 01a14d24): findings, three low, comments only; 770 base/head comparisons of the readers matched (key order, check order, `feeSettings` presence), all 31 `finalizeGasLimits` calls carry their arguments. Accepted: the `FinalizeGasOptions` doc line deleted, the moved FIFO comment cut to its invariant, the card predicate's comment to one sentence. **Opus review**: no behaviour change; one low design risk (D20) and nits. Accepted: D20, the controls comment and the header overclaims, the stale test title, `handleFeeUpdate`'s comment. Kept: `handleFeeUpdate` now returns quietly on an out-of-range index where `op.kind` threw (unreachable; the card emits its own index). **Cross-arc pass** (fresh session 01a14d26, arcs 1 to 4): no functional seam; `handleWalletMessage` takes arc 2's `sessionProfiles` map and reads `switchEpoch` late. Accepted: the `handleWalletMessage` doc's duplicated history, and the init-order pins header's "pre-extraction", stale since arc 2. All in fbed541b. **Round 2** (both sessions resumed): clean ("accepted fixes verified; no new findings"; `isSendTx` byte-identical to base, the other files emit unchanged JavaScript). The cross-arc pass: clean ("both findings are resolved; no new cross-arc regression found").

## Seeds

Orchestrator-owned: no ELI5; the seeds are not run.

```
/goal Arc <N> of implementations-plan/service-structure-1/plan.md: its phase gates green in STATUS.md, the Codex loop converged (a resumed pass with no new material finding quoted), the arc's PR open against dev with Closes #<n>, `bun run test:all` and `bun run lint` exit 0 in the transcript.
```

```
/loop 15m Drive arc <N> of implementations-plan/service-structure-1: read plan.md and STATUS.md; run the next unticked step and its gate; consult Codex on any decision; never change what a person sees; stop after the PR's checks report.
```

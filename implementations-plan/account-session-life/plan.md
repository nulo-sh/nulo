---
plan: account-session-life
tier: mid
status: approved by the orchestrator (D-orch-1 to D-orch-3); arc 1 in progress
issues: "#99, #100, #159, #198, #158 (arc 1); #157 decision-free half (arc 2); #24, #137, #208 (arc 3, waits on page 7, hold H2 and backup-import-export arc 3); #157 Ready half (arc 4, waits on OWNER-ASKS OA-4)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 explorers (sonnet); dual audit (Codex gpt-6.1-sol high + one Opus Plan agent); final fresh Codex pass
post_implementation_hardening: not scheduled
---

# Account, profile and session lifecycle: races, retry, the port handshake, unlock and credentials

Nine issues on how accounts, profiles and sessions start, wait and end, in four arcs and a close-out.

- **Arc 1 (decision-free).** Account creation and import check and write an address under that address's own lock, so neither can land between the other's check and write (#99). The popup's profile create waits for the created profile by id, joined to a bootstrap failure, under a deadline, and re-checks identity after every await (#100). A retry after "Passkey not confirmed" confirms the passkey the first attempt saved, as the passkey window does (#159). Two no-ask items ride here because page 7 governs neither: account RPC params are validated and a bad call is refused as `INVALID_PARAMS` (#198); ConfirmPopup's unreachable passkey branch and button are deleted (#158).
- **Arc 2 (decision-free; reservation R4).** The half of #157 that no person sees: `onDisconnect` reads `lastError`; the background closes a port it refuses; `deleteProfile` waits, bounded, for the deletion coordinator instead of throwing; the PXE fence keeps every dead generation of a profile and joins an erase already in flight.
- **Arc 3 (waits on decision page 7, hold H2, and backup-import-export arc 3).** Planned now, built only after page 7 is signed: #24 closes as not planned if P7-01 is approved; #137's toast (P7-02); #208's split reveal (P7-03) and backup autocomplete (P7-04, veto list).
- **Arc 4 (waits on OWNER-ASKS OA-4).** The Ready handshake: the popup counts as connected only when the background says Ready, and a call made before that waits for Ready within its deadline. Both audits showed that this changes what a person sees (the start-up loader and the "unreachable" banner's timing), so it is planned in full and built only on the owner's answer. Closes #157.

Recon: [recon.md](recon.md). Owner questions: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Scope

**In:** the nine issues above, with every surface they name.

**Out:**
- A strict-mode recovery bearer of any kind (#24): hold H2 forbids it without a page-7 answer, and P7-01 proposes none.
- `ProfileService.confirmProfileOperation` and the passkey recovery coordinator's `confirm`: #158's decision covers the popup branch only. The close-out files an issue if the RPC is left with no caller (dedupe first).
- Session checks on account reads and metadata edits (`getAccounts`, `getAccount`, `changeAccountName`, `changeAccountVisibility` run without one today, `account/service.ts:202-221,369-398`). Found in audit, not in any lane issue; the close-out files it (dedupe first).
- The passkey window's own retry for an authenticator that returns no PRF (OWNER-ASKS OA-3).
- Fee-map cleanup on profile deletion (#91, fees-and-sponsors arc 2). Arc 2 stays out of `ProfileDeletionCoordinator.purge` and the tombstone shape.
- `restore()`'s account writes (backup-import-export owns them; recon § Collisions).
- A reconnect backoff for the port client: it would make the start-up loader visible between attempts (`components/GlobalLoader.vue:14`), so it waits with arc 4.

## Regrouping against the lane map

The lane map has three arcs. This plan keeps arcs 1 and 3, narrows arc 2, and adds arc 4:

- **#198 and #158 move into arc 1.** The lane brief allows it when page 7 governs neither. #198 edits `account/spec.ts` and `account/service.ts`, the files #99 edits. #158 deletes code no screen renders.
- **#157 splits into arc 2 (decision-free) and arc 4 (owner decision).** The lane map called #157 decision-free. The tree says otherwise: `isBackgroundConnected` follows the profile client's `onConnected` (`utils/core.ts:62-73`), and it drives the full-screen "INITIALIZING / RECONNECTING" loader (`components/GlobalLoader.vue:14`) and the reconnect boot (`popup/app.vue:432`). Today the port reopens in the same tick, so the loader practically never shows; once Connected means Ready, it covers every background start, and a background that never starts shows it for up to 60 s instead of the "unreachable" banner after about 1.5 s (`popup/auth-guard.ts:60-80`). Everything of #157 that changes no screen ships in arc 2; the Ready handshake waits on OA-4 as arc 4.

## Outcome & Quality Bar

**For whom.** A person using the wallet popup: creating a profile, importing an account, unlocking after the browser restarted the background; and the maintainer who later reads a lock or a fence and must see why it is safe.

**What excellent looks like.**
1. A race between two of the person's own actions ends in one of the two outcomes the actions would have had one after the other, never a mixed state. Proved by a never-happens test with its success control for each race: create against import, create against a rename, a stale activation, overlapping PXE erases.
2. A retry never creates a second secret. One passkey per created profile; an imported key row only behind an imported account row. Proved by the e2e count of `navigator.credentials.create` calls and the unit test of the row and key stores.
3. Nothing a person sees changes except what a recorded decision names: the mirrored passkey confirmation (#159) in arc 1, page 7's words in arc 3, and the OA-4 answer in arc 4.
4. A call made while the background restarts is answered or refused exactly as a fresh call made just after the restart would be, and is never posted twice (arc 4).

**What good enough looks like.** No new abstraction beyond what each fix needs. No refactor of the window's passkey flow, the deletion coordinator or the offscreen handshake. No timing tune of existing timeouts.

## Assumptions

### Facts (verified against `643c0c9`)

- F1. Create, `ensureDefaultAccount` and `provisionDefaultAccount` serialise on `${profileId}:${chainId}:0`, import on `${profileId}:${chainId}:1` (`apps/extension/src/wallet/services/account/service.ts:225,240,263,366,522`). Create has no duplicate-address check and writes without the row lock (`:327`); import's duplicate check is at `:524`.
- F2. An imported account's address is a pure function of its signing key, the same function a derived account uses (`packages/aztec-runtime/src/account/nulo-account.ts:67-89`). So an account exported from a same-phrase install has the address a later create derives at that index, and two rows at one address hold the same signing key.
- F3. Row-lock keys are `JSON.stringify(["account", profileId, chainId, address])` (`account/spec.ts:27-29`), taken by `patchAccountField` (`:386`, a whole-row read-modify-write), `unwrite` (`:351`), `clearChainState` (`:193`), the profile purge (`:677`) and `reconcileImportedAccounts` (`:949`), each awaiting storage only. `KeyedLock` is not reentrant (`packages/wallet-core/src/utils/keyed-lock.ts`). `EntityStorage.get` hides an undecodable row; `contains(id)` reads the physical key and does not (`packages/wallet-core/src/storage/entity_storage.ts:176-186`).
- F4. `activateCreatedProfile` polls `appStore.isLogined` every 100 ms with no id check and no deadline, then awaits `setLastActiveProfileId`, `getAccounts` and `storageLocalSet` before it routes (`apps/extension/src/popup/pages/profile/new-profile-helpers.ts:25-45`). The page is reached only from the lock screen's profile picker and from register (`popup/components/popups/SelectProfilePopup.vue:73`, `popup/pages/register.vue:46`), so `isLogined` is false when it starts. The shell's bootstrap sets `appStore.profile` to the activated profile synchronously at entry and flips `isLogined` last (`composables/useProfileBootstrap.ts:148-175`). `awaitProfileActivation` is the bounded, identity-checked, failure-joined wait (`apps/extension/src/composables/unlockWait.ts:33`). `auth.vue` re-checks identity after each await of its own tail (`popup/pages/auth.vue:185-197`). A failed bootstrap records `appStore.bootstrapFailure` (`popup/app.vue:215`).
- F5. `handleCreate` keeps its latch when `onCreated` throws (`apps/extension/src/composables/useProfileCreateFlow.ts`, pinned by `useProfileCreateFlow.test.ts:219`).
- F6. The in-page passkey create mints a new id and a new credential on every attempt and drops the `PasskeyUnconfirmedError` (`apps/extension/src/wallet/utils/create-passkey-profile.ts`); the window keeps it and calls `confirmCreatedCredential` on Try again (`apps/extension/src/popup/windows/passkey/index.vue:36,76-88`). The create writes the profile name into the credential's `user.name` (`wallet/utils/passkey-ceremony.ts:47`).
- F7. `classifyPasskeyFailure` unwraps a `PasskeyUnconfirmedError` to its cause: `NotAllowedError` is "not-confirmed" (toast "Passkey not confirmed. Try again."), `PasskeyPrfError` is "no-prf" (`apps/extension/src/utils/passkey-copy.ts:80-96`). A create that returns no `prf` at all fails as no-prf (`passkey-ceremony.ts:107`); one that returns `prf` without `results` goes to the confirming assertion (`:109-123`).
- F8. RPC params keep `undefined` holes across the wire (`packages/extension-messaging/src/utils.ts` `wrapParams`/`unwrapParams`), so `.optional()` tuple members match omitted arguments.
- F9. `BaseService.handleRequest` calls `invoke(method, params)` for `rpcMethods` and for the framework RPCs `backup` and `restore`, and logs a thrown error at debug; a malformed params object gets a `VALIDATION` response before `invoke` (`packages/extension-messaging/src/core/base-service.ts:80-120`). `OperationJournalService` already overrides `invoke` and passes other names to `super.invoke` (`apps/extension/src/wallet/services/operation-journal/service.ts:117-127`). `InvalidWalletArgumentsError.forMethod` carries code `INVALID_PARAMS` and a message that names only the method (`packages/extension-messaging/src/errors.ts:284-295`).
- F10. The port client sets Connected and fires `onConnected` right after `chrome.runtime.connect` (`packages/extension-messaging/src/background/client.ts:62-78`) and reconnects at once on `onDisconnect` without reading `lastError` (`:94-97`). `isBackgroundConnected` follows the profile client's two events (`apps/extension/src/utils/core.ts:62-73`); the loader shows while it is false (`components/GlobalLoader.vue:14`); `app.vue` runs the reconnect boot when it turns true (`popup/app.vue:420-436`).
- F11. The server logs and leaves open a port from an untrusted sender (`background/service.ts:45-48`).
- F12. `deleteProfile` throws "deletion coordinator not ready" when no delegate is set (`apps/extension/src/wallet/services/profile/service.ts:1455-1457`); the coordinator sets it at the end of its `start()`, the last start phase. Resume and torn reap run after start (`:1543-1545`).
- F13. `clearProfileState(id, G2)` over `deleted(G1)` throws a generation mismatch (`packages/aztec-runtime/src/pxe/service.ts:752-759`); `provisionChainStoreKey` refuses only the one retained dead generation (`:829-846`); `clearProfileState` marks `deleting` before it awaits the write barrier and drops the barrier on success (`:763-786`); the orphan sweep skips any profile with a lifecycle entry (`:286`); `incarnation-fence.test.ts:133-146` pins that `clear(G1)` over `live(G2)` refuses.
- F14. `ToastOptions` has `sub` (`packages/design/src/composables/toast.ts:15-20`); about ten popups write the label "Something went wrong" by hand.
- F15. `change-password.vue` drives all three fields from one `isPasswordType` flag (`apps/extension/src/popup/pages/settings/security/change-password.vue:124-186`); the backup decrypt field and the export pair carry no `autocomplete` (`ImportFullBackupForm.vue:111`, `export/full.vue:665,679`).
- F16. SECURITY.md § Session secret (password profiles), item 5, already says that after a background death under strict mode the next popup shows the lock screen.
- F17. Eleven network files carry `@requires-proverless`, three of them in this plan's gates: `account-switch-isolation.test.ts`, `backup-restore-sw-restart.test.ts` and `inflight-call-background-death.test.ts`. `apps/extension/scripts/e2e/agent.sh:21-33` refuses a marked file unless `NULO_E2E_PROVERLESS=1` is set.

### Inferences (unverified; each is checked in the phase named)

- I1. Once the shell has started the created profile's bootstrap, the bootstrap ends on its own: every await in it is an RPC under the client's 60 s timeout or a storage call, a failure of the current run records `bootstrapFailure` (`popup/app.vue:205-216`), and a newer profile event supersedes it by selecting another profile or by locking. A run of slow but healthy calls can take longer than any fixed bound (Codex final pass, finding 4), so arc 1 puts no time bound after the start. Phase 1.2 lists every await and failure path and confirms this.
- I2. Overriding `getClientExtensionResults` on the credential a real create returns (to `{ prf: { enabled: true } }`, no `results`) sends the in-page ceremony down the confirming-assertion path on both browsers (F7). Phase 1.3 checks it on Chrome and Firefox before the test relies on it.
- I3. A port opened during a cold wake can meet no `onConnect` listener, because the services register theirs inside `registerServices` after awaited boot steps (`apps/extension/src/wallet/runtime.ts:254,478`). Arc 4 checks it on the base build before any red/green claim.

### Asks

None block arcs 1 and 2. OWNER-ASKS.md holds OA-1 (#100, a create whose activation fails or wedges), OA-2 (#99, a create that lands on an imported account's address), OA-3 (the window's retry for a no-PRF authenticator) and OA-4 (the Ready handshake's visible effects; gates arc 4). Page 7's four records gate arc 3.

## Architecture & Implementation

### Arc 1

**#99: one critical section per address.** The per-type serialisation (`serializePerTuple`) stays: it keeps two creates, or two imports, from picking one index. What changes is the final check and write. Both create and import run them under the existing row lock, `tupleLocks.withLock(accountRowId(profileId, chainId, address))`, the lock `patchAccountField` and every purge already take (F3). Create learns its address only after the derivation, so it takes the row lock then, inside its type section. Nesting is always type key, then row key; nothing takes them in the other order, and no code holding a row lock calls `unwrite`.

Inside the row lock, each side awaits storage only:
- It reads occupancy with `contains(id)`, the physical key, not the decoded view, so a row the codec hides still counts as present (F3).
- It asserts the deletion epoch with no await before the write. The network liveness read stays before the lock, as today, and the post-write liveness read and epoch check stay after it.
- **Import:** an occupied key refuses with "This account is already in your wallet", before any key row is written. Otherwise it writes the key row, then the account row, as today.
- **Create:** whatever occupies the key is overwritten, as today; for an imported row that is today's sequential outcome (OWNER-ASKS OA-2 asks whether to change it). It then deletes any sealed imported key stored for that address, in the same hold. The derived row signs with the same key (F2), and while it stands nothing else removes that key row: `clearChainState` deletes keys only behind imported rows (`account/service.ts:196`), the init sweep only behind absent rows (`:171-178`), and a backup would carry it (`:805`). A failed key delete logs a fixed category at warn and does not throw: the new row is already committed.

Because a rename's read-modify-write holds the same row lock, a rename parked on its read can no longer write an imported row back over a create's derived row after its key is gone (Codex finding 1). Import no longer waits behind a create's custom-network L1 probe, which runs in create's type section, outside the row lock (Codex finding 8).

Two other writers must respect a replacement, or a create that replaced an imported row can still lose its row (final pass, findings 1 and 2):
- **`unwrite` deletes only its own row.** Under the row lock it re-reads the row and deletes it only while the stored `type` and `index` are the ones this writer wrote; otherwise it throws its refusal and deletes nothing. A rename keeps `type` and `index`, so a renamed row is still removed. Import's key compensation in its `catch` stays: only imports write key rows, imports of one (profile, chain) serialise on the import type key, and that `catch` runs inside the section, so the key it deletes is its own or already gone.
- **`reconcileImportedAccounts` selects and deletes under the row lock.** A candidate is a row that, read fresh under its row lock, is still imported and has no key. The delete pass re-checks the same two facts under the lock, so the reconcile never deletes a row that is not an imported, keyless one. Its one caller, the full-backup import, runs it before the restored profile has a session (`apps/extension/src/composables/useFullBackupImport.ts:388-399`), when create and import refuse (`profile/session-manager.ts:248-252`); the re-checks keep the rule for a direct RPC call too. A dependent purge for a candidate that a create replaces mid-reconcile is not fenced: no session-holding create can reach that window (final pass, round 2).

**#100: the activation wait.** `activateCreatedProfile` replaces the poll with `awaitProfileActivation(appStore, profile.id, CREATE_START_WAIT_MS, { deadlineCovers: "start" })`, `CREATE_START_WAIT_MS = 30_000`. The one watcher the helper already has gains one option and one typed error:
- With `deadlineCovers: "start"`, the timer stops once the shell has selected the expected profile (`store.profile?.id === expectedId`), which its bootstrap does at entry (F4). Before that, the deadline covers the one part nothing else bounds: a profile event that never arrives. After it, the bootstrap ends the wait by itself (I1): activation resolves, a recorded failure rejects with `BootstrapFailedError`, and the shell selecting another profile rejects with a new `ActivationSupersededError`. A start-up that is slow but succeeds still lands on General, as today. A lock during the bootstrap leaves the wait pending, as today's poll does.
- Without the option (the unlock's use), nothing changes.

The tail follows `auth.vue`. It drops the redundant `appStore.profile = profile` write. It returns without writing or routing unless `appStore.isLogined && appStore.profile?.id === profile.id` holds right after the wait, and again after each of its three awaits (`setLastActiveProfileId`, `getAccounts`, `storageLocalSet`). On any rejection it rethrows. `handleCreate` catches an `onCreated` rejection, logs a fixed category at warn (`{ reason: "timeout" | "bootstrap-failed" | "superseded" | "other" }`, never the error text), and keeps its latch: today's visible behaviour (OA-1).

**#159: the saved credential.** Three small edits, no new module:
- `PasskeyRequest`'s create variant gains `credentialId?: string`: a credential this create already minted. `runPasskeyCeremony` confirms it through `confirmCreatedCredential` instead of running `create`, and wraps a failure as `PasskeyUnconfirmedError(credentialId, userHandle, cause)`, as `runCreate` does once a credential exists. The background never sets the field; the window's own path is unchanged.
- `createPasskeyProfileWithRetry(name, deps, saved?)`: the first attempt uses `saved.userHandle` as the profile id and passes `saved.credentialId`; a `ProfileIdConflictError` falls back to a fresh id and a fresh create, as today.
- `useProfileCreateFlow` keeps the last `PasskeyUnconfirmedError` with the name it was created under and passes it on the next passkey attempt; success clears it. It is not reused when the name changed (the credential's label would name another profile, F6) or when the failure was "no-prf" (that authenticator can never confirm, and pinning the retry to it would stop the person picking another one). Both keep today's fresh create.

**#198: params at the RPC boundary.** `account/spec.ts` gains `AccountMethodSchemas`, one `z.tuple` per name in `rpcMethods` (13 methods), with `.optional()` for optional parameters (F8). `restoreImportedKeys` checks only that it receives an array, so `restoreRows` still records each bad row as its own error. `AccountService` overrides `invoke` on the operation-journal precedent (F9): a name with no schema (`backup`, `restore`) goes to `super.invoke` unchanged; otherwise the tuple is checked with `safeParse`, a failure throws `InvalidWalletArgumentsError.forMethod(method)` before the method runs, and a success calls the method with the original params, so zod never rewrites an argument such as a `RunFence`. A malformed params object keeps today's `VALIDATION` response. The stale TypeError comment at `account/spec.ts:37-41` is rewritten. A test pins that the schema keys equal `rpcMethods`.

**#158: ConfirmPopup.** Delete `isPasskeyConfirmed`, `handlePasskeyConfirmation`, the passkey `Button`, and the `passkeyConfirmation` terms in `isConfirmed` and in the row's `v-if`; drop imports left unused.

### Arc 2: the decision-free half of #157

**Transport (`packages/extension-messaging/src/background/*`).**
- The client's `onDisconnect` reads `chrome.runtime.lastError` (Chrome) and the port's `error` (Firefox), so neither browser reports an unchecked error, and logs a fixed category at debug. Its timing and events are unchanged.
- The server `disconnect()`s a port from an untrusted sender after logging it, instead of leaving it open. A port for another service name is still ignored: every service sees every `onConnect`.

**Delegate wait (`profile/service.ts`).** `setDeletionDelegate` resolves a one-shot promise. `deleteProfile` awaits it before any lock, bounded by `DEFAULT_INIT_TIMEOUT_MS` (30 s); at the bound it throws the existing "deletion coordinator not ready", having written nothing. This is the only edit to the deletion path, in the first lines of `ProfileService.deleteProfile` (the R4 seam, below).

**Dead generations (`pxe/service.ts`).** `profileLifecycles` becomes a per-profile record `{ current?: { kind: "live" | "deleting"; gen }, dead: Set<gen>, clearing?: { gen, done: Promise<void> } }`. A record exists while a profile is live, deleting or has any dead generation, so the orphan sweep's `has` check (`:286`) keeps its meaning.
- `clearProfileState(id, gen)`, in this order:
  1. A clear of the same `gen` already in flight is joined: the caller awaits it. No second erase runs through a barrier the first may drop.
  2. A `current` under another `gen` refuses, as `incarnation-fence.test.ts:133-146` pins: a late clear never erases a live or in-flight successor.
  3. A dead `gen` is an idempotent no-op.
  4. Otherwise it marks `deleting(gen)` synchronously and takes the barrier. It re-checks that `current` is still `deleting(gen)` before the first destructive step, then erases. On success it drops `current` and adds `gen` to `dead`.
- `provisionChainStoreKey(id, key, gen)`: refuse while `deleting`, refuse any dead `gen`, refuse `live` under another `gen`; otherwise as today.
- `assertGenerationCurrent`: a dead captured `gen` is stale. With no `current` the op falls through, as today: a successor booting before its first provision. `live` under the captured `gen` passes.

The record lives as long as the offscreen document, like today's map, and grows by one entry per deletion of a profile id. Generations are minted fresh for every row (`apps/extension/src/wallet/services/profile/profile-row.ts:37,60`), so no successor can carry a dead generation.

**R4 seam.** fees-and-sponsors arc 2 (#91) appends a purge to `ProfileDeletionCoordinator.purge` and may widen the deletion snapshot. Arc 2 edits neither `coordinator.ts`, `profile-deletion/types.ts` nor the tombstone repository. Its only deletion-path edit is the delegate acquisition at the top of `ProfileService.deleteProfile`. Whichever lands second rebases and re-runs its network gate.

### Arc 3 (planned, not built until page 7 is signed)

- **#24 (P7-01).** Approved as proposed: no code. The issue closes as not planned with a comment that quotes the decision and its date and cites SECURITY.md § Session secret (password profiles), item 5 (F16). Changed: hold H2 stands; the change becomes its own blueprint, and arc 3 ships the rest.
- **#137 (P7-02).** `auth.vue`'s unlock failure ladder ends with `openToast({ kind: "error", label: "Something went wrong", sub: "Try unlocking again." })` for a password unlock that no earlier rung handled. The passkey rung keeps its own copy. The toast never carries the error's text.
- **#208 (P7-03).** `change-password.vue` uses two flags: the current-password eye drives the current field only; the new-password eye drives the new field and its confirmation. Test ids stay.
- **#208 (P7-04, veto list).** Accepted unless struck: `autocomplete="current-password"` on `ImportFullBackupForm.vue`'s decrypt field, `autocomplete="new-password"` on `export/full.vue`'s encrypt pair, after backup-import-export arc 3 lands on both files. Struck: not built, and #208 closes on P7-03 with the strike quoted.

### Arc 4 (planned, not built until OA-4 is answered)

Built as below if the owner picks OA-4 B or C; with A, nothing is built and #157 closes after arc 2 with a comment quoting the answer.

**Wire.** `MessageType.Ready`, an envelope that carries no content, posted by the server on a port it accepts once `ensureInitialized()` resolves. If init fails its 30 s budget, the server logs a fixed category, drops the port and `disconnect()`s it.

**Client states.** `Disconnected` → `Connecting` (port open, no Ready yet) → `Connected`.
- Every port carries a generation number. A message or a disconnect from a port that is not the current one is ignored, and that port is closed, so the client never holds two open ports.
- `ensureTransportReady()` returns void when `Connected`. Otherwise it opens a port if none is open and returns a Ready promise that survives Connecting-to-Connecting retries.
- **Send boundary.** The request posts only in the same synchronous turn that sees `Connected` on the current generation. After its readiness wait, the base client asks a background-only hook (`isTransportStillReady()`, default `true`, so the offscreen transport is untouched) and waits again within the same deadline when the port changed in between (Codex finding 3).
- An explicit `disconnect()` bumps an epoch; a request that captured an older epoch rejects at the send boundary instead of reopening the port. It also rejects the Ready promise and cancels any reconnect timer (Opus finding 9).
- On Ready: `Connected`, resolve the Ready promise, then fire `onConnected` in a task (`setTimeout(0)`), so every queued request has posted before a subscriber's re-read. The task captures the port generation and the disconnect epoch and fires nothing if either moved, so an explicit `disconnect()` or a dropped port before it runs never emits a stale Connected (final pass, finding 6).
- On `onDisconnect` from `Connected`: as today. Reject every posted request with "Client disconnected" (a posted request may have run, so it is never resent), fire `onDisconnected`, reconnect. From `Connecting`: reject nothing (nothing was posted) and reconnect after a delay of 100 ms doubling to 2 s, reset on Ready.
- The reconnect boot (`popup/app.vue:432`) runs on Ready under B and C.
- **Loader under B.** It shows while no Ready has arrived and gives way to the boot banner once the boot gives up (`bootOutcome` set, `popup/app.vue:476-486`). Without that, a service that never says Ready keeps the loader, at `z-index: 9999`, over the banner for good (final pass, finding 5).
- **Loader under C.** It keeps today's timing. It turns off on `onDisconnected`, which now fires only from `Connected`, and on again when that disconnect's immediate reconnect opens the next port, in the same tick, as today. A close before Ready fires neither event, so the spaced retries never show it.

**Queued calls and sessions.** A call queued across a background restart reaches the new worker, which applies its own session state. That is exactly what a fresh call made just after the restart, from the same page, would get. The page has not re-read yet, so the call's authority and the page's knowledge are the same either way. Under strict mode no session exists and session-checked calls are refused. Under lenient mode the bearer restores the same profile during init, before Ready. A call that acts on "the active profile" (`backup`, `lockActiveProfile` without a handle) acts on whichever profile is active when it arrives, as it does today for a call made one moment later. The flows that move secrets carry a `RunFence` or `ExecutionFence` that refuses a changed session. Account reads and metadata edits check no session at all; that is pre-existing and filed separately (Scope).

**Invariants.** A request is posted at most once, and only on a port that said Ready. `onConnected` fires at most once per Ready, and never for a port that is no longer current. Every port the client stops using is closed.

### File-level change map

| Arc | File | Change |
|---|---|---|
| 1 | `apps/extension/src/wallet/services/account/service.ts` | row-lock check and write in create and import; create's key cleanup; `unwrite` deletes only its own row; `reconcileImportedAccounts` selects and deletes under the row lock; `invoke` override |
| 1 | `apps/extension/src/wallet/services/account/spec.ts` | `AccountMethodSchemas`; the stale comment |
| 1 | `apps/extension/src/wallet/services/account/create-import-lock.test.ts` (new) | #99 never-happens tests and controls |
| 1 | `apps/extension/src/wallet/services/account/rpc-params.test.ts` (new) | #198 refusals, framework passthrough, surface pin |
| 1 | `apps/extension/src/composables/unlockWait.ts` (+ `.test.ts`) | `deadlineCovers: "start"`; `ActivationSupersededError` |
| 1 | `apps/extension/src/popup/pages/profile/new-profile-helpers.ts` (+ `.test.ts`) | the wait, identity re-checks |
| 1 | `apps/extension/src/composables/useProfileCreateFlow.ts` (+ `.test.ts`) | keep the unconfirmed credential; catch an activation rejection |
| 1 | `apps/extension/src/wallet/utils/create-passkey-profile.ts` (+ `.test.ts`) | `saved` |
| 1 | `apps/extension/src/wallet/utils/passkey-ceremony.ts` (+ `.test.ts`), `apps/extension/src/wallet/services/passkey/spec.ts` | `credentialId` on the create request |
| 1 | `apps/extension/tests/e2e/fixtures/passkey.ts`, `apps/extension/tests/e2e/passkey-retry.test.ts` | the withheld-PRF interceptor; the one-credential case |
| 1 | `apps/extension/src/popup/components/popups/ConfirmPopup.vue` (+ `.test.ts`) | the deletion |
| 2 | `packages/extension-messaging/src/background/client.ts`, `service.ts` (+ tests) | `lastError`; close refused ports |
| 2 | `apps/extension/src/wallet/services/profile/service.ts` (+ `service.integration.test.ts`) | delegate wait |
| 2 | `packages/aztec-runtime/src/pxe/service.ts`, `incarnation-fence.test.ts` | dead generations, joined clears |
| 3 | `apps/extension/src/popup/pages/auth.vue` (+ `auth.test.ts`), `apps/extension/tests/e2e/auth-flows.test.ts` | the toast |
| 3 | `apps/extension/src/popup/pages/settings/security/change-password.vue` (+ `.test.ts`) | two reveal flags |
| 3 | `apps/extension/src/components/composite/import/ImportFullBackupForm.vue`, `apps/extension/src/popup/pages/settings/security/export/full.vue` (+ tests) | `autocomplete` |
| 4 | `packages/extension-messaging/src/messages.ts`, `background/client.ts`, `background/service.ts`, `core/base-client.ts`, `testing/port-registry.ts`, `testing/transport-harness.ts` (+ tests) | Ready, states, generations, send boundary, epoch, backoff |
| 4 | `apps/extension/src/utils/core.ts`, `apps/extension/src/popup/app.vue`, `apps/extension/src/components/GlobalLoader.vue` (+ test) | per the OA-4 answer |
| 4 | `apps/extension/tests/e2e/sw-resilience.test.ts` | the restart cases |

### Trade-offs and alternatives not taken

- **#99, one lock per (profile, chain)** (this plan's first draft). Replaced: both audits showed that create's write would still race a rename's read-modify-write under the row lock (Codex 1). It would also queue an import behind a create's custom-network probe, whose per-attempt fetch timeout is 60 s with retries (Codex 8). The row lock is already the address's lock.
- **#99, re-check the row after the write** (the issue's second option). Rejected: an undo after a lost race is itself a write another writer can interleave with.
- **#100, one deadline over the whole activation** (30 s as the unlock uses, or 120 s as the revised draft had). Rejected: a start-up of healthy but slow calls lands on General today, and any fixed bound over the whole bootstrap would leave some of them on "Creating…" (Opus 5; final pass, finding 4). The deadline covers the start, which nothing else bounds; the bootstrap bounds the rest (I1).
- **#159, a fourth `PasskeyRequest` mode for confirmation.** Rejected: every exhaustive switch over `mode` would grow; an optional field on the create variant keeps one meaning ("finish this create").
- **#159, exact mirror for no-PRF too.** Rejected for the page: the page tells the person the authenticator may not be supported, and a retry pinned to that credential can never succeed (OA-3 asks the same about the window).
- **#198, `ValidationError` with per-method `validateParams`** (the network pattern). Rejected: the recorded no-ask names `INVALID_PARAMS`, the refusal #196 uses for a popup RPC; `ValidationError`'s message also carries zod's issue text; and one `invoke` override cannot be forgotten by a new method. Both audits agree.
- **#157, Ready in arc 2 as decision-free** (this plan's first draft). Replaced: it changes the loader and the "unreachable" banner's timing (Opus 1, Codex 7).
- **#157, a module-scope `onConnect` that buffers ports and their messages until the services exist** (Outline B). Rejected for arc 4: registering at evaluation time is the documented rule on both browsers (Opus corrected this plan's earlier doubt), but the buffer must also hold messages, it does nothing about `lastError` or refused ports, and it still reports Connected before the background can answer.
- **#157, a background boot id that refuses a queued call across a restart.** Rejected: it would refuse the reconnect boot's own reads, which `app.vue` issues when the port reopens. A queued call gains no authority a fresh call would not have (Arc 4, Queued calls).
- **#157, resend unanswered requests after a reconnect.** Rejected: a posted request may have run.

## Security & Adversarial Considerations

**Threat model.** The actors are:
- a web page or dApp, which reaches the background only through the wallet-sdk path, never these ports or the account RPCs;
- another extension or a content script, which can open a port with a service's name (`isTrustedInternalSender` refuses it);
- a compromised popup or extension page, which has full RPC access;
- stale state: a restarted service worker, a restarted offscreen document, a capture that outlived a deletion.

The secrets in play are the master secret, the imported-keys DEK, sealed imported signing keys, passkey credential ids and user handles, and the PXE store keys.

| Arc | Actor | Before | After |
|---|---|---|---|
| 1 (#99) | The person, two popups; a dApp that triggers `provisionDefaultAccount` on a new chain | A create and an import of one address interleave: the stored row disagrees with what one caller was told, and a later create re-derives the lost index and overwrites again. A rename parked on its read can write an imported row back over a derived one | One address, one lock: each outcome is one of the serial orders; an imported key row never outlives its imported row behind a derived row, and an imported row never loses its key. A failing writer's undo and the restore reconcile delete only the row they own, so a replacement survives them |
| 1 (#100) | Another popup or tab unlocking another profile | The create page writes the created profile into the store while the session is another profile | Nothing is written or routed unless the created id is the active, bootstrapped profile right after the wait and after each await |
| 1 (#159) | None hostile; privacy | Each retry leaves an orphan passkey in the password manager, labelled with the profile name | One passkey per created profile; the saved id lives only in page memory, never logged or persisted |
| 1 (#198) | A compromised extension page | A missing `profileId` ends in a TypeError whose text names internals | A typed refusal with a fixed message that echoes no value; the method body never runs; `restore` is untouched |
| 1 (#158) | None | A dead branch called `confirmProfileOperation` without a password and swallowed the throw | Gone |
| 2 | Another extension or content script | Its refused port stays open | Closed at once |
| 2 | A restarted worker | Chrome logs an unchecked `lastError` per dropped port | Read and logged as a category at debug |
| 2 | A restarted offscreen; a stale capture; a resumed deletion | A same-id re-import cannot be deleted until the offscreen restarts; after a second deletion, a stale provision of the first erased generation is admitted again; two clears of one generation can both erase | Both deletions complete; every erased generation stays refused for the document's lifetime; a second clear joins the first |
| 2 | An RPC caller during boot | `deleteProfile` throws before the coordinator exists | It waits up to 30 s with no lock held, then throws as today |
| 3 | Shoulder-surfing; password managers | One eye reveals the current password with the new ones; managers cannot tell backup fields apart | Page 7's proposals; the unlock toast never shows error text |
| 4 | A restarted worker; a forged Ready | Calls on a port opened during boot fail; `onConnected` fires per failed port | Calls wait for Ready within their deadline and are posted at most once; only the port's far end can post a Ready, and a stale port's Ready is ignored |

**Lock order (1).** Type key, then row key, in both create and import. Code that holds a row lock awaits storage only, and never calls `unwrite`, which takes the row lock itself. The reconcile's dependent purges run outside every row lock, as today. `resolveVerifiedL1ChainId`, `isChainLive` and `getL1ChainIdStored` take no account lock. Nothing that holds `restoreLock` or `runExclusive` calls create or import.

**Logging.** No new log line carries a credential id, user handle, address, password, error message or URL: categories and counts only (CLAUDE.md § Logging policy).

**Least privilege, crypto, supply chain.** No new permission, dependency, CI token or cryptographic primitive. WebAuthn goes through the existing `passkey-ceremony.ts`; sealing stays in `@nulo/wallet-crypto`. The 7-day npm age gate and the frozen lockfile are untouched.

## Implementation

Every gate runs from the repo root unless it says `apps/extension`. Retry 0 everywhere: smoke `--retry=0`, network `NULO_E2E_RETRY=0`; a file marked `@requires-proverless` runs in its own call with `NULO_E2E_PROVERLESS=1` (F17).

**Warning:** until #169 (gate G1) merges, network e2e runs one lane at a time on this host. Wait for a free host before each `e2e:agent` run, and never run two in this worktree.

A red/green proof takes the old copy from the base SHA (`git show 643c0c9:<path>`), never from `HEAD`. Each test below is labelled **new proof** (fails on the base copy) or **guard** (already holds on base; it pins the behaviour the change must keep).

### Arc 1: races and retry

#### Phase 1.1: one critical section per address (#99) ✓

1. Move create's final check and write, and import's duplicate check and writes, under the row lock as the Architecture section states. Read occupancy with `contains(id)`. Assert the epoch inside the lock with no await before the write.
2. In create, after the row write in the same hold, delete the replaced imported row's key. On failure, log a fixed category and continue.
3. Add `create-import-lock.test.ts`. Mock the derivation so create and import produce one address.
   - **New proof.** Park import inside the row lock (a held `importedKeys.set`), then start a create. While import is parked, no create write occurs (`recordWrites`). After both settle, one row exists, it is the create's, and no key row sits behind it.
   - **New proof.** Park a rename on its read inside the row lock, then start a create that replaces the imported row. After both settle, the row is derived and no imported row lacks its key.
   - **New proof.** Import writes its row; a create replaces it; then import's post-write liveness read rejects. The derived row survives and the create's result stands. **Guard:** with no create in between, the same rejection removes import's row and its key row, as today.
   - **New proof.** A keyless imported row is chosen by `reconcileImportedAccounts`, which is paused after its selection; a create replaces the row; the reconcile resumes. The derived row survives (the base delete pass checks only the key and deletes it).
   - **Guard.** An imported row whose key is present at the listing; a create replaces it and deletes the key mid-reconcile. No dependent purge runs and the derived row survives. This passes on the base, whose create keeps the key, and fails if the key cleanup ships without the reconcile change.
   - **Guard.** A keyless imported row with no create in between is still purged, deleted and reported.
   - **Guard.** Create first, then import. Import rejects "This account is already in your wallet", writes no key row, and the derived row is unchanged.
   - **Guard.** Two creates still get indices 0 and 1 (`serialize-per-tuple.test.ts`).

**Validation gate**
- Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/wallet/services/account/`.
- Pass: exit 0. The four new proofs fail against `git show 643c0c9:apps/extension/src/wallet/services/account/service.ts` (the base create ignores the row lock, deletes no key, and the base `unwrite` and reconcile delete whatever row they find).
- Layers: lint, typecheck, unit.

#### Phase 1.2: the activation wait (#100) ✓

1. Confirm I1: list every await in `bootstrapActiveProfile` and `runBootstrapCore` and every failure path, and check that each await is an RPC under the client timeout or a storage call, and that each failure of a current run writes `bootstrapFailure`. Log it in `lessons/phase-1.md`. If one is not, record that path in OA-1 and stop before step 3.
2. Add `deadlineCovers: "start"` and `ActivationSupersededError` to `awaitProfileActivation`, keeping its one watcher.
3. Replace the poll with the wait; rewrite the tail with the identity check right after the wait and after each of its three awaits; drop the redundant `appStore.profile` write.
4. In `handleCreate`, catch an `onCreated` rejection, log the fixed category at warn, and keep the latch.
5. `unlockWait.test.ts`, with fake timers:
   - **New proof.** With the option, the deadline never fires once the expected profile is selected; activation after 5 minutes resolves. **Guard:** without the option, the same schedule rejects at the deadline, as today (the unlock's case).
   - **New proof.** With the option, the shell selecting another profile after the start rejects with `ActivationSupersededError` at once.
6. Rewrite `new-profile-helpers.test.ts` without the `sleep` mock, on a `reactive` store with fake timers:
   - **New proof.** Another profile becomes active and the created one never starts. The wait rejects at 30 s, and the helper never sets the store, never calls `setLastActiveProfileId`, `getAccounts` or `router.push`.
   - **New proof.** A bootstrap failure for the created id rejects at once with `BootstrapFailedError`. Same nothing-written assertions.
   - **New proof.** The session switches to another profile while `getAccounts` is pending, and in a second case while `storageLocalSet` is pending. The helper writes no accounts in the first and routes in neither.
   - **Guard.** The created profile starts at once and becomes active after 3 minutes. The tail runs in today's order and routes to General.

**Validation gate**
- Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/popup/pages/profile/ src/composables/unlockWait.test.ts src/composables/useProfileCreateFlow.test.ts`.
- Pass: exit 0. The new proofs fail against the base copy of `new-profile-helpers.ts`.
- Layers: lint, typecheck, unit.

#### Phase 1.3: the passkey retry confirms (#159) ✓

1. Add `credentialId?` to the create variant of `PasskeyRequest`. Teach `runPasskeyCeremony` to confirm it and to wrap a confirm failure as `PasskeyUnconfirmedError`.
2. Add `saved` to `createPasskeyProfileWithRetry`.
3. In `useProfileCreateFlow`, keep the last non-"no-prf" `PasskeyUnconfirmedError` with its name. Pass it on the next passkey attempt while the name is unchanged; clear it on success.
4. Unit tests:
   - **New proof** (`create-passkey-profile.test.ts`). With `saved`, `generateProfileId` is never called, and the request carries `saved.credentialId` and `saved.userHandle`. **Guard:** a `ProfileIdConflictError` on that attempt falls back to a fresh id and a create.
   - **New proof** (`passkey-ceremony.test.ts`). With `credentialId`, `navigator.credentials.create` is never called, and a refused confirmation rejects as `PasskeyUnconfirmedError` with the same id. **Guard:** without it, today's create runs.
   - **New proof** (`useProfileCreateFlow.test.ts`). A retry after a "not-confirmed" failure never mints a new id. **Guard:** a retry after "no-prf", or after a name change, runs a fresh create, as today. A second refusal of the confirmation keeps the same saved credential for the next retry.
5. Check I2 on both browsers. Add `withholdCreatePrf(page)` to `tests/e2e/fixtures/passkey.ts`. The real create runs, and its result reports `prf: { enabled: true }` with no `results`. The first confirmation is refused with `NotAllowedError`. A page counter records `create` calls.
6. Add a case to `passkey-retry.test.ts` for the popup's new passkey profile.
   - **New proof.** The `create` counter reads 1 after the retry finishes.
   - **Guard.** The retry lands on the general page with the profile active.

**Validation gate**
- Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/wallet/utils/ src/composables/useProfileCreateFlow.test.ts src/components/passkey/ src/popup/windows/passkey/`; `cd apps/extension && bun run test:e2e -- tests/e2e/passkey-retry.test.ts --retry=0`; the same with `NULO_E2E_BROWSER=firefox` (a fixture changed).
- Pass: exit 0 on both browsers. The new e2e case fails on the base copy of the three source files (the counter reads 2).
- Layers: lint, typecheck, unit, smoke e2e on Chrome and Firefox.

#### Phase 1.4: account RPC params (#198) ✓

1. Add `AccountMethodSchemas` to `account/spec.ts`; rewrite the stale comment at `:37-41`.
2. Override `invoke` in `AccountService` as the Architecture section states.
3. Add `rpc-params.test.ts`, driven through the real request path (`transport-harness`):
   - Pin: the schema keys equal `rpcMethods`.
   - **New proof**, one per refused class. Each asserts code `INVALID_PARAMS`, the fixed message, and that the method body never ran:
     - a missing required argument (`getAccounts(undefined, 1)`);
     - a wrong primitive (`chainId: "1"`);
     - an out-of-range enum (`type: 2`);
     - an extra argument.
   - **Guard.** A valid tuple reaches the method, both with an optional argument omitted and with it passed as `undefined`.
   - **Guard.** `restore` and `backup` still run, and a malformed params object still gets `VALIDATION`.

**Validation gate**
- Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/wallet/services/account/`.
- Pass: exit 0. The new proofs fail against the base copy of `service.ts`.
- Layers: lint, typecheck, unit.

#### Phase 1.5: ConfirmPopup's dead branch (#158)

1. Delete the branch, the button and the unused imports.
2. Drop the `confirmProfileOperation` stubs from `ConfirmPopup.test.ts`; keep its existing cases.

**Validation gate**
- Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/popup/components/popups/ConfirmPopup.test.ts`; `! rg -q "passkeyConfirmation|handlePasskeyConfirmation" apps/extension/src`.
- Pass: every command exits 0 (the last one exits 0 only when nothing matches).
- Layers: lint, typecheck, unit.

#### Arc 1 boundary gate

- Commands:
  - `bun run audit:vue`; `bun run test:all`.
  - `cd apps/extension && bun run test:e2e -- tests/e2e/registration.test.ts tests/e2e/passkey-paths.test.ts tests/e2e/passkey-retry.test.ts tests/e2e/accounts.test.ts tests/e2e/account-import-export.test.ts tests/e2e/passkey-backup.test.ts --retry=0`. `passkey-backup.test.ts` is the smoke file that opens ConfirmPopup.
  - The passkey files again with `NULO_E2E_BROWSER=firefox`.
  - After a free host is confirmed: `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_RETRY=0 bun run e2e:agent tests/e2e/network/imported-account-execution.test.ts`, then `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_RETRY=0 NULO_E2E_PROVERLESS=1 bun run e2e:agent tests/e2e/network/account-switch-isolation.test.ts`.
- Pass: every command exits 0.
- Layers: lint, typecheck, unit, build, smoke e2e (Chrome; Firefox for the passkey files), network e2e (Chrome).
- Then the arc's Codex loop (Post-implementation), then `gh stack add account-session-life-arc-2`.

### Arc 2: the decision-free half of #157

**Warning:** arc 2 edits `ProfileService.deleteProfile`, under reservation R4. If fees-and-sponsors arc 2 (#91) is ready at the same time, it lands first. Whichever lands second rebases on the other and re-runs its network gate.

#### Phase 2.1: transport hardening

1. Read `lastError` and the port's `error` in the client's `onDisconnect`; log the fixed category at debug.
2. `disconnect()` an untrusted sender's port on the server.
3. Tests:
   - **New proof** (`client.test.ts`). Every `onDisconnect` reads `chrome.runtime.lastError` (a counting getter on the fake) and `port.error`. **Guard:** reconnect timing and events are unchanged.
   - **New proof** (`service.test.ts`). An untrusted sender's port is `disconnect()`ed. **Guard:** it is never added to the clients and gets no event; a trusted port is unaffected.

**Validation gate**
- Commands: `bun run lint`; `bun run typecheck:all`; `bun run test:all`.
- Pass: exit 0. The new proofs fail against the base copies of `client.ts` and `service.ts`.
- Layers: lint, typecheck, unit.

#### Phase 2.2: the delegate wait

1. Add the one-shot delegate promise and await it in `deleteProfile`.
2. Tests in `service.integration.test.ts`, with fake timers:
   - **New proof.** A `deleteProfile` started before `setDeletionDelegate` does not throw "not ready"; it completes once the delegate is set.
   - **Guard.** With no delegate, at the bound it rejects with "deletion coordinator not ready". No tombstone is written, and the row is still present.

**Validation gate**
- Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/wallet/services/profile/ src/wallet/services/profile-deletion/`.
- Pass: exit 0. The new proof fails against the base copy of `profile/service.ts`.
- Layers: lint, typecheck, unit.

#### Phase 2.3: dead generations and joined clears

1. Reshape `profileLifecycles` and its four readers (clear, provision, the op guard, the orphan sweep) as the Architecture section states; update their comments.
2. Tests in `incarnation-fence.test.ts`:
   - **New proof.** After deleting G1, a clear of G2 with no provision in between does not throw. **Guard:** a clear of G1 over `live(G2)` still refuses (`:133-146`).
   - **New proof.** After deleting G1, then provisioning and deleting G2, a provision of G1 is refused. **Guard:** a provision of G3 is admitted.
   - **New proof.** Two clears of one generation started together erase once (one registry dispose, one directory removal), and both resolve. **Guard:** a failed erase leaves `deleting(gen)`, and its retry succeeds.
   - **Guard.** An op captured under a dead generation is refused. An op captured under a successor with no provision falls through to the missing-key path (`:223`). The orphan sweep skips a profile with only dead generations.

**Validation gate**
- Commands: `bun run lint`; `bun run typecheck:all`; `bun run test:all`.
- Pass: exit 0. The three new proofs fail against the base copy of `pxe/service.ts`.
- Layers: lint, typecheck, unit.

#### Arc 2 boundary gate

- Commands:
  - `bun run audit:vue`; `bun run test:all`.
  - `cd apps/extension && bun run test:e2e -- tests/e2e/security-reset.test.ts tests/e2e/passkey-paths.test.ts tests/e2e/duplicate-phrase-import.test.ts tests/e2e/sw-resilience.test.ts --retry=0`, and the same with `NULO_E2E_BROWSER=firefox`.
  - After a free host is confirmed, on Chrome and then with `NULO_E2E_BROWSER=firefox`: `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_RETRY=0 bun run e2e:agent tests/e2e/network/profile-reimport-matrix.test.ts tests/e2e/network/firefox-background-restart.test.ts`.
  - The same pair of browsers with `NULO_E2E_PROVERLESS=1` for `tests/e2e/network/backup-restore-sw-restart.test.ts`.
- Pass: every command exits 0; a file the browser skips by design (`CHROME_ONLY`, `skipIf`) counts as passing.
- Layers: lint, typecheck, unit, build, smoke e2e and network e2e on both browsers. The same-id re-import race is timing-bound in a browser, so the unit tests carry its proof; the e2e runs guard the deletion and restart paths on both browsers.
- Then the arc's Codex loop.

### Arc 3: unlock, credentials, bearer

**Warning:** build nothing in this arc until all three hold:
1. Page 7 carries the owner's signed message.
2. Hold H2 has its recorded answer.
3. backup-import-export arc 3 has merged (`ImportFullBackupForm.vue`, `export/full.vue`).

Re-read the page's answers first: a changed record replaces the proposal quoted here, and a struck veto item is not built.

#### Phase 3.1: #24 (P7-01)

1. Approved: comment on #24 with the decision text, its date and the SECURITY.md citation, then close it as not planned. No code.
2. Changed: record it in STATUS.md, leave #24 open under H2, and continue with phase 3.2.

**Validation gate**
- Commands: `gh issue view 24 --repo nulo-sh/nulo --json state,stateReason,comments`.
- Pass: approved → `CLOSED`, `NOT_PLANNED`, the comment present; changed → `OPEN` with the hold recorded.
- Layers: none (tracker).

#### Phase 3.2: the unlock toast (#137, P7-02)

1. Add the final rung to `handleUnlockError`.
2. `auth.test.ts`:
   - **New proof.** A password unlock that rejects with an unlisted error shows `{ label: "Something went wrong", sub: "Try unlocking again." }` and stops the spinner.
   - **Guard**, one case each: an `InvalidPasswordError`, a `UserRejectedError`, a `BootstrapFailedError`, a lost-race `UnlockTimeoutError` and a passkey failure never show this toast.
3. `auth-flows.test.ts`: drive the unlisted failure through a tampered profile row (the pattern at `imported-account-lifecycle.test.ts:120`); assert the toast by its text (the `waitForToast` exception); capture the screenshot for the PR.

**Validation gate**
- Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/popup/pages/auth.test.ts`; `cd apps/extension && bun run test:e2e -- tests/e2e/auth-flows.test.ts --retry=0` and the same with `NULO_E2E_BROWSER=firefox`.
- Pass: exit 0 on both browsers.
- Layers: lint, typecheck, unit, smoke e2e on Chrome and Firefox.

#### Phase 3.3: the split reveal (#208, P7-03)

1. Split the flag in `change-password.vue`.
2. `change-password.test.ts`:
   - **New proof.** The current-password eye never unmasks the new pair, and the new-password eye never unmasks the current field.
   - **Guard.** Each eye unmasks its own field or fields.
3. Capture the before and after screenshots.

**Validation gate**
- Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/popup/pages/settings/security/`; `cd apps/extension && bun run test:e2e -- tests/e2e/security.test.ts --retry=0` and the same with `NULO_E2E_BROWSER=firefox`.
- Pass: exit 0 on both browsers.
- Layers: lint, typecheck, unit, smoke e2e on Chrome and Firefox.

#### Phase 3.4: backup autocomplete (#208, P7-04)

**Warning:** skip this phase if the owner struck P7-04; then comment the strike on #208.

1. Add the two attributes.
2. Add one component assertion per field class. **New proof:** the decrypt field reads `current-password`, and both export fields read `new-password`.

**Validation gate**
- Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/components/composite/import/ src/popup/pages/settings/security/export/`.
- Pass: exit 0.
- Layers: lint, typecheck, unit.

#### Arc 3 boundary gate

- Commands:
  - `bun run audit:vue`.
  - `cd apps/extension && bun run test:e2e -- tests/e2e/auth-flows.test.ts tests/e2e/security.test.ts tests/e2e/passkey-backup.test.ts --retry=0`, and the same with `NULO_E2E_BROWSER=firefox`.
  - After a free host is confirmed: `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_RETRY=0 bun run e2e:agent tests/e2e/network/backup-restore-integrity.test.ts`.
- Pass: every command exits 0.
- Layers: lint, typecheck, unit, build, smoke e2e on both browsers, network e2e on Chrome.
- Then the arc's Codex loop.

### Arc 4: the Ready handshake

**Warning:** build nothing in this arc until OA-4 has the owner's recorded answer. With A, build nothing: comment the answer on #157 and close it after arc 2 merges. With B or C, build as below, wiring `isBackgroundConnected` and the reconnect boot as the answer says.

#### Phase 4.1: base evidence

1. On the base build, kill the background with no extension page open, then open the popup. Record what fails and where it is observable. The app's own `console.*` never reaches Puppeteer (`tests/e2e/fixtures/extension.ts:248-262`), so observe the browser's "Unchecked runtime.lastError" entries or the logger buffer (I3).
2. List every `onConnected` and `onDisconnected` subscriber and say whether a first `onConnected` that now arrives a task later changes what it does.
3. Write both to `lessons/phase-4.md`.

**Validation gate**
- Commands: none beyond the recorded evidence.
- Pass: `lessons/phase-4.md` names the observation, each subscriber, and whether phase 4.3's e2e can fail on the base.
- Layers: none (evidence).

#### Phase 4.2: wire, server, client

1. Build the Architecture section's arc 4, including the send-boundary hook in `core/base-client.ts`.
2. Teach `port-registry.ts` and `transport-harness.ts` to answer Ready.
3. Tests in `client.test.ts`, with fake timers where timing matters:
   - **New proof.** A request made while `Connecting` is not posted before Ready. **Guard:** it is posted once after Ready and resolves.
   - **New proof.** Two pre-Ready refusals in a row reject nothing. **Guard:** the request resolves after the third port's Ready.
   - **New proof.** A port change between Ready and a queued request's continuation (the fake drops the port inside the Ready handler) makes the request wait for the next port's Ready and post once, there.
   - **Guard.** A subscriber that reconnects in `onConnected` drops a request that had already posted: it rejects with "Client disconnected" and was posted exactly once.
   - **New proof.** An explicit `disconnect()` between Ready and a request's continuation rejects the request and opens no port. **Guard:** a later request reopens normally.
   - **New proof.** A request whose deadline passes while it waits is never posted when a late Ready arrives. **Guard:** it rejects with the timeout error.
   - **New proof.** `onConnected` does not fire on a bare connect, and fires only after every queued request has posted. **Guard:** it fires once per Ready, and twice for a duplicated Ready only if the port changed.
   - **New proof.** An explicit `disconnect()`, or a dropped port, between Ready and the scheduled `onConnected` task fires no `onConnected`. **Guard:** with nothing in between, it fires once.
   - **New proof.** A Ready or an event from a stale port is not acted on, and that port is closed.
   - **New proof.** Pre-Ready closes space the reconnects, a Ready resets the spacing, and an explicit `disconnect()` cancels a pending reconnect.
   - **Guard.** A request posted on a `Connected` port that then drops is not posted again; it rejects with "Client disconnected".
4. Tests in `service.test.ts`:
   - **New proof.** A trusted port gets Ready only after init.
   - **New proof.** When init fails, the port gets no Ready and is `disconnect()`ed.
5. Under B only, `GlobalLoader.test.ts`: **new proof**, with no Ready and the boot outcome set, the loader is not rendered and the banner is reachable; **guard**, with no Ready and no outcome, the loader shows.

**Validation gate**
- Commands: `bun run lint`; `bun run typecheck:all`; `bun run test:all`; `bun run test`.
- Pass: exit 0. Each new proof fails against the base copies.
- Layers: lint, typecheck, unit (every package).

#### Phase 4.3: the restart e2e

1. Add a case to `sw-resilience.test.ts`, shaped by the phase 4.1 evidence. Stop the background with no extension page open, then open the popup.
   - **New proof.** No browser-emitted "Unchecked runtime.lastError" entry and no logger-buffer transport failure appears during the start-up.
   - **Guard.** The screen the OA-4 answer names appears, and an unlock then reaches the general page.
2. If phase 4.1 shows the failure is not observable on the base build, keep the case as a guard and record that the unit tests carry the proof.

**Validation gate**
- Commands: `cd apps/extension && bun run test:e2e -- tests/e2e/sw-resilience.test.ts --retry=0`, and the same with `NULO_E2E_BROWSER=firefox`.
- Pass: exit 0 on both browsers.
- Layers: smoke e2e on Chrome and Firefox.

#### Arc 4 boundary gate

- Commands:
  - `bun run audit:vue`; `bun run test:all`.
  - `cd apps/extension && bun run test:e2e -- --retry=0` (full smoke), and the same with `NULO_E2E_BROWSER=firefox`.
  - After a free host is confirmed, on Chrome and then with `NULO_E2E_BROWSER=firefox`: `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_RETRY=0 bun run e2e:agent tests/e2e/network/connect-locked-queue-sw-restart.test.ts tests/e2e/network/cold-wake-discovery.test.ts tests/e2e/network/firefox-background-restart.test.ts`.
  - The same pair of browsers with `NULO_E2E_PROVERLESS=1` for `tests/e2e/network/backup-restore-sw-restart.test.ts tests/e2e/network/inflight-call-background-death.test.ts`.
- Pass: every command exits 0; a file the browser skips by design counts as passing.
- Layers: lint, typecheck, unit, build, smoke e2e and network e2e on both browsers.
- Then the arc's Codex loop, then the final cross-arc pass.

## UI impact

- **Profile create, passkey, retry after "Passkey not confirmed. Try again."** (popup `profile/new.vue` and onboarding `create.vue`; #159). Before: the retry opens the browser's create-a-passkey prompt and saves a second passkey. After: it opens the browser's sign-in prompt for the passkey already saved, as the passkey window's Try again does. The card, the toast and the button keep their words. A retry after a no-PRF failure or a name change stays as today. Recorded decision: no-ask #159 ("Mirror the passkey window's saved-credential confirmation on retry").
- **Profile create in the popup when activation fails or wedges** (#100): none. The button keeps reading "Creating…", as today, and a slow start-up still lands on General. One race changes: when another popup opens another profile during the create, this page no longer loads the new profile's accounts over the other session and routes to General; it stays on "Creating…" as a failed create does. That is the issue's fix, not a new screen. OWNER-ASKS OA-1.
- **Create account landing on an imported account's address** (#99): none. The row is replaced, as today. OWNER-ASKS OA-2.
- **ConfirmPopup** (#158): none. The deleted button never rendered.
- **Account RPCs** (#198) and **arc 2**: none.
- **Unlock screen after a background restart under strict mode** (#24, P7-01): none, by the page's proposal: "No recovery bearer: under strict mode a background restart asks for your password again, as SECURITY.md documents, and an import it interrupts lands on the unlock screen as today. #24 closes as not planned with that line; lenient mode stays the opt-in convenience."
- **Unlock screen, password profile, unlisted failure** (#137, P7-02): "The spinner stops and a toast reads "Something went wrong" with the line "Try unlocking again.""
- **Settings → Security → Change password** (#208, P7-03): "The current-password field gets its own show/hide eye; the new password and its confirmation share the second one. Both eyes stay out of the Tab path (SR8)."
- **Backup password fields** (#208, P7-04, veto list): "The backup decrypt field gets autocomplete=current-password and the export encrypt pair new-password, as every other credential field has." No visible change; a password manager reads the fields differently.
- **Start-up loader, "unreachable" banner and reconnect after a background restart** (arc 4): exactly as the OA-4 answer says; nothing ships before it.

Sign-off: arc 1's one visible change rides the recorded no-ask decision for #159. Arc 3 ships only on page 7's signed message, and arc 4 only on the OA-4 answer, each quoted in its PR body. Arc 3's PR attaches screenshots of the unlock toast and the Change password eyes; arc 4's attaches the start-up screens it changes (CLAUDE.md § UI changes).

## Decision ledger

**Outlines compared.**
- *Outline A (chosen):* the fixes above. A per-address check and write; the existing activation wait with a deadline that only a wedged start-up reaches; a saved credential on the create request; an `invoke` override; the invisible transport fixes and the deletion fence now; the Ready handshake on the owner's answer.
- *Outline B (competing, cheapest-first):* re-check the account row after each write and undo a lost race; keep the activation poll and add an id check and a deadline; retry the confirmation inside one `handleCreate` call with no saved state across clicks; register one `onConnect` listener at the worker's module scope that buffers ports and messages until the services exist, with no wire change; leave `deleteProfile` throwing and let callers retry.
- *Why A:* B's undo is a second racing write. B's poll is the bare poll the lane brief rules out. B's in-call retry changes what the person sees (a second prompt with no click). B's buffering still has to hold messages and leaves `lastError` and refused ports alone. B's caller retry does not help the resume and torn-reap paths, which run after start; those fail on the PXE generation, which arc 2 fixes (Opus corrected the first draft's reason here).

### Orchestrator decisions (on approval, 2026-10-10)

- **D-orch-1. No stack.** Arc 1 opens its own PR against `dev` (`gh pr create --base dev`) with the Delivery table's title; no `gh stack`. Later arcs branch from arc 1's branch and rebase onto `dev` after it lands. This replaces the Delivery section's `gh stack init` / `gh stack add` / `gh stack submit` steps for arc 1.
- **D-orch-2. Arc 1 only.** Nothing of arcs 2, 3 or 4 is built now: arc 2 waits on reservation R4 (fees-and-sponsors #91); arc 3 on decision page 7 and hold H2; arc 4 on OA-4, which is now page 7's item P7-08 (OA-1 to OA-3 are P7-05 to P7-07, and each ships its "what ships now" form in arc 1). Nothing a screen shows changes beyond § UI impact; no new words.
- **D-orch-3. R2-1 is asked first.** Before phase 1.1's gate counts as passed, the first Codex round and the Opus review are each asked, first and explicitly, whether R2-1's schedule is reachable on the merged tree (a create from a second window, a restore that activates the profile early, an import that reconciles later). Reachable: build the fix (the row lock across the purge, or an equivalent that keeps lock order 1) with a never-happens test. Unreachable: record the evidence below and keep the plan. Result: both unreachable (Audit verdicts, "R2-1 asked first").

### Audit verdicts

**Round 1, Codex** (`gpt-6.1-sol`, high): `reject (with blocking findings: unsafe imported-key cleanup, unfenced activation tail, Ready-to-send race, unsupported session-isolation claim, overlapping erasures)`.

| # | Finding | Disposition |
|---|---|---|
| C1 [High] | Create's write does not take the row lock, so a parked rename can write an imported row back after its key is deleted | **Accepted.** #99 moved to a per-address check and write under the row lock |
| C2 [High] | #100 fences the wait, not the tail's awaits | **Accepted.** Identity re-check after each await, as `auth.vue` does |
| C3 [High] | Ready is not bound to the send; a reconnect in `onConnected` or an explicit disconnect in the continuation gap can post on an unacknowledged port | **Accepted** into arc 4: send-boundary hook, explicit-disconnect epoch |
| C4 [High] | "Every call carries `profileId`" is false; queued calls can act under a successor session | **Accepted as a fact correction.** Session binding of every call **rejected**: a queued call gains no authority a fresh call would not have. The claim is rewritten (Arc 4, Queued calls), and the unchecked account reads and edits are filed separately |
| C5 [High] | Two same-generation clears can overlap and erase a successor | **Accepted.** Join an in-flight clear; re-check ownership after the barrier. The trigger needs a duplicate clear, which no known path sends while the id is reserved; the join removes the dependency anyway |
| C6 [Medium] | Dead-generation no-op contradicts the pinned refusal | **Accepted.** Explicit precedence: join, refuse a different current, dead no-op, erase |
| C7 [Medium] | `isBackgroundConnected` drives reconnect boot and screens; I3 cannot say "none" | **Accepted.** The Ready handshake moved to arc 4 behind OA-4 |
| C8 [Medium] | The L1 probe has no total bound; a shared lock queues import behind it | **Accepted.** Moot under the per-address design: the probe runs in create's type section, outside the row lock |
| C9 [Medium] | The `invoke` override must pass `backup`/`restore` and test optional args | **Accepted** |
| C10 [Low] | Not every never-happens test fails on base; the `rg` gate's exit code | **Accepted.** Each test is labelled new proof or guard; the gate is `! rg -q` |
| — | Make R4's "#91 first" unconditional | **Rejected.** R4 is the orchestrator's text; arc 2's seam stays out of the coordinator either way |

**Round 1, Opus 5.5 Plan agent**: `conditional approve (with conditions: resolve #1 before arc 2a is built; fix #2–#8 in plan.md before their phases run)`.

| # | Finding | Disposition |
|---|---|---|
| O1 [High] | Arc 2a changes the loader and the "unreachable" banner timing | **Accepted.** Same move as C7: arc 4 behind OA-4; the backoff waits with it |
| O2 [Medium] | Two of the gates' network files need `NULO_E2E_PROVERLESS=1` (a third, in arc 4, also does) | **Accepted** (F17); gates split |
| O3 [Medium] | Dead-generation precedence; the orphan sweep is a fourth reader | **Accepted** |
| O4 [Medium] | The `invoke` override would refuse `restore`; call with original params; stale comment | **Accepted** |
| O5 [Medium] | A 30 s deadline regresses slow start-ups; copy `auth.vue`'s re-checks | **Accepted.** The re-checks; the revised draft's 120 s deadline was later narrowed to the start (final pass F4) |
| O6 [Medium] | A renamed profile would unlock through a passkey labelled with the old name; the interceptor must keep `prf` without `results` | **Accepted** |
| O7 [Medium] | The app's console never reaches Puppeteer | **Accepted** into arc 4's evidence phase |
| O8 [Medium] | The queued-call claim is false | **Accepted.** Same as C4 |
| O9 [Low] | Disconnect must cancel backoff and reject the Ready promise; ordering of `onConnected` against queued requests | **Accepted** into arc 4 |
| O10 [Low] | Label guards | **Accepted.** Same as C10 |
| O11 [Low] | A failed key delete should log, not throw; import holds the DEK behind create's probe | **Accepted.** The second is moot under the per-address design |
| O12 [Low] | 2b need not wait on 2a | **Accepted** in effect: the old 2a no longer exists, and arc 2 carries no owner question |

**Final fresh pass, Codex** (`gpt-6.1-sol`, high, new session): `reject (with blocking findings: stale account undo and reconciliation can delete a successful replacement; activation remains incompletely fenced; OA-4 promises failure behavior the handshake does not implement)`. Its "looks fine" list: `contains(id)`, the type-then-row lock order, the #159 binding, the PXE precedence, the #198 override, the gates.

| # | Finding | Disposition |
|---|---|---|
| F1 [High] | Import's post-write `unwrite` deletes a create's replacement row | **Accepted.** `unwrite` deletes only a row whose `type` and `index` are still its writer's. Its other half, making import's key compensation respect ownership, **rejected**: only imports write key rows, they serialise per (profile, chain), and the `catch` runs inside that section |
| F2 [High] | Create's key cleanup makes `reconcileImportedAccounts` purge and delete a healthy derived row | **Accepted.** Candidates are chosen, and the delete re-checked, from a fresh read under the row lock |
| F3 [High] | The tail's `storageLocalSet` await is unfenced; the post-wait check must be explicit | **Accepted** |
| F4 [Medium] | 120 s does not mean wedged: the bootstrap is a sequence of RPCs | **Accepted.** The deadline now covers only the start; I1 rewritten and checked in phase 1.2 |
| F5 [High] | Under OA-4 B a never-Ready service keeps the loader over the banner for good; the 1.5 s baseline is misstated | **Accepted.** Under B the loader gives way to the boot banner; OA-4's baseline corrected; a component test added |
| F6 [Medium] | The deferred `onConnected` can fire after an explicit disconnect | **Accepted.** It captures the port generation and the epoch |
| F7 [Medium] | The reconnect-subscriber guard contradicts the posting order | **Accepted.** The guard asserts rejection and one post; the port change before the continuation has its own test |

**Final pass, round 2** (same session, resumed with the fix diff): `reject (with blocking findings: reconciliation still allows a stale dependent purge after a successful replacement)`. F1 and F3-F7 resolved; F2 resolved for the account row.

| # | Finding | Disposition |
|---|---|---|
| R2-1 [High] | A genuinely keyless candidate that a create replaces after selection still has the derived account's new dependents purged; fix by holding the row lock across the dependent purge | **Rejected.** The schedule needs a create on the restored profile while the restore reconciles it. The full-backup import reconciles before it opens that profile's session (`useFullBackupImport.ts:388-399`), and create and import refuse a profile without one (`session-manager.ts:248-252`). Only a direct RPC call reaches it, from a page that can already delete those records outright. Holding a row lock across subscriber purges would break the rule that a row-lock holder awaits storage only. The plan now says the purge is not fenced, and why |
| R2-2 [Medium] | The reconcile "new proof" passes on base | **Accepted.** It is now a guard (it fails only if the key cleanup ships without the reconcile change); the new proof starts from a keyless row and fails on base, whose delete pass deletes the derived row |

The planner closes the panel here. Codex is advisory. Its one open finding is rejected on evidence above, and the orchestrator sees the disagreement in the report.

**R2-1 asked first (arc 1, D-orch-3), on the merged tree (`9574a9d` + the plan).** Both legs were asked only this question first, with three schedules to break: a create from a second window, a restore that activates the profile early, an import that reconciles later.

- **Codex** (`gpt-6.1-sol`, high, new session `01a12394-69f4-7bf3-8f41-121e759cf705`): `UNREACHABLE, high confidence through the existing non-hostile application paths`.
- **Opus 5.5** (general-purpose, read-only): `UNREACHABLE, high confidence, for any path a person can take through the UI or a dApp`.

Evidence both legs found, each checked by the implementer in the tree:
- `SessionManager.open` has one call site, inside `openSessionVerified` (`profile/service.ts:1324`). Every unlock, create and import reaches it there, and it refuses a profile whose restore-pending marker matches its generation (`:1286-1289`). Bearer rehydration after a worker restart (`:466-478`) refuses a torn restore too, and passkey sessions never rehydrate. So the planner's "every session open goes through `openSessionVerified`" was overbroad, but the conclusion holds.
- The marker is written before the row, under the facade lock (`:1432-1439`). If the marker write fails, no row is written. A corrupt marker counts as torn. A stale marker is one whose generation differs from the row's, and a new restore always mints a fresh generation.
- Neither restore branch opens a session. Restored ids are never a live profile's id (`:2329-2332`, `:2489`).
- The only caller is `useFullBackupImport.ts:398`, before `finalizeRestore` (`:413`). Retry re-runs only the account-state stage. No boot step, resume or migration reconciles.
- Create, `ensureDefaultAccount` and `provisionDefaultAccount` need the profile's secret, and import needs its DEK. Both are refused unless that profile holds the session (`session-manager.ts:248-265`).

The residual is a direct `reconcileImportedAccounts` RPC on a profile that already has a session. Only an extension page can send it, never a dApp, and that page can delete those records outright. Both legs agree that holding the row lock across the subscribers would break lock order 1: they take their own service locks (`token-balance/service.ts:571-587`, `auth-registry/service.ts:511-526`). **Disposition: the plan stands; no fix is built.**

Opus's phase 1.1 notes:
- **Accepted.** Name the reconcile guard's pause point. It parks after the listing (`storage.get()`) and before the key read, the only point where the hazard exists. The test title says so.
- **Rejected.** "`unwrite` throws a parse error on a row the codec cannot decode." `EntityStorage.get` returns `undefined` for an undecodable or invalid row (`packages/wallet-core/src/storage/entity_storage.ts:98-143`), so `unwrite` reads the row as not its own and deletes nothing.

## Delivery

One `gh stack` on trunk `dev`. Arc 1 is the worktree branch itself (`gh stack init --adopt worktree-account-session-life --base dev`).

| Layer | Branch | Phases | Stacks on | `/code-review` | PR title (≤ 93 chars) | Closes |
|---|---|---|---|---|---|---|
| 1 | `worktree-account-session-life` | 1.1-1.5 | `dev` | off | `fix(account): lock per address, identity-checked profile activation, passkey retry confirms` | #99, #100, #159, #198, #158 |
| 2 | `account-session-life-arc-2` | 2.1-2.3 | arc 1 | off | `fix(profile): deletion waits for its coordinator, the pxe fence keeps dead generations` | none (`Part of #157`) |
| 3 | `account-session-life-arc-3` | 3.1-3.4 | arc 2 | off | `fix(auth): say when an unlock fails, reveal the current password on its own` | #137, #208 (#24 closes by comment) |
| 4 | `account-session-life-arc-4` | 4.1-4.3 | arc 3 | off | `fix(messaging): ports connect on the background's ready, calls wait for it` | #157 |
| 5 | `account-session-life-close-out` | close-out | the top built arc | n/a | `docs(plans): close account-session-life` | none |

- Gated arcs: arc 2 follows #91 under R4 if both are ready together. Arc 3 follows page 7, H2 and backup-import-export arc 3. Arc 4 follows OA-4.
- When a higher arc's gate opens before a lower one, the orchestrator may reorder the unmerged layers. They share no file, except that arcs 2 and 4 both edit `packages/extension-messaging/src/background/client.ts` and `service.ts`, and arc 4 builds on arc 2's edits.
- Arc 1 and backup-import-export arc 3 both edit `apps/extension/src/wallet/services/account/service.ts` and `spec.ts`, in different functions (create, import, `unwrite`, `reconcileImportedAccounts`, `invoke` and the params schemas here; the reseal path there). Whichever lands second rebases and re-runs `src/wallet/services/account/`; if the other added or changed an account RPC, it adds that method's schema, which the surface pin (schema keys equal `rpcMethods`) demands.
- An arc that is not built drops out of the stack, and the close-out goes on the top built arc.
- Open each PR without labels. Afterwards, add `e2e:extension-network` or `e2e:extension-smoke` only when the path filter would skip a suite the change needs. Arcs 2 and 4 need both suites; arcs 1 and 3 need smoke. Check what the filter picked before adding a label.
- PR body: what changed and why, the validation run with its outcomes, the `Closes` lines. Arc 3's and arc 4's bodies quote the owner's recorded answer and attach the screenshots.
- Merging is the orchestrator's call, in stack order.

## Post-implementation

`code_review: off`, so no `/code-review` runs.

1. **Codex audit, per arc, at the arc boundary** (before `gh stack add` opens the next arc), while that arc is the stack tip. Run `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol` with:
   - the arc's diff;
   - this plan and its decision ledger;
   - the arc map: "this is arc N of 4; later arcs build: 2 the transport and deletion fence, 3 page 7's surfaces, 4 the Ready handshake";
   - the adversarial ask: "What could go wrong? What would an attacker target? What are we trusting that we shouldn't?";
   - these two rules, verbatim:
     - *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."*
     - *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*
2. **Fix loop.**
   1. Verify each finding against the repo first.
   2. Apply the accepted fixes and commit.
   3. Log the round (the consult and its verdict) in `lessons/phase-N.md`.
   4. Resume the same session (`resume-codex.sh`) with the fix diff.
   5. Repeat until a round yields no new material finding.

   **Warning:** hard stop at three rounds. If a finding is still material after round three, stop and report `ARC_FAILED` with the open findings.
3. **Final cross-arc pass** after the last built arc: a fresh Codex session over the net diff from `643c0c9`, asking for cross-arc issues (seams between arcs, duplication across arcs, drift from this plan), with the same two rules and the same loop.
4. **Delivery** per the Delivery section. This is the first time any PR opens.
   1. Run `gh stack sync` if `dev` moved.
   2. Run `gh stack submit --auto`, then `gh pr edit` each body.
   3. Watch checks with `gh pr checks <n> --watch`.
5. **Close-out**, as the stack's docs-only top layer (`gh stack add account-session-life-close-out`). First merge `origin/dev` in and read what changed in `implementations-plan/index.md` and `lessons.md`; another lane may have landed. Never use a union merge.
   1. Write an `## Outcome` block directly after the front matter: the date; the status; what shipped, with PR numbers; what was dropped, rejected or superseded, with a disposition line each; an `Open items:` line; one line that retires this plan's `/goal` and `/loop` seeds.
   2. Promote the generalizable gotchas to `implementations-plan/lessons.md`, one line each with a link to the archived detail. Deduplicate, retire what a new line supersedes, date tool versions, and stay under 8 KiB.
   3. File every open item in its home (table below). Dedupe first (`gh issue list --state all --search "<words>"`). An issue body has five sections: `## What happens`, `## Where`, `## Impact`, `## Possible fix`, `## Record`. Known candidates: the unchecked account reads and edits, and `confirmProfileOperation` without a caller. Comment on any lane issue whose fix was left out or did not hold, with the reason, and leave it open.
   4. Run `git mv implementations-plan/account-session-life implementations-plan/archive/account-session-life` in its own commit. Repair the links the extra directory level breaks, and move the index line to `implementations-plan/archive/index.md`. Delete `STATUS.md` in the close-out commit.
   5. Report and wait: merging is the orchestrator's call.

   | Situation | Home |
   |---|---|
   | Work inside the implementation you are on | this `plan.md` and the PR |
   | Actionable work that outlives the plan: a bug, a gap, a missing test, a deferred refactor | a GitHub issue, with a domain label and a `Record` link to the archived plan |
   | Needs a product call, or waits on something outside the repo | an issue labelled `owner-decision` or `blocked:external` (the body names the trigger) |
   | A suspected exploitable weakness | a private draft security advisory; `plan.md` records only "tracked privately: GHSA-…" until it is published |
   | Rejected, superseded or already done | a disposition line in the Outcome block; no open item anywhere |
   | Knowledge that prevents a repeat | `implementations-plan/lessons.md` (8 KiB budget) |
   | A legal or store blank with a release deadline | `BEFORE-LAUNCH.md` |
   | Accepted code work that blocks launch | the `v1.0.0` milestone, pointed at once from `BEFORE-LAUNCH.md` |

6. **Teardown after the merge.** This step is standing authorization; do not ask first.
   - Trigger: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/account-session-life/plan.md` succeeds.
   - Run `agent-worktree done account-session-life --merged`. This session did not enter through `EnterWorktree`, so there is nothing to exit.
   - The helper refuses rather than forces. Relay a refusal and stop.
   - Who notices the merge: a `/loop` session checks on every firing. A `/goal` session arms one background wait right after its wrap-up report (`until <the check>; do sleep 300; done`, `run_in_background`, maximum timeout), and otherwise runs this step at the start of its next turn.

## Seeds

Not run by this planner (orchestrator-owned). Drafts:

```
/goal Arcs 1 and 2 of implementations-plan/account-session-life/plan.md are marked ✓ in plan.md, each phase ✓ backed by its validation gate reported passing in the transcript, each phase's LESSONS_FILE=implementations-plan/account-session-life/lessons/phase-N.md printed; /code-review was NOT run (code_review: off); the Codex fix loop converged for each built arc and for the final cross-arc pass, each convergence quoted from a resumed Codex pass reporting no new material findings; the stack exists on GitHub with PRs opened only after the loops converged (gh stack view in the transcript); arcs 3 and 4 are built only if STATUS.md records their gates (page 7, hold H2 and backup-import-export arc 3; OA-4) as cleared; `bun run test` and `bun run lint` both report exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/account-session-life forward. Never idle waiting for input. Each firing: 1. Reality check: read plan.md, STATUS.md and lessons/ (the authority, not the chat), including the Outcome & Quality Bar; on a stack read them from the top layer. If plan.md is gone from the live path, check `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/account-session-life/plan.md`: success → run `agent-worktree done account-session-life --merged`, report, clear this loop and stop; failure → babysit delivery only. 2. Waiting on CI is fine; confirm it progresses. 3. No task in hand → take the next pending step of plan.md; after each edit run `bun run lint` and the phase's unit command; commit; push with `gh stack push`. Never run network e2e while another lane holds the host before #169 merges. 4. Stuck or facing a decision → consult `/codex high` on gpt-6.1-sol, log it in lessons/phase-N.md; anything a person would see goes to OWNER-ASKS.md, never decided here. 5. Same step failed 3 times → stop and report ARC_FAILED. 6. Phase green = its validation gate passes; mark ✓, write lessons, advance; at an arc boundary run the arc's Codex loop first, then `gh stack add`. Arc 3 waits for page 7, hold H2 and backup-import-export arc 3; arc 4 waits for OA-4. 7. All buildable arcs ✓ → final cross-arc pass, Delivery, close-out per plan.md; report and stop: merging is the orchestrator's call.
```

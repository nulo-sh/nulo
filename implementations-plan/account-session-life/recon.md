# Recon: account-session-life

Base: `origin/dev` at `643c0c9` (carries backup-import-export arcs 1 and 1b). Three read-only explorers (Sonnet) plus the planner's own reading. Every issue claim below was checked against the tree; the verdict column says where a claim did not hold.

## Reuse map

| Capability the lane needs | Existing code | Verdict |
|---|---|---|
| One critical section for account create and import | `KeyedLock` (`packages/wallet-core/src/utils/keyed-lock.ts`); the account service's `tupleLocks` + `serializePerTuple` (`apps/extension/src/wallet/services/account/service.ts:364-367`) | **adapt**: keep `tupleLocks`, change the key so create and import share one per (profile, chain). A new lock instance would not serialise against `createAccount`. |
| Concurrency test for the account service | `account/serialize-per-tuple.test.ts` (rejection-isolation, `collectUnhandledRejections`), `account/service.test.ts` (mocks `@nulo/wallet-crypto` + `@nulo/aztec-runtime/account`), `storage-write-log` `recordWrites` | **reuse-as-is** |
| Bounded, identity-checked activation wait | `awaitProfileActivation` + `UnlockTimeoutError` + `BootstrapFailedError` (`apps/extension/src/composables/unlockWait.ts:33`), its test `unlockWait.test.ts` | **reuse-as-is**. `waitForProfileActive.ts` is the older sibling (no failure join); do not add a third. |
| Confirm a created-but-unconfirmed passkey | `PasskeyUnconfirmedError` (`wallet/utils/passkey-errors.ts:18`), `confirmCreatedCredential` (`wallet/utils/passkey-ceremony.ts:148`), the window's `unconfirmed` ref (`popup/windows/passkey/index.vue:36,76-88`) and its test | **reuse-as-is** for the primitives; **adapt** `createPasskeyProfileWithRetry` + `useProfileCreateFlow` + `runPasskeyCeremony` to carry the saved credential |
| Page-level WebAuthn interception in e2e | `refuseNextStep` (`tests/e2e/fixtures/browser/chrome-webauthn.ts:76`, Firefox twin `fixtures/browser/firefox.ts:560`), `refusePasskeyStep` / `registerPasskeyProfile` (`fixtures/passkey.ts`), `passkey-retry.test.ts` | **adapt**: a sibling interceptor that withholds the create's PRF and refuses one confirmation |
| Param schemas on an internal RPC service | `validateParams` (`packages/extension-messaging/src/zod-helpers.ts`), `NetworkMethodSchemas` (`network/spec.ts:186-222`), `OperationJournalMethodSchemas` | **adapt**: an `AccountMethodSchemas` map; the refusal type is `InvalidWalletArgumentsError` (the decided INVALID_PARAMS), not `ValidationError` |
| RPC-boundary seam for validation | `BaseService.invoke` (`packages/extension-messaging/src/core/base-service.ts`, protected, runs only for `rpcMethods`) | **reuse-as-is** (override in `AccountService`) |
| Port transport readiness | `BaseServiceClient.request` already awaits `ensureTransportReady()` within the request deadline (`core/base-client.ts:110-123, 280-300`); `PortRegistry` / `FakePort` / `transport-harness` (`packages/extension-messaging/src/testing/`) | **adapt**: the background client returns a Ready promise while a port is not yet acknowledged |
| Server-side port accept | `Service.onConnect` (`packages/extension-messaging/src/background/service.ts:38-53`), `awaitInitialized` (`core/initialization.ts`) | **adapt**: post Ready after init; close refused ports |
| Background kill in e2e | `stopBackground` (`tests/e2e/fixtures/browser/index.ts:158`), `readLivenessBaseline`, `waitForWorkerLiveness`, `unlockAfterBackgroundDeath` (`fixtures/helpers.ts`), `sw-resilience.test.ts` | **reuse-as-is** |
| PXE incarnation fence | `profileLifecycles` + `clearProfileState` + `provisionChainStoreKey` + `assertGenerationCurrent` (`packages/aztec-runtime/src/pxe/service.ts:171-186, 748-846, 900-912`), `incarnation-fence.test.ts` (`makeService()`) | **adapt**: a per-profile set of dead generations |
| Deletion delegate | `setDeletionDelegate` (`profile/service.ts:1250`), `deleteProfile` (`:1454`), `ProfileDeletionCoordinator.start` (`profile-deletion/coordinator.ts`), delegate stubs in `service.integration.test.ts:245,273,2027+` | **adapt**: `deleteProfile` waits, bounded, for the delegate |
| Generic error toast | `openToast({ kind: "error", label: "Something went wrong" })` hand-written in about ten popups; `ToastOptions.sub` (`packages/design/src/composables/toast.ts:15-20`) | **reuse-as-is** (no shared constant exists; the arc-3 toast writes the literal like its siblings) |
| Password reveal | `PasswordVisibilityToggle.vue` (`components/composite/`), `expectMaskToggle` in `change-password.test.ts` | **reuse-as-is** |

**Build new, with justification:** the dead-generation set (nothing tracks more than one generation per profile today); the Ready envelope (no popup-to-background acknowledgement exists; the only Ready is offscreen-to-background, `wallet/utils/offscreen.ts:285`, a different transport); the e2e interceptor that withholds PRF on create (no fixture can drive "created but not confirmed": the virtual authenticators return PRF results on create).

## Issue claims checked

| Issue | Claim | Verdict and evidence |
|---|---|---|
| #99 | Create and import take different tuple locks and both write `accountRowIdOf(account)` | **HOLDS, line numbers moved.** Key `${profileId}:${chainId}:${type}` (`service.ts:366`); create, `ensureDefaultAccount`, `provisionDefaultAccount` lock `Nulo_v1` (`:225,:240,:263`), import locks `Imported` (`:522`). Create's write `:327`, import's `:554`. Import's only duplicate check is `:524`; **create has none at all**, so even sequentially a create that derives an address already held by an imported row replaces that row and leaves its sealed key row behind. The race is real: an account exported from a same-phrase install and imported here has the address a later create derives (`nulo-account.ts:67-85`: the address is a pure function of the signing key). |
| #100 | The popup spins until any login flag is set, no identity check or deadline | **HOLDS.** `new-profile-helpers.ts:25-27` polls `appStore.isLogined` every 100 ms forever; no id check, no failure join. Caller `profile/new.vue:71`. `handleCreate` leaves its latch set when `onCreated` throws (`useProfileCreateFlow.ts`, pinned by `useProfileCreateFlow.test.ts:219`). |
| #159 | The in-page retry runs a new create and saves a second passkey | **HOLDS.** `create-passkey-profile.ts` mints a new id and runs `create` on every attempt; the `PasskeyUnconfirmedError` (with `credentialId`, `userHandle`) is dropped by `reportCreateFailure`. The window keeps it (`windows/passkey/index.vue:36,80`). Hosts: `popup/pages/profile/new.vue` and `onboarding/pages/create.vue`, both through `useProfileCreateFlow`. No e2e drives the unconfirmed case; `passkey-retry.test.ts` refuses the create prompt itself, which mints nothing. |
| #157 (a) | The client reports Connected as soon as connect returns a port | **HOLDS** (`background/client.ts:75-77`); no acknowledgement exists. "Calls in a respawn gap fail fast" is **PARTLY**: calls already posted reject on `onDisconnect`; a call posted on a doomed port waits for that disconnect. The server's `onConnect` listeners register only inside `registerServices` (`wallet/runtime.ts:254,478`), after awaited boot steps, so a port opened during a cold wake can meet no listener (inferred from MV3 dispatch rules; verify on the base SHA before claiming a red). |
| #157 (b) | `onDisconnect` never reads `lastError` | **HOLDS** (`client.ts:94-97`; repo-wide grep finds no reader in `packages/extension-messaging`). |
| #157 (c) | Refused ports stay open | **HOLDS** (title): an untrusted sender's port is logged and left open (`background/service.ts:45-48`); it is never `disconnect()`ed. |
| #157 (d) | `deleteProfile` throws before the coordinator wires its delegate | **HOLDS** (`profile/service.ts:1455-1457`, "deletion coordinator not ready"); the coordinator is the last start phase. No test pins it. |
| #157 (e) | A crash between a same-id re-import and provisioning blocks deleting that profile until offscreen restarts | **HOLDS, and no crash is needed.** State `deleted(G1)`; the re-imported row carries G2; `clearProfileState(id, G2)` throws "generation mismatch" (`pxe/service.ts:752-759`); every boot's resume retries and fails the same way, since a background restart does not reset the offscreen map. A second, unclaimed hole: after `deleted(G2)` replaces `deleted(G1)`, a stale G1 provision is admitted again (`:829-846` checks only the one retained generation). |
| #24 | Strict mode has no restart bearer | **HOLDS** as a description; SECURITY.md § Session secret item 5 already documents the lock screen after a background death. Page 7 (P7-01) proposes building nothing. |
| #137 | An unlisted password-unlock failure stops the spinner with no message | **HOLDS** (`auth.vue:116-150`: the ladder toasts only `isPasskeyAttempt`). |
| #208 | Backup decrypt field and export pair lack `autocomplete`; Change password reveals all three from one flag | **HOLDS.** `ImportFullBackupForm.vue:111` (decrypt, none), `export/full.vue:665,679` (none), `change-password.vue:124-186` (one `isPasswordType` flag; the repeat field has no eye and follows it). |
| #158 | Nothing sets `cacheStore.confirm.passkeyConfirmation` | **HOLDS.** No writer in `src`; readers only in `ConfirmPopup.vue:41-53,122-130`. `confirmProfileOperation`'s only UI caller is that branch; the service method keeps its integration tests (`service.integration.test.ts:378-389,1155-1163`). |
| #198 | Account RPC params are unvalidated; a missing `profileId` ends in a native TypeError | **HOLDS.** `account/spec.ts` has storage schemas only; `rowMatchesKey`'s comment documents the TypeError. Network and operation-journal are the only services with param schemas. |

## Conventions to match

- Locks: `KeyedLock({ maxHoldMs: null })` for holds across slow awaits; under a row lock, await storage only (`service.ts:362-363`). Deletion fence: capture before the first await, `assertCurrent` with no await before the write, `isCurrent` after the post-write liveness read.
- Waits: typed errors branched by `instanceof`; one `watch` for every signal; tests with a `reactive` store and fake timers (`unlockWait.test.ts`).
- Passkey tests: hoisted `ceremony = { run, confirm }` mock of `@/wallet/utils/passkey-ceremony` (`windows/passkey/index.test.ts:19-23`), a `dismissed()` `NotAllowedError` helper.
- Messaging tests: `PortRegistry` / `FakePort` (`remoteClose`, `hold`, `answerHeld`), `transport-harness` (`emitPortDisconnect`, `connectServiceClient`).
- e2e: select by `data-testid` only; passkey tests keep the `setupPasskeyVirtualAuth` anchor page open; Firefox cannot stop its event page while an extension page is open (`FIREFOX.md`; `CHROME_ONLY` in `fixtures/browser/index.ts`).
- Composition tests: account create and import call poseidon and address derivation, so they are bb-bound (D6 in `tests/COMPOSITION-TESTS.md`) and stay unit tests with the module mocks `service.test.ts` uses. The lane map's "composition tests" for arc 1 do not apply; no arc-1 surface qualifies.

## Collisions and dedup risks

- **backup-import-export** edits `account/service.ts`, `profile/service.ts`, `ImportFullBackupForm.vue` and `export/full.vue` (its arcs 2 and 3); arc 3 of this lane follows its arc 3 on the two Vue files. `restore()` writes account rows under `restoreLock` only, not the tuple key; it targets a freshly remapped profile id, so it cannot meet a create or import of a live profile. Left to that lane.
- **fees-and-sponsors arc 2 (#91)** appends a fee-map purge to the deletion funnel (`ProfileDeletionCoordinator.purge`, reached by regular delete, resume and torn reap). Reservation R4: one lane at a time, #91 first. This lane's deletion change stays out of `coordinator.ts` and out of the tombstone shape: it edits `deleteProfile`'s delegate read (`profile/service.ts:1455-1457`) and the PXE fence (`pxe/service.ts`).
- **forms-and-contacts (#225)** touches `export/full.vue` after this lane (file-overlap sequence: backup, session, forms).
- `change-password.vue`, `auth.vue`, `ConfirmPopup.vue`, `useProfileCreateFlow.ts`, `new-profile-helpers.ts`, `packages/extension-messaging/src/background/*`: no other lane in the program map names them.
- The reuse sweep's line "account create and import are already serialized" is wrong: they lock different keys (checked by the planner at `service.ts:366,522`).

## Open work read

`gh pr list --state open`: #248 (incoming-transfers arc 1) only. `e2e-harness-gaps` arc 1a (#169, gate G1) is being built: until it merges, network e2e runs one lane at a time on this host.

## Search trail for absence claims

- No Ready envelope on the popup port: `rg -n "Ready|READY|handshake|isConnected|connectionState" packages/extension-messaging/src/background` (only offscreen hits elsewhere).
- No `lastError` reader in messaging: `rg -n "lastError" packages/extension-messaging/src`.
- No writer of `passkeyConfirmation`: `rg -n "passkeyConfirmation" apps/extension/src apps/extension/tests`.
- No e2e of an unconfirmed create: `rg -n "Unconfirmed|unconfirmed" apps/extension/tests/e2e` (only the failed-send journal state).
- No params schema in account: `rg -n "MethodSchemas|validateParams" apps/extension/src/wallet/services` (network, operation-journal only).

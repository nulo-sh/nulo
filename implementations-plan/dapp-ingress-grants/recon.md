# Recon: dapp-ingress-grants

Base: `origin/dev` at `ac259a7`. Two read-only Explore agents (a batched reuse sweep, a session-lifecycle mapper) plus the driver's own reads. Every issue claim was checked against this tree; § Claims records where one did not hold.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Validate a stored grant | `packages/wallet-bridge/src/capability-negotiation.ts:246` `projectStoredGrants` (re-projects each record through `projectKnownCapability`, `:229`; a malformed record refuses the whole read with a fixed `ValidationError`; an unknown type passes untouched). Pinned by `packages/wallet-bridge/src/stored-grants.test.ts`. Already used at `dispatcher.ts:740`, `:950`, `capability-negotiation.ts:334`. | **reuse-as-is**; export it from the `@nulo/wallet-bridge` index (it is not exported today) |
| Grant readers still raw | `dapp-session/service.ts:37`, `:307`, `:365`, `:382`; `wallet-sdk/queued-journal.ts:106`; `wallet-bridge/src/dispatcher.ts:405` | **adapt** (read through the projection) |
| Grant writer | `dapp-session/service.ts:318` `setCapabilityGrants` stores caller grants unvalidated; `applyCapabilityDecision` (`:357`) takes `grantRecords` already projected by `mergeGrantsAndRejections` → `collectNewGrants` (`capability-negotiation.ts:480`), but the RPC is reachable from any extension page | **adapt** (project at both writers) |
| Live-channel revocation by profile | `wallet-sdk/session-revocation.ts:20` `revokeLiveSessions` | **adapt** (consult the pending marker for an unstamped channel) |
| Handshake approval marker | `wallet-sdk/pending-verification.ts:27` `PendingVerificationEntry {at, profileId, tabId, cancelled?}`, keyed by request id = session id; `isPendingVerificationDead` `:42` | **reuse-as-is** |
| Teardown wiring | `wallet-sdk/background.ts:631` `wireSessionTeardown` (private) | **adapt** (move beside `revokeLiveSessions`, export, pass the marker map) |
| Journal refusal kinds | `packages/wallet-core/src/jobs/types.ts:102` union + `:131` runtime table; `wallet-sdk/queued-journal.ts:248` `queuedFailureKind`; `dapp-interaction/service.ts:602` `settleUnclaimedAfterTermsRefusal`; copy in `apps/extension/src/utils/journal-state.ts` (`kindLabel`, `failedSubtitleFor`) | **adapt** (one new kind for the Terms; reuse `scope_refused`, `session_ended`) |
| Resolve a call's function by selector | `execution/contract-resolver.ts:65` `findFunctionBySelector`, `:96` `assertSelectorBinding`; `execution/call-decoder.ts:36` `decodeCallForDisplay`. bb-bound (COMPOSITION-TESTS.md D6) and needs a PXE | **reuse** where execution already resolved; **build new** only a thin retitle step |
| Typed dApp errors | `wallet-sdk/error-envelope.ts` (`CONSTANT_ENVELOPES` `:55`, `TooManyPendingError` `:162`); `packages/extension-messaging/src/errors.ts` `REBUILT_AS` `:518`; `execution/rpc-cancel.ts:83` `classifyOperationCatch` code channel | **adapt** (add `InvalidWalletArgumentsError`, then `TooManyPendingError`, to the channel) |
| Schema parse of dApp args | `packages/wallet-bridge/src/wallet-schema-args.ts:32` `assertWalletSchemaArgs` (pass/fail; parsed value discarded) | **adapt** (one argument-tree guard) |
| Published schema patch | `packages/wallet-sdk-schema-patch/src/apply.ts:37` `GRANT_CONTENT_SCHEMA`; pins `apply.pins.test.ts:52,65`; drift guard `isGrantAuthwitShape` `:113`; README `scripts/publish/readme/wallet-sdk-schema-patch.md`; lockstep publish `.github/workflows/publish-packages.yml` | **adapt** |
| Batch refusal set | `wallet-bridge/src/method-descriptors.ts:96,351` `refusedInBatch` / `BATCH_REFUSED_METHODS`; refusal at `dispatcher.ts:276-281` | **reuse-as-is** (pins exist) |
| Coverage of a held grant | `capability-negotiation.ts:514` `isCapabilityCovered`; `contractsRequestCovered` for the `contracts` type | **adapt** (field-aware `contractClasses`) |
| chainInfo decode | `wallet-sdk/session-established.ts:19` `chainInfoToChainId`; `packages/wallet-core/src/utils/chain-id.ts:5` `walletChainId` | **adapt** (strict reader at discovery and establishment) |
| Discover window copy and app chain | `popup/windows/discover/index.vue:143` `actionLabel`; `popup/windows/capabilities/chain-mismatch.ts:15` `resolveDappChain`; `DiscoveryParams` (`dapp-interaction/spec.ts:98`) carries no chain id | **adapt** (carry the chain id; reuse the resolver) |
| Cancelled overlay | `components/composite/DappCancelledOverlay.vue` (prop `message`, default "Connection request was cancelled") | **reuse-as-is** |
| Standby expiry | `wallet-sdk/verify-admission.ts:92` `releaseIfUnstarted` → `:175` `closeStandby` | **adapt** |
| Composition harness | `dapp-session/service.composition.test.ts` (real service + `FakeBrowserApi` + MAC key); `services/composition-harness.ts` `svc()` | **reuse** |
| Ingress test harness | `wallet-sdk/test-services.ts` `fakeSdkServices`, `test-ports.ts`, `queued-journal.fixtures.ts`, `background.refusal-teardown.test.ts` | **reuse** |
| Network e2e templates | `tests/e2e/network/scope-refusal.test.ts` (journal kind, card and detail copy), `legal-acceptance-wall.test.ts`, `connect-one-window.test.ts`, `connect-verify-mismatch.test.ts`, `session-*`, `sim-methods.test.ts`, `err-scope-and-cap.test.ts`, `meta-batch.test.ts` | **extend**, no new parallel specs where one exists |

Absence claims and their search trail:
- No zod schema for a stored grant, no second projector: searched `projectGrant|parseGrant|StoredGrant|GrantSchema|validGrants`, `capabilityGrants`, `capability\.type` over `apps` and `packages`.
- No helper maps a marker to a profile: searched `marker.profileId|pendingVerification.get|profileIdOf|profileForSession`.
- No Terms journal kind: searched `LegalAcceptanceRequired|TermsNotAccepted|TermsRequired|LegalRequired|terms_` in `jobs/types.ts` and `journal-state.ts`.
- No composition test drives the wallet-sdk ingress: `handleWalletMessage|tryCreateQueuedJournal` in every `*.composition.test.ts` returned nothing.
- No e2e for a dApp-session expiry or two profiles holding the same app at once: searched `expiry|deleteExpired|expired` under `tests/e2e`, listed `network/` for `session|revok|expir|profile|multi`.
- No typed discovery rejection upstream: `@aztec-labs/wallet-sdk` 6.0.0-rc.1 `dest/extension/handlers/internal_message_types.js` has `DISCOVERY_APPROVED` and no rejection type; `rejectDiscovery` (`background_connection_handler.js:150`) deletes the pending entry and sends nothing.

## Claims (issue by issue)

| Issue | Claim | Holds? |
|---|---|---|
| #88 | Readers at `service.ts:36`, `:303` and `queued-journal.ts:106` dereference raw `g.capability.type` | Holds. The schema is `z.custom(tolerantRecord)` (`spec.ts:93`), so any object passes. More raw reads than the issue names: `service.ts:307`, `:365`, `:382` and `dispatcher.ts:405`. `queued-journal.ts:106` is inside a catch (a malformed grant logs a warn line and skips the record); the `service.ts` reads throw a `TypeError` out of the lock. |
| #228 | An unstamped channel ends when another profile's row is deleted | Holds (`session-revocation.ts:26-27`; pinned as intended at `session-revocation.test.ts:84-94`). `deleteExpired` (`service.ts:460`, from `getDappSessions` and `addDappSession`) sees only the active profile's rows while that profile stays active (`getValues` hides rows whose MAC key cannot be derived); a switch during its enumeration can mix two profiles' rows. The plain cross-profile deletions are `purgeForProfile` and `refuseVerification` (plan F7). A reconnect (no marker) cannot be matched by profile and keeps failing closed. |
| #83 | Terms, capability and other pre-send refusals file as `popup_bound` | Holds (`queued-journal.ts:248-251`). A second producer the issue misses: `dapp-interaction/service.ts:602-611` files a Terms refusal after the window as `popup_bound`. `background.ts:1280` moved to the guard at `:1265` and the catch at `:1303-1310`. |
| #86 | A refused call is titled by the dApp's claimed name | Holds (`queued-journal.ts:187`; claim-time titles at `execution/dapp-send-executor.ts:83-89`). Resolving a selector is bb-bound and needs a PXE; the ingress has neither. |
| #123 (1-2) | Header shows the wallet's network; the waiting line still says "wants to connect" | Holds (`discover/index.vue:143`, a fixed `actionLabel`). `DiscoveryParams` carries no chain id, so the window cannot name the app's network today. Items 3 and 5 are closed on `dev` (#76, #241). |
| #124 | A standby connect window closes silently on expiry | Holds (`verify-admission.ts:92-96`, `:175-179`, `:327-329`). |
| #126 | A batched sendTx leg gets no queued record | Does **not** hold as a defect: `sendTx` is `refusedInBatch` (`method-descriptors.ts:241`), refused before any leg runs (`dispatcher.ts:276-281`, pinned by `dapp-grant.characterization.test.ts:307`). No batched send ever waits. The TODO at `background.ts:513-514` is stale. |
| #128 | executeUtility on a non-utility function gets the unclassified error | Holds in effect. The failure crosses the execution port as an `OperationResult` whose code channel (`rpc-cancel.ts:95-102`) carries no `InvalidWalletArgumentsError`, so even a typed refusal in `view-executor.ts` would arrive unclassified. Which throw fires today (`findFunctionBySelector` or `pxe.executeUtility`) is not proven without a sandbox; Phase 2.6 records it. `sim-methods.test.ts:25` accepts ok or error, and `err-scope-and-cap.test.ts` never reaches execution (no simulation grant). |
| #84 | contractClasses coverage is type-only | Holds, at `capability-negotiation.ts:536-537` and `:345-347` (lines moved from `:341-351`). |
| #87 | A batch may call requestCapabilities | Holds, and is already pinned: `dispatcher.test.ts:3470` and `dapp-grant.characterization.test.ts:307`. The wrong comment is `dispatcher.ts:274-275`. |
| #89 | `caller`/`contract` accept any string; a Buffer-shaped address throws at `String()` | Both hold. Probe on this tree: `schemas.AztecAddress` accepts `{type:"Buffer", data:[32 bytes], toString:"x"}` and `String()` of it throws. Sites: `dispatcher.ts:327`, `:540`, `:610`, `:614`, `:646`. The publish is lockstep (all three packages take one version, `publish-packages.yml` input `version`); npm holds `0.1.0`. |
| #125 | A new connection refused for the Terms leaves the wallet silent | Holds (`background.ts:811-814`). P2-07's typed refusal cannot travel: the discovery protocol has no rejection message (see absences). |
| #199 | The decoder folds non-canonical chainInfo | Holds (`session-established.ts:19-24`, `chain-id.ts:5-6`). Discovery (`background.ts:760`) decodes first; the discovery reply cannot carry an error. |
| #201 | TooManyPendingError loses -32005 across the port | Holds (`rpc-cancel.ts:95-102`; `errors.ts:514-518`; bug pin `errors.test.ts:419`, `rpc-cancel.test.ts:133-137`; the issue's `:111-115` moved). |
| #15 | Dispatch does not wait for the person's OK | Holds (`session-established.ts:146-155`; `background.ts:503-506`, `:566-578`; playground confirm `apps/playground/src/lib/wallet.ts:92-94`). The verify window already has "They match" and "They don't match" (`verify/index.vue:245,256`). |
| #127 | requestId collision check upstream | `blocked:external`; not re-verified. |

## Conventions to match

- Fixed-text refusals, never a request value in a message or log line; refusals that a dApp can repeat log at `debug` (`background.ts:1349` `isExpectedRefusal`, `execution/service.ts` `logOperationOutcome`).
- Fail closed on a malformed grant: refuse the whole read, never narrow (`projectStoredGrants` doc).
- Markers are tombstoned, never deleted, except by tab teardown and success.
- Ingress tests mock `@aztec-labs/wallet-sdk/extension/handlers` and use `fakeSdkServices`; storage-lifecycle orchestration uses the dapp-session composition harness.

## Collision risks

1. Fixtures with shapeless grants (`{capability:{type:"transaction"}}`) fail projection: `queued-journal.fixtures.ts:73`, `queued-journal.test.ts:95,234,412`, `background.connect-window.test.ts:460`, `test-services.ts:18`, `dapp-session/service.composition.test.ts:94` (`{type:"data"}` without a flag is malformed).
2. `holdsCanCreateAuthWit` runs after every grant writer (`dropConsentWithoutAuthWit`); a throwing read there aborts a write.
3. `KnownJobErrorKind` is mirrored by a compile-checked table; a new kind edits the union, the table and its doc together.
4. `revokeLiveSessions` must keep unstamp-before-terminate and per-match try/catch.
5. `journal/[id].vue` is reserved R1 for other lanes in waves 3+; arc 2 edits only `utils/journal-state.ts` copy maps, not the page.
6. `rpc-cancel.ts` is touched by arc 2 (#128) and arc 3 (#201) in sequence.

## Open work read

`gh issue list --state open` searched for grants, handshake, refusal, batch and chainInfo. Neighbours not in this lane: #157 (session-life), #196 and #198 (SR7 parse refusals, other lanes), #112 (H7 copy hold). Closed predecessors: #29 (stored grants projected at enforcement), #85, #13, #28.

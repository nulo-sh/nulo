---
plan: dapp-ingress-grants
tier: mid
status: approved (orchestrator, D-orch-1 and D-orch-2); arc 1 in progress
issues: "#15, #83, #84, #86, #87, #88, #89, #123, #124, #125, #126, #127, #128, #199, #201, #228"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); dual audit (Codex gpt-6.1-sol high + one Opus Plan agent); final fresh Codex pass
post_implementation_hardening: not scheduled
base: origin/dev ac259a7
---

# dApp ingress: grants, refusals and the app-facing contract

The dApp-facing boundary of the wallet: which stored grants a reader trusts, how a refused app call is recorded and titled, what the connect window says while it waits, which inputs an app may send, and what it gets back. Sixteen issues in four arcs. Arc 1 is decision-free and ships first. Arcs 2 and 3 are planned here in full and are built only after their decision pages are signed. Arc 4 (#15) is scoped only: if the owner approves it, it becomes its own deep-tier blueprint.

## Issue map (the arc that closes each issue)

| Issue | Arc | Decision it waits on | Closes how |
|---|---|---|---|
| #88 stored grants read raw | **arc 1** | none | `Closes #88` |
| #228 a deleted row ends another profile's unstamped handshake | **arc 1** | none | `Closes #228` |
| #83 pre-send refusals read "Popup closed early" | **arc 2** | page 2: P2-01, P2-02, P2-03 | `Closes #83` when the page also answers Ask A5; otherwise arc 2 says `Refs #83` and the close-out moves the rest to a new issue |
| #86 refused call titled by the claimed name | **arc 2** | page 2: P2-04 | `Closes #86` |
| #123 items 1-2 connect window network and waiting line | **arc 2** | page 2: P2-05 | `Closes #123` (items 3 and 5 shipped in #76 and #241) |
| #124 standby window closes silently on expiry | **arc 2** | page 2: P2-06 | `Closes #124` |
| #126 batched sendTx leg has no queued row | **arc 2** | page 2: P2-08 (premise check) | `Closes #126` as not reproducible: a pin and the stale TODO's removal |
| #128 executeUtility on a non-utility function | **arc 2** | none (no-ask, SR7) | `Closes #128` |
| #84 widen a contract-classes grant | **arc 3** | page 3: P3-01; C11; H5 | `Closes #84` |
| #87 batched requestCapabilities | **arc 3** | none (no-ask, settled) | `Closes #87` (comment fix and pin) |
| #89 grantPublicAuthwit addresses; throwing address shapes | **arc 3** | page 3: P3-02 (item 8); C11; H5. Item 9 is SR7 | `Closes #89`; the npm publish of 0.2.0 is an owner step after merge |
| #125 Terms refusal on a new connection | **arc 3** | page 2: P2-07; C11; H5 | `Closes #125` with the proposal's own fallback (see Fact F17) |
| #199 non-canonical chainInfo | **arc 3** | page 3: P3-03; C11; H5 | `Closes #199` |
| #201 -32005 on every path | **arc 3** | page 3: P3-04; C11; H5 | `Closes #201` |
| #15 hold dispatch until the emoji check | **arc 4** (scoped, not built) | page 2: P2-09; H1 | approved: moves to its own deep-tier plan and stays open there; answered no: closes as not planned (SR3) |
| #127 upstream requestId collision check | **no arc** | `blocked:external` | stays open (SR5) |

## Outcome & Quality Bar

**For whom.** Three readers. A person who uses Nulo with dApps and reads Home, History and the connect window to understand what an app asked for and why it did not happen. A dApp developer who reads the error an app call returns and must tell "I sent something wrong" from "the wallet broke". A future maintainer who must trust that every reader of a stored grant sees the same validated shape.

**What excellent looks like.**
1. Every stored-grant reader that decides something (the session service, the bridge, the queued row) and every writer reads through the one projection (`projectStoredGrants`), and a malformed grant refuses the read instead of throwing a `TypeError` or narrowing. A test proves each reader refuses and a well-formed row still works. The Settings displays stay raw (a screen; see arc 1).
2. Revocation ends exactly the channels of the profile whose row went away: a handshake approved under profile A survives the deletion of profile B's row for the same app, and a channel nobody can attribute still ends. A test proves both.
3. After the pages are signed, each refused app send says why in the page's approved words, and is titled by what it really calls or "Transaction", never by the name the app claimed. A test feeds wire-shaped records (`0x` + 64 hex fields).
4. Each change to what an app may send or receive is one fixed refusal with a fixed code, logged at `debug`, pinned by one test per refused class, with a success control for the stock SDK's own input.

**Good enough.** No new screen, no new string beyond the pages' proposals, no change to the playground beyond what its existing probe button already does, no refactor of the dispatcher beyond the named lines.

## Assumptions

### Facts (verified at `ac259a7`)

- **F1** `DappSessionSchema` accepts any object as a grant record: `capabilityGrants: z.array(z.custom(tolerantRecord))` (`apps/extension/src/wallet/services/dapp-session/spec.ts:93`).
- **F2** `projectStoredGrants` (`packages/wallet-bridge/src/capability-negotiation.ts:246`) refuses a malformed record with a fixed `ValidationError` and passes an unknown type untouched; it is not exported from the package index (`packages/wallet-bridge/src/index.ts`).
- **F3** Raw readers: `dapp-session/service.ts:37`, `:307`, `:365`, `:382`; `wallet-sdk/queued-journal.ts:106`; `wallet-bridge/src/dispatcher.ts:405`. Only `queued-journal.ts:106` sits inside a catch.
- **F4** `setCapabilityGrants` (`service.ts:318`) stores what it receives; its only production caller writes `[]` (`wallet-sdk/background.ts:1182`). `applyCapabilityDecision` receives grant records already projected by `collectNewGrants` (`capability-negotiation.ts:480-507`), but both are RPC methods any extension page can call (`dapp-session/client.ts:38,42`).
- **F5** `revokeLiveSessions` ends an unstamped channel whatever the deleted row's profile (`wallet-sdk/session-revocation.ts:26-27`); the test at `session-revocation.test.ts:84-94` pins it.
- **F6** The pending marker (`wallet-sdk/pending-verification.ts:27`) is keyed by the discovery request id, which upstream reuses as the session id, and carries the approving profile; it exists only for new connections, from `discovery-approval.ts:65` until establishment spends or tombstones it (`session-established.ts:170`).
- **F7** `DappSessionMacStorage.getValues()` hides a row whose MAC key cannot be derived (`dapp-session/mac-storage.ts:41-46`), and `SessionManager.getSecret` throws for any profile but the active one (`profile/session-manager.ts:248-253`). So, while the active profile stays the same, `deleteExpired` and `isExpired` reach only its rows. `getValues()` verifies row by row across awaits, so a profile switch during the enumeration can return rows of two profiles, and `deleteExpired` can then delete another profile's expired row. The plain cross-profile deletions are `purgeForProfile` (`service.ts:477`, raw rows) and `refuseVerification` for another profile's row (`service.ts:421`). #228's rule keys on the deleted row's profile, never on the deletion's source, so it covers all of them.
- **F8** Pre-claim refusals file as `popup_bound` (`queued-journal.ts:248-251`), and so does the Terms refusal after the window (`dapp-interaction/service.ts:602-611`). Copy: `popup_bound` reads "Popup closed early" / "The popup closed before this transaction could finish." on the detail page and "Transaction failed" on the card (`apps/extension/src/utils/journal-state.ts`, `kindLabel` and `failedSubtitleFor`). `humanizeErrorKind` renders nowhere.
- **F9** A record's card title, detail title and Method row all come from `op.title` (`popup/pages/journal/[id].vue:75,98-100`), and `OperationJournalService.setOperationMeta` rewrites a title on any record under the transition lock (`operation-journal/service.ts:407`).
- **F10** `assertSelectorBinding` holds the resolved `FunctionAbi` when it refuses (`execution/contract-resolver.ts:96-107`); the refusal travels in-process to `markFailedUnlessCancelled` (`execution/mark-failed-unless-cancelled.ts`). `WalletError.toPayload()` serializes only `code`, `message`, `details` (`packages/extension-messaging/src/errors.ts:41`).
- **F11** `sendTx`, `registerToken`, `grantPublicAuthwit` are the exact batch-refused set; `requestCapabilities` is allowed and answers as a top-level call (`dapp-grant.characterization.test.ts:307`, `dispatcher.test.ts:3470`). The comment at `dispatcher.ts:274-275` says "a popup leg is refused here", which `requestCapabilities` contradicts.
- **F12** An `executeUtility` failure reaches the dApp through `classifyOperationCatch` (`execution/rpc-cancel.ts:83`), whose code channel excludes `InvalidWalletArgumentsError` and `TooManyPendingError` (`:95-102`); anything else is rebuilt as a bare `Error` and answered with the unclassified constant (`wallet-bridge/src/dispatcher.ts:182-183`, `wallet-sdk/error-envelope.ts:219`).
- **F13** `schemas.AztecAddress` accepts `{type:"Buffer", data:[32 bytes], toString:"x"}`, and `String()` of that object throws (probe run on this tree). Coercion sites: `dispatcher.ts:327`, `:540`, `:610`, `:614`, `:646`; `GRANT_CONTENT_SCHEMA` takes `caller` and `contract` as `z.string()` (`packages/wallet-sdk-schema-patch/src/apply.ts:37-42`).
- **F14** `publish-packages.yml` publishes all three packages at one lockstep version from a `version` input, behind the `npm-publish` environment's owner approval; npm holds `0.1.0` (`npm view @nulo-sh/wallet-sdk-schema-patch versions`).
- **F15** `contractClasses` coverage is type-only (`capability-negotiation.ts:536-537`), with a rejected-type special case at `:345-347`.
- **F16** `chainInfoToChainId` folds with `Number(BigInt(…))` and `walletChainId`'s XOR `>>> 0` (`session-established.ts:19-24`, `packages/wallet-core/src/utils/chain-id.ts:5-6`); the XOR is the frozen persisted key, so two distinct valid `(chainId, version)` pairs can share an id by design. It runs at discovery inside the `try` (`background.ts:760`; the catch rejects and logs at `warn`, `:839-842`), at establishment **before** the `try` (`session-established.ts:74`, so a throw there skips termination, marker settlement and slot release), at ingress inside the catch (`background.ts:1284`), and in revocation and queued-journal behind catches.
- **F17** The discovery protocol has no rejection reply: `@aztec-labs/wallet-sdk` 6.0.0-rc.1's `rejectDiscovery` deletes the pending entry and sends nothing (`dest/extension/handlers/background_connection_handler.js:150-158`; `internal_message_types.js` has `DISCOVERY_APPROVED` only). P2-07 says "If the discovery reply cannot carry a typed refusal, it stays as today."
- **F18** The standby connect window is closed by `closeStandby` when its reservation expires (`wallet-sdk/verify-admission.ts:92-96`, `:175-179`, `:327-329`); its slot frees on the window's removal. `closeStandby` also serves two other causes: the session went away (`cancel`, `:155-158`) and an establishment that ended without a window (`releaseIfUnstarted` from `session-established.ts:172`). A `closing` reservation gets no timer (`nextWake` considers only unclaimed ones, `:363`). `DappCancelledOverlay` takes a `message` prop (`components/composite/DappCancelledOverlay.vue`).
- **F19** `DiscoveryParams` carries only `dappMetadata` (`dapp-interaction/spec.ts:98-100`); the capabilities window names the app's network through `resolveDappChain` (`popup/windows/capabilities/chain-mismatch.ts:15`).
- **F20** The verify window already has "They match" and "They don't match" (`popup/windows/verify/index.vue:245,256`); establishment resolves once the window is shown (`session-established.ts:146-155`); dispatch waits only on establishment (`background.ts:503-506`, `:566-578`).
- **F21** Network e2e retry is set by `NULO_E2E_RETRY` (`apps/extension/vitest.e2e.network.config.ts:39`); smoke takes `--retry=0`.
- **F22** No open PR exists on `nulo-sh/nulo` (`gh pr list`, 2026-10-09). #169 (gate G1) is open, so network e2e runs one lane at a time on the host.
- **F23** `failQueuedIfUnclaimed` discards `transitionIfStage`'s outcome (`queued-journal.ts:229`), and `setOperationMeta` writes a title on any record, terminal or claimed (`operation-journal/service.ts:407-425`). An error rebuilt from execution also reaches `failQueuedForError` at ingress (`background.ts:1322-1323`).
- **F24** Upstream `terminateSession` posts `SESSION_DISCONNECTED` to the tab before it deletes the session (`dest/extension/handlers/background_connection_handler.js:236-246`), so a throwing post leaves the session live; `revokeLiveSessions` catches it (`session-revocation.ts:28-37`).
- **F25** H5's issue list is #84, #87, #89, #125, #199, #201 (decisions record H5); #128 is not on it, and SR7 settles #128 as part of the already-ratified half of C11.

### Inferences (unverified; audits attack these)

- **I1** (qualified by the final pass) No production path writes a malformed grant: the dApp-facing writers project since #29, and `setCapabilityGrants`' only production caller writes `[]` (F4). An extension page could still call that RPC with anything, so the number of malformed rows on a dev install is unknown, not proven zero; pre-production installs reinstall, and enforcement already refuses such a row (`dispatcher.ts:950`). A reader that now refuses one breaks no real user.
- **I2** A stock wallet-sdk dApp never sends a non-canonical `chainInfo`, a non-string address, or an own `toString`/`valueOf` key: the SDK serializes `Fr` and `AztecAddress` as hex strings.
- **I3** The playground's `executeUtility (balance_of_public)` probe fails today at `pxe.executeUtility`, not at `findFunctionBySelector` (public functions are found in `nonDispatchPublicFunctions`). Phase 2.6 step 1 proves or refutes it before the fix.
- **I4** Keeping the standby window open on the expired overlay holds its verify slot until the person presses OK or closes it, with no timer (F18). Each such window needed the person's Allow, so an app cannot hold a slot alone; but an expired overlay left open blocks that app's next connection until it is dismissed. OWNER-ASKS item 7 surfaces this.
- **I5** (corrected by the panel) A retitle is safe only from the producer that moved the record to `failed`: a no-op transition (the record was claimed, or execution already failed it) must not retitle (F23).

### Asks (each with the working assumption the plan proceeds on)

- **A1** Arc 2 and 3 ship only what their signed page approves. Working assumption: each P2/P3 record is approved as written; a "Change" note re-plans that item before its phase starts, and an "as is" closes its issue as not planned (SR3).
- **A2** Where the `0.2.0` changelog line lives: no package changelog exists. Working assumption: a `## Changes` section in `scripts/publish/readme/wallet-sdk-schema-patch.md`, the README npm shows. Owner may name another place.
- **A3** The lockstep publish moves `@nulo-sh/wallet-crypto` and `@nulo-sh/resolve-asset` to `0.2.0` too, unchanged. Working assumption: acceptable; the owner runs the publish (it is never an agent action).
- **A4** Everything a person would notice beyond the pages' proposals is in `OWNER-ASKS.md` with the form that ships now. Working assumption: the "what ships now" form of each.
- **A5** #83 names "most failures"; the page classifies three (Terms, capability, session ended). Working assumption: the others keep `popup_bound` until the owner answers OWNER-ASKS item 1.

## Architecture & Implementation

### Arc 1: grant readers and handshake stamps (decision-free)

**#88, one projection for every reader and writer.**
- Export `projectStoredGrants` from `packages/wallet-bridge/src/index.ts` (the extension already imports `coversAnyContract` and `readConsent` from there).
- `dapp-session/service.ts`:
  - `holdsCanCreateAuthWit(grants: GrantedCapabilityRecord[])` takes projected grants; its callers project once.
  - `setAuthorizationsWithoutAsking`: on the On branch only, project once and use the result for both the `canCreateAuthWit` check and `coversAnyContract`. Off reads no grant and keeps its documented "Off always succeeds" (`service.ts:297-300`), so a malformed row can always be switched off.
  - `applyCapabilityDecision`: project the held grants once (the `requiresGrant` check and the replace filter read the projection), project `decision.grantRecords` (the writer validates whatever page called it), store the projected list.
  - `setCapabilityGrants`: store `projectStoredGrants(grants)`; a malformed record throws `ValidationError` before any write.
  - `getCapabilityGrants` (an RPC no page calls today) returns the projection.
  - A malformed held grant makes every grant writer refuse with the fixed `ValidationError("Malformed capability")`, as enforcement already does (`dispatcher.ts:950`): fail closed, never narrow. Disconnecting deletes the row without reading grants, but the Settings list and detail that offer it render grants raw (`settings/connected-apps/index.vue:32`, `[id].vue:81`), so a grant with no `capability` could break that page. Existing malformed rows: no production path writes one, but they remain possible (I1: an extension page could have called the setter), and adding reader validation rewrites none of them. Enforcement already refuses such a row; the page is a screen, so it stays as is and the close-out files it as an `owner-decision` issue.
- `wallet-sdk/queued-journal.ts:106`: a helper `holdsTransactionGrant(records)` projects and answers `false` on a `ValidationError`, so a malformed grant skips the queued row the way a missing grant does, logged at `debug` with a fixed text (no warn line per message).
- `wallet-bridge/src/dispatcher.ts:405`: read `projectStoredGrants(dappSession.capabilityGrants)`. Enforcement has already projected by then, so this only removes the last raw read in the bridge.
- Out of scope, recorded: the popup's display readers (`settings/connected-apps/*.vue`, `GrantedCapabilitiesList.vue`, `CapabilityDetailPanel.vue`) read raw. Changing them can change a screen. After this arc no writer can store a malformed grant, but a row written before it is not rewritten, so these displays can still meet one (the `owner-decision` issue above). "Every reader" in this plan means every reader that decides (the session service, the bridge, the queued row), not these displays.
- What changes for an app or a person, stated plainly (the lane brief names #88 and #228 for this arc and asks for their never-happens tests, which are these behaviours): a stored grant no writer can produce now refuses a grant write with a fixed error instead of a `TypeError`, and skips the queued row with a `debug` line instead of a `warn` line. No screen, string or app-facing error changes for any row a writer can produce.

**#228, attribute an unstamped handshake by its approval marker.**
- `revokeLiveSessions` deps gain `pendingVerification: ReadonlyMap<string, PendingVerificationEntry>`. Rule for one matching channel (same origin, same decoded chain):
  1. Stamped to another profile → keep (unchanged).
  2. Stamped to this profile → end (unchanged).
  3. Unstamped, with a live marker (`!isPendingVerificationDead`) whose `profileId` is another profile and whose `tabId` is the channel's own tab → keep. The marker is keyed by an id the page chose (#127), so the tab check stops a colliding id from shielding a channel in another tab. Its own establishment validates it against its own row and terminates on any mismatch (`session-established.ts:97-112`).
  4. Unstamped otherwise (no marker: a reconnect or debris; a dead marker; a marker of this profile) → end (unchanged, fail closed).
- When rule 4 ends a channel whose marker belongs to that channel's own tab, it tombstones the marker (`cancelPendingVerification`) before it terminates; a marker from another tab is left alone, so a colliding id never abandons another tab's approval. Establishment rechecks at its second liveness gate, just before the stamp (`session-established.ts:134`), that the map still holds the very marker object it captured at `:79` and that it is not dead. A reused id that replaced the entry therefore reads as a dead approval, never as the old live one. On that mismatch the old callback retires without touching anything the id now names: it does not terminate (termination and liveness work by id, so it would end the replacement's channel), and its `finally` settles the marker only while the map still holds the captured object (`settlePendingVerification` at `session-established.ts:170` acts on the current entry). The captured reservation object is safe to release: the gate ignores a reservation it no longer holds (`verify-admission.ts`, `released`). A termination that throws (F24) then still cannot be followed by a stamp: an establishment that read the row before the deletion finds its marker dead and terminates instead.
- Residual, unchanged and recorded: a marker-less reconnect whose termination throws can still be stamped by an establishment already past its row read. It is the same seam today; it is not #228's. If the implementer reproduces it, the close-out files it as an issue.
- Residual, unchanged and recorded (arc 1 Codex round 1, C3): termination by id runs the worker's id-keyed cleanup (`onSessionTerminated` → `admission.onSessionGone` → the `released` hook tombstones whatever marker holds the id), so ending a channel whose id another tab reused for a newer attempt also ends that attempt. It needs a page to reuse its own request id across two tabs, so it harms only that page; the fix is upstream's request-id collision check (#127). Revocation itself never tombstones another tab's marker. The close-out files it as an issue that references #127.
- Move `wireSessionTeardown` from `background.ts:631-658` into `session-revocation.ts`, exported, taking the marker map; `background.ts` passes `state.pendingVerification`. The move lets a composition test drive the real wiring.
- Unchanged: unstamp-before-terminate, the per-match try/catch, the profile-switch teardown (`profile-switch-teardown.ts`), which still ends unstamped channels on a switch.
- What an app notices: a handshake approved under profile A is no longer cut when profile B's row for the same app is deleted. That disconnect was the bug #228 reports; the lane brief asks for exactly this never-happens test.

**Arc 1 file map.** Modified: `packages/wallet-bridge/src/index.ts`, `packages/wallet-bridge/src/dispatcher.ts`, `apps/extension/src/wallet/services/dapp-session/service.ts`, `apps/extension/src/wallet/services/wallet-sdk/queued-journal.ts`, `apps/extension/src/wallet/services/wallet-sdk/session-revocation.ts`, `apps/extension/src/wallet/services/wallet-sdk/session-established.ts`, `apps/extension/src/wallet/services/wallet-sdk/background.ts`. Tests modified: `session-established.test.ts`, `dapp-session/service.test.ts`, `dapp-session/service.composition.test.ts` (its `{type:"data"}` fixture is malformed and becomes `{type:"data", addressBook:true}`), `wallet-sdk/queued-journal.test.ts`, `queued-journal.fixtures.ts`, `test-services.ts`, `background.connect-window.test.ts` (shapeless grant fixtures), `session-revocation.test.ts`. Added: `apps/extension/src/wallet/services/wallet-sdk/session-revocation.composition.test.ts`.

### Arc 2: refusal rows, titles, connect-window lines, batched rows (after page 2)

**#83, a kind per refusal.**
- `packages/wallet-core/src/jobs/types.ts`: add `terms_refused` to `KnownJobErrorKind`, its runtime table and the producers doc.
- `queuedFailureKind`: `TermsAcceptanceRequiredError` → `terms_refused`; `CapabilityNotGrantedError` → `scope_refused` (P2-02); `SessionEndedError` → `session_ended` (P2-03); `ScopeViolationError` and `InvalidWalletArgumentsError` as today; the rest `popup_bound` (A5). Widen `failQueuedIfUnclaimed`'s `Extract`.
- `dapp-interaction/service.ts:602-611`: the post-window Terms settle files `terms_refused`.
- `utils/journal-state.ts`: `kindLabel` gains `terms_refused` → label "Terms not accepted", context "Accept Nulo's Terms to let apps send. Nothing was sent."; `failedSubtitleFor` gains `terms_refused` → "Terms not accepted". Copy is P2-01's, verbatim. The page file `journal/[id].vue` (reservation R1) is not edited.

**#86, title a refused call by what it calls.**
- Definition used: a record "refused" is one failed by `failQueuedForError` before any claim (every cause: Terms, a missing permission, a scope refused by name, a locked wallet, an unserved chain, too many waiting sends, no usable account), by the post-window Terms settle, by a call-binding refusal at execution, or by an unresolvable selector.
- Title provenance is explicit, never read from message text: `SelectorBindingPolicy` gains `titlesRow: boolean`, true for `CALL_BINDING` and `NAMED_CALL_BINDING` (the outer call), false for `AUTHWIT_CALL_BINDING` (an authwit's inner call, `authwit-discoverer.ts:183`, `execution/service.ts:1069`). Under a titling policy, `assertSelectorBinding` attaches an in-process `refusalTitle` to both of its throws: the name mismatch (`ScopeViolationError`, title = the resolved `FunctionAbi.name`) and the unresolvable selector (`Error("Method not found")`, `contract-resolver.ts:101-103`, title = "Transaction", P2-04's fallback). Kinds, messages and copy stay. The authwit inner lookup's own "Method not found" (`authwit-discoverer.ts:146-148`, by name, not through the helper) carries no title, so its row keeps its claimed title. The field is never in `message`, `details` or `toPayload()` (F10), so no dApp receives it.
- The new title rides the failing write itself, through every production hop: `markFailedUnlessCancelled` reads `refusalTitle` and passes it; the executor port's `markJournal` (`dapp-send-executor.ts:120`), the service adapter (`execution/service.ts:449`) and `ExecutionLane.markJournal` (`execution-lane.ts:538`) forward it; the lane's `transitionOperation` and the ingress `transitionIfStage` write it in the same locked write as the `failed` stage. A transition that is refused or is a no-op (a terminal record, a stage outside `allowedStages`, a touched record) writes no title (F23). Two writes would leave the claimed title in place if the worker died between them, and a separate retitle could rename a record another producer already failed. `markFailedUnlessCancelled` still returns `markJournal`'s own promise (its pin, `mark-failed-unless-cancelled.test.ts:44`). So an ingress `failQueuedForError` that runs after execution already failed the record writes nothing, and an approved row that fails later keeps its title. Ingress refusals have no resolution, so they read "Transaction" (OWNER-ASKS item 2 records this consequence). Approved and sent rows are untouched.

**#123 items 1-2, name the app's network.**
- `DiscoveryParams` gains `chainId: string`; `handleDiscovery` passes the chain id it already decoded (`background.ts:760`).
- The discover window resolves the name with `resolveDappChain` (imported from `../capabilities/chain-mismatch`) and passes `actionLabel` = before Allow `wants to connect on <name>`, after Allow (`isLoading` after a successful `resolveInteraction`) `Connecting on <name>`. `DappStatusStrip` keeps the wallet's network.

**#124, say why the standby window ends.**
- Only the expiry path changes: the gate's `serve` calls a new `WindowReservation.expire()` for an expired unclaimed reservation, and `cancel` and `releaseIfUnstarted` keep closing the window as today (a session that went away or an establishment that failed is not an expiry, F18). `expire()` on a standby reservation navigates the window to its own discover URL plus `&expired=1` instead of closing it, and moves the reservation to `closing`, so a late establishment cannot claim the window (`claimStandby` refuses) and opens no second one. The reservation does not know that URL today: the discovery popup's result carries only `windowId` (`background.ts:1040`). The interaction service builds the URL itself (`dapp-interaction/service.ts:487`), so it returns that URL beside the window id it owns, never a value the page answered, and `attach` (`:1057`) stores it. Expiry also tombstones the marker through a new `expired(id)` hook: today the `released` hook does it (`background.ts:307-308`), and a held slot would otherwise leave the approval live for up to 90 s after it expired. That is a hash change in the same document, so the mounted page stays and shows `DappCancelledOverlay` with `message="Connection request expired"` over itself, as P2-06 says ("the existing cancelled overlay"). OK closes the window, and its removal frees the slot as today. A failed navigation closes the window (today's behaviour). Expiry of a still-queued request has no window and changes nothing. If the browser reloads the page instead (to be proven on both browsers), the overlay still shows, over an empty page: OWNER-ASKS item 3.
- The reservation needs the window port's `navigate`; it is injected the way `closeWindow` is (`background.ts:304-309`).
- The expired window keeps its slot until it is closed, with no timer (I4). The slot is never freed while the window remains: freeing it would let a window outlive its slot, which the gate treats as an invariant. Whether the overlay should also close by itself is OWNER-ASKS item 7; what ships now is the page's proposal, "OK closes it".

**#126, the premise check.**
- No batched send can wait: `sendTx` is refused in a batch before any leg runs (F11). Rewrite the comment at `background.ts:508-514` to say so and delete the `TODO(queued-visibility-for-batch)`. A background-level test pins that a batch with a `sendTx` leg creates no queued record and answers the batch refusal.

**#128, refuse a non-utility function with INVALID_PARAMS (SR7).**
- `execution/view-executor.ts` `executeAztecExecuteUtility`: after `assertSelectorBinding`, refuse `fn.functionType !== FunctionType.UTILITY` with `InvalidWalletArgumentsError.forMethod("executeUtility")`, before `pxe.executeUtility`.
- `execution/rpc-cancel.ts`: `InvalidWalletArgumentsError` joins the code channel (its message is fixed by `forMethod`, so it is lossless); `execution/service.ts` `logOperationOutcome` logs it at `debug`.
- The playground and its probe button do not change.

**Arc 2 file map.** Modified: `packages/wallet-core/src/jobs/types.ts`, `apps/extension/src/wallet/services/wallet-sdk/queued-journal.ts`, `wallet-sdk/background.ts`, `wallet-sdk/verify-admission.ts`, `dapp-interaction/service.ts`, `dapp-interaction/spec.ts`, `apps/extension/src/utils/journal-state.ts`, `packages/extension-messaging/src/errors.ts` (`ScopeViolationError` field), `execution/contract-resolver.ts`, `execution/mark-failed-unless-cancelled.ts`, `execution/view-executor.ts`, `execution/rpc-cancel.ts`, `execution/service.ts`, `execution/dapp-send-executor.ts`, `execution/execution-lane.ts` (the `title` hops), `operation-journal/service.ts` (`transitionOperation` and `transitionIfStage` title), `popup/windows/discover/index.vue`. Tests: `queued-journal.test.ts`, `operation-journal/service.test.ts`, `execution/service.composition.test.ts`, `packages/wallet-core/src/jobs/error.test.ts`, `journal-state*.test.ts`, `dapp-interaction/service.test.ts`, `mark-failed-unless-cancelled.test.ts`, `contract-resolver.test.ts`, `view-executor.test.ts`, `rpc-cancel.test.ts`, `verify-admission.test.ts`, `background.connect-window.test.ts`, `popup/windows/discover/index.test.ts`; e2e `tests/e2e/network/legal-acceptance-wall.test.ts`, `scope-refusal.test.ts`, `connect-one-window.test.ts`, `sim-methods.test.ts`, `session-tabClose.test.ts`.

### Arc 3: the app-facing contract (after pages 2 and 3, C11; hold H5)

- **#87**: rewrite `dispatcher.ts:274-275` to name `BATCH_REFUSED_METHODS` and state that a batched `requestCapabilities` answers as a top-level one. Add one test that a batched `requestCapabilities` asking for an ungranted type reaches the interaction runner once (the connect window). The behaviour does not change.
- **#201**: `TooManyPendingError` joins `REBUILT_AS` (`errors.ts`) and the code channel (`rpc-cancel.ts`); the two bug pins (`errors.test.ts:419`, `rpc-cancel.test.ts:133-137`) flip to assert the class and `-32005`.
- **#89 item 8**: `GRANT_CONTENT_SCHEMA.caller` and `.contract` use `schemas.AztecAddress`. Update `apply.pins.test.ts:52,65`. `isGrantAuthwitShape` also requires `caller` and `contract` to be `schemas.AztecAddress` by identity: `patchOrVerifyEntry` keeps an existing compatible entry (`apply.ts:77-84`), so a key-presence check alone would let an existing loose entry (`caller: z.string()`) survive the patch. A loose entry now throws the drift error. The wallet's own parse uses a private copy patched from the one source (`wallet-schema-args.ts:13-15`), so this guards npm consumers, not the wallet. The published README gains the changes line (A2). The workspace `package.json` version stays; the publish input sets `0.2.0` (owner step).
- **#89 item 9 (SR7)**: `assertWalletSchemaArgs` refuses any argument holding an object with an own `toString` key, with `InvalidWalletArgumentsError.forMethod(method)`. Wire args come from `JSON.parse`, so a value is data, never a function: an own `toString` makes `String()` and a template literal throw, while an own `valueOf` alone falls back to the inherited `toString` and cannot, so `valueOf` is not refused (refusing it would only add false positives on map keys named after Noir functions). The walk is iterative (no recursion on hostile depth), uses `Object.keys` so a child under an own `__proto__` key is visited, covers only the slice the parse reads, and runs before the `requestCapabilities` branch. One place covers every later `String()`, template literal and `fromStringUnsafe`.
  - Residual, recorded: a Buffer-shaped address with no own `toString` passes the upstream schema and becomes `"[object Object]"` at `dispatcher.ts:540`, `:610`, `:614`, `:646`. It fails closed but unclassified; the close-out files it as an issue.
- **#199**: `chainInfoToChainId` becomes strict. Each field is parsed with the upstream `schemas.Fr.parse`, which is synchronous (probe on this tree), as P3-03 says; then the wallet's own bounds apply: not above `2^53`, and `chainId` not above `2^32 - 1`. Either failure throws `InvalidWalletArgumentsError`. No second field-element check is written. A canonical value yields the same chain id as today; the XOR fold stays (F16).
  - Establishment: the decode moves inside the `try`, so a refusal terminates, tombstones the marker and releases the slot like every other failed exit.
  - Discovery and establishment: each catch logs an `InvalidWalletArgumentsError` at `debug` (SR7) and every other failure as today (`background.ts:839-842`, `session-established.ts:159`).
  - Effects by site: discovery rejects (no reply, F17; OWNER-ASKS item 4), establishment terminates, ingress answers `-32602`, revocation and the queued row skip.
  - Claim, narrowed: this removes the aliasing a malformed `chainInfo` causes. It does not make the chain id unique: distinct valid pairs still share an id through the frozen XOR, and a `version` above `2^32` still truncates, as P3-03's bounds allow.
- **#84**: `isCapabilityCovered` gains `contractClassesRequestCovered`, per grant as enforcement reads it (`method-scope-checkers.ts:95`, `some(c => c.canGetMetadata && inAddressList(id, c.classes))`): a request is covered when every requested class is covered by one held grant that also holds each requested flag, never by a union of classes from one grant and flags from another. Delete the rejected-type special case at `:345-347`. A widening follows the `contracts` type's replace rule.
- **#125**: no code change is possible under P2-07 (F17). Extend the existing pin (`background.admission.test.ts:319-329`, no popup opens) to assert no row and no marker. #125 closes on the proposal's fallback; OWNER-ASKS item 5 offers an upstream ask.

**C11 mapping (option A: each narrowing approved on its own, a 0.x minor, a changelog line).**

| Change | Approval | Release vehicle | Changelog line |
|---|---|---|---|
| #84 class widening asks again | P3-01 | extension 0.x minor (`feat` squash subject) | its own conventional line in the squash body |
| #89 item 8 address schemas | P3-02 | extension 0.x minor and `@nulo-sh/wallet-sdk-schema-patch` 0.2.0 | squash body line; README `## Changes` line (A2) |
| #89 item 9 throwing shapes | SR7 (ratified half) | extension 0.x minor | squash body line |
| #199 strict chainInfo | P3-03 | extension 0.x minor | squash body line |
| #201 -32005 everywhere | P3-04 | extension 0.x minor | squash body line |
| #125 Terms refusal on discovery | P2-07 (fallback: no change) | none | none |

release-please reads extra conventional commits written in a squash commit's body as their own entries; the implementer confirms that against `.github/release-please-config.json` before the PR opens, and if it does not hold, splits arc 3 into one PR per approval. #128 (arc 2) brings `executeUtility` into SR7, the ratified half of C11: a fix to the existing contract, not a new narrowing, so it has no H5 gate (F25) and no minor of its own. Arc 2's squash body carries its own `fix(dapp)` line for it, so it still gets a changelog entry.

**Arc 3 file map.** Modified: `packages/wallet-bridge/src/dispatcher.ts`, `packages/wallet-bridge/src/wallet-schema-args.ts`, `packages/wallet-bridge/src/capability-negotiation.ts`, `packages/extension-messaging/src/errors.ts`, `apps/extension/src/wallet/services/execution/rpc-cancel.ts`, `packages/wallet-sdk-schema-patch/src/apply.ts`, `scripts/publish/readme/wallet-sdk-schema-patch.md`, `apps/extension/src/wallet/services/wallet-sdk/session-established.ts`, `apps/extension/src/wallet/services/wallet-sdk/background.ts` (the discovery catch's log level). Tests: `dispatcher.test.ts`, `wallet-schema-args.test.ts`, `capability-negotiation*.test.ts` / `dispatcher.test.ts` coverage pins, `errors.test.ts`, `rpc-cancel.test.ts`, `apply.test.ts`, `apply.pins.test.ts`, `session-established.test.ts`, `background.admission.test.ts`; e2e `cap-widening.test.ts`.

### Arc 4: dispatch held until the emoji check (scope only; #15)

Built only through its own deep-tier blueprint, after P2-09 is approved and H1 lifts. Its scope, for that plan to start from:
- **Surfaces**: the verify window (`popup/windows/verify/index.vue`), the connect window it replaces after Allow, the standalone reconnect window, and the app side: a stock dApp's calls wait while the check is open.
- **Protocol-model options**:
  - **M1, hold in the wallet** (P2-09's proposal): establishment resolves `true` only on "They match"; a check that is not needed (trusted reconnect) resolves as today; "They don't match" ends the session as today; closing the window answers nothing, so held calls wait until the session ends. Needs the security-ui-1 Phase 3.3 report path: the verify page reports "They match" keyed by its window id; the reservation gains the session id, hash and window id and a confirmed mark.
  - **M2, refuse while held**: answer calls that arrive before "They match" with a typed refusal the app retries. A new refusal is a C11 contract change.
  - **M3, keep today's model**: the dApp's own confirm is the gate; #15 closes as not planned (SR3).
- **Tests that would prove the hold** (both browsers): a call sent while the check is open never reaches the dispatcher, and after "They match" runs in arrival order; "They don't match" drops held calls and ends the session; closing the window keeps them held; a trusted reconnect dispatches at once; a lock or a profile switch while held ends the session and drops the calls; two checks for one app hold independently; the anti-lost-tx rule (`concurrent-sendtx.test.ts`) still gives every held `sendTx` its queued row on arrival.

### Trade-offs and alternatives not taken

- **#88, validate in the schema codec instead of at readers.** A strict `capabilityGrants` codec hides the whole row when one grant is malformed, which silently disconnects the app instead of refusing a grant write. Rejected: the projection is the established single source (#29), and the codec's tolerance is documented on purpose (`spec.ts:72-75`).
- **#228, make revocation profile-exact for every unstamped channel by reading the active profile.** A reconnect has no marker, and the active profile can change mid-handshake. Rejected: it would weaken the fail-closed rule; only the marker proves who approved.
- **#86, resolve the selector at ingress through `decodeCallsForDisplay`.** It would title ingress refusals precisely, but puts a PXE call on every refused send that a dApp can trigger. Rejected for this arc; OWNER-ASKS item 2 lets the owner ask for it.
- **#124, release the slot at expiry while the overlay stays.** It frees the origin's budget sooner but lets a window outlive its slot, which `VerifyAdmissionGate` treats as an invariant. Rejected.
- **#89 item 9, fix each `String()` site.** Five sites today, more tomorrow (template literals, `fromStringUnsafe`). Rejected for the one guard at the parse, which SR7 names.
- **#199, a hand-written canonical check instead of `schemas.Fr`.** First chosen on the belief that the schema parse is asynchronous; the final pass showed `schemas.Fr.parse` is synchronous, so the plan reuses it and writes only the bounds.
- **Regrouping SR7 no-asks (#128, #89 item 9) into arc 1.** Faster, but arc 1 would then change what an app receives, against the lane rule that arc 1 changes nothing an app notices, and #89 would split across arcs. Kept as the lane map has it; recorded as outline B in the ledger.

## Security & Adversarial Considerations

**Threat model.** Every dApp is hostile: it controls its origin's messages, `chainInfo`, every argument, the names it claims for calls, how many requests it sends and when. It does not control the wallet's storage (MAC-protected rows), the extension's pages, or the person. A second profile on the same install is a different principal. Nothing in this plan touches keys, crypto, CI permissions or secrets.

| Phase | Before: what an app can learn or cause | After |
|---|---|---|
| 1.1 #88 | Nothing directly: no dApp reaches the writers. A malformed grant, if one existed, threw a `TypeError` in the session service and a warn log line per sendTx | Same reach; a malformed grant refuses the read with a fixed error; no log line per message |
| 1.2 #228 | Nothing: the effect is a wallet-internal teardown of another profile's handshake (a reconnect) | A cross-profile deletion no longer ends a handshake approved under another profile; an unattributable channel still ends. The kept channel still passes establishment's row and profile checks, so nothing is minted. A channel the rule ends has its marker tombstoned first, so a termination that throws cannot be followed by a stamp |
| 2.1 #83 | Its refusal reads "Popup closed early" | Each refusal names its cause; copy names no app value and says "Nothing was sent" only for refusals before any proof (H7 respected) |
| 2.2 #86 | Picks the title of its refused row by claiming any name | A refused row shows the wallet-resolved function or "Transaction"; the title's provenance is the outer call's binding, never an authwit's inner call or an error's text; the title never leaves the process |
| 2.3 #123 | Nothing new | The window names the network from the wallet's decoded chain id, not an app string |
| 2.4 #124 | Expiry closes the window silently | The window says it expired; it holds its slot until dismissed, inside the per-origin cap (2) and global cap (8), with no timer. Each held slot cost the person an Allow, so an app cannot hold one alone; an overlay left open blocks that app's next connection until it is closed (OWNER-ASKS item 7) |
| 2.5 #126 | Nothing (already refused) | Unchanged; pinned |
| 2.6 #128 | Learns nothing but gets the unclassified constant | Gets `-32602` with the fixed message; logged at `debug` |
| 3.1 #87 | Stacks connect windows through a batch; each still needs the person | Unchanged by decision; pinned |
| 3.2 #201 | Sees `-32005` or the constant depending on path | Always `-32005`; no lane detail |
| 3.3 #89 | Sends a non-address `caller`/`contract`, or an object whose `String()` throws, causing an unclassified error and an error log line per call | Refused at the parse with `-32602`, at `debug`; the guard is iterative, so a deep hostile tree cannot overflow the stack |
| 3.4 #199 | Aliases its session onto another chain id by non-canonical `chainInfo`; a malformed one at establishment skips termination and slot release | Refused at discovery (at `debug`) and at establishment, which now cleans up like any failed exit; a canonical id is unchanged. Distinct valid pairs still share an id through the frozen XOR fold: this is not a uniqueness guarantee |
| 3.5 #84 | Cannot widen a contract-classes grant | Can ask; every widening still opens the window, so nothing is granted without the person |
| 3.6 #125 | Learns only that discovery was not answered | Unchanged (protocol limit) |

**Least privilege.** No workflow, token or permission changes. The `0.2.0` publish stays the owner-approved `npm-publish` environment with trusted publishing and provenance (F14); no agent dispatches it.

**Cryptography.** None added or changed. The MAC layer on session rows is untouched.

**Input validation.** Arc 1 validates stored grants at every reader and writer. Arc 3 narrows dApp inputs at the parse (#89, #199) with one fixed refusal per class; the stock SDK's own forms are success controls.

**Supply chain.** No dependency is added. 7-day minimum age, frozen lockfile and `bun audit` are unchanged. The npm API change in #89 ships as a 0.x minor with a changelog line (C11 option A).

**Logging.** Refusals log at `debug` with fixed text; no new line carries a request value, a resolved function name, or a grant (CLAUDE.md § Logging policy). The in-process `refusalTitle` is not a key the redactor knows, so it never goes to a log call; it reaches only the journal write, and the tests pin that `toPayload()`, a wire round trip and `normalizeError` drop it.

**Cross-profile privacy.** No refusal text names another profile, session or grant. The #228 rule reads only the wallet's own marker.

## UI impact

- **Arc 1**: none. No screen, no string, no row changes.
- **Arc 2**, quoting page 2 word for word (P2-01 to P2-06, P2-08):
  - History card and journal detail (P2-01): "The row reads \"Terms not accepted\" with the line \"Accept Nulo's Terms to let apps send. Nothing was sent.\" instead of \"Popup closed early\"."
  - P2-02: "A CapabilityNotGrantedError refusal files as scope_refused and reads the existing \"Not allowed\" / \"The app asked for more than you allowed. Nothing was sent.\""
  - P2-03: "A SessionEndedError refusal files as session_ended and reads the existing \"Stopped when the wallet locked\"."
  - History card, journal title and Method row (P2-04): "A refused call is titled by the function its selector resolves to, or the existing fallback \"Transaction\" when it cannot be resolved; the app's claimed name no longer titles it. Approved and sent rows are unchanged (their claimed name now always matches)."
  - Connect (discover) window identity line (P2-05): "Before Allow the line under the app reads \"wants to connect on <app's network>\", the words the permission window already uses (capabilities/index.vue:387). After Allow it reads \"Connecting on <app's network>\". The strip at the top keeps showing your wallet's own network."
  - Connect window in standby when its reservation expires (P2-06): "Instead of closing at once, the window shows the existing cancelled overlay with its own line, \"Connection request expired\", and OK closes it. A request that expired while still queued never had a window and shows nothing."
  - Home and History while a batched leg waits (P2-08): "A sendTx leg inside a batch gets the same queued row on Home and History that a single sendTx already gets while it waits, with the same copy. No new string." Premise: no such leg can wait today, so nothing renders differently.
  - Playground: none (#128 changes only the error the probe receives).
- **Arc 3**: no wallet screen. P2-07: "No wallet window or notification opens (the Terms sheet may not cover a window route)." The connect window's existing rows show a contract-classes widening (P3-01).
- **Arc 4**: the verify window and the app-side wait; screens return for sign-off in its own plan.
- Anything beyond these quotes is in `OWNER-ASKS.md`.

## Phases

Plain-language steps. "Gate" means the validation block at the end of the phase. Run every command from the worktree root unless the step says otherwise.

### Arc 1 (decision-free; build first)

#### Phase 1.1: read stored grants through the projection (#88) ✓

1. Export `projectStoredGrants` from `packages/wallet-bridge/src/index.ts`.
2. In `dapp-session/service.ts`, project held grants once in `applyCapabilityDecision` and on the On branch of `setAuthorizationsWithoutAsking`.
3. Pass projected grants to `holdsCanCreateAuthWit`.
4. Project `decision.grantRecords` in `applyCapabilityDecision`, then store the projected list.
5. Store `projectStoredGrants(grants)` in `setCapabilityGrants`; return the projection from `getCapabilityGrants`.
6. Add `holdsTransactionGrant` in `queued-journal.ts`; answer `false` on a `ValidationError`, at `debug`.
7. Read `projectStoredGrants` at `dispatcher.ts:405`.
8. Make every shapeless grant fixture well-formed (Recon collision 1).
9. Add tests:
   - `service.test.ts`: per writer, a malformed record refuses with `ValidationError` and the stored row is byte-identical (never-happens); a well-formed record stores its projection (success control).
   - `service.test.ts`: a row holding a malformed grant (written through `DappSessionMacStorage` with the test key) makes `setAuthorizationsWithoutAsking(on)`, `applyCapabilityDecision` and `getCapabilityGrants` refuse with `ValidationError`, never a `TypeError`; `setAuthorizationsWithoutAsking(off)` still succeeds on that row; the same calls succeed on a well-formed row.
   - `queued-journal.test.ts`: a malformed grant creates no record and logs no warn line; a well-formed `transaction` grant creates one.
   - `service.composition.test.ts`: the round-trip case stores and reads back a well-formed grant.

**Gate 1.1**
- Commands: `bun run lint`; `bun run typecheck:all`; `bun run --cwd packages/wallet-bridge test`; `bun run test`.
- Pass: every command exits 0; the new tests are listed and green.
- Layers: lint, typecheck, unit, composition.

#### Phase 1.2: attribute an unstamped handshake by its marker (#228) ✓

1. Move `wireSessionTeardown` into `session-revocation.ts` and export it.
2. Add `pendingVerification` to `LiveSessionRevocationDeps`.
3. Keep an unstamped channel whose live marker names another profile.
4. Keep every other rule as it is.
5. Tombstone the marker of each unstamped channel the rule ends, before terminating it, only when the marker's tab is the channel's tab.
6. In `handleSessionEstablished`, at the second liveness gate before the stamp, require the map to still hold the captured marker object and that it is not dead.
7. Pass `state.pendingVerification` from `background.ts`.
8. Update the comment at the rule to state the new invariant in one sentence.
9. Replace the test at `session-revocation.test.ts:84-94` with one table:
   - another profile's live marker from the channel's own tab → kept (never-happens: a deletion of profile B never ends A's approved handshake);
   - this profile's marker, no marker, a dead marker, another profile's marker from another tab → ended (success controls); a marker from the channel's own tab is tombstoned, and a marker from another tab is left unchanged (never-happens: a colliding id never abandons another tab's approval).
10. Add one barrier test in `session-established.test.ts`: establishment paused inside `setVerificationHash`; a revocation for the marker's own profile whose `terminateSession` throws; resume → no stamp, the session terminated, the marker still a tombstone. Control: the same run without the revocation stamps. A second barrier case replaces the marker under the same id while establishment is paused: resume → no stamp, and the replacement marker, its live channel, its reservation and its establishment status all survive unchanged (never-happens). Control: an unchanged marker whose attempt was revoked still terminates and is tombstoned.
11. Add one wiring case to `background.connect-window.test.ts`: a marker created by the real approval path, then a real `onDappSessionDeleted` for another profile's row keeps the handshake, and one for the approving profile's row ends it. This proves `background.ts` hands revocation the same marker map approval writes; a typed parameter cannot.
12. Add `session-revocation.composition.test.ts`:
   - real `DappSessionService` on `FakeBrowserApi`, real `wireSessionTeardown`, a fake handler as the only boundary;
   - write one row under `p2` and one under `p1` for the same app and chain;
   - `purgeForProfile("p2")` leaves the unstamped `p1` handshake (live `p1` marker) running;
   - `purgeForProfile("p1")` ends it (success control);
   - assert on the real stamp map and the fake handler's `terminated` list.

**Gate 1.2**
- Commands: `bun run lint`; `bun run typecheck:all`; `bun run test`.
- Pass: exit 0; the composition test passes the reviewer checklist in `apps/extension/tests/COMPOSITION-TESTS.md` (no PXE, no bb, one assertion on real state).
- Layers: lint, typecheck, unit, composition.

#### Phase 1.3: arc 1 end-to-end gate

Warning: until #169 merges (gate G1), only one `e2e:agent` run may run on the host. Before each network run, confirm no other lane runs one (`agent-worktree list`, `~/.agents/ports.md`). Never start two in this worktree.

1. Run the network files that read grants or end sessions, on Chrome, retry 0.
2. Run the whole smoke suite on Chrome, retry 0.
3. Run `bun run test:all`.

**Gate 1.3**
- Commands:
  - `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/cap-widening.test.ts tests/e2e/network/scope-refusal.test.ts tests/e2e/network/concurrent-sendtx.test.ts tests/e2e/network/connect-verify-mismatch.test.ts tests/e2e/network/session-profileSwitch.test.ts tests/e2e/network/session-reconnect.test.ts tests/e2e/network/connect-one-window.test.ts`
  - `cd apps/extension && bun run test:e2e -- --retry=0`
  - `bun run test:all`; `bun run audit:vue`
- Pass: every file green at retry 0; every command exits 0. One rerun is allowed for a named known flake, recorded in `lessons/phase-1.md`.
- Layers: e2e network (Chrome), e2e smoke (Chrome), all workspace units.

### Arc 2 (after page 2 is signed and arc 1's PR is open)

Before the first step: read the page 2 answers in each issue's `## Decision` block. Build each item as answered. Skip and record any item answered "as is" (SR3) or "Change".

#### Phase 2.1: a kind per refusal (#83)

1. Add `terms_refused` to the union, the runtime table and the doc in `packages/wallet-core/src/jobs/types.ts`.
2. Map `TermsAcceptanceRequiredError`, `CapabilityNotGrantedError` and `SessionEndedError` in `queuedFailureKind`.
3. Widen the `Extract` in `failQueuedIfUnclaimed`.
4. File `terms_refused` in `settleUnclaimedAfterTermsRefusal`.
5. Add the P2-01 strings to `kindLabel` and `failedSubtitleFor`, verbatim.
6. Add tests:
   - `queued-journal.test.ts`: one case per refused class → its kind; an unknown error → `popup_bound` (control).
   - `journal-state` test: `terms_refused` label, context and card subtitle, on a wire-shaped record.
   - `dapp-interaction/service.test.ts`: the post-window Terms refusal files `terms_refused`.
7. Extend `legal-acceptance-wall.test.ts` to read the refused send's record kind, card subtitle and detail (the `scope-refusal.test.ts` helpers).

**Gate 2.1**: `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run --cwd packages/wallet-core test`. Pass: exit 0. Layers: lint, typecheck, unit.

#### Phase 2.2: title a refused call by what it calls (#86)

1. Add `titlesRow` to `SelectorBindingPolicy`: true for `CALL_BINDING` and `NAMED_CALL_BINDING`, false for `AUTHWIT_CALL_BINDING`.
2. Under a titling policy, attach the in-process `refusalTitle` to both throws of `assertSelectorBinding` (resolved name on a mismatch, "Transaction" on an unresolvable selector); keep it out of `toPayload()`.
3. Add an optional `title` through the executor port, the service adapter, `ExecutionLane.markJournal`, `transitionOperation` and `transitionIfStage`, written in the same locked write as `failed` and never on a refused or no-op transition.
4. Pass `refusalTitle` from `markFailedUnlessCancelled`, and `"Transaction"` from `failQueuedIfUnclaimed` and the post-window Terms settle.
5. Add tests:
   - `contract-resolver.test.ts`: a call-binding mismatch carries the resolved name and an unresolvable selector "Transaction"; under the authwit policy neither carries a title (never-happens).
   - `errors.test.ts`: `toPayload()` and a wire round trip carry no `refusalTitle` (never-happens).
   - `mark-failed-unless-cancelled.test.ts`: a titled error passes its title; an untitled "Method not found" (the authwit inner lookup) passes none (never-happens: an inner call never renames the row); a plain failure passes none (control); the passthrough pin stays.
   - `operation-journal/service.test.ts`: a `title` lands with a `failed` write and is ignored on a refused or no-op transition.
   - `execution/service.composition.test.ts`: through the real adapter and lane, a binding refusal persists the resolved title on the record (proves the forwarding).
   - `queued-journal.test.ts`: an ingress refusal retitles "Transaction"; a claimed record keeps its title (control); a record execution already failed and retitled with the resolved name keeps that title when the rebuilt error reaches `failQueuedForError` (never-happens).
   - `jobs/error.test.ts` (wallet-core): `normalizeError` of a `ScopeViolationError` carrying `refusalTitle` has no such key in `normalizedRaw`.
6. Extend `scope-refusal.test.ts`: the renamed call's card and detail read the real function, not "Balance Of Public".

**Gate 2.2**: `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run --cwd packages/extension-messaging test`. Pass: exit 0. Layers: lint, typecheck, unit.

#### Phase 2.3: name the app's network in the connect window (#123 items 1-2)

1. Add `chainId` to `DiscoveryParams` and pass it from `handleDiscovery`.
2. Resolve the name with `resolveDappChain` in `discover/index.vue`.
3. Set `actionLabel` before and after Allow as P2-05 states.
4. Add tests in `discover/index.test.ts`: the label before Allow, after Allow, and for a chain with no wallet network (the `getChainName` fallback).
5. Extend `connect-one-window.test.ts`: read the identity line before Allow and right after it.

**Gate 2.3**: `bun run lint`; `bun run typecheck:all`; `bun run test`. Pass: exit 0. Layers: lint, typecheck, unit, component.

#### Phase 2.4: say why the standby window ends (#124)

1. Inject the window port's `navigate` into `VerifyAdmissionGate` beside `closeWindow`.
2. On expiry, navigate the standby window to its own discover URL plus `&expired=1`.
3. Close the window when navigation fails.
4. Show `DappCancelledOverlay` with `message="Connection request expired"` when the page's `expired` query is set.
5. Add tests:
   - `verify-admission.test.ts`: expiry navigates and keeps the slot until removal; a failed navigation closes; a queued expiry opens nothing (control); `cancel` and an establishment failure still close (never shows "expired" for another cause); a late establishment after expiry claims no window and opens none; expiry tombstones the marker at once.
   - `discover/index.test.ts`: the expired route shows the overlay line and OK closes the window.
6. E2E: closing the app tab after Allow is a cancellation, not an expiry (tab teardown cancels the reservation, `background.ts:323`), so it is the control: extend `session-tabClose.test.ts` to assert the window closes with no overlay. Expiry itself needs a key exchange stalled past the grace, which the e2e harness cannot do today; it is proven by `verify-admission.test.ts` and a `background.connect-window.test.ts` case on the fake clock (navigates with the flag, tombstones at once, keeps the slot, no second window on a late establishment). The PR's screenshot comes from a manual run with the app page paused in DevTools right after Allow (its key exchange never starts, so the reservation expires), or from a Storybook story of the expired state; the PR says which (a route opened without a live request would show the overlay over an error state, not the real one).

**Gate 2.4**: `bun run lint`; `bun run typecheck:all`; `bun run test`. Pass: exit 0. Layers: lint, typecheck, unit, component.

#### Phase 2.5: the batched-send premise (#126)

1. Rewrite the comment at `background.ts:508-514`; delete the TODO.
2. Add a background-level test: a batch holding a `sendTx` leg creates no queued record and answers the batch refusal. No e2e case: the characterization pins already cover the refusal on the wire.

**Gate 2.5**: `bun run lint`; `bun run test`. Pass: exit 0. Layers: lint, unit.

#### Phase 2.6: refuse a non-utility function (#128)

1. On the base commit, record which throw the probe hits today: grant a simulation utility scope, click the probe, read the error. Log it in `lessons/phase-2.md`.
2. Refuse a non-utility function in `executeAztecExecuteUtility` before `pxe.executeUtility`.
3. Add `InvalidWalletArgumentsError` to the code channel in `rpc-cancel.ts`.
4. Log it at `debug` in `logOperationOutcome`.
5. Add tests:
   - `view-executor.test.ts`: a public function and a private function refuse and never call `pxe.executeUtility` (never-happens); a utility function calls it (control).
   - `rpc-cancel.test.ts`: the refusal survives the port and answers `-32602` with the fixed message.
6. Add a case to `sim-methods.test.ts` with a simulation utility grant: the probe answers `-32602`.

**Gate 2.6**: `bun run lint`; `bun run typecheck:all`; `bun run test`. Pass: exit 0. Layers: lint, typecheck, unit.

#### Phase 2.7: arc 2 end-to-end gate

Warning: the G1 rule from Phase 1.3 applies until #169 merges.

**Gate 2.7**
- Commands, each also run with `NULO_E2E_BROWSER=firefox` in front:
  - `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/legal-acceptance-wall.test.ts tests/e2e/network/scope-refusal.test.ts tests/e2e/network/connect-one-window.test.ts tests/e2e/network/sim-methods.test.ts tests/e2e/network/concurrent-sendtx.test.ts tests/e2e/network/session-tabClose.test.ts`
  - `cd apps/extension && bun run test:e2e -- --retry=0`
  - `bun run test:all`
  - `bun run audit:vue` (typecheck, units and lint, then the production build; CLAUDE.md requires it before any UI PR)
- Merge gate for #124: the manual expiry check (OWNER-ASKS item 3) is recorded in `lessons/phase-2.md` for Chrome and for Firefox: page kept or reloaded, what sits under the overlay, OK closes the window. Storybook screenshots may supplement it, never replace it. If either browser reloads and the owner has not accepted option B, #124 is held out of the PR.
- Pass: every file green at retry 0 on both browsers; `audit:vue` exits 0. Screenshots of the History card, the journal detail, the connect window before and after Allow, and the expired overlay, dark and light, are saved for the PR.
- Layers: e2e network and smoke on Chrome and Firefox; units.

### Arc 3 (after pages 2 and 3 and charter C11; merge hold H5)

Before the first step: read the page 3 and C11 answers. Build each item as answered.

#### Phase 3.1: #87 comment and pin; #201 -32005 on every path

1. Rewrite `dispatcher.ts:274-275`.
2. Add the batched `requestCapabilities` window test.
3. Add `TooManyPendingError` to `REBUILT_AS` and the code channel.
4. Flip the two bug pins to assert the class and `-32005`.

**Gate 3.1**: `bun run lint`; `bun run typecheck:all`; `bun run --cwd packages/wallet-bridge test`; `bun run --cwd packages/extension-messaging test`; `bun run test`. Pass: exit 0. Layers: lint, typecheck, unit.

#### Phase 3.2: #89 addresses and throwing shapes

1. Change `caller` and `contract` to `schemas.AztecAddress` in `GRANT_CONTENT_SCHEMA`.
2. Update `apply.pins.test.ts` and the published README's changes line (A2).
3. Require the two address schemas by identity in `isGrantAuthwitShape`.
4. Add the iterative own-`toString` guard to `assertWalletSchemaArgs`.
5. Add tests, one per refused class:
   - `apply.test.ts`: an existing entry whose content takes `caller: z.string()` throws the drift error; the strict entry is kept by identity (control);
   - a non-address `caller`; a non-address `contract`;
   - an own `toString` at the top level, nested in an object, inside an array, and under an own `__proto__` key; a 100,000-deep tree refuses without a stack overflow;
   - an own `valueOf` alone passes (control), and a `requestCapabilities` manifest with an own `toString` refuses;
   - success controls: hex address strings; a large real argument (a wire artifact from `@nulo/wallet-bridge/testing`).

**Gate 3.2**: `bun run lint`; `bun run typecheck:all`; `bun run --cwd packages/wallet-sdk-schema-patch test`; `bun run --cwd packages/wallet-bridge test`; `bun run test:release`; `bun run test:ci-gating`. Pass: exit 0 (`stage.test.ts` sees the README). Layers: lint, typecheck, unit, release staging.

#### Phase 3.3: #199 strict chainInfo

1. Make `chainInfoToChainId` refuse non-canonical input with `InvalidWalletArgumentsError`.
2. Keep canonical values mapping to today's ids.
3. Move the decode inside establishment's `try`; log the discovery refusal at `debug`.
4. Add tests:
   - one per refused class: blank, negative, non-integer, above `2^53`, `chainId` above `2^32 - 1`;
   - schema acceptance and wallet bounds apart: a row `schemas.Fr` refuses (blank, negative, not a number) and a row it accepts but the bounds refuse (`0x100000000` as `chainId`, `0x20000000000001`) each refuse with `InvalidWalletArgumentsError`;
   - success controls: the local chain (`0`) and testnet (`2904119610`) from their canonical `chainInfo`, plus `chainId = 2^32 - 1` and `version = 2^53` at the bounds, each pinned to today's id;
   - discovery rejects and logs at `debug`; establishment terminates with no stamp, a tombstoned marker and a released slot, and logs at `debug`; ingress answers `-32602`.

**Gate 3.3**: `bun run lint`; `bun run typecheck:all`; `bun run test`. Pass: exit 0. Layers: lint, typecheck, unit.

#### Phase 3.4: #84 field-aware contract classes; #125 pin

1. Add `contractClassesRequestCovered`; delete the special case at `capability-negotiation.ts:345-347`.
2. Update the coverage pins and the doc comment on `isCapabilityCovered`.
3. Add tests: a wider class list opens the window; a flag upgrade opens it; classes from one grant and the flag from another do not cover (never-happens, mirrors enforcement); a request inside one held grant does not open it (control).
4. Extend `cap-widening.test.ts` with a contract-classes widening.
5. Extend `background.admission.test.ts`'s Terms test: no row, no marker.

**Gate 3.4**: `bun run lint`; `bun run typecheck:all`; `bun run --cwd packages/wallet-bridge test`; `bun run test`. Pass: exit 0. Layers: lint, typecheck, unit.

#### Phase 3.5: arc 3 end-to-end gate

Warning: the G1 rule applies until #169 merges.

**Gate 3.5**
- Commands, each also with `NULO_E2E_BROWSER=firefox` in front:
  - `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/cap-widening.test.ts tests/e2e/network/legal-acceptance-wall.test.ts tests/e2e/network/meta-batch.test.ts tests/e2e/network/connect-one-window.test.ts tests/e2e/network/concurrent-sendtx.test.ts tests/e2e/network/authwit-lifecycle.test.ts tests/e2e/network/contracts-getClassMetadata.test.ts` (the last two are the success controls for #89, whose playground sends `caller` and `contract` as strings the tightened patch now parses, and for #84)
  - `bun run test:all`; `bun run test:release`; `bun run test:ci-gating`; `bun run audit:vue`
- Pass: every file green at retry 0 on both browsers; composition tests green; every command exits 0.
- Layers: e2e network on both browsers; composition; units; release staging.

### Arc 4 (#15)

No phase in this plan. If P2-09 is approved, open `/blueprint deep` for it from the scope above. If it is answered no, comment on #15 with the answer and its date, and close it as not planned (SR3).

## Delivery

One `gh stack` on base `dev`, delivered arc by arc: each arc's PR opens once its own gates pass and its own Codex loop converges, because arcs 2 and 3 wait on pages that may take weeks. The final cross-arc pass runs before the last arc's PR opens, and the close-out layer goes on top of it.

| Layer | Branch | Phases | Stacks on | `/code-review` | PR title | Closes |
|---|---|---|---|---|---|---|
| 1 | `worktree-dapp-ingress-grants` (adopted; carries this plan) | 1.1-1.3 | `dev` | off | `fix(dapp): validate stored grants at every reader, keep other profiles' handshakes` | #88, #228 |
| 2 | `dapp-ingress-grants-arc-2` | 2.1-2.7 | layer 1 | off | `fix(dapp): name refused app sends, title them by their call, name the app's network` | #83 (per A5), #86, #123, #124, #126, #128 |
| 3 | `dapp-ingress-grants-arc-3` | 3.1-3.5 | layer 2 | off | `feat(dapp): ratify the app contract: class widening, address checks, chainInfo, -32005` | #84, #87, #89, #125, #199, #201 |
| 4 | `dapp-ingress-grants-close-out` | close-out | layer 3 | off | `docs(plans): close dapp-ingress-grants` | none |

- Start: `gh stack init --adopt worktree-dapp-ingress-grants`. At each arc boundary, after its loop: `gh stack add <next branch>`.
- Publish: `gh stack submit --auto`, then `gh pr edit` each body: what changed and why, the validation run with outcomes, `Closes #n` per issue, the composition checklist for arc 1, screenshots for arc 2, and for every surface or contract change the owner's page answer quoted with its record id (P2-xx, P3-xx), which is the sign-off CLAUDE.md § UI changes requires. Open each PR without labels; add `e2e:extension-network` or `e2e:extension-smoke` afterwards only if the path filter skips a suite the change needs.
- Arc 1 can merge while arcs 2 and 3 wait on their pages. If the orchestrator prefers plain PRs on `dev` per arc (the accessibility-1 precedent), each arc branches from `dev` after the one below merges; the titles and `Closes` lines stay.
- Owner step after arc 3 merges (never an agent): dispatch `publish-packages.yml` from `dev` with `version=0.2.0`, dry run first. It publishes all three packages (A3).
- Merging is the orchestrator's call. `gh stack merge` lands the named PR and every PR below it; pass `--squash`.

## Post-implementation

Run per arc at its boundary, before that arc's PR opens; the cross-arc pass runs once, before the last arc's PR.

1. **Codex audit** (`~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`). Send: the arc's diff; `plan.md` with the decision ledger; the arc map ("this is arc N of 3; later arcs build X on it"); the adversarial ask (what can a hostile dApp send, learn or cause; what does the change trust that it should not); and these two rules, verbatim:
   - *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."*
   - *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*
2. **Fix loop.** Verify each Codex claim against the repo. Apply the accepted fixes, commit, log the round in `lessons/phase-N.md`, then resume the same session (`resume-codex.sh "" <followup> <codex-dir> high`) with the fix diff. Stop when a round finds nothing material. After three rounds with material findings, stop and report `ARC_FAILED` or surface it.
3. **Arc delivery.** Open the arc's PR per the Delivery section, then `gh pr checks <n> --watch`; a red check is a flake to re-run once or breakage to fix, never a gate to weaken.
4. **Final cross-arc pass**, before the last arc's PR opens: a fresh Codex session over the net diff from `ac259a7`, asking for seams between arcs, duplication across arcs and drift from this plan; same loop. Then open that PR as in step 3.
5. **Close-out** (the stack's docs-only top layer), after `git merge origin/dev` into the close-out branch and a read of what changed in `implementations-plan/index.md` and `lessons.md` (another lane may have landed; never a union merge):
   - Write the `## Outcome` block directly after the front matter: date, status, what shipped with PR numbers, every dropped or rejected item with its disposition, `Open items:` (issue or advisory numbers, or `none`), and a line retiring the seeds below.
   - Promote generalizable gotchas into `implementations-plan/lessons.md` (8 KiB budget; dedupe, retire, date tool versions).
   - File each open item in its home:

     | Situation | Home |
     |---|---|
     | Work inside the implementation you are on | the active `plan.md` and the PR |
     | Actionable work that outlives the plan: a bug, a gap, a missing test, a deferred refactor | a GitHub issue, with a domain label and a `Record` link to the archived plan |
     | Needs a product call, or waits on something outside the repo | an issue labelled `owner-decision` or `blocked:external` (the body names the trigger) |
     | A suspected exploitable weakness | a private draft security advisory; `plan.md` records only "tracked privately: GHSA-…" until it is published |
     | Rejected, superseded or already done | a disposition line in the plan's Outcome block; no open item anywhere |
     | Knowledge that prevents a repeat | `implementations-plan/lessons.md` (8 KiB budget) |
     | A legal or store blank with a release deadline | `BEFORE-LAUNCH.md` |
     | Accepted code work that blocks launch | the `v1.0.0` milestone, pointed at once from `BEFORE-LAUNCH.md` |

     Dedupe first (`gh issue list --state all --search "<words>"`); each new issue has `## What happens`, `## Where`, `## Impact`, `## Possible fix`, `## Record`. Comment on each issue left open (#15 moved to its own plan, #127) with the reason. The retired `follow-ups.md` is not used.
   - Delete `STATUS.md`. `git mv implementations-plan/dapp-ingress-grants implementations-plan/archive/dapp-ingress-grants` in its own commit, repair links the extra level breaks, move the index line to `archive/index.md`.
   - Run `bun run check:plans` on the staged files.
6. **Teardown after the merge.** When `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/dapp-ingress-grants/plan.md` succeeds, run `agent-worktree done dapp-ingress-grants --merged` (this session started inside the worktree, so there is nothing to exit). It refuses rather than forces; relay a refusal and stop. A `/loop` session checks on every firing; a `/goal` session arms one background wait after its report: `until git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/dapp-ingress-grants/plan.md; do sleep 300; done`.

## Decision ledger

### Orchestrator decisions (override the Delivery section)

- **D-orch-1, no stack.** Arc 1 opens its own PR against `dev` (`gh pr create --base dev`) with the Delivery table's title; no `gh stack init` or `adopt`. Arcs 2 and 3 branch from arc 1's branch and rebase onto `dev` after it lands (the accessibility-1 precedent the Delivery section already allows).
- **D-orch-2, arc 1 only.** Nothing of arcs 2, 3 or 4 is built: they wait on decision pages 2 and 3, charter C11, holds H1 and H5 and the OWNER-ASKS answers (all eight asks are on pages 2 and 3). Arc 1's two behaviour changes for rows no writer can produce (a fixed `ValidationError("Malformed capability")` instead of a `TypeError`; a `debug` line instead of `warn` when a malformed grant skips the queued row) are accepted as stated; nothing a screen shows, a string, or an app-facing error for a producible row changes.

### Implementation deviations (arc 1)

- **D-impl-1.** `projectStoredGrants` is exported through `dispatcher.ts`'s existing `export { … } from "./capability-negotiation"` line, which `index.ts` re-exports; the public surface is the one the plan names.
- **D-impl-2 (withdrawn after Codex round 1, C2).** Tombstoning the own-tab marker of a stamped channel too was tried and reverted: after a stamped channel's check window closes, its page can reuse the id in the same tab for a newer approval, and the stamped channel's revocation would kill it. Revocation tombstones only an unstamped channel's own-tab marker, as planned.
- **D-impl-3.** The establishment recheck lives in two helpers (`lostApproval`, `settleCapturedMarker`) so `handleSessionEstablished` stays under the cognitive-complexity budget (19 inline, under 15 after); the recheck's log reads "…, so it is not stamped" since the copy dash ban reads `terminateWith` arguments.
- **D-impl-4 (Codex round 1, C1; Opus O2).** The plan's "retire without terminating" on a replaced marker covered only the second liveness gate. Every exit before the stamp (dead on entry, row gone, row of another profile, row read or hash write failing) now skips termination when the map no longer holds the captured marker; an exit after the stamp (the check window failing) still terminates, since a stamped channel must never stay live unverified.
- **D-impl-5 (Opus O3).** The recheck reads `cancelled`, not `isPendingVerificationDead`: a key exchange that crosses the 90 s staleness line during the two storage awaits used to stamp and still does. Staleness is judged once, on entry; a revocation and a slot given back both tombstone.

### Plan-space search: the competing outline

- **Outline A (chosen): the lane map's four arcs.** Arc 1 decision-free and invisible; arc 2 visible items after page 2; arc 3 the H5 contract; arc 4 scoped.
- **Outline B (rejected): decision-freeness first.** Arc 1 would take every item that needs no answer: #88, #228, #126's pin, #87's comment, #128 and #89 item 9 (both SR7). Arc 2 the visible page-2 items; arc 3 the H5 items. For: ships two app-facing fixes without waiting on pages. Against: arc 1 would change what an app receives (`-32602` instead of the constant), breaking the lane's "arc 1 changes nothing an app notices"; #89 would split across two PRs; the orchestrator placed #87 in arc 3 explicitly. Decided A; the orchestrator can move #128 and #89 item 9 forward if page 2 or 3 stalls.

### Lane-map discrepancies recorded

- `lanes-v2.json` holds H1 as gating `dapp-ingress-grants/arc-3`, but the lane's arcs put #15 (H1) in arc 4. This plan follows the arcs: H1 gates arc 4; H5 gates arc 3 and #125.
- The common brief names `follow-ups.md` for open items; CLAUDE.md retired it (the plans gate refuses it). This plan files issues.
- #126 is "code-only" in the lane map; the page found it is not reachable (F11). Kept in arc 2 as a premise check.

### Panel (Codex and the Opus lens)

**Round 1, Codex (gpt-6.1-sol, high).** Verdict: reject, with blocking findings: revocation can race restamping; strict decoding bypasses establishment cleanup; arc and approval gates contradict the charter. Each finding checked against the tree before its disposition.

| # | Finding | Disposition |
|---|---|---|
| C1 High | #199: the establishment decode sits before the `try`, so a refusal skips termination, marker settlement and slot release; discovery logs the rejection at `warn` | Accepted. Decode moves inside the `try`; discovery logs `InvalidWalletArgumentsError` at `debug`; test for all three cleanups plus a canonical control (F16, Phase 3.3) |
| C2 Med | #88: Connected Apps renders `g.capability.type` raw, so "the person can still disconnect" is unproven; `getCapabilityGrants` returns raw | Accepted. Claim narrowed to readers that decide; `getCapabilityGrants` projects; the display stays (a screen) and the close-out files an `owner-decision` issue |
| C3 Med | F7 holds only while the active profile is stable | Accepted. F7 qualified. The extra switch-during-enumeration test is rejected: the rule keys on the deleted row's profile, never on the source, and the unit table covers that |
| C4 Med | #89: an existing loose `grantPublicAuthwit` entry survives the tightened patch | Accepted. `isGrantAuthwitShape` requires both address schemas by identity; drift test. Scope: npm consumers, since the wallet parses a private copy |
| C5 High | #228: a termination that throws (upstream posts before it deletes, F24) can be followed by a stamp | Accepted, narrowed to what #228 touches: the rule tombstones the marker of each channel it ends, establishment rechecks the marker before stamping, one barrier test. The marker-less reconnect residual is the same seam as today, recorded |
| C6 Med | #86: an ingress retitle could overwrite the resolved title, or retitle a claimed record | Accepted. Retitle only from the producer whose transition failed the record (F23, I5 corrected); never-happens test |
| C7 Med | #124: the expired window holds its slot with no timer; `closeStandby` serves three causes | Accepted. A separate `expire()` path; cancel and failure keep closing; late-establishment test; occupancy surfaced as OWNER-ASKS item 7 |
| C8 Med | #199 does not make chain ids unique (XOR fold, version truncation) | Accepted. Claim narrowed; bounds and canonical pairs pinned; `schemas.Fr` parity test, since P3-03 says "parsed with the upstream Fr schema" |
| C9 High | Arc 1 is observable (#228 removes a disconnect; #88 changes failures) | Accepted in part. The lane brief places both in arc 1 and names their never-happens tests, which are these behaviours; the plan now states the change plainly instead of "nothing changes". No exception ask: the orchestrator's arc map is the authorization |
| C10 High | OWNER-ASKS defaults cannot override signed proposals (items 3, 4) | Accepted. Both are attached to their records; a dependent phase does not merge on an unsigned deviation |
| C11 High | H5/C11 incompletely enforced: #128 changes the app's answer; no per-narrowing release map | #128 part rejected: H5's list excludes it and SR7 settles it as C11's ratified half (F25). C11 part accepted: mapping table in arc 3 |
| C12 Med | Delivery order contradicts itself; no `audit:vue`; no CI watch | Accepted. Arc-by-arc delivery, cross-arc pass before the last arc's PR, `audit:vue` in each arc gate, `gh pr checks --watch` |

**Round 1, Opus (Plan agent, opus).** Verdict: conditional approve, with conditions: (1) retitle in the same stage-guarded write that fails the record, call bindings only; (2) the #124 overlay on the expiry path only, marker tombstoned at expiry; (3) bound both `chainInfo` fields to u32 and move the establishment decode into the `try`; (4) keep "Off always succeeds"; (5) send unquoted person-visible effects to OWNER-ASKS; (6) fix the Delivery and seed contradiction so arc 1 can ship alone; (7) add e2e success controls for #89 and #84.

| # | Finding | Disposition |
|---|---|---|
| O1 High | #86: a retitle after `failQueuedForError` renames approved rows that fail later; two writes can be split by a worker death; the authwit binding shares the refusal; "Method not found" keeps the claimed title | Accepted. The title rides the failing write (`transitionIfStage` / `markJournal` gain `title`, applied on `transitioned` only); call bindings only; "Method not found" reads "Transaction" per P2-04's fallback |
| O2 Med | #124: three causes share `closeStandby`; holding the slot delays the marker tombstone; the reservation does not know the URL | Accepted. `expire()` path only; an `expired(id)` hook tombstones at once; the popup result returns the window URL for `attach` |
| O3 Med | #199: version truncates through the XOR; decode outside the `try`; discovery warns | Decode and log level accepted (same as C1). The `version` bound goes beyond P3-03's signed bounds, so it is OWNER-ASKS item 4's added option, recommended, not shipped unsigned |
| O4 Med | #88: projecting on Off breaks "Off always succeeds"; `[id].vue:81` also reads raw | Accepted. Project on the On branch only; Off control test; `[id].vue` added to the display list |
| O5 Med | Unquoted visible effects: `session_ended` has no detail label; #86's "refused" covers every pre-claim cause; option B of item 3 is not an empty window | Accepted. OWNER-ASKS item 8 added; items 2 and 3 corrected |
| O6 Med | Delivery and seeds still require all four layers, so arc 1 waits on pages | Accepted. Seeds end on "arc N delivered; arc N+1 waits on page X" |
| O7 Med | Gate 3.5 lacks success controls for #89 and #84 | Accepted. `authwit-lifecycle.test.ts` and `contracts-getClassMetadata.test.ts` added, both browsers |
| O8 Low | #89 item 9: only an own `toString` can throw; walk the parsed slice; `Object.keys`; deep test; Buffer-shaped leftover | Accepted. `valueOf` dropped from the guard with its control; the leftover is a close-out issue |
| O9 Low | #228: also match the marker's tab; the composition test injects its own map | Tab check accepted. The wiring test is rejected: passing the wrong map can only end a channel, which is today's fail-closed behaviour, and the dep is typed and required |
| O10 Low | #84 coverage must be per grant, as enforcement reads it | Accepted, with a never-happens test for classes and flag split across grants |
| O11 Low | #125 pin and #126 e2e duplicate existing tests | Accepted. The #125 pin extends `background.admission.test.ts:319-329`; the #126 e2e case is dropped |
| O12 Low | PR bodies must quote the owner's page answers | Accepted, in Delivery |
| Facts | F6 and F15 line numbers; recon.md's #228 row contradicted F7 | Corrected in plan.md and recon.md |

**Round 2, Codex final pass (gpt-6.1-sol, high, fresh session).** Verdict: reject, with blocking findings: marker ownership remains ambiguous under id reuse; refusal-title plumbing and provenance are incomplete; the expiry E2E exercises cancellation. Each finding checked against the tree.

| # | Finding | Disposition |
|---|---|---|
| F1 High | #228: establishment rechecks its captured marker while revocation tombstones the map's current one (a reused id); the rule tombstones another tab's marker | Accepted. The recheck requires the map to hold the captured object; only a same-tab marker is tombstoned; barrier case for a replaced marker and a never-happens case for another tab's marker |
| F2 High | #86: the production path forwards three arguments (`execution/service.ts:449`, `dapp-send-executor.ts:120`); the lane uses `transitionOperation` (`execution-lane.ts:538`) | Accepted. Every hop named in the design and file map; a composition case through the real adapter persists the title |
| F3 High | #86: "Method not found" is also thrown by the authwit inner lookup (`authwit-discoverer.ts:148`), and can land after a claim | Accepted. Provenance is explicit (`titlesRow` on the binding policy, `refusalTitle` on the error), never the message; an inner-call control keeps the claimed title |
| F4 Med | #124: the planned e2e (close the tab) is a cancellation, which still closes the window; the URL's provenance is unstated | Accepted. Tab close is now the cancellation control; expiry is proven on the fake clock; the URL is built by the interaction service; the screenshot source is stated |
| F5 Med | #199: `schemas.Fr.parse` is synchronous, so the hand-written check duplicates it, and the parity test could not pass; establishment would warn | Accepted (probe confirmed). Reuse `schemas.Fr.parse`, then the bounds; tests split schema refusals from bound refusals; establishment logs the refusal at `debug` |
| F6 Med | O9's wiring-test rejection: an empty map restores the exact bug | Accepted, reversing O9's rejection: one background wiring case with a real approval marker and real deletion events |
| F7 Med | #128 has no release vehicle or changelog line | Accepted in part. Not a new narrowing (SR7), so no minor; arc 2's squash body carries its own `fix(dapp)` line |
| F8 Med | I1 overstated (the RPC setter stores what it gets); `getCapabilityGrants` missing from the steps | Accepted. I1 qualified; step and test added |
| Low | Stale "toString/valueOf" wording; the loop's 5-failure threshold | Fixed; the threshold is the standing 3 |

**Round 3, Codex final pass resumed (same session).** Verdict: reject, with blocking findings: #228's identity check still leaves cleanup targeting the replacement attempt. The other round-2 fixes were confirmed closed at plan level.

| # | Finding | Disposition |
|---|---|---|
| R1 High | On an identity mismatch the old callback's `finally` still settles the current marker, and its termination by id can end the replacement's channel | Accepted. On mismatch the callback retires without terminating; settlement only while the map holds the captured marker; the barrier case asserts the replacement's marker, channel, reservation and status survive, with a revoked-attempt control |
| R2 Med | #124's browser behaviour (page kept or reloaded) is proven by nothing automated | Accepted. A manual check on both browsers is a merge gate for #124 (Gate 2.7, OWNER-ASKS item 3) |
| R3 Low | Two sentences still asserted no malformed row exists | Fixed |

**Round 4, Codex final pass resumed (same session).** Verdict: approve. No new material findings; R1-R3 confirmed closed (the mismatch path keeps no destructive step by id; `verify-admission.ts:317` checks reservation identity before any release).

## Audit verdicts

| Round | Reviewer | Verdict | Outcome |
|---|---|---|---|
| 1 | Codex gpt-6.1-sol, high | reject (with blocking findings: revocation can race restamping; strict decoding bypasses establishment cleanup; arc and approval gates contradict the charter) | 12 findings: 10 accepted, 2 accepted in part (C9, C11), dispositions in § Panel |
| 1 | Opus Plan agent | conditional approve (7 conditions) | 12 findings and fact fixes: 11 accepted, 1 accepted in part (O9); condition 3's `version` bound moved to OWNER-ASKS item 4 |
| 2 | Codex gpt-6.1-sol, high, fresh session | reject (with blocking findings: marker ownership remains ambiguous under id reuse; refusal-title plumbing and provenance are incomplete; the expiry E2E exercises cancellation) | 8 findings: 7 accepted, 1 accepted in part (F7); F6 reversed round 1's O9 rejection |
| 3 | same session, resumed | reject (with blocking findings: #228's identity check still leaves cleanup targeting the replacement attempt) | 3 findings, all accepted |
| 4 | same session, resumed | **approve** | no new material findings |

### Arc 1 post-implementation

| Round | Reviewer | Verdict | Outcome |
|---|---|---|---|
| 1 | Codex gpt-6.1-sol, high (session `01a12317`) | reject (with blocking findings: replacement attempts remain vulnerable to stale callback cleanup and revocation) | C1 High accepted (D-impl-4); C2 Med accepted (D-impl-2 withdrawn); C3 Med pushed back: pre-existing id-keyed cleanup, self-inflicted id reuse, upstream #127; recorded as a residual under #228; C4 Low accepted (marker comment rewritten) |
| 1 | Opus general-purpose review | approve with fixes (3 Low) | O1 (no test for D-impl-2) superseded by its withdrawal, the stamped row now pins the planned rule; O2 same as C1; O3 accepted (D-impl-5) |

## Seeds (draft; finalized after approval)

Recommended: `/goal`, since every completion signal is in the transcript. Use exactly one per session.

```
/goal Every phase of every arc whose decision page is signed is marked ✓ in implementations-plan/dapp-ingress-grants/plan.md, each backed by its validation gate reported passing in the transcript; for each phase `LESSONS_FILE=implementations-plan/dapp-ingress-grants/lessons/phase-N.md` printed; code_review is off and /code-review was NOT run; the Codex fix loop (gpt-6.1-sol, high) converged for each delivered arc, evidenced by a resumed Codex pass reporting no new material findings quoted in the transcript; arcs 2 and 3 started only after their page answers were read and quoted; each delivered arc's PR exists (`gh pr view` in the transcript) and its checks were watched to green. Either all three arcs are delivered, the final cross-arc pass converged and the close-out archived the plan (`git show --stat` of the archive-move commit), or the transcript ends with "arc N delivered; arc N+1 waits on page X" naming the unsigned page, and no later arc was started.
```

```
/loop 15m Drive implementations-plan/dapp-ingress-grants forward. Never idle waiting for input. Each firing: (1) Reality check: read plan.md and lessons/; if implementations-plan/archive/dapp-ingress-grants/plan.md is on origin/dev, run `agent-worktree done dapp-ingress-grants --merged`, report, clear this loop and stop; if an arc's PR is open, babysit its CI only. (2) Waiting on CI is fine; confirm it progresses. (3) No task in hand: take the next pending step; run lint and the touched tests after each edit; commit. Never start arc 2 or 3 before its page answers are recorded in the issues; if every startable arc is delivered and the next waits on an unsigned page, report "arc N delivered; arc N+1 waits on page X", clear this loop and stop. (4) Stuck or facing a decision: consult Codex (run-codex.sh … high read-only gpt-6.1-sol), log it in lessons; a question about what a person sees goes to OWNER-ASKS.md, never decided here. Hard limits: no merge, no publish, no force-push, no scope beyond plan.md. (5) Same step failed 3 times: stop and reassess with Codex. (6) Phase green means its gate as written; mark ✓, print LESSONS_FILE; at an arc boundary run the Codex loop, then open that arc's PR and watch its checks. (7) Last arc's phases ✓: final cross-arc pass, its PR, then the close-out, then `gh pr checks --watch`, then report and stop.
```

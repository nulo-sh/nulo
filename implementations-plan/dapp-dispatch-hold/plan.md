---
plan: dapp-dispatch-hold
tier: deep
status: planned; panel approved (final pass round 2 conditional approve, condition met); awaiting orchestrator approval
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 Explore agents (sonnet) plus the driver's own read; three independent drafts (driver, Codex gpt-6.1-sol high, Opus Plan); contradiction check (Codex + Opus); double audit (Codex + a fresh Opus); one final fresh Codex pass
post_implementation_hardening: not scheduled
base: origin/dev at 527b369f
trunk: dev
issues: [15]
---

Live progress: [STATUS.md](STATUS.md). Owner questions: [OWNER-ASKS.md](OWNER-ASKS.md). Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

# Hold an app's calls until the person confirms the emoji check (#15)

## Tier and budget

Deep, per the orchestrator: P2-09 names a deep-tier blueprint. Three independent drafts were written: the driver's, Codex's (gpt-6.1-sol, high), and Opus's (a Plan agent). This plan consolidates them; § Decision ledger records each fork and which draft won it. Then come a contradiction check (Codex + Opus), a double audit (Codex + a fresh Opus), and one final fresh Codex pass. Each verdict is recorded in § Audit verdicts.

## Issue map

| Issue | Claim | Holds at 527b369f? | Arc |
|---|---|---|---|
| #15 | Calls are dispatched before They match | **Yes.** `handleSessionEstablished` returns `true` once the check is shown (`session-established.ts`, after `showVerifyWindow`), and `runEstablishedMessage` (`background.ts`) waits only for establishment | 1, **closes** |
| #15 (lane scope) | "A lock … while held ends the session and drops the calls" | **No, not today.** A lock tears no channel down (`profile-switch-teardown.ts` header). The plan makes it true for unconfirmed sessions only (L5) | 1 |
| #15 (lane scope) | "Every held `sendTx` has its queued row on arrival" | **Only for journal-eligible sends.** The queued row is skipped by design when a send has no grant, an unresolved account, a storage failure, or is over the queued-row caps (8 per session, 32 global; `queued-journal.ts` header). The plan keeps that rule as is | 1 |
| #15 (lane scope) | The playground shows no sign of the wait | **Partly.** There is no spinner, but a pending call's `pg-result` row reads `pending` | — |

**Related, not claimed:**
- #331, #330, #332: checked for duplicates only. None of them touches the hold.
- #340: the execution cap's `-32005` files a misleading History row. This plan's held-call cap refuses before any row exists, so it adds no such row.
- #157 and the `account-session-life` lane touch lock semantics elsewhere. This plan changes only what a lock does to sessions whose check is unanswered.

## Outcome & Quality Bar

**Who this is for. Three readers:**
- **The person** who connects an app and compares two grids of emojis. The check exists so that a mismatch can stop the app, and today it cannot stop calls already running.
- **A dApp developer** whose stock wallet-sdk app now waits for that person. Its calls must stay pending, never fail mysteriously, and end with the standard disconnect when the session ends.
- **A maintainer**, who must be able to see in one module why a call waited and what released it.

**What excellent looks like.**
1. **No early dispatch.** On a check that is shown, no app call reaches the dispatcher before They match; afterwards the held calls run in arrival order. A callback integration test over the real `background.ts` proves it with a dispatch spy and a success control: the same call on a trusted reconnect runs at once. The network suite proves the flow on Chrome and Firefox.
2. **Every ending is clean.** Every way a held session ends drops its held calls without running any, ends the channel with the standard disconnect, and files each held send's queued row under an existing kind whose copy is true for that cause. Each mechanism that ends a hold (termination, refusal, lock, profile switch, re-key, failed establishment) has a test; the paths that reach termination through today's code are represented by tab close and row deletion.
3. **A hostile app gains nothing.** It cannot use the hold to skip the check, to keep an unbounded number of calls waiting, or to ride a re-keyed session:
   - the confirmation binds to the session's own verification hash;
   - only an extension page can send the confirmation;
   - a per-session cap answers calls past it with the ratified `-32005`.
4. **Nothing on a screen changes.** The decision page shows the screens as they are and the app-side wait. Any line it approves lands in the same PR before merge.

**Good enough:**
- There is no wallet-side timeout on a held call (M1 says the app waits).
- The 90-minute vouching lease and the reaper treat a long-held send's queued row as they treat any long FIFO wait today.
- The playground does not change.

## Scope

**In:**
- The hold: its registry, the fence before dispatch, and its teardown.
- The They match report.
- The held-call cap.
- The lock rule for unconfirmed sessions.
- The e2e fixture that reconnects an untrusted row.
- The tests in § Tests.
- The docs that describe the session model: `ARCHITECTURE.md` § 8 and `tests/e2e/FIREFOX.md`.

**Out:**
- Any screen or copy change unless the decision page approves it.
- A wallet-side timeout on held calls.
- A payload-size bound at ingress. This is existing behaviour for every call.
- Changing what a lock does to confirmed channels.
- A way to reopen a closed check (DH-6).
- security-ui-1's Phase 3.3 (closing ends the session), which its call 3 dropped.

## Architecture & Implementation

### The shape

One new module in the wallet-sdk background, `verification-hold.ts`, owns the hold. Nothing persists: a hold lives exactly as long as the transport session it gates, like `sessionProfiles` and `establishmentStatus` today.

| Where | What changes |
|---|---|
| `background.ts` | Opens a hold for every transport session the moment upstream reports it established, while the hash is at hand. Each message captures its hold on arrival and is admitted against the cap. Dispatch waits on the hold behind the per-session FIFO. Termination ends the hold. |
| `session-established.ts` | Releases the hold when no check is needed (a trusted reconnect). It no longer decides anything else about the hold. |
| `DappSessionService` | Gains `confirmVerification(verificationHash)`, which validates the hash and emits `onVerificationConfirmed`. This mirrors `refuseVerification` → `onVerificationRefused`. |
| The verify page | Its They match reports the URL's hash after the optional trust write and before it closes. |
| `wireVerificationHold` (in the new module) | Wires the confirmation listener and the lock rule. |

`WindowReservation` and `VerifyAdmissionGate` do not change. A window slot and a hold have different lifetimes: a slot frees when its window is removed, and a hold ends when its session ends or when the person confirms.

### Key types

```ts
// apps/extension/src/wallet/services/wallet-sdk/verification-hold.ts

/** How a session's hold ended. The drop outcomes are the queued row's failure kinds. */
export type HoldOutcome = "released" | "wallet_refused" | "session_ended"

/** Calls one unconfirmed session may keep waiting; the next one is answered -32005. */
export const MAX_HELD_PER_SESSION = 32

/** One transport session's gate on dispatch, opened when upstream reports the session established. */
export interface VerificationHold {
	readonly sessionId: string
	/** The session's own key-exchange hash, the value its check shows. */
	readonly verificationHash: string
	/** Settles once; the first settle wins. */
	readonly outcome: Promise<HoldOutcome>
	/** Counts one arriving call. False only while unsettled and at the cap. */
	admit(): boolean
	/** No check is needed, or the person confirmed it. */
	release(): void
	/** The session ended before release; held calls are dropped and their queued rows filed as `kind`. */
	drop(kind: Exclude<HoldOutcome, "released">): void
}

export class VerificationHolds {
	/** Opens the hold for a session, bound to its own hash; settles a previous hold for the same id `wallet_refused`. */
	open(sessionId: string, verificationHash: string): VerificationHold
	/** The current hold for `sessionId`, captured by a message on arrival; released holds stay until `end`. */
	get(sessionId: string): VerificationHold | undefined
	/** Releases the unsettled hold carrying `verificationHash`. False when none does. */
	confirm(verificationHash: string): boolean
	/** The session ended: drops its hold if still unsettled, and removes it from the map. */
	end(sessionId: string, kind: Exclude<HoldOutcome, "released">): void
	/** Holds not yet settled, for the lock rule. */
	unsettled(): VerificationHold[]
}

export function wireVerificationHold(deps: {
	holds: VerificationHolds
	onActiveProfileChanged: { add(listener: (profile: { id: string } | undefined) => void): unknown }
	onVerificationConfirmed: { add(listener: (payload: { verificationHash: string }) => void): unknown }
	terminateSession: (sessionId: string) => void
	logger: ILogger
}): void
```

```ts
// apps/extension/src/wallet/services/wallet-sdk/live-session.ts

/** A call's own transport session, bound so the call acts only while that exact session is live. */
export interface LiveSession {
	/** `handler.getSession(id) === session`: false once the session ended, even if the id re-keyed. */
	isLive(): boolean
	/** Sends `response` only while live; a reply never reaches a successor under the same id. */
	respond(response: WalletResponse): Promise<void>
	/** Terminates only while live; never ends a successor under the same id. */
	terminate(): void
}
export function bindLiveSession(handler: Pick<BackgroundConnectionHandler, "getSession" | "sendResponse" | "terminateSession">, session: ActiveSession): LiveSession
```

`DappSessionService` (spec, service, client):

```ts
confirmVerification(verificationHash: string): void       // RPC; ValidationError unless /^[0-9a-f]{64}$/
onVerificationConfirmed: { verificationHash: string }     // event, the same path as onVerificationRefused
```

A hold leaves the map only through `end` (its session terminated) or when `open` replaces it after a re-key. `release` and `drop` settle the outcome and keep the entry, so a call arriving after the release finds the hold and passes at once. A message that captured a replaced hold still observes that hold's outcome.

### Data and control flow

```text
key exchange done (upstream) ─► onSessionEstablished (synchronous):
                                  hold = holds.open(id, session.verificationHash)
                                  validated = handleSessionEstablished(session, { …, hold })
                                     … row, stamp …
                                     needsVerification ? show the check → true
                                                       : hold.release() → true
                                  validated.then(ok => ok || hold.drop("wallet_refused"))
                                  establishmentStatus.set(id, validated)                       (today)

message arrives ─► onWalletMessage (synchronous on arrival):
                     live = bindLiveSession(handler, session)
                     hold = live.isLive() ? holds.get(id) : undefined
                                                                  // captured; never re-read after an await
                     hold && !hold.admit() → answer -32005 now, no row, no FIFO; stop
                     establishedPromise (today's identity check)  ─► queued row for a top-level sendTx (today)
                   FIFO baton ─► runEstablishedMessage:
                     ok = await establishedPromise                                              (today)
                     outcome = hold ? await hold.outcome : "wallet_refused"
                     "released" and live.isLive() → handleWalletMessage(…, live):
                         fence capture → identity guard (its respond and terminate go through live)
                         → legal guard → live.isLive() checked synchronously → dispatcher.dispatch
                         → response tail: live.respond(response)
                     otherwise  → failQueuedIfUnclaimed(…, outcome, or "wallet_refused" when not live); no response; debug log

They match ─► verify page: setTrustedVerification (toggle on) → confirmVerification(urlHash) → close
                service: validate → emit onVerificationConfirmed ─► holds.confirm(hash) → "released"
termination ─► onSessionTerminated: holds.end(id, "wallet_refused") (a no-op once settled) + today's cleanup
lock ─► onActiveProfileChanged(undefined): drop every unsettled hold "session_ended", then terminate each session in its own try/catch
```

### Mechanics that are not obvious

- **Why the hold opens on the first tick.**
  - Upstream calls `onSessionEstablished` synchronously, right after it sets the active session and posts the key-exchange response. A dApp message needs a round trip through the content script and an async decrypt, so no message can arrive before the hold exists. The same reasoning already guards `establishmentStatus`.
  - Opening here also puts the hash at hand: it is on the `ActiveSession`. So `session-established.ts` needs only a `release()` dependency.
  - A missing hold at arrival (possible only if upstream reorders this) drops the call as `wallet_refused`. It is never let through.
- **Why a call acts only while its own session is live.** A call carries the `ActiveSession` object upstream handed it, and `bindLiveSession` binds every outward effect of the call to that object (`handler.getSession(id) === session`). A same-id successor can exist because termination restores the discovery and a confirmed check frees its slot, so the page can key-exchange the same id again; the successor is stamped to the same profile before its check shows.
  - **At arrival.** Upstream reads the session before it awaits the decrypt and does not re-check it (`background_connection_handler.js`, `handleEncryptedMessage`). A message whose decrypt finishes after its session ended and the id re-keyed arrives with the old object. It must not capture the successor's hold.
  - **After the hold releases.** A call parked in the FIFO keeps its settled establishment and its `released` hold. A dead session's call is dropped here, before it reads the fence or the legal record.
  - **Synchronously before `dispatcher.dispatch`.** `handleWalletMessage` awaits the fence capture, the identity guard and `legal.assertCurrent()` first; the session can end and re-key inside any of them. The last check sits after the legal guard with no await before the dispatch, so a dispatch never starts for an ended session. A stale call there is dropped: its unclaimed row fails `wallet_refused`, and nothing is sent.
  - **Every send and termination.** `sendResponse` addresses the session by id, so the identity guard's early error, its termination, and the response tail all go through `live.respond` and `live.terminate`. A reply to an ended session's call never goes out under a successor's key, and a stale guard never ends the successor.
  - This gap exists today for any re-keyed id; the hold makes it matter, because the successor may be unconfirmed. The upstream object closes it; no incarnation counter is added.
- **Why the hash, not the window.**
  - The verify URL carries the session's own `verificationHash`, written by the service worker. That is the value the person compared, and it is unique per key exchange because the wallet makes a fresh key pair each time.
  - security-ui-1's Phase 3.3 keyed the report by window because it had to tell a close apart from They match. With call 3 keeping the session on close, the window no longer has a role after the check is shown.
  - A service handler cannot see the caller's port sender (`BaseService.invoke`). A window id the page reports about itself therefore proves nothing the hash does not.
  - The dApp knows its own hash but cannot reach the RPC: service ports refuse a content script (`isTrustedInternalSender`), and the extension has no `externally_connectable`.
  - A stale window carries the hash of a settled hold, which `confirm` no longer finds. A second session's window carries a different hash.
- **Why the relay counts as acknowledged.** `emit` runs the service worker's own `EventHandler` listeners synchronously before it returns (`base-service.ts`, `event-handler.ts`). So `holds.confirm` has run before the RPC answers, and the page closes only after the release.
- **Why a lock ends unconfirmed sessions only.**
  - Today a lock tears no channel down, and confirmed channels keep that behaviour.
  - A lock also reroutes the open check to the auth screen and then to Home, so the check usually cannot be answered in that window. An unconfirmed session would hold its calls for nothing.
  - Ending the session gives the app the standard disconnect. A hold whose establishment is still running at the lock is ended too, trusted reconnect or not: an untrusted one's check page would mount locked, and a trusted one is still before `release`, which follows the MAC-gated `setVerificationHash` that a lock makes fail. Its app can reconnect.
  - Every unsettled hold is dropped `session_ended` first, then each session is terminated inside its own try/catch, as `profile-switch-teardown.ts` does. The terminations' `end(…, "wallet_refused")` then find settled holds, so the rows read the lock's copy, and one throwing termination cannot leave another hold held.
  - A fast unlock can supersede the lock's landing, so the check may stay mounted (`locked-state.ts`). That changes nothing: its hold is already dropped and removed, so a later They match finds no hold and only closes.
  - `profile-switch-teardown.ts`'s header line "LOCK deliberately tears nothing down" is narrowed to confirmed channels in the same PR.
- **Counting held calls.** The cap bounds the number of admitted waiting calls per session, not memory: payload bytes and messages still being decrypted are not counted (§ Residual risk).
  - `admit()` increments a counter only while the hold is unsettled. Every call admitted then is still waiting, because nothing passes or drops without settling the hold. The counter is therefore exactly the number of held calls, with no decrement path to get wrong.
  - Once released, `admit()` always says yes, and the execution lane's caps apply as today.
- **The queued row of a held send is unchanged.** It is created on arrival behind `establishedPromise` and vouched by `chainSendTxWithVouching` from id resolution to settlement. The invariant is the existing one: every journal-eligible top-level `sendTx` has its queued row before it waits.
- **The dropped-call message.** `failQueuedIfUnclaimed` takes a developer-box message (shown only in Developer or Debug mode). The drop reuses today's "Session no longer valid — reconnect" through one hoisted constant, so `copy-dash-ban.test.ts`'s reviewed entry still matches exactly once and no new words appear.

### Teardown table

Row kinds use existing copy (`utils/journal-state.ts`):
- **W** = `wallet_refused`: "Refused before sending" / "The wallet refused this request before anything was signed. Nothing was sent."
- **L** = `session_ended`: "Stopped when the wallet locked" / "The wallet locked while this was in progress."
- **Q** = `stuck_queued`: "Stopped before broadcast" (the reaper, today).

Only a row still `queued` is failed. A row the person cancelled from Home stays cancelled, and `execute` refuses a cancelled or reaped row with 4001 before any popup.

| Path | Held calls | What the app sees | A held send's queued row | The check window |
|---|---|---|---|---|
| They match | run in arrival order | results, as today | claimed as today | closes after the report |
| They don't match | dropped. `refuseVerification` ends every live channel of the app on that network under the row's profile, a second check's session included (today's refusal) | `SESSION_DISCONNECTED`: pending calls reject "Wallet disconnected" | W | closes (today). Another check of the same app stays open on a dead session, as today |
| Window closed, no answer | **kept** (security-ui-1 call 3) | calls stay pending; PONGs keep the channel alive | stays queued: vouched up to 90 min, then Q | gone; its slot frees (today) |
| Closed, then the session ends (any row below) | dropped | as that row | W (L for a lock) | — |
| Settings → Connected apps → Disconnect session | dropped (row deletion → revocation, today) | disconnect | W | — |
| Lock | dropped: every session not yet released ends (a held one, or one still establishing, trusted or not); released ones survive (today) | disconnect | L | rerouted to the auth screen (today) |
| Profile switch through the popup (lock, then the other profile) | dropped by the lock first | disconnect | L | as for a lock |
| Profile switch with no lock (a direct `open` over the active session) | dropped by today's switch teardown | disconnect | W | as today |
| Background restart | gone with the worker | the next PING gets the stale-session disconnect (today) | Q, from the boot sweep (today) | They match finds no hold and only closes; They don't match still works |
| The app disconnects | dropped | its own disconnect already rejected its calls | W | stays open on a dead session (today) |
| Tab closes | dropped (`terminateForTab`) | — | W | stays (today) |
| Tab reloads or navigates to an ordinary origin | **kept but inert.** Navigation is invisible without the `tabs` permission (`tab-lifecycle.ts` header) | — (the realm is gone) | stays queued, then Q | a later They match runs the old calls into a dead channel, as calls in flight during a navigation do today |
| Row deleted or expired | dropped (revocation, today) | disconnect | W | as today |
| Establishment fails after the hold opens | dropped (`validated` false settles W; today's gate already drops them) | disconnect when terminated | none: the queued-row gate is establishment, which failed | closed by today's failed-presentation cleanup |

### File-level change map (whole arc)

**Added:**
- `apps/extension/src/wallet/services/wallet-sdk/verification-hold.ts`
- `apps/extension/src/wallet/services/wallet-sdk/verification-hold.test.ts`
- `apps/extension/src/wallet/services/wallet-sdk/live-session.ts`
- `apps/extension/src/wallet/services/wallet-sdk/live-session.test.ts`
- `apps/extension/tests/e2e/network/verify-hold.test.ts`

**Modified, production:**
- `wallet-sdk/background.ts`:
  - adds `holds` to `SdkHandlerState`;
  - opens a hold in `onSessionEstablished` and wires the `validated` drop;
  - calls `end` in `onSessionTerminated`;
  - captures the hold and admits against the cap in `onWalletMessage`;
  - adds the outcome gate in `runEstablishedMessage`;
  - adds `refuseOverHeldCap` and `dropHeldMessage`;
  - threads a `LiveSession` into `handleWalletMessage`: the identity guard's `respond` and `terminateSession` callbacks, a synchronous `isLive()` check right before `dispatcher.dispatch`, and the response tail all go through it. If the function then exceeds a budget, extract a helper; never a suppression;
  - hoists the dropped-call constant;
  - wires `wireVerificationHold`.
- `wallet-sdk/session-established.ts`:
  - adds the `hold: Pick<VerificationHold, "release">` dependency;
  - keeps `handleSessionEstablished` under its 80-line budget (78 counted today; the release adds one or two). If Biome reports it over, extract the check's presentation (`showCheck`), never a suppression;
  - calls `if (!needsVerification) deps.hold.release()`.
- `wallet-sdk/profile-switch-teardown.ts`: header sentence only.
- `packages/extension-messaging/src/errors.ts` (`TooManyPendingError`'s doc comment) and `wallet-sdk/error-envelope.ts` (its comment): they say the error comes from the execution lane or from `sendTx`; now a held call can get it too. Comments only; the message is unchanged.
- `dapp-session/spec.ts`, `dapp-session/service.ts`, `dapp-session/client.ts`: the method and the event.
- `popup/windows/verify/index.vue`: `checkHash` ref and the report in `handleConfirm`. No template change.

**Modified, tests and fixtures:**
- `wallet-sdk/test-services.ts`: the event.
- `wallet-sdk/session-established.test.ts`.
- `wallet-sdk/background.connect-window.test.ts` (a callback integration test over stubbed services, not a composition test in `tests/COMPOSITION-TESTS.md`'s sense): the edits at `:540` and `:551`, plus new cases. The harness keeps one stable `ActiveSession` object per live session id: `establish` creates it with a wire-shaped 64-hex hash (today `HASH-<id>`), messages and confirmations reuse that same object and hash, a re-key replaces it, and the mocked handler's `getSession` returns it (today `getActiveSessions` builds fresh objects and messages pass their own). `boot()` gains a stateful journal fake (`transitionIfStage` and a row read, so W and L are observable), a `sendResponse` spy, `confirm(hash)`, `refuse()` (emits `onVerificationRefused`), `lock()` and `switchProfile(id)` (each emits `onActiveProfileChanged`).
- `wallet-sdk/background.discovery-race.pins.test.ts` and `background.init-order.pins.test.ts`: their own service stubs gain `onVerificationConfirmed`, or `wireVerificationHold` throws at init.
- `wallet-sdk/background.legal.test.ts`, `background.refusal-log.test.ts`, `session-revocation.test.ts`: their mocked handlers gain an identity-preserving `getSession`, or every call reads as an ended session.
- `wallet-sdk/background.init-order.pins.test.ts:136`: three profile subscriptions become four.
- `dapp-session/service.test.ts`.
- `popup/windows/verify/index.window.test.ts`: the exact call log at `:195-202`.
- `popup/windows/verify/index.test.ts`.
- `tests/e2e/fixtures/send.ts`: `reconnectPlayground`.
- `tests/e2e/fixtures/popups.ts`: gains `recordCreatedWindows`.
- `tests/e2e/fixtures/journal.ts`: a new function that reads a row's failure kind (`error.kind`). It must not extend `readDappExecuteRecords`, which carries an accepted complexity stamp.
- `tests/e2e/network/connect-one-window.test.ts`: imports it.
- `tests/e2e/network/session-reconnect.test.ts`: a read right after a trusted reconnect.

**Modified, docs:**
- `ARCHITECTURE.md` § 8: one paragraph on calls waiting for They match.
- `apps/extension/tests/e2e/FIREFOX.md`: its line on `reconnectPlayground` letting the wait expire.

### Trade-offs and alternatives

See § Decision ledger for the forks between the drafts. The rejected alternatives:
- **M2 (refuse while held).** A new refusal is a C11 contract change every app must retry around, and M1 is sound: the app side has no per-call timeout and PONGs keep the channel alive.
- **Folding the hold into establishment's promise.** Tests await it. The queued row would wait for They match, breaking the rule that two concurrent sends both show queued. A drop could not carry its kind.
- **The hold on `WindowReservation`.** A reservation is released when its window is removed, and the hold must outlive the window. Stretching the reservation would break "a window never outlives its slot" from the other side.
- **Binding by window id (security-ui-1 Phase 3.3's shape).** Shown above to add nothing over the hash once a close keeps the session.
- **A sender-derived window identity (Codex).** It would need `invoke` to carry request context in `@nulo/extension-messaging` (a cross-package change) and per-browser sender probing. It protects only against extension pages, which are trusted.
- **A global or per-origin held cap, a byte budget, an unconfirmed-session bound (Codex).** One origin's flood could refuse another origin's calls under a global cap. Origins are paced by the person's approvals and held sessions by windows the person must close. Bytes are unbounded today for any call waiting in the FIFO.
- **A hold expiry timer (Codex).** Every session's row expires lazily today. The first released call's row read expires it and revokes the session, exactly as for a trusted session.
- **An e2e-build trace recorder for "never dispatched" (Codex).** The callback integration test proves non-dispatch on the real `background.ts` callbacks with a dispatch spy and a success control. The network suite proves the flow a person and an app observe (the row, the disconnect, no new window), with the matched case's execute window as its control. A recorder would be new e2e-only production code for a fact the composition layer already proves.

## Security & Adversarial Considerations

**Threat model.**
- **The attacker** is the page on the other end of the channel: a phishing look-alike, or a page that took over a legitimate tab. It speaks the wallet-sdk protocol and knows its own verification hash (both peers derive it). It can open sessions, send any message at any rate, disconnect, and reconnect.
- **The defender** is the person. The check is the only point where they can tell this channel's peer from the one they meant.
- **Out of scope:** an attacker running code inside an extension page, who already holds everything the hold protects.

| Attack | What stops it | Proof |
|---|---|---|
| Run a call before the person answers (the issue itself) | Dispatch awaits the captured hold behind the per-session FIFO; the hold opens synchronously before any message can arrive; a missing hold drops the call | callback integration: the dispatch spy stays empty until `confirm`, with a success control on a trusted reconnect |
| Skip the check by reconnecting | Only two things release a hold: `!needsVerification` (the approval marker and the row's trust flag, neither app-writable) and a confirmation of the session's own hash. A reconnect is a new key exchange with a new hash | `session-established.test.ts`: an untrusted reconnect holds, a trusted one releases |
| Release one session with another's confirmation | `confirm` matches the session's own hash, which is unique per key exchange; a stale window's hash names a settled hold | unit: a wrong, stale or predecessor hash releases nothing, with the right one as control |
| Forge a confirmation from the page | Service ports refuse content scripts. The hash is not a secret, so reachability is the boundary | existing `sender-auth` tests; the RPC adds no new ingress |
| Race a lock, a termination or a re-key against a confirmation | Every hold transition is synchronous on one thread and settles once. A call acts only while its own `ActiveSession` is the live one (`bindLiveSession`): at arrival, after the release, synchronously before the dispatch, and on every send and termination, so neither a late old-key message nor a call parked or paused across a re-key reaches or answers the successor | unit: settle-once and re-key; callback integration: a lock during the hold, a late old-session message, a parked call, a deferred legal read and a deferred fence across a re-key |
| Flood a held session | `admit()` caps admitted waiting calls at 32 per unconfirmed session. The call past the cap is answered `-32005` at arrival and keeps nothing | callback integration: the 33rd call gets `-32005`; control: the first 32 run after confirm |
| Keep a session held forever | PINGs keep the channel open. The session ends when the person refuses, disconnects it in Settings, or locks; when the app disconnects; or when the tab closes. Held sessions are paced by windows the person must close | not bounded by a timer (Good enough) |
| Trick the person into confirming | Out of scope: the check's screen is unchanged, and a mismatch is the person's call | — |

**Invariants the implementation keeps.**
- `ExecutionCoordinator.sendTxTask` keeps the only `node.sendTx` and its `assertCurrent` → `assertLive` order. The hold sits before dispatch, never on the broadcast line, and `call-sites.test.ts` stays untouched.
- `VerifyAdmissionGate`: a window never outlives its slot. The hold neither frees nor keeps a slot.
- security-ui-1 call 3: closing the check keeps the session.
- A lock tears no confirmed channel down. `wallet-locked-mid-session.test.ts` stays green unchanged.

**Logging.**
- A confirmation that finds no hold, a dropped held call, and a cap refusal each log at `debug` only, with the session id and the method at most.
- Never the hash, the URL, or the call's arguments (§ Logging policy). `log-payload-ban.test.ts` scans the new lines.
- `isExpectedRefusal` already classes `TooManyPendingError`.

**Residual risk.**
- **Payload size is not bounded at ingress** (`content-script-validator.ts`). This is true for any call waiting in the FIFO today; the cap bounds count, not bytes. At close-out it is filed as an issue if none owns it.
- **A send held for more than about 100 minutes** (the 90-minute lease plus the reaper's grace) has its row reaped as `stuck_queued` while the app's promise still waits. A later They match then meets `execute`'s refusal (4001) before any popup. This is the same as any call that waits that long in the FIFO today.
- **Held sends use queued-row visibility longer.** A held send's queued row can sit for up to about 100 minutes and counts against `MAX_QUEUED_GLOBAL` (32). A few held sessions with transaction grants can use up other apps' queued-row visibility for that long; a send past the cap still waits and dispatches, only without a row (today's rule).
- **The confirmation event carries the hash to every extension page** listening on the service's port. The hash is not a secret, and only extension pages receive it.

## UI impact

**No pixel, word or layout change on any screen.** What changes is *when* things happen, and a person can notice it on these surfaces. Each is an `OWNER-ASKS.md` entry in "what ships now" form, and the decision page must be signed before the PR merges (DH-0).

| Surface | Before | After (ships now) |
|---|---|---|
| Emoji check, new connection (inside the connect window after Allow) | The app's calls run while the check is on screen. They match only closes the window, and writes trust if the toggle is on | Same screen, same words. The app's calls wait. They match releases them, then closes the window |
| Emoji check, untrusted reconnect (its own window) | Same as above | Same as above |
| Emoji check closed without an answer | The app's calls already ran | The app stays connected and its calls stay pending until the session ends. Nothing on screen says so (DH-6) |
| An approval window a held call opens (connect capabilities, execute, sign) | Opens beside the check while it is still open | Opens only after They match, and never after They don't match (DH-0) |
| Lock while a check is open | The check goes to the auth screen. The session survives, and its calls already ran | Same routing. The unconfirmed session ends and the app gets the standard disconnect (DH-2) |
| Home and History: a held app send | A queued row on arrival, claimed within moments | The same queued row, now waiting until They match. If the session ends first, the row fails with existing copy: W, or L after a lock, titled "Transaction" as every queued-row failure is today (DH-3) |
| Journal detail, Developer or Debug mode, a dropped held send | — | today's developer line "Session no longer valid — reconnect" (existing words) |
| Playground (`apps/playground`) | `connected`, then each call's `pg-result` row settles at once | `connected`, then each call's row stays `pending` until They match. No playground change (DH-4) |
| The app, past 32 held calls | — | `-32005` with today's message, which says "transactions" (DH-5) |
| Settings → Connected apps | unchanged | unchanged |

## Assumptions

**Facts** (from recon, re-verified at 527b369f):
- **F1.** Upstream calls `onSessionEstablished` synchronously after it posts the key-exchange response. A message needs a round trip through the content script and an async decrypt, so a structure created synchronously there exists before any message arrives.
- **F2.** `verificationHash` is HMAC-SHA-256 hex: 64 lowercase hex characters, fresh per key exchange, and present on the `ActiveSession` at `onSessionEstablished`. Both peers derive it, so it is not a secret.
- **F3.** Service ports refuse content scripts (`isTrustedInternalSender`), and `BaseService.invoke` sees no sender.
- **F4.** `emit` runs the service worker's own `EventHandler` listeners synchronously before it returns.
- **F5.** A lock reroutes every open extension page, the check included, to the auth screen and afterwards to `/popup/general`; the check page sets no return route. A fast unlock can supersede that landing (`locked-state.ts`), so the check may stay mounted.
- **F6.** A held call's dApp promise has no per-call timeout. `ExtensionWallet` rejects only on disconnect or after 300 s without inbound traffic, and the wallet answers PINGs independently of dispatch.
- **F7.** The queued row of a top-level `sendTx` is created on arrival, behind establishment and outside the FIFO, and is vouched while it waits. Past the 90-minute lease plus the reaper's grace it fails `stuck_queued`, and the boot sweep does the same.
- **F8.** A profile switch through the popup runs through a lock (the auth screen's profile pill). `SessionManager.open` over an active session emits only the new profile.
- **F9.** `connectPlayground` answers the check with `approveVerify`, which waits for the window to close. `reconnectPlayground` races the check against `connected`, and both of its callers reconnect an untrusted row.
- **F10.** `TooManyPendingError`'s message is a stable public contract and says "transactions".

**Inferences:**
- **I1.** An unconfirmed session at a lock can, in general, no longer be confirmed from its window (F5), so holding its calls past the lock usually waits for nothing. Where the check stays mounted, the lock has already dropped its hold, so its They match releases nothing.
- **I2.** Honest apps keep at most 32 calls pending before They match. There is no data on this; the playground sends a handful.
- **I3.** Every network spec connects through the check, so the full network suite on both browsers is the regression net for the fence, not just the new file.

**Asks** (each with the working assumption the plan builds on):
- **Ask 1.** P2-09 brings "its screens and the app-side wait back for sign-off before merge". *Working assumption:* the PR may open once its gates pass, and its merge waits for the decision page's signature on the shots (DH-0).
- **Ask 2.** A lock ends unconfirmed sessions (L5). *Working assumption:* yes; DH-2 states the alternative.
- **Ask 3.** The held-call cap answers `-32005` with today's message. The lane brief says #201's rule applies to held calls; the code and its meaning are unchanged, so no C11 page item is needed. *Working assumption:* yes; DH-5 asks about the message's wording.

## Phases

One arc, four phases. Each phase ends with its gate. Inside a phase, run the fast layers (`bun run lint`, `bun run typecheck:all`, the touched package's tests) after each meaningful step, not only at the gate.

### Phase 1: the hold registry and the confirmation report

**Change map:**
- Added: `wallet-sdk/verification-hold.ts` and `verification-hold.test.ts`.
- Modified:
  - `dapp-session/spec.ts`, `service.ts`, `client.ts`: `confirmVerification` in `Methods`, `rpcMethods` and the client passthrough list; `onVerificationConfirmed` in `Events`, the service and the client.
  - `dapp-session/service.test.ts`.
  - `wallet-sdk/test-services.ts`: the event on `fakeSdkServices`.
  - `popup/windows/verify/index.vue`, `index.window.test.ts`, `index.test.ts`.

**Steps:**
1. **The registry.** Write `VerificationHolds`, `VerificationHold` and `MAX_HELD_PER_SESSION` as § Key types states, using `deferred` for the settle-once outcome.
2. **The service method.** `confirmVerification` refuses anything but a string matching `/^[0-9a-f]{64}$/` with `ValidationError`, then emits. It does no storage write and takes no lock.
3. **The page.** `handleConfirm` runs the existing trust write, then `await confirmVerification(checkHash)` when the URL carried a hash, then closes. It never reports the row fallback hash. A failure releases the latch and keeps the window, as a failed trust write does today.

**Tests that land:** § Tests 1–6, 10–14.

**Validation gate:**
- Commands: `bun run lint`; `bun run typecheck:all`; `bun run test`.
- Pass criteria: all exit 0; the new cases pass; `index.window.test.ts`'s exact call log names `confirmVerification` with the wire-shaped hash.

### Phase 2: the dispatch fence, the cap and the lock rule

**Change map:**
- Added: `wallet-sdk/live-session.ts` and `live-session.test.ts`.
- Modified:
  - `wallet-sdk/background.ts`.
  - `wallet-sdk/session-established.ts`: `release` (and `showCheck` only if Biome reports the budget).
  - `wallet-sdk/profile-switch-teardown.ts`: header.
  - `wallet-sdk/verification-hold.ts`: `wireVerificationHold`.
  - `wallet-sdk/session-established.test.ts`.
  - `wallet-sdk/background.connect-window.test.ts`.
  - `wallet-sdk/background.init-order.pins.test.ts` and `background.discovery-race.pins.test.ts` (their stubs gain the event).
  - `wallet-sdk/background.legal.test.ts`, `background.refusal-log.test.ts`, `session-revocation.test.ts` (identity-preserving `getSession`).

**Steps:**
1. **`onSessionEstablished`.** Open the hold before `handleSessionEstablished`, pass `hold` in its deps, and drop it `wallet_refused` when `validated` resolves false or rejects.
2. **`handleSessionEstablished`.** Release the hold on `!needsVerification`. Extract `showCheck` only if Biome reports the function over its 80-line budget; never a suppression.
3. **`onWalletMessage`.** Bind the call's session (`bindLiveSession`), capture the hold only while it is live, and admit the call. `refuseOverHeldCap` answers `TooManyPendingError` through today's error envelope, logs at `debug`, and returns before the queued row and the baton.
4. **`runEstablishedMessage`.** After today's establishment gate, await the captured hold's outcome. If it is not `released`, or the session is no longer live, `dropHeldMessage` fails the queued row with that kind (`wallet_refused` for a dead session) and the hoisted message, logs at `debug`, and sends nothing. Pass the `LiveSession` into `handleWalletMessage`: its identity guard responds and terminates through it, it checks `isLive()` synchronously after `legal.assertCurrent()` and drops a stale call the same way, and its response tail sends through `live.respond`, after the switch-epoch gate.
5. **`onSessionTerminated`.** Call `holds.end(id, "wallet_refused")`.
6. **`wireVerificationHold`.** Wire it next to `wireProfileSwitchTeardown`: confirmations go to `holds.confirm`; on `undefined`, drop every unsettled hold `session_ended`, then terminate each session inside its own try/catch.
7. **Comments.** Update `TooManyPendingError`'s and the envelope's doc comments to name held calls as a source.

**Tests that land:** § Tests 6b, 7–9, 15–25 (with 23b–23f); edit the existing cases at `background.connect-window.test.ts:540`/`:551` and `background.init-order.pins.test.ts:136`.

**Validation gate:**
- Commands: `bun run lint` (this includes the complexity-baseline check); `bun run typecheck:all`; `bun run test`; `bun run test:all`.
- Pass criteria: all exit 0. `scripts/complexity-baseline/manifest.json` is unchanged, with no new acceptance and no suppression. With the `confirm` step removed, the two edited callback integration cases fail; check this once by hand, then restore.

### Phase 3: the network proof and the docs

**Change map:**
- Added: `tests/e2e/network/verify-hold.test.ts`.
- Modified:
  - `tests/e2e/fixtures/send.ts`.
  - `tests/e2e/fixtures/popups.ts`.
  - `tests/e2e/fixtures/journal.ts` (the failure-kind read).
  - `tests/e2e/network/connect-one-window.test.ts`.
  - `tests/e2e/network/session-reconnect.test.ts`.
  - `tests/e2e/FIREFOX.md`.
  - `ARCHITECTURE.md`.

**Steps:**
1. **`reconnectPlayground`.** Wait for the check deterministically (its window target), answer it with `approveVerify`, then wait for `connected`.
2. **`recordCreatedWindows`.** Move it into `fixtures/popups.ts`, now that it has a second user.
3. **The new spec.** Write `verify-hold.test.ts` (§ Tests 26–30) and the trusted-reconnect read in `session-reconnect.test.ts` (§ Tests 31).
4. **The docs.** Update the `FIREFOX.md` line and the `ARCHITECTURE.md` § 8 paragraph.

**Validation gate.** `bun run lint` and `bun run typecheck:all` first (this phase edits e2e TypeScript). Every network command then runs at retry 0 on Chrome, and again with `NULO_E2E_BROWSER=firefox` in front. Two of the targeted files and about a dozen others are `@requires-proverless`, and `scripts/e2e/proverless-guard.sh` refuses an unarmed run that selects one, so the targeted and full runs are armed as CI's proverless pool is:
- `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/verify-hold.test.ts tests/e2e/network/session-reconnect.test.ts tests/e2e/network/connect-one-window.test.ts tests/e2e/network/connect-verify-mismatch.test.ts tests/e2e/network/concurrent-sendtx.test.ts tests/e2e/network/inflight-call-background-death.test.ts tests/e2e/network/firefox-background-restart.test.ts tests/e2e/network/session-profileSwitch.test.ts tests/e2e/network/wallet-locked-mid-session.test.ts tests/e2e/network/lock-cancels-dapp-send.test.ts`
- Then the full suite once per browser: `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent` (I3).
- The prover-ON canary files once per browser, unarmed: `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/frozen-account-canary.test.ts tests/e2e/network/passkey-execution-canary.test.ts` (both connect through the check).
- Smoke, because the popup changed: `bun run test:e2e` and `NULO_E2E_BROWSER=firefox bun run test:e2e`.

**Pass criteria:**
- Every network file is green at retry 0 on both browsers. `firefox-background-restart` is Firefox-only, as today.
- Smoke is green on both browsers. A smoke test that passes only on its config retry is named in the PR body as a flake and replayed once to show it.

### Phase 4: the shots and the pre-PR gate

**Change map:** none committed. The capture spec (`tests/e2e/network/zz-shot-*.test.ts`) is local and deleted before the commit.

**Steps:**
1. **The captures.** On both browsers, light theme, capture:
   - the check for a new connection and for an untrusted reconnect, each while a call is held;
   - the playground with a `pending` call during the check;
   - a held `requestCapabilities`' approval window opening after They match;
   - Home and History with a held send's queued row;
   - History with a dropped held send (W) and a lock-dropped one (L), each titled "Transaction";
   - the journal detail of a dropped held send in Developer mode.
2. **Where they go.** Into the PR body, where the orchestrator's decision page reads them. Never into the extension bundle.

**Validation gate:**
- Commands: `bun run audit:vue`; `bun run test:ci-gating`.
- Pass criteria:
  - both exit 0;
  - one shot per screen surface of § UI impact per browser, each matching its "After" column; the app-side `-32005` message is quoted in the PR body, not captured;
  - `git status` shows no `zz-shot-*` file.

## Tests

The smallest set that proves the hold works and that each way it ends is caught. Every negative assertion has a success control in the same test or the same file.

### Unit: `verification-hold.test.ts`

1. `open` then `confirm(hash)` settles `released` and returns true; `get` still returns the hold and `admit()` is true. This is the control for 2–4.
2. `confirm` with an unknown hash, or with the hash of a settled hold, releases nothing and returns false. (Another live session's hash releases that session only: test 20.)
3. Settle-once: `drop("session_ended")` then `end(…, "wallet_refused")` stays `session_ended`.
4. Re-key: `open` on an id that has a hold settles the previous one `wallet_refused`. The old hash then releases nothing; the new hash releases the new hold.
5. `admit()` accepts 32 and refuses the 33rd while unsettled. Control: after `release`, every call is admitted.
6. `unsettled()` lists only unsettled holds; `end` removes the hold from the map and drops it if unsettled.

### Unit: `live-session.test.ts`

6b. `isLive`, `respond` and `terminate` act while `getSession(id)` returns the bound object; once it returns another object or none, `respond` sends nothing and `terminate` ends nothing. Control: the bound object's own response is sent.

### Unit: `session-established.test.ts`

7. A new connection and an untrusted reconnect show the check and do not call `release`.
8. A trusted reconnect calls `release` and shows no check.
9. A failure exit (lost approval, dead session, failed presentation) does not call `release`.

### Unit: `dapp-session/service.test.ts`

10. `confirmVerification` with a 64-lowercase-hex hash emits `onVerificationConfirmed` with it. Uppercase, 63 characters, or a non-string throws `ValidationError` and emits nothing.

### Component: the verify page

11. They match with the toggle on: the exact call log becomes trust write, then `confirmVerification:<URL hash>`, then close. The URL hash is wire-shaped (64 hex).
12. With the toggle off it confirms and never writes trust.
13. The URL hash is reported, never the row's fallback hash. A URL without a hash closes without reporting.
14. A failing confirm keeps the window and both buttons usable (control: success closes). They don't match never confirms (control: They match does).

### Callback integration: `background.connect-window.test.ts`

The real `background.ts` callbacks over stubbed services and a mocked SDK handler (not a `*.composition.test.ts`). `boot()` gains the helpers in the change map.

15. Read A, `sendTx` S and read B are sent while the check shows. S's queued row exists at once, and dispatch is not called after the queue flushes. After `confirm`, dispatch runs in order A, S, B, and a read C sent after the confirmation dispatches at once. Control: on a trusted reconnect the same calls dispatch with no confirm, and so does a call sent after the release.
16. They don't match terminates the session. Dispatch never runs, and S's row fails `wallet_refused`.
17. Closing the check keeps S held with no termination and no dispatch. Then the tab closes: the session terminates, dispatch never ran, and the row fails `wallet_refused`.
18. A lock with one confirmed and one held session terminates only the held one, whose row fails `session_ended`. The confirmed one survives. A `confirm` with the dropped session's hash afterwards releases nothing. A termination that throws for one held session still leaves the other dropped.
19. A direct switch to another profile ends the held session through today's switch teardown; the row fails `wallet_refused`.
20. Two checks for one origin: confirming the second's hash dispatches only its calls. Control: confirming the first then dispatches the first's.
21. Thirty-three calls while held: the 33rd gets `-32005` (`TOO_MANY_PENDING`) at once, with no row. After confirm, 32 dispatch.
22. A hold dropped while S's queued row is still being written still fails that row once the write lands.
23. Establishment resolving false settles the hold. No call dispatches, and no row exists.
23b. Row deletion (`rowDeleted`) during the hold revokes the session; the held call never dispatches and its row fails `wallet_refused`.
23c. Late old-key message: the session terminates and the same id key-exchanges again (a second `discover()` with that id after the first check window closed, since a re-key through the restored discovery gets no slot otherwise). A message delivered afterwards with the old session object is dropped, not dispatched, even after the successor is confirmed. Control: the successor's own message dispatches.
23e. Deferred legal read: a confirmed session's call pauses inside `legal.assertCurrent()` (a deferred stub); the session terminates and the same id re-keys an unconfirmed successor; the read resolves. The dispatcher is never called and nothing is sent; the row fails `wallet_refused`. Control: the same call with no re-key dispatches.
23f. Deferred fence with a stamp mismatch: a call pauses inside `captureExecutionFence`; the session terminates and the same id re-keys under another profile; the fence resolves. The identity guard sends no error under the successor's key and does not terminate the successor. Control: with the predecessor still live, the guard's error is sent and the session ends (today's pin).
23d. Parked call across a re-key: a confirmed session's second call waits behind a slow first one in the FIFO; the session terminates and the same id re-keys (as in 23c) before the first call settles. The parked call is never dispatched and gets no response; its row fails `wallet_refused`. Control: a call of the successor dispatches after its own confirmation.
24. The edited `:540` and `:551` cases confirm before they expect dispatch.
25. `background.init-order.pins.test.ts`: four profile subscriptions.

### Network e2e: `tests/e2e/network/verify-hold.test.ts`

Runs on Chrome and Firefox at retry 0, connecting with stored grants.

26. **Matched.** Set `pg-input-from` to the account address first: after the reconnect the playground has no selected account, and its held `requestCapabilities` cannot fill one, so a send without `from` would get no queued row. While an untrusted reconnect's check is open, the app sends read A (`getChainInfo`), sends S1 and S2, then read B.
    - Two `queued` rows show before They match.
    - After They match, S1's execute window opens and A then settles `ok` (`waitForPgResult`). The dispatch order is test 15's to prove; A's response travels through a fire-and-forget tab message, so its rendering may trail S1's window.
    - Reject S1 and S2; B ends `ok`.
27. **They don't match.** S's row reads `wallet_refused` (the new failure-kind read), A rejects "Wallet disconnected", and `recordCreatedWindows` saw no window created after the check opened. The observed behaviour of the drop; non-dispatch itself is test 16's proof. Test 26's execute window is the success control for the window count.
28. **Closed check.** Close the check with S held: the app still shows `connected` and the row is still `queued`. Then close the app's tab: the row reads `wallet_refused`, and no window was created after the check opened.
29. **Two tabs.** Match each check window to its tab through `pg-verification-hash`. Approving tab 2's check settles tab 2's read `ok` while tab 1's stays `pending`. Closing tab 1 then files tab 1's S `wallet_refused`.
30. **Lock.** Lock with the check open: the app gets the disconnect and S reads `session_ended`.
31. **Trusted reconnect** (`session-reconnect.test.ts`): a read sent right after a reconnect with "Skip this check next time" on settles `ok` with no check window.

## Delivery

**One plain PR against `dev`, no stack.** It opens only after Phases 1–4 pass and the Codex fix loop converges.

| PR title (73 characters) | Closes | Merge condition |
|---|---|---|
| `feat(dapp): hold an app's calls until the person confirms the emoji check` | `Closes #15` | green required checks; both browsers' network lanes at retry 0; the orchestrator's signed decision page for every `OWNER-ASKS.md` entry |

This PR closes #15. If the decision page approves a visible line, it lands in this PR before merge, with the owner's sign-off quoted in the body. If no line is approved, that is a disposition line in the Outcome.

**The PR body carries:**
- the `UI impact` table;
- the Phase 4 shots for both browsers;
- the teardown table;
- the answers to the Asks.

It never names a finding id or a draft advisory.

**Commit order inside the PR.** One logical commit per phase, each green on its own gate. The close-out commits come last: the Outcome, `lessons.md`, the archive move, and the index line.

## Post-implementation

1. **The Codex fix loop**, before the PR opens.
   - Each round runs `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` on the branch diff against `dev`, with an explicit adversarial brief: skip the check, a stale or forged confirmation, lock and termination races, a flood, logging.
   - The brief also carries the no-over-engineering rule ("do not add mechanisms the plan rejected in its ledger unless you show a concrete failure they prevent") and the comment rule ("comments state invariants and whys; never a plan, phase, audit, or issue number").
   - Fix the accepted findings and record every finding's disposition in `plan.md`.
   - **Hard stop at three rounds.** Anything still open becomes an issue or an Ask, never a fourth round.
2. **No monkey-patches.** No loosened or skipped assertion, raised timeout, retry over a race, `skipIf`, or suppression. A red network file at retry 0 is either a flake, proved by replay, or a bug, fixed.
3. **The close-out ships with the PR:**
   - the Outcome block after the front matter;
   - generalizable gotchas promoted to `implementations-plan/lessons.md` (deduplicated, within the 8 KiB budget);
   - every open item filed in its home (table below);
   - `git mv` into `archive/` in its own commit, with relative links repaired;
   - the index line moved to `archive/index.md`.

| Situation | Home |
|---|---|
| Work inside the implementation | this `plan.md` and the PR |
| Actionable work that outlives the plan (the ingress payload-size bound, if no issue owns it) | a GitHub issue with a domain label and a `Record` link |
| Needs a product call or waits outside the repo | an issue labelled `owner-decision` or `blocked:external` |
| A suspected exploitable weakness | a private draft security advisory |
| Rejected, superseded or done | a disposition line in the Outcome |
| Knowledge that prevents a repeat | `implementations-plan/lessons.md` |

4. **Teardown**, after the close-out lands on `dev`. Leave the worktree (`ExitWorktree` with `keep` if it was entered through `EnterWorktree`), then run `agent-worktree done dapp-dispatch-hold --merged`. A refusal is relayed, never worked around.

## Decision ledger

D = driver draft, C = Codex draft, O = Opus draft. Later rounds amend a row in place and say so.

| # | Question | D | C | O | Chosen | Why |
|---|---|---|---|---|---|---|
| L1 | M1 or M2 | M1 | M1 | M1 | M1 | P2-09 chose it. M2 adds a refusal every app must retry around |
| L2 | Where the hold lives | own module | own module | own module | `verification-hold.ts` | Establishment's promise gates the queued row, which must stay on arrival. The reservation dies with the window, and the hold must not |
| L3 | When the hold opens | at `hold()`, right before the window | synchronously in `onSessionEstablished` | synchronously, with the hash | synchronously in `onSessionEstablished`, bound to the session's hash (O) | One path for every session. No lock epoch and no `hold()` step. `session-established` only releases |
| L4 | What binds the confirmation | the hash, internal RPC, event | sender-derived window, hash and incarnation, acknowledged RPC | the hash, internal RPC, event | the hash, internal RPC, event | The attacker cannot reach the RPC; the hash is unique per key exchange and is what the person compared. Window keying served Phase 3.3's close detection, which call 3 dropped. Sender proof is a cross-package change that guards only against trusted pages. The relay is acknowledged in effect (F4) |
| L5 | Lock | end held sessions | end unconfirmed | end unconfirmed | end unsettled holds, then terminate; confirmed channels unchanged | The lock makes the check unanswerable (F5). Owner ask DH-2 |
| L6 | Flood bound | 32 per session | 8/8/32, plus unconfirmed-session bounds, plus a byte budget | 32 per session, on the hold | 32 per unconfirmed session, counted on the hold (O) | No decrement path. A global or per-origin cap lets one flood refuse others; bytes are an existing, unchanged gap |
| L7 | Cap refusal | `-32005` | `-32005` | `-32005` | `-32005` at arrival, before any row or FIFO slot, with today's message | #201's ratified meaning. No row means no #340-style History row. The message wording is DH-5 |
| L8 | Expiry timer | none | a timer | none | none | Row expiry is lazy for every session today. The first released call's row read revokes an expired session |
| L9 | Never-dispatched proof | composition spy | e2e trace recorder | composition spy plus a causal e2e barrier | a dispatch spy in the callback integration test; e2e asserts observed behaviour (amended by the contradiction check and the double audit) | A W row can also come from failures after dispatch, so the e2e proves the flow, not non-dispatch. The recorder is new production code for what the composition spy proves |
| L10 | Delivery | arc 1 plus a conditional arc 2 | one PR | one PR | one PR; an approved line joins it before merge | The merge already waits for the decision page, so a second arc only adds a review cycle |
| L11 | PR type | `fix(dapp)` | `feat(wallet)` | `feat(dapp)` | `feat(dapp)` | The app-observable behaviour changes (calls wait) and a new RPC appears. The scope matches the area's recent PRs |
| L12 | Drop message | new words | — | the hoisted existing literal | the hoisted existing literal (O) | No new words; the copy-dash review still matches once |
| L13 | `handleSessionEstablished` budget | — | — | extract `showCheck` | extract only if Biome reports it over (amended by the contradiction check) | 78 counted lines today; the release adds one or two. Suppressions are banned either way |
| L14 | Full network suite before the PR | targeted files | targeted files | the full suite on both browsers | targeted files, then the full suite once per browser | Every network spec connects through the check (I3) |
| L15 | A released hold in the map | — | removed when settled | removed when settled | kept until `end` or a re-key (contradiction check) | Removing it on release would drop every later call as "no hold" |
| L16 | Calls from an ended session after a same-id re-key | — | — | — | `bindLiveSession` (`handler.getSession(id) === session`) at arrival, after the release, synchronously before the dispatch, and on every send and termination (contradiction check; widened by the double audit and the final pass, replacing a hash comparison at arrival only) | Upstream hands `onWalletMessage` the object it read before the decrypt, and a parked call keeps its settled gates; the session object is the ground truth upstream already owns |
| L17 | The Phase 3 network gate | — | — | — | armed `NULO_E2E_PROVERLESS=1` for the targeted and full runs, plus the prover-ON canary files unarmed (double audit) | The proverless guard refuses an unarmed selection of a `@requires-proverless` file |

## Audit verdicts

### Contradiction check (2026-10-13)

**Codex (gpt-6.1-sol, high, fresh session): contradictory.** Seven findings, all accepted:
1. Blocker: a released hold removed from the map makes every later call "no hold" and drops it. Fixed: a hold leaves the map only through `end` or a re-key (L15); tests 1 and 15 cover calls after the release.
2. Major: a late old-key decrypt can capture a re-keyed successor's hold. Fixed: the capture compares hashes (L16); test 23c.
3. Major: test 2 contradicted test 20 on another live session's hash. Fixed: test 2 now covers unknown and settled hashes only.
4. Major: the composition harness lacked a stateful journal, a response spy, a refusal helper and an emitting profile switch. Fixed: listed in the change map.
5. Minor: a W row alone does not prove non-dispatch (post-dispatch failures also write W). Fixed: L9 amended; tests 27–29 assert observed behaviour.
6. Minor: the `showCheck` extraction is not forced by the budget. Fixed: L13 amended.
7. Minor: the shot list and OWNER-ASKS' phase reference disagreed with the gate. Fixed.

**Opus (Plan agent): consistent with fixes.** Nine findings. 1 (map removal) and 5 (re-key) duplicate Codex's 1 and 2; 4 duplicates Codex's 6. The rest are accepted:
- 2, Major: test 26's "A is already `ok` when S1's window exists" raced a fire-and-forget tab message. Fixed: wait for A; the order is test 15's.
- 3, Minor: missing helpers (the pins tests' stubs, an e2e failure-kind read, `recordCreatedWindows` seeing only ids and types). Fixed in the change maps; the e2e window assertion is now "no window created after the check opened".
- 6, Minor: the lock rule also ends a trusted reconnect still establishing. Fixed: named in the teardown row, the mechanics and DH-2.
- 7, Minor: OWNER-ASKS named "Phase 1.4", and DH-6 counted a lock as an exit without DH-2's answer. Fixed.
- 8, Minor: Outcome item 2 promised more tests than § Tests held. Fixed: test 23b (row deletion), and the claim narrowed to mechanisms plus representatives.
- 9, Minor: a dropped held send's row is titled "Transaction" (today's queued-row failure title). Fixed: named in UI impact, DH-3 and the shots.

No contradiction with the lane rules was found by either.

### Double audit (2026-10-13)

**Codex (gpt-6.1-sol, high, fresh session): reject.** Five findings, all accepted:
1. Blocker: a call parked behind a confirmed session's FIFO keeps its settled establishment and `released` hold. After that session ends and the same id re-keys, the call dispatches on the successor, and its response goes out by session id under the successor's key, before the successor's check is answered. Codex reproduced it in memory with the real FIFO helpers. Fixed: `isLive(session)` before dispatch and at the response tail (L16); test 23d.
2. Minor: the callback fixtures need one wire-shaped hash shared by establishment, messages and confirmation. Fixed in the change map.
3. Minor: `background.connect-window.test.ts` is a callback integration test over stubs, not a composition test. Fixed: relabelled, and the claims narrowed.
4. Minor: F5 and I1 overstate the lock reroute. Fixed: reworded, and test 18 confirms after the lock.
5. Minor: the cap bounds admitted waiting calls, not memory. Fixed: reworded.

**Opus (Plan agent, fresh): conditional approve.** Ten findings. 1 (the parked call across a re-key, reproduced independently), 8 (the label) and 10 (lock reroute) duplicate Codex's 1, 3 and 4; 4's hash point duplicates Codex's 2. The rest are accepted:
- 2, Major: the Phase 3 gate as written is refused by `proverless-guard.sh`, since two targeted files and the full suite select `@requires-proverless` files. Fixed: armed runs plus the prover-ON canaries (L17), with lint and typecheck added.
- 3, Major: approval windows opened by held calls now appear only after They match, a visible timing change missing from UI impact. Fixed: a UI impact row, DH-0, and a shot.
- 4, the rest: test 23c needs a second `discover()` to reach a confirmed successor. Fixed: stated in the test.
- 5, Minor: after a reconnect the playground has no selected account, so test 26's sends would get no row. Fixed: set `pg-input-from` first.
- 6, Minor: one throwing termination would stop the lock loop. Fixed: drop all first, then terminate each in its own try/catch; test 18.
- 7, Minor: the failure-kind read must not extend the complexity-stamped `readDappExecuteRecords`. Fixed: a new function.
- 9, Minor: held sends' rows consume `MAX_QUEUED_GLOBAL` for longer; `TooManyPendingError`'s and the envelope's comments name only the execution lane. Fixed: a residual-risk line and the comment edits.

### Final fresh Codex pass, round 1 (2026-10-13)

**Codex (gpt-6.1-sol, high, fresh session): reject.** Three findings, all accepted. Each refines where the session-identity fix sits.
1. Blocker: the pre-dispatch check sat before `handleWalletMessage`, whose fence capture, identity guard and `legal.assertCurrent()` all await before `dispatcher.dispatch`. A confirmed predecessor could pass the check, pause in the legal read, end, and be dispatched after an unconfirmed same-id successor established. Codex reproduced it in memory with the real function. Fixed: a synchronous `isLive()` right before the dispatch, after the legal guard; test 23e.
2. Blocker: the identity guard's early `respond` and `terminateSession` bypassed the tail check, so a stale guard could answer under the successor's key and end the successor. Fixed: `bindLiveSession` routes every send and termination of a call through its own session object; test 23f.
3. Major: object identity needs a stable session-object map in the callback harness and an identity-preserving `getSession` in three more mocked handlers. Fixed in the change maps.

### Final fresh Codex pass, round 2 (2026-10-13)

**Codex (gpt-6.1-sol, high, fresh session): conditional approve.** Round 1's fixes close their findings; no remaining path dispatches or answers a call before They match on a shown check. One condition, a minor: Phase 2 step 2 still made the `showCheck` extraction unconditional, against L13. Fixed: the step now extracts only if Biome reports the budget exceeded. With that condition met, the panel's last verdict is **approve**; no open finding remains.

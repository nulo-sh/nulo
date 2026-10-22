---
plan: offscreen-ping-1
tier: mid
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 5711a1bc3
trunk: dev
status: closed with its one PR; the merge closes the plan
issues: "#1035 (closed by A1)"
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-22.
- **Status:** closed with its one PR (`worktree-offscreen-ping-1` → `dev`, `Closes #1035`), which carries this close-out; the merge closes the plan.
- **Shipped:**
  - **The answer token** (`apps/extension/src/wallet/utils/offscreen.ts`). It is issued on each READY that ends a create pass and on each PONG, and cleared on every close and create attempt. A request skips the ping while a token is current.
  - **Withdrawing trust** (`apps/extension/src/wallet/services/pxe/client.ts`). `requestTag` carries the token as `{ answer, inner }`. `onTerminal` clears it on `timeout_fired` or `send_failed`, but only under the same token, and forwards `inner` to the base.
  - **A typed READY timeout:** `RpcTimeoutError` replaces the bare string.
  - **The docs:** `ARCHITECTURE.md` §6 states the rule and the D2 sequence.
  - **The tests:** the busy-document reproducer (`apps/extension/src/wallet/services/pxe/busy-document.test.ts`, five cases) and three new `offscreen.test.ts` cases. The two Phase 1 cases were red on base ([lessons/phase-1.md](lessons/phase-1.md)), and four mutations went red as named ([lessons/phase-2.md](lessons/phase-2.md)).
- **Dispositions:**
  - The orchestrator approved the plan as committed, with the D2 recovery policy and K1-K4.
  - The review loop converged at round 2 of 3 ([lessons/phase-4.md](lessons/phase-4.md)):
    - Codex r1 approved, with two non-blocking test fixes, both applied. One of them corrected the Phase 1 evidence: the busy call now reaches the document before the thread blocks.
    - The Opus leg conditionally approved. Its three items were applied: a test for the token clears, the §6 wording, and "no later than their deadline".
    - Codex r2 approved, with no new finding.
  - The reviews ran beside the Phase 3 runs, not after them, as the Post-implementation section planned. Every change they caused was test-only or docs-only, so the e2e dist stayed current.
  - Phase 3 ran at retry 0 ([lessons/phase-3.md](lessons/phase-3.md)):
    - Smoke on Firefox: 276/276.
    - Smoke on Chrome: 271/272. `network-arrival` stalled on a popup route that reads no PXE, then passed 3/3 alone; read as a load flake.
    - The six network runs plus `firefox-background-restart`: all green, prover-on.
- **Lessons:** nothing promoted. `lessons.md` is at its budget, and its existing "take a red/green proof's old copy from the base SHA" line covers the reproducer correction. The race between a reviewer that mutates files and this session's own base swap is recorded in [lessons/phase-4.md](lessons/phase-4.md).
- **Known limits:** #1044 (K1), #1045 (K2), #1046 (K3), #1047 (K4).
- **Open items:** none.
- **Seeds retired:** the `/goal` and `/loop` below; they are no live instructions.

# offscreen-ping-1: a busy PXE document is not a dead one

One arc, one PR against `dev` (the orchestrator's D-orch-1, no stack). Today the service worker pings the offscreen document before every PXE request and replaces it when the PONG takes over 3 s. A document whose thread is busy (a long tag sync, or the popup holding the renderer they share) misses the ping, and the replacement fails the calls it was running (#1035). After A1 the worker pings only a document it has not heard answer, or one that left a request unanswered since it last answered. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## The claims and what did not hold

- **Code sites** (`pxe/client.ts:76-83`, `offscreen.ts:15, 16, 181-205, 345-355`): hold at `5711a1bc3`.
- **"The work in flight in the old one fails"**: holds, but not at once. Nothing rejects a request already sent to a closed document; it fails at its own deadline (90 s; 30 min for `proveTx` and the two clears) with `RpcTimeoutError` (recon § What happens today). Calls that joined a pass whose replacement missed READY failed within 10 s with a bare **string**: `rejectOffscreenPromise("Offscreen is not responding")` (`offscreen.ts:116`). Callers turned that string into "PXE request failed".
- **"Answered pings reach 2.7 s"**: from the records; not re-measured. A longer budget would still lose to a 40 s render (pxe-limits-1 phase 5).
- **Why the document was silent**: inferred, not shown (I1).

## Outcome & Quality Bar

- **For whom:** a person with a large contact list or many senders, whose wallet is syncing or rendering a long page while a balance, a note read or a dApp simulation is in flight.
- **Excellent:** (1) a document that answers late keeps running, no close, no cold sync, no failed call, until a request sent under its current answer goes unanswered (the reproducer proves it at unit level; K3 is what remains); (2) a document that stopped answering is still replaced by the sequence in D2, stated in code and in `ARCHITECTURE.md` §6; (3) a call that fails because the transport did not come up fails with `RpcTimeoutError`, which every caller already classifies, never a string; (4) a replacement re-sends nothing.
- **Good enough:** the first request after a Chrome worker restart still pings the document it finds (D5); requests already sent to a replaced document fail at their own deadline (D4).

## UI impact

None on any wallet screen: no copy, layout or row changes. The READY-timeout message keeps its text, so a popup that prints `error.message` reads the same. A dApp whose call meets a READY timeout now gets the existing classified timeout envelope (`-32603`, `walletErrorCode: RPC_TIMEOUT`, `error-envelope.ts:131-141`) where it got the unclassified constant.

## Assumptions

**Facts** (verified at `5711a1bc3`)
- F1. Every ordinary PXE request awaits `ensureOffscreenRunning` (`pxe/client.ts:81-83`); concurrent callers share one pass (`offscreen.ts:328-337`), which runs `getContexts`, then a 3,000 ms PING (L181-205); a miss closes (L352-355) and recreates with a 10,000 ms READY gate (L16, L367). `requestAlreadyReady` bypasses readiness once (store-key recovery).
- F2. The worker keeps no record that a document answered (recon).
- F3. All nine worker-side PXE client constructions are `PxeServiceClient` (`apps/extension/src/wallet/services/pxe/client.ts:64`); its base `onTerminal` calls `super` and tracks abandoned simulations by `tag` (`packages/aztec-runtime/src/pxe/client.ts:206-217`).
- F4. `requestTag` runs once per request that reaches the send path, synchronously just before its send (`requestAlreadyReady` skips readiness, not the tag), and `onTerminal` hands that tag back inside `settle`, before the caller's handlers (`base-client.ts:158, 169, 287`); it reports `timeout`/`timeout_fired` (L143) and `send_failed` (L181-194); readiness-phase timeouts never reach it (L134, 295-313).
- F5. Nothing rejects a request already sent to a closed document before its deadline (recon).
- F6. `node.sendTx` has one call site, `ExecutionCoordinator.sendTxTask` (`execution-coordinator.ts:299`), pinned by `legal/call-sites.test.ts:22-30`; nothing in `packages/aztec-runtime/src` sends a transaction (`pxe/service.ts:486-488`).
- F7. Worker-side retries follow a typed refusal sent before the op ran (store key, scopes; `aztec-runtime/src/pxe/client.ts:268-357`); nothing re-sends after a timeout or a transport failure. Inside the document, the stale-anchor retry re-runs a prove, never a send (`pxe/service.ts:475-492`).
- F8. Chrome's offscreen document survives a worker restart; Firefox's frame dies with the background page (`ARCHITECTURE.md` §6). `strictSecurityMode` defaults on (`wallet/config/config.ts:31`), so after a worker death the wallet comes back locked.
- F9. `src/offscreen/index.html` is not web-accessible (`manifest.test.ts:63-65`, `pxe-host-state.test.ts:38-46`); PONG and READY are accepted only from that page in this extension, and on Firefox only with the live frame's random generation (`offscreen.ts:71-76`). Chrome checks no generation and PONG/READY carry no nonce.

**Inferences** (unverified)
- I1. A blocked renderer queues `chrome.runtime` messages and delivers them when its thread frees. Consistent with, not proven by, the records (answered pings at 2.3-2.7 s; a 70.8 s lock wait that succeeded). Chrome runs one extension's pages in one renderer process, so a 40 s popup layout would stall the offscreen document too. If I1 is false, a busy document's requests fail at their deadline, as a hung one's do.
- I2. A crashed Chrome offscreen renderer leaves `getContexts`. Unknown; D2 does not depend on it (a crash also fails the next request's deadline or send).
- I3. The recorded misses came from a worker that had already heard the document. Unmeasured: the pxe-limits harness kept the worker alive. D5 rests on it.
- I4. A request waiting behind more than 90 s of PXE work (two 71.7 s syncs at 1,000 senders; any count above about 1,300 by linear extrapolation) clears trust, and a ping that lands in a stretch where the thread blocks replaces the document. #1035's first row shows such a stretch 21 s after a sync.

**Asks**: none open. The orchestrator's lane brief delegates the design: "The plan decides, with Codex, how the worker tells them apart … and why. No raised timeout as the answer." and "a document that truly stopped answering is still replaced within a bound the plan states; … a call that fails because the document was replaced fails closed with a typed error the caller already handles." The recovery trade-offs in D2, D4 and D5 are made under that delegation and go to the orchestrator for approval; none adds persistence, a permission, a public contract or background work.

## Architecture & Implementation

**The rule.** Each time the worker hears the current document answer (the READY that ends its create pass, or a PONG), it issues a fresh *answer token*, a number never reused. While a token is current, a request skips the ping, because a slow answer proves nothing and a replacement fails every call the document runs. Each request carries the token current at its send. A request that ended unanswered (its deadline fired, or its send failed) clears the current token only if it carries that same token: a request sent to an earlier document, sent before the document last answered, or sent while no token was current is not evidence against the document trusted since. Every close and every create attempt clears the token. With none current, the next request pings as today, and silence replaces the document as today.

**`apps/extension/src/wallet/utils/offscreen.ts`**
- `let answerSeq = 0` and `let currentAnswer: number | undefined`, with one comment stating the rule.
- `export function offscreenAnswer(): number | undefined` returns `currentAnswer`: the token a request sent now carries.
- `export function markOffscreenUnanswered(answer: number | undefined): void` clears `currentAnswer` when `answer !== undefined && answer === currentAnswer`.
- Set `currentAnswer = ++answerSeq` synchronously where the message is accepted: in `onOffscreenReady` after `isLiveOffscreenSender`, and in `isOffscreenHealthy`'s `onPong`.
- Clear it at the start of `closeOffscreen`, of `createRetiringEarlier` (each Chromium create attempt, the retry included) and of `createOffscreenFirefox`.
- `doEnsureOffscreenRunning`: `if (await isOffscreenAlreadyRunning()) { if (currentAnswer !== undefined || (await isOffscreenHealthy())) return; await trackedClose() }`. `getContexts` still runs per pass, so a document the browser removed is recreated at once.
- `rejectOffscreenPromise` takes an `RpcTimeoutError`; `onOffscreenTimeout` rejects with `new RpcTimeoutError("Offscreen is not responding")`: same text, so logs and popups read the same.

**`apps/extension/src/wallet/services/pxe/client.ts`**: declare `type PxeRequestTag = { answer: number | undefined; inner: unknown }`; override `requestTag(method: string): PxeRequestTag` to return `{ answer: offscreenAnswer(), inner: super.requestTag(method) }`, and `onTerminal(record: TerminalRecord, tag?: PxeRequestTag)` (both narrowings are legal overrides) to call `super.onTerminal(record, tag?.inner)` (the base reads only `inner`, the simulation epoch; passing anything else would typecheck and silently end abandoned-simulation tracking), then `markOffscreenUnanswered(tag?.answer)` when `record.detail === "timeout_fired"` or `record.status === "send_failed"`. `success`, `rejected` (the document answered) and `disconnected` (a local teardown) do not mark.

**`ARCHITECTURE.md` §6 L144**: replace the ping sentence with the rule and the D2 sequence.

**Mechanics that are not obvious**
- N requests queued behind one long op cost one ping per deadline that passes, not N: the first timeout clears token k, the next pass's PONG issues k+1, and the others still carry k.
- A stale terminal (a request sent to document X timing out after Y sent READY) carries X's token, so Y keeps its own.
- No clock is compared, so a wall-clock step or two events in one millisecond cannot misorder a request and an answer.
- Ghost messages (F9): a READY or PONG from an earlier Chrome document, delivered late, can issue a token for a document still loading, so its first requests wait until a deadline. This is the race `offscreen.ts:385-391` already accepts; A1 only lengthens its effect from one request to one deadline.
- Module state is not persisted; a worker restart forgets the token (D5).

**File-level change map**

| File | Change |
|---|---|
| `apps/extension/src/wallet/utils/offscreen.ts` | the token, its two issues and three clears, `offscreenAnswer`, `markOffscreenUnanswered`, the skip, the typed READY rejection |
| `apps/extension/src/wallet/services/pxe/client.ts` | `requestTag` and `onTerminal` overrides |
| `apps/extension/src/wallet/utils/offscreen.test.ts` | reset in both `beforeEach`; marks in five cases; two new cases; string pins → `RpcTimeoutError` |
| `apps/extension/src/wallet/services/pxe/busy-document.test.ts` (new) | the reproducer, the sequence, the token boundaries, the marks, the forwarded tag |
| `ARCHITECTURE.md` | §6 ping paragraph |

**Trade-offs and alternatives not taken**
- **B. Count outstanding requests** (the competing outline): a missed ping replaces only a document with nothing outstanding. It keeps the page trigger (the popup stalls the renderer between requests, nothing is outstanding, the ping misses, the replacement cannot boot), and under continuous traffic the count never reaches zero, so a hung document is kept forever.
- **C. Answer the ping off the busy thread** (a worker in the document over `BroadcastChannel`): proves the worker thread alive, not the main thread that runs the PXE; a hung main thread passes forever. New channel and document code.
- **E. A heartbeat while work runs** (the unused 20 s `OFFSCREEN_KEEPALIVE`): sent from the same blocked thread, so it stops when the ping does; a liveness window over it is a longer timeout.
- **F. A longer ping budget**: ruled out by the lane brief; the 40 s render beats any budget that still catches a hang quickly.
- **Tagging each request with the document epoch** (Codex r1): handles a stale document but not N requests queued behind one op, since the epoch does not move on a PONG.
- **Comparing the request's send time with the last answer's time** (Opus r1, taken in revision 1): needs no tag, but `Date.now()` ties within a millisecond and steps backward, and a backward step keeps a hung document trusted for its length (Codex r2, Opus r2). A second comparison against the current time (Opus r2) patches one symptom; the token removes the clock.

## Security & Adversarial Considerations

- **Threat model.** A connected dApp (drives simulations and reads through the wallet-sdk), a hostile node (slow or huge answers), or code in this extension (out of scope: it already holds the keys). No new message type, listener, permission or stored value.
- **A replaced document mid-call.** Replacement now needs an unanswered request and a missed ping. Calls in flight on a replaced document fail at their own deadline with `RpcTimeoutError` (D4); answers to requests the worker gave up on arrive unmatched and are dropped.
- **No replay.** Invariant I-1: *a document replacement re-sends no PXE request, and a transport timeout or send failure triggers no re-send.* Separately and unchanged: `node.sendTx` has one call site, and the document never broadcasts (F6). Pins: `call-sites.test.ts` (unchanged); the sequence test asserts the timed-out request reached the wire exactly once across the replacement.
- **A stale document answering a new worker.** On Chrome its PONG is the adoption the new worker asks for, as today; its answers to the dead worker's request ids are dropped (`message.to === this.uid`). Firefox accepts only the live frame's generation.
- **Two documents alive.** No new create path; every create attempt and close clears the token. A ghost READY can still issue a token for a loading document (Mechanics).
- **A forged PONG or READY** needs code running inside this extension (F9). It gains what a PONG gains today: skipping pings for a document `getContexts` already lists. No boundary is crossed that is not crossed now.
- **A dApp holding the PXE.** Capability: a connected dApp runs a simulation that blocks the document's thread past its 90 s deadline. Today 3 s of blocking replaces the document and fails the person's other calls; after A1 it takes the deadline plus a ping that lands while blocked, once per long op. The dApp crosses no authorization boundary; the availability effect is the I4 known limit.
- **Logging.** The new code logs nothing; the `RpcTimeoutError` message is fixed text.
- **Supply chain, cryptography, least privilege**: no dependency, crypto or permission change.

## Phase 1 — reproducer, red first

1. Write `apps/extension/src/wallet/services/pxe/busy-document.test.ts` with fake timers. Its fake document keeps a queue: while `busy` it answers nothing; when freed it answers queued PINGs with PONG and queued requests with responses, in order; it can drop one chosen request (never answered); `closeDocument` kills it and drops its queue, and a test can remove it without `closeDocument` (it leaves `getContexts`, its queue dropped). Call `getNoteSchemas`, which takes no network, so no generation provider is needed.
2. Add **"a busy document finishes the call it runs and the next one"**: create the document (READY), send A, make the document busy, send B at +1 s. At +4.1 s assert `closeDocument` was not called, before awaiting anything. Then free the document and expect A and B to resolve, with `createDocument` called once. Attach rejection handlers at once and drain every pass before the case ends.
3. In `offscreen.test.ts`, add **"a document this worker heard answer is not pinged again"**: READY, then a second `ensureOffscreenRunning()` with `getContexts` listing it and PING unanswered. Expect no PING. Drive the pass to its end before asserting (advance 3,100 ms, deliver READY), as L490 does, so no pass leaks into later cases.
4. Run both files on the base code; record the red output in `lessons/phase-1.md`.

**Validation gate.** Command: `cd apps/extension && bun --bun vitest run src/wallet/services/pxe/busy-document.test.ts src/wallet/utils/offscreen.test.ts`. Pass: exactly the two new cases fail, on the close or the PING assertion (not on a timeout); every other case passes. Layers: unit.

## Phase 2 — the fix

1. Make the `offscreen.ts` changes, then the `requestTag` and `onTerminal` overrides.
2. In both `describe` blocks of `offscreen.test.ts`, call `markOffscreenUnanswered(offscreenAnswer())` in `beforeEach`, so no case inherits a document an earlier case trusted.
3. Mark the same way before the ping in each case that expects one after its own READY: L96 (its second pass), L600, L619, L636, L674. At L636 also assert `sendMessage` was called with `OFFSCREEN_PING`, or the case passes without testing anything. Delete or weaken no assertion.
4. Replace the eight string pins (L262, 294, 335, 383, 426, 472, 574, 657) with an `RpcTimeoutError` instance check and the same message.
5. Add to `busy-document.test.ts`:
   - **"a document that stops answering is replaced after a request goes unanswered"**: A times out at 90 s with `RpcTimeoutError` and reached the wire once; B pings, 3 s of silence closes the document, the new one answers B. A long request L, pending on the old document across the replacement, is never re-sent (I-1, K1).
   - **"a timeout clears trust only under the token it was sent with"**: (a) A is sent to X; X leaves `getContexts`; B creates Y (READY); A times out; C is sent with no PING. (b) Control: D, sent to Y, times out; E pings, Y PONGs. (c) F, sent to Y after D and before D's deadline and dropped by the fake, times out after E's PONG; G is sent with no PING.
   - **"a failed send marks the document; an answered error and a readiness-phase timeout do not"**: the next request pings after the first and not after the other two. Build the readiness-phase timeout by holding the fake `getContexts` past the request's deadline while the document is trusted.
   - **"the override forwards the tag"**: with `registerPxeGenerationProvider` set, a timed-out `simulateTx` on a `PxeServiceClient` with `setDocumentEpochProvider(offscreenEpoch, …)` is still tracked (`offscreenSettled` pending).
6. Add to `offscreen.test.ts`: **"a mark with an earlier token is ignored; one with the current token makes the next pass ping, and a PONG issues a new one"** (PING asserted).
7. Update `ARCHITECTURE.md` §6.

**Validation gate.** Commands: `bun run lint`, `bun run typecheck:all`, `cd apps/extension && bun --bun vitest run src/wallet/utils/offscreen.test.ts src/wallet/services/pxe/`, then `bun run test` and `bun run test:all`. Pass: all exit 0; both Phase 1 cases pass; `git diff` on `offscreen.test.ts` removes no assertion (only the reset, the marks, the PING assertion, the error-type pins and the two new cases). Layers: lint, typecheck, unit, integration.

## Phase 3 — e2e at retry 0

**Warning:** run nothing while the deps-audit-1 soak holds the host. Run every e2e through `agent.sh` or `test:e2e`, one at a time in this worktree.

1. Smoke, both browsers: `cd apps/extension && NULO_E2E_RETRY=0 bun run test:e2e`, then the same with `NULO_E2E_BROWSER=firefox`.
2. Network, each file alone: `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<file>.test.ts` for `incoming-transfers`, `execute-scope-account` and `pxe-host-state`, then each with `NULO_E2E_BROWSER=firefox`; add `firefox-background-restart` on Firefox (it pins the frame lifecycle).
3. Record wall-clock per file and browser in `lessons/phase-3.md`, beside the medians in recon.

**Validation gate.** Pass: every run green at retry 0; a red is read honestly (one rerun for a named known flake, otherwise a fix). Layers: e2e smoke, e2e network.

## Decision ledger

| Id | Question | Decision and why | Panel |
|---|---|---|---|
| D1 | How does the worker tell busy from dead? | Trust by evidence (the rule). No message from a blocked thread can prove liveness before the block ends, so only time separates busy from hung; the request deadline is already the codebase's "stuck worker" ceiling (`aztec-runtime/src/pxe/client.ts:56-73`). B, C, E, F rejected (Trade-offs). | Codex r1 and Opus r1 agree; both reject B. |
| D2 | What happens to a dead document | A sequence, not a wall-clock bound: a request carrying its current answer token ends unanswered (its deadline, 90 s, or 30 min for `proveTx`, `clearChainState`, `clearProfileState`; or a failed send); the next request pings; 3 s of silence replaces it; the new document has 10 s for READY. Every request sent to a hung document meanwhile waits out its deadline. Nothing is replaced without a later request; a hung `closeDocument` holds `pendingClose` (residual accepted in fix-pxe-offscreen; requests keep their deadlines). A document the browser removed is recreated at the next pass. Cost: a true hang waits up to a deadline, not 3 s; none appears in 8,526 recorded pings. | Codex r1 #3, Opus r1 #4: restated, I4 added. |
| D3 | The READY-timeout error | `RpcTimeoutError`, same message: a deadline passed, as in `awaitReadyWithinDeadline`. Not `RpcDisconnectedError`: the popup's restore path reads that as "the worker went away" and waits for its liveness (`full-backup-restore.ts:1040`). Not registered as an abandoned simulation: nothing was sent. | Both agree. |
| D4 | Fail requests in flight on a replaced document at once? | No: it needs a per-request document tag in every client and a rejection path, a new mechanism. They fail at their deadline. Known limit K1 (a `proveTx` on a replaced document waits up to 30 min). | Both agree. |
| D5 | The first request after a Chrome worker restart | Unchanged: it pings the document it finds; silence replaces it. It must still catch a document whose init failed or is running (why PONG waits for `servicesReady`). Narrowed by F8 (the wallet comes back locked). Known limit K2: a restart meeting a stalled renderer; reopen on a recorded replacement on a worker's first ping. The fix then would persist the answering document's `documentId` in `storage.session`: persistent state, the owner's call. | Opus r1 #6. |
| D6 | Test shape | A unit-level reproducer wiring the real `offscreen.ts` and `PxeServiceClient` to a fake document, plus cases in `offscreen.test.ts`. Not a composition test: no service graph (`COMPOSITION-TESTS.md`). | Both agree; tests strengthened (Codex #7, Opus #2, #3, #8, #11). |
| D7 | New e2e scenario? | None. One would stall a real renderer to test I1 at about 30 s per browser; if I1 is false the outcome equals a hang's (I1), so the scenario would not change the design. Existing files cover the paths the change touches. | Codex r1 #4: no mandatory scenario. |
| D8 | Stale and queued terminals | An answer token issued on each READY or PONG, carried by each request through `requestTag`, compared for equality at the terminal. Not a document epoch, not a send time (Trade-offs). | Codex r1 #1 (blocking), Opus r1 #1; revision 1 took send times; Codex r2 (reject) and Opus r2 showed clock ties and steps; token per Codex r2. |

Known limits filed at close-out as closed `known-limit` issues: **K1** (D4); **K2** (D5); **K3** (I4: work past a request's deadline, mixed deadlines included, such as a 90 s read expiring during a 30 min `proveTx`, or a dApp's long simulation, then a ping in a blocked stretch replaces the document); **K4** (a late READY from an earlier Chrome document issues a token for a loading successor, whose requests then wait a deadline instead of one ping; reopen on a record of it). No existing closed limit covers K4 (#399 is about epochs).

## Delivery

- **A1** = Phases 1-3, branch `worktree-offscreen-ping-1`, one PR against `dev`, `code_review: off`. Title: `fix(offscreen): keep a busy pxe document instead of replacing it on a slow ping` (77 characters). Body: what changed and why, the validation runs with outcomes, the wall-clock of each e2e file per browser, `Closes #1035`, and `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Open it without labels; add `e2e:extension-network` and `e2e:extension-smoke` afterwards only if the path filters skip a suite. One arc, so no lanes.
- The close-out is the PR's final commits.

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at `5711a1bc3`. Plan-specific values:

- **Review loop** (step 2), once over the whole diff after Phase 3: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; hard stop at three rounds. The adversarial ask names: a document replaced mid-call, a stale document answering a new worker, two documents alive, a ping reply forged by a page, a dApp holding the PXE, and a stale or queued terminal. Log each round in `lessons/phase-4.md` and in § Audit verdicts.
- **Delivery** (step 3): `gh pr create` as above; `gh pr checks <n> --watch`.
- **Close-out** (step 4): Outcome block; K1-K4 filed as closed `known-limit` issues (dedupe first: `gh issue list --state all --search "offscreen"`); lessons promotion; `STATUS.md` deleted; `git mv` to `archive/` in its own commit; `bun run check:plans` green after staging.
- **Teardown** (step 5): after the merge, `agent-worktree done offscreen-ping-1 --merged`.
- Approval boundary: a fix that adds a listener, a timer, a stored value or a message is a plan change; stop and report.

## Audit verdicts

- **Codex r1** (fresh, Sol, high): *conditional approve*. Accepted all seven: #1 stale terminal (D8); #2 F1, F7, I-1 narrowed; #3 D2 restated as a sequence, dApp availability noted; #4 I1-I3 kept as hypotheses, D7 no longer leans on the records; #5 ghost messages kept as an explicit limit; #6 delegation quoted; #7 test harness (assert the close in time, drain passes, stale-terminal and readiness controls, PING asserted in healthy controls). Rejected: the epoch-tag form of #1 (Trade-offs); revision 2 took Codex r2's answer token instead.
- **Opus r1** (Plan agent, fresh): *conditional approve*. Accepted #1-#8, #10, #11 (I4 and K3; I3 reworded; marks at L96, L600, L619, L636, L674 with the L636 PING assertion; forwarded tag pinned; `getNoteSchemas`; outline B's never-zero count). #9 (`send_failed` on an oversize message costs one ping) noted, no change. #5: answered by the quoted delegation, not an owner ask: no persistence, permission, public contract or background work.
- **Codex r2** (resumed): *reject*. #1 a request and a PONG in one millisecond compare equal and clear the newer trust; #2 a backward clock step suppresses every mark for the step's length; #3 the tests must pin the token boundaries. All accepted: D8 is now the answer token; the boundaries are the three-part case in Phase 2 step 5.
- **Opus r2** (resumed): *conditional approve*. #1 the clock step (fixed by the token, not by its proposed second comparison); #2 the fake-clock tie in the stale-terminal case (gone with the token); #3 the forwarded-tag case needs a generation provider; #4 build the readiness-phase control by holding `getContexts`; #5 the gate's allowlist names the new cases. All accepted.
- **Codex r3** (resumed): *approve*. Nit: F4's "once per request" excludes requests that fail before the send; reworded. Checked the override shape under TypeScript 6.0.3 strict in memory: no diagnostics.
- **Opus r3** (resumed): *conditional approve*. #1 type the tag (`PxeRequestTag`) so `tag?.inner` compiles; #2 the fake document needs "drop one request" and "remove without `closeDocument`" for step 5 (a) and (c), with F sent between D and D's deadline; #3 step 1 names `requestTag`. All accepted.
- **Opus r4** (resumed): *approve*. The three r3 fixes verified; one wording leftover in D2 (a send-time phrase), corrected.
- **Final Codex pass** (fresh session, Sol, high): *conditional approve*. #1 qualify Outcome (1) and widen K3 to mixed deadlines, with the sequence case keeping a long request pending across the replacement; #2 record the amplified ghost-message limit (K4); #3 nine construction sites, recon's boolean wording; #4 the seed's five failures become three. All accepted. It judged D8's token the smallest correct design, D2's sequence correctly stated, D5/K2 acceptable and D7 proportionate. Resumed on the applied conditions: **approve**.
- **Implementation, Codex r1** (fresh, Sol, high, over `5711a1bc3..af337ad54`): *approve*. Two non-blocking findings, both accepted: the busy reproducer now admits its call before the thread blocks, which corrected the Phase 1 evidence; and the test comments were cut. Its adversarial walk found no re-send and no double broadcast, and no page can issue or clear a token; K1-K4 stand as filed.
- **Implementation, Opus r1** (fresh, general-purpose, beside Codex r1): *conditional approve*. Accepted: a test pinning the token clears; three §6 wording fixes; "no later than their deadline" for a send pending when its document goes. The two contract-pin assertions were kept.
- **Implementation, Codex r2** (resumed, on `345a6fdb0`): *approve*, no new finding. The loop converged at round 2.

## Seeds (draft; not run by this planner)

```
/goal Phases 1-3 of implementations-plan/offscreen-ping-1/plan.md marked ✓, each gate reported passing in the transcript; LESSONS_FILE printed per phase; the Codex fix loop converged (a resumed pass with no new material finding quoted); PR against dev with Closes #1035 opened only after the loop (gh pr view output), the close-out's archive-move commit shown with git show --stat; bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/offscreen-ping-1 forward per its plan.md: reality check (plan, lessons, git status, PR checks), next pending step, fast gates after each edit, Codex at high on gpt-6.1-sol for any decision, stop at 3 failures on one step, never merge.
```

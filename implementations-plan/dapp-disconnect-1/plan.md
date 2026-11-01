---
plan: dapp-disconnect-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev f738cba62
issues: "#1412"
---

# dapp-disconnect-1: disconnecting an app also closes its send's fee question

A disconnect closes the app's send, sign and capabilities windows (#1414) but skips the fee question ("the fee went up, accept?"). Accept there still sends, at the higher fee, for an app the person just disconnected. The owner chose option A on #1412. One arc, one PR against `dev`. The tier is `light` by the spawn prompt: one Codex audit and the Opus Plan leg.

## Issue map (claims checked at `f738cba62`; detail in `recon.md`)

- **#1412 holds.** `endRequestsOfApp` skips a fee question (`dapp-interaction/service.ts:202`). The window stays open and Accept resumes the send.
- **"Through the same path a declined fee question takes" holds with no new path.** `askInWindow` turns every rejection of the window into `false` and calls `cancelQuestion`, the decline's own call (`execution/service.ts:879-891`). Ending the window as the other kinds end is enough.
- **The issue names one site; there are two.** The re-read after registration skips fee questions too (`dapp-interaction/service.ts:692`). A deletion that lands before the question registers is caught only there. The lane brief's second test needs it.

## Outcome & Quality Bar

For a person who disconnects an app in Settings, or refuses its emoji check, while that app's send waits on a fee question.

- **Excellent:** the window closes at once. Nothing is proved or broadcast. History reads "Cancelled", exactly as after a Decline, and the send ends as a declined one does.
- **Good enough:** no new copy, no new state, no new error kind. An Accept the worker claimed before the disconnect is not undone by it (D4).

## Assumptions

Facts:
1. A Decline calls `rejectInteraction(id, "User rejected", end)` (`popup/windows/fee/index.vue:209-212`). `endInteraction` deletes the record, then `windowManager.cancel` rejects the window's promise (`dapp-interaction/service.ts:228-231`). A disconnect uses the same `endInteraction` with `WindowEndedError(…, "disconnect")` (`:78`, `:205`).
2. `DappInteractionService.askFeeAgain` does not catch (`:465-483`). `askInWindow` catches any rejection as `false`, then `lane.cancelQuestion(journalId, fee)` (`execution/service.ts:884-887`). That reads the row and calls `cancelJob` only while the row still asks that fee (`execution/execution-lane.ts:447-451`). The read and the cancel are two steps.
3. `cancelJob` drops the cancel when no profile is active or the row is another profile's (`execution-lane.ts:216-218`); a lock or switch is then swept by `abandonDeadSessions` (`execution/service.ts:356`). Otherwise it writes `cancelled` before it aborts the send's controller. The waiter ends `"aborted"` and `fee-reask` throws `JobCancelledSentinel` before any proof (`execution/fee-reask.ts:102`). The row has no `error.kind`, so it reads "Cancelled" (`src/utils/journal-state.ts:100`, `:229`).
4. The window's error never reaches the send, because `askInWindow` drops it. So the send ends exactly as after a Decline. The app's channel gets its normal disconnect too ("Wallet disconnected", `verify-hold.test.ts:157`).
5. `onDappSessionDeleted` and `onVerificationRefused` both call `endRequestsOfApp` (`dapp-interaction/service.ts:190-193`).
6. `execution/service.composition.test.ts:1720-1730` pins that a refused or closed window cancels the held send, against a fake `askFeeAgain`. `dapp-interaction/service.composition.test.ts:297-312` pins the skip and must go.
7. `startExecutionGraph` stubs the session service as `{}` and the interaction service through `svc()`, which cannot carry a class instance (`tests/helpers/execution-graph.ts:81`, `:88`).
8. Session ids are random (`dapp-session/service.ts:236`): a connection made after a deletion gets a new row, so the old id stays absent. A remembered reconnect keeps its row, but deletes nothing.
9. `tx-sendTx-default.test.ts:120` opens the real fee window by approving half the estimate, then accepts. No e2e disconnects while it is open (D6).

Inferences:
- I1. Both new helper fields are optional and default to today's values, so `send-order`, `service` and `fee-race` composition callers do not change.
- I2. With `:692` open to fee questions, each question costs one row read after registration. A read under a lock or another profile ends nothing, as for the other kinds. The read is not free of effect: on an expired row `isExpired` deletes it and emits the deletion event (`dapp-session/service.ts:470-481`), so an expiry ends the question too (UI impact).

Asks: none. The owner signed P94-10. `OWNER-ASKS.md` says none.

## Architecture & Implementation

**The change.** In `endRequestsOfApp`, drop `|| isFeeQuestionPayload(payload)` from the skip at `:202`. In `interaction()`, drop `&& !isFeeQuestionPayload(payload)` at `:692`. Rewrite the doc comment at `:196-197`: a fee question ends too, and its end cancels the held send as a refusal. `isFeeQuestionPayload` keeps its other callers (`:529`). Nothing in execution, the journal or the window changes.

**Test helper.** `startExecutionGraph` gains `dappSession?: Stub` (default `{}`). `dappInteraction` also accepts a builder `(graph: { api, logger }) => DappInteractionService`, so the real service and its `WindowManager` run on the graph's own `FakeBrowserApi`. A second `FakeBrowserApi.reset()` would wipe the graph's storage (`recon.md`).

**Data and control flow after the change.** The session row is deleted. `endRequestsOfApp` finds the fee interaction and runs `endInteraction`. The window closes and its promise rejects. `askInWindow` reads `false` and calls `cancelQuestion`, which runs `cancelJob`. The row reads `cancelled` and the controller aborts. `fee-reask` throws the sentinel, and the send ends as a declined one does.

| File | Change |
|---|---|
| `apps/extension/src/wallet/services/dapp-interaction/service.ts` | the two skips, the doc comment |
| `apps/extension/tests/helpers/execution-graph.ts` | `dappSession` stub; `dappInteraction` builder |
| `apps/extension/src/wallet/services/dapp-interaction/service.composition.test.ts` | delete the "stays open" pin; add the describe below |

Alternatives not taken: a direct cancel from `DappInteractionService` into execution (a second decline path beside `askInWindow`'s); a new window end such as `fee_disconnect` (new reading, no new information); two tests on either side of the seam (D3); a session read before the question opens, to spare the open-then-close window (a second read with the same gap the re-read already closes).

## Security & Adversarial Considerations

- **Threat model.** A dApp controls its calls, not the session tuple. The match keys on the wallet-held tuple, so a dApp cannot end another app's question. Only a row deletion or a refused check triggers it: a person, an expiry or a purge.
- **Fail closed.** The change removes authority: a disconnected app's open question can no longer be accepted, so its send cannot broadcast at the new fee. Two bounds stay: an Accept claimed first (D4) and known limit #1413 (D5). The one `node.sendTx` and its `assertCurrent` guard are untouched.
- **Fail-open contract.** No custom RPC changes. The dApp sees only the answer a Decline already gives.
- **Logging.** No new log line. Supply chain, crypto, least privilege, CI tokens: N/A, no dependency or workflow change.

## UI impact

The owner, decision page 94 (P94-10, signed 2026-11-01), option A: "Close the fee question too: the held send is cancelled, nothing is sent, its History row reads Cancelled, as a declined fee question does."
- **Fee question window:** a disconnect in Settings, or a refused emoji check of the app, closes it. Today it stays open with Accept live. No text changes.
- **History row and journal page of the held send:** today they wait on the question until an answer or its deadline. After: "Cancelled" / "This transaction was cancelled." at once, the existing reading of a declined question.
- **Every deletion of the app's row ends it the same way**, as #1414 ends the app's other windows: the person's disconnect, a refused check, the session's expiry (7 days after the connection, applied when a read or the sweep finds it), a chain or profile purge. Each one ends the app's connection, the reason the owner gave for option A.
- **A disconnect during the send's build**, before the question opens: the fee window opens, then closes at once, as an execute window does in the same gap.
- Captures: History before and after, Chrome, light and dark, in `screenshots/`, linked from the PR body at the head SHA.

## Phases (arc 1)

### Phase 1: the disconnect ends the fee question ✓
Land the tests red on their own commit, then the fix.
- Add the helper fields (I1). The builder runs only when `typeof dappInteraction === "function"`; an object stub still goes through `svc()`.
- Fixtures, all real validation: a session whose `accounts` holds the request's exact CAIP account on the session's chain, and whose permission record has an empty `methods` list, which allows every method (`dapp-interaction/service.ts:824-856`). A profile stub with `captureExecutionFence` (a fence with `session`), a matching `peekLiveSerial`, `isFenceLive`, `assertFence`, `getDeletionState`, `getProfiles`, `getActiveProfile`, `refreshSession`, `onActiveProfileChanged` and `setExpiryDeferral`, plus the graph's row keys. The transactions and FPC stubs carry their startup subscriptions, as the execution harness's do. Assert that `beginJournal` returned an id and `registerInFlight` returned `{ live: true }`, so a red cannot come from the fixture.
- Add the describe "DappInteractionService × ExecutionService (a disconnect answers the fee question as a decline)". Its harness is `startExecutionGraph` with the real `DappInteractionService`, a `WindowManager` on the graph's `api`, and a session stub with real `EventHandler`s and a settable row. `dapp.execute` opens the send's window and `approveInteraction` claims it, so production code fills `approved`. The execute payload carries one `aztec_sendTx` operation, with the materialize stubs (`getNetworks`, `getAccount`) and a `feeSettings` delta, as `service.approval-binding.test.ts:319-345` does; with no operation, `DappInteractionService.askFeeAgain` answers no at `:468` and no window opens. `chrome.runtime.getURL` is mocked so the window URL names its route. The `WindowManager` runs on a `MockClock`, so its timeout never ends the question. The real `executeOperations` is spied as the stand-in for the build (COMPOSITION-TESTS D3). The spy opens the send's row through `lane.beginJournal` at `simulating` and registers its controller, as `heldSend` does (`execution/service.composition.test.ts:1691-1709`). Then it runs the real exported `askFeeAgain` of `fee-reask.ts`, with the lane's `commitJournal`, `beginQueuedWait` and `endQueuedWait`, a 60-minute `ms`, and `onAsked` calling the real `askInWindow`. So the spy re-enacts nothing `fee-reask` does.
- Each case runs in this order: `vi.waitFor` the question opened, act, `vi.waitFor` the outcome, and only then await the spy and the dApp's own `execute` call (settled, never left to reject unhandled). So a red is an assertion, never a hang. A `finally` aborts the controller. Never raise a timeout or shorten the question's deadline to force a red: the window's own timeout would then cancel the send and pass the red test.
- Case A, `test.each` over the answer. Assert the fee window opened (`#/windows/fee`) before each answer.
  - The app's disconnect (`deleteRow()`), then a late Accept: `resolveInteraction(feeId, …)` throws "Invalid id".
  - The app's refused check (`onVerificationRefused`) with the row left in place (D2).
  - The person's Decline: `rejectInteraction(feeId, "User rejected", "reject")`.
  - For these three: the window is removed, `fee-reask`'s `askFeeAgain` rejects with `JobCancelledSentinel` (the throw that keeps the send from proving), the controller is aborted, and the row is `cancelled` with no `error.kind`. `journalTerminalDisplay` and `categoricalLabel` read the same for each.
  - The control, Accept then disconnect: `resolveInteraction(feeId, { accepted: true })`, then `deleteRow()` (D4). `fee-reask`'s `askFeeAgain` resolves, the controller is not aborted, and the row reads `pending`.
- Case B, the order. The spy waits on a gate before it files the question. Delete the row while it waits, after the approval's own row check. Release the gate. Assert the question registered (`openAndAwait` called with kind `"fee"`), not that a window was created: a cancel that wins the bounds lookup creates none (`window-manager.ts:106`). Then no fee window is open, `fee-reask`'s `askFeeAgain` rejects with the sentinel and the row ends `cancelled`.
- Delete `dapp-interaction/service.composition.test.ts:297-312`.
- **Gate:** `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/wallet/services/dapp-interaction src/wallet/services/execution src/wallet/services/operation-journal src/wallet/services/wallet-sdk --retry=0`. Pass: exit 0. Case A's disconnect and refused check, and case B, are red on the test commit; the Decline and the Accept control are green there.

### Phase 2: e2e, captures and the full gate ✓
- Network e2e at retry 0 from the repo root, Chrome then Firefox (`NULO_E2E_BROWSER=firefox`), one run at a time: `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/{tx-sendTx-default,tx-sendTx-reject,verify-hold,connect-verify-mismatch}.test.ts`. `tx-sendTx-default`'s fee case is the real-browser control for the re-read: its row is live, so the window stays and Accept proves. `verify-hold` drops a held call on the app's own disconnect, a reconnect and a refused check. `connect-verify-mismatch` refuses a check, the event that now also ends a fee question. The `session-*` files are left out: the app's own disconnect keeps its row, so `endRequestsOfApp` never runs there.
- No new e2e scenario (D6), so the suite wall-clock does not change.
- Captures: a throwaway smoke spec, never committed, writes the held send's row and shoots History in light and dark. Before: `queued` with `reask` and no terminal time, as the journal writes it; History lists terminal rows only (`src/utils/activity-rows.ts:122`), so it shows no row for the send. After: `cancelled`. Deviation: `seedJournalRecord` stamps every row terminal, which drew the queued row as "Transaction failed", so the spec writes the row itself.
- **Gate:** every e2e run green at retry 0; `bun run audit:vue`; `bun run test:all`; `bun run check:plans` after staging. Pass: exit 0 for each.

## Decision ledger

- **D1** The fix is the two removed skips. A disconnect ends the question as every other window end does, and `askInWindow` already makes any end a decline. Rejected: a dedicated cancel call (a second decline path).
- **D2** A refused emoji check ends the question too, even when its row delete fails. The owner's decision, on #1412: "A lane makes the request-ending step stop skipping fee questions." That step is `endRequestsOfApp`, which both events call, and #1414 shipped the refused check as a disconnect for every other window, delete failure included. Codex asked that this scope be stated, not inferred; it is pinned by case A.
- **D3** One cross-service composition test, not two half-tests. The change relies on the seam between the two services: the window's rejection must become `cancelQuestion`. Each existing harness fakes one side of it. Extending `startExecutionGraph` is two optional fields. Copying its graph would be a second copy that drifts.
- **D4** An Accept the worker claimed before the disconnect is not undone by it. `resolveInteraction` deletes the record first, so `endRequestsOfApp` finds nothing, as for an approved send. The question's deadline, a feed cancel and a session end still apply. The owner's decision closes an open question; an answered one is not open. Not a known limit: it is the first-claim-wins rule, pinned by case A's control.
- **D5** Known limit #1413 case 2 now also reaches a fee question: a refused check whose row delete fails, landing before the question registers, leaves it answerable. Same path, same reopening condition. The close-out adds a comment to #1413 naming the fee question; no new limit is filed.
- **D6** No new e2e. Opus proposed a disconnect case beside `tx-sendTx-default`'s fee case (no proof, about two minutes a browser). Codex: not required. Each link it would cross is already proven: the row's deletion emits the event (`dapp-session` composition), the event ends the question and the window's rejection cancels the send (the new cases), the cancel keeps the send from proving (`fee-reask` and the executor's refusal test, `dapp-send-executor.test.ts:3136`), and the window's removal is the `WindowManager.cancel` every worker-side end already uses (a feed cancel, a lock, #1414's disconnect). That coverage is sufficient: the case would add integration confidence, but no browser mechanism changes here, as #1414 judged for the other windows. The captures come from seeded rows.
- **D7** (arc 1) The capture's "before" is History with no row for the held send, not a row reading "waiting": History lists terminal rows only, so while the question stayed open after a disconnect the send never reached it. Recorded so the PR body does not imply a row changed copy.

## Audit verdicts

- **Codex round 1** (gpt-6.1-sol, high): conditional approve.
  - Adopted: Fact 9 was false (`tx-sendTx-default` opens the fee window), so D6 replaces it. Fact 4 narrowed: the app's channel gets its normal disconnect. Fact 3 now names `cancelJob`'s profile gate and the sweep, and `:102`. Fact 8 narrowed to a new connection. D4 reworded to a worker claim, with the deadline, feed cancel and session end kept.
  - Adopted tests: bounded waits before a promise only the fix settles; a refused-check case (D2); Accept then disconnect (D4); a late Accept refused; case B asserts the registration, not a window.
  - Adopted e2e: `connect-verify-mismatch` added; each file's role stated.
  - D2 stated with the owner's words; D5 gets a comment on #1413. Confirmed: D1, D3, the helper change, no new e2e.
- **Opus Plan round 1**: conditional approve.
  - Adopted: Fact 9 (as Codex); the red-test mechanics (one operation with materialize stubs, mocked `getURL`, `MockClock`, wait-then-act order); the real `fee-reask` `askFeeAgain` in the spy, which removes a hand copy and pins the sentinel; `session-explicitDisconnect` dropped, its row persists; the row-deletion triggers and the open-then-close window under UI impact; I2 corrected; the deleted range is `:297-312`.
  - Rejected: a new e2e case (D6). Confirmed: D2 and D4 may be assumed from #1412's text and the first-claim rule; no path lets the held send broadcast.
- **Codex final** (fresh session, gpt-6.1-sol, high): conditional approve.
  - Adopted: Phase 1's fixtures spelled out (the session's account and permission record, the full profile stub, the startup subscriptions, asserted journal id and live registration); the builder only for a function; recon synced with Facts 8–9; I2 names the deletion `isExpired` emits; D6 says "sufficient"; "fail closed" bounded by D4 and D5; "rare" dropped.
  - Argued: its ask for owner acknowledgement of the expiry and purge triggers and the open-then-close window. The owner chose the mechanism by name ("the request-ending step"), every trigger ends the app's connection, and #1414 already ships both effects for the other windows. Codex withdrew it; the PR body states both.
- **Codex verify** (resumed, 2026-11-01): `approve`. Both conditions resolved; D1–D6 settled; no `OWNER-ASKS.md` entry.
- **Post-implementation, Codex round 1** (gpt-6.1-sol, high, over `f738cba62...68382c2ac`): `approve`, two low findings, both adopted: a failed case left the build gate, the fee window and its waiter unsettled (now a `dispose()` in every `finally`); the helper's header still said every other service is a stub, and one comment narrated `asked`.
- **Post-implementation, Opus diff review** (beside round 1): `approve`, four optional findings, all adopted: the accept control re-reads the controller and the row after the send settles; a missing journal id fails by name; a `Held` alias; `endRequestsOfApp`'s comment stands on its own.
- **Post-implementation, Codex round 2** (resumed, over `68382c2ac..d44bef322`): `approve`, no new finding. Loop converged.

## Delivery

One arc, one PR from `worktree-dapp-disconnect-1` to `dev`. Title: `fix(dapp): disconnecting an app also cancels its send's open fee question` (73 characters). Body: what changed and why, the UI impact with the owner's words and the captures, the runs with outcomes, "no new e2e scenario", `Closes #1412`. Open it with no labels; add `e2e:extension-network` only if the path filter skipped that lane. The close-out lands as the PR's final commits. No stack, no lanes.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `f738cba62` binds. Plan-specific values:
- `code_review: off`, so step 1 is absent.
- The loop: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` over `git diff f738cba62...HEAD`, resumed with `resume-codex.sh`. Hard stop at three rounds. One Opus diff review runs beside round 1.
- Close-out: the Outcome; a lessons pass (dedupe first, 8 KiB budget); `STATUS.md` deleted; `git mv` into `archive/` in its own commit, with the index line moved.
- Teardown after the merge: `agent-worktree done dapp-disconnect-1 --merged`. A `/loop` session checks on every firing; otherwise the session runs it at the start of its next turn.

## Seeds (orchestrator-owned; not run)

- `/goal` Phases 1–2 of implementations-plan/dapp-disconnect-1/plan.md marked ✓, each gate's output in the transcript; the Codex loop converged; the PR open against `dev` with the close-out commits; `bun run test:all` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/dapp-disconnect-1 forward per its plan.md: reality check, next unticked phase, its gate, the loop at the end, Delivery; never merge.

# Phase 0: planning consults

Every consult of the planning run, in order, with its verdict. Transcripts stay local; what matters is recorded here and in plan.md.

## Recon (2026-10-13)

- Two Explore agents on sonnet: (1) service layer, caps, journal kinds, lock behaviour; (2) e2e and unit coverage of the verify flow. Both completed; findings consolidated in recon.md.
- Surprise worth keeping: a lock reroutes the open verify window to the auth screen and, after unlock, to `/popup/general`, so a check open at lock time can never be answered in that window (`popup/locked-state.ts`, `useDappApprovalWindow.ts`). This decides how a hold must treat a lock.
- Surprise worth keeping: service RPC handlers cannot see the caller's port sender (`base-service.ts` `invoke`), so a "keyed by its window id" report would rest on a page-supplied id.

## Deep-tier drafts (2026-10-13)

- Driver draft written (local `plan-main.md`).
- Codex draft (gpt-6.1-sol, high, read-only; session `01a132e3`): completed. M1 with a separate hold; asked for a browser-derived sender window identity and an acknowledged RPC, caps 8/8/32 plus unconfirmed-session bounds and a byte budget, an expiry timer, an e2e-build trace recorder, one PR. Corrected recon: the boot sweep files queued rows `stuck_queued`, not `stale_on_resume`; the playground does show a pending row.
- Opus draft (Plan agent, opus): completed. The hold opened synchronously with the session's hash, a 32-per-session cap counted on the hold, a causal e2e barrier in place of a recorder, one PR. Found three things the other drafts missed: `handleSessionEstablished` sits at 78 of its 80 counted lines (extraction needed), `background.init-order.pins.test.ts` pins three profile subscriptions, and the copy-dash review entry matches one literal hit.
- Driver checks after the drafts: `emit` runs the service worker's own listeners synchronously (so the refusal-style event relay releases before the RPC answers); `SessionManager.open` over an active session emits only the new profile, and the popup's switch runs through a lock; `connectPlayground` answers the check, `reconnectPlayground` races it; `TooManyPendingError`'s message says "transactions"; Settings → Connected apps has "Disconnect session".

## Consolidation (2026-10-13)

- Ledger L1–L14 in plan.md. Opus's shape won L3, L6, L9, L12–L14; Codex's sender proof, byte budget, unconfirmed-session bounds, expiry timer and trace recorder were rejected as protection the threat model does not need or a gap that exists unchanged today.

## Contradiction check (2026-10-13)

- Codex (gpt-6.1-sol, high, read-only; fresh session `01a132fb`): VERDICT contradictory, 7 findings. Blocker: removing settled holds from the map would drop every call that arrives after a release (accepted). Major: a late old-key decrypt (upstream captures the `ActiveSession` before `await decrypt`) can capture a re-keyed successor's hold, a gap today's establishment identity check shares (accepted: compare the hold's hash with the message's session hash). Major: Test 2 contradicts Test 20 (accepted). Major: the composition harness needs a stateful journal, a response spy, a refusal helper and an emitting profile switch (accepted). Minor: a W row alone does not prove non-dispatch (accepted, L9 reworded). Minor: the `showCheck` extraction is not mandatory at 78+1 lines (accepted: extract only if Biome reports it). Minor: the shot list and OWNER-ASKS' phase reference disagree with the gate (accepted).
- Opus (Plan agent, fresh): VERDICT consistent with fixes, 9 findings; three duplicate Codex's, six accepted (a raced e2e ordering check, missing harness and e2e helpers, the lock rule catching a trusted session still establishing, OWNER-ASKS drift, an over-promised Outcome item, the "Transaction" title on failed queued rows). Both agreed nothing contradicts the lane rules.

## Double audit (2026-10-13)

- Codex (gpt-6.1-sol, high, read-only; fresh session `01a13309`): VERDICT reject, 5 findings. Blocker (accepted): a call parked behind a confirmed session's FIFO keeps its settled establishment and `released` hold, so after the session ends and the same id re-keys it dispatches, and its response goes out by session id under the successor's key, before the successor's check is answered; Codex reproduced it in memory with the real FIFO helpers. Fix: the captured hold must still be the map's current hold for the id right before dispatch and before the response. Minor (accepted): the callback fixtures need a wire-shaped 64-hex hash shared by establishment, messages and confirmation; `background.connect-window.test.ts` is a callback integration test over stubs, not a composition test per `tests/COMPOSITION-TESTS.md`; F5/I1 overstate the lock reroute (a fast unlock can supersede the landing); the memory claim should say "admitted waiting calls", not memory.
- Opus (Plan agent, fresh): VERDICT conditional approve, 10 findings. It reproduced the same parked-call blocker independently and proposed the fix the plan adopted: `handler.getSession(id) === session` (the object upstream already owns) at arrival, before dispatch and at the response tail, replacing the arrival-only hash comparison. New accepted findings: the proverless guard refuses the Phase 3 gate as written; approval windows opened by held calls are a visible timing change; the playground's `from` after a reconnect; per-session try/catch in the lock loop; a complexity-stamped e2e reader; queued-row visibility and stale error comments.

## Final fresh Codex pass (2026-10-13)

- Round 1 (gpt-6.1-sol, high, read-only; fresh session `01a1331b`): VERDICT reject, 3 findings, all accepted. The session-identity check needed to sit synchronously before `dispatcher.dispatch` (the fence, guard and legal awaits come after the earlier check) and to cover the identity guard's own early send and termination; the mocks need stable session objects. Fixed with one helper, `bindLiveSession`, used at arrival, after the release, right before the dispatch, and on every send and termination. Lesson: when a fix binds work to an object's identity, place the check after the last await before each outward effect, not at the entry of the function that holds the awaits.
- Round 2 (gpt-6.1-sol, high, read-only; fresh session `01a13321`): VERDICT conditional approve. One minor condition (Phase 2 step 2 still made the `showCheck` extraction unconditional, against L13), met in the plan. No path dispatches or answers a call before They match on a shown check.

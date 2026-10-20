# Phase 2 (A2): the arrival

## Design consult, 2026-10-19

The design as first drafted: `announce` in the record; get and answer RPCs; the popup answers an arrival when the active network equals it; the Terms sheet and both barriers emit a visibility the gate waits on.

- **Codex** (`gpt-6.1-sol`, high, session `01a15665`): request changes.
  1. (high) The guarded activation sets `store.network` before it persists, so an equality watcher answers a switch that then fails. Accepted (D18).
  2. (medium) Equality is no answer: the boot re-asserts the stored pointer, so a pending arrival on the active network would be answered unseen. Accepted (D18).
  3. (medium) The barriers report "clear" before their first read. Rejected for the barriers (D19: they cover the popup at z 10000, and the takeover relies on the same). Accepted for the Terms sheet: the emit is now tri-state.
  4. (medium) A second surface keeps a stale arrival. Recorded as a known limit (D22), as the guarded activation already accepts for cross-window switches.
  5. (low) Record the e2e's runtimes. Accepted.
- **Opus** (Plan agent): sound in outline.
  1. Answer inside `setActiveNetwork`, and only when the old pointer named a live, different row. Taken (D18).
  2. The sheet's pre-flush watcher runs after the parent's render: make it `flush: "sync"` and clear the verdict on unmount. Taken (D19).
  3. Refresh on session open, and drop a read for another profile. Taken.
  4. Order the lookup by kind, not by seed. Kept: this build seeds no Mainnet, so seed order cannot find the e2e's planted row.
  5. A fresh profile carried a stale `announce` over. Fixed.
  6. No barrier emits. Taken (D19).
  7. Avoid the `arrivals` name, which incoming transfers already use. Taken: everything is `networkArrival`.
  8. On focus: none, as the takeover. Recorded as D21.

## Implementation notes

- **Layout extraction.** The takeover's 28 component tests pass unedited after the extraction.
- **Inventory.** The type-role identifier inventory dropped four takeover entries. They were sites only because the takeover's `content` reached `copy.newAddresses`, and the layout makes no such call. The arrival is a new `overlay:NetworkArrival` surface.
- **Complexity.** `seedsToOffer` went over the cognitive budget at 21. The fix was an early return for an empty profile, which is offered every seed and announces nothing. No suppression was added.
- **Test leak.** One describe called `seededByEarlierBuild` twice, which pushed the extra seed twice. The `afterEach` removes one copy, so the second leaked into the next describe's pin. Each harness now gets its own test.

## Proof of the tests, 2026-10-19

Each named mutation of the new code turns its test red (each reverted after the run):
- M1: any `setActiveNetwork` answers.
- M2: a hold by chain alone announces.
- M3: an added seed is not announced.
- M4: the gate ignores a missing Terms verdict.
- M5: another profile's arrival is kept.
- M6: the answer write is not fenced.
- M7: the sheet's verdict is not immediate.
- M8: the verdict is not reset at unmount.
- M9: a fresh profile carries `announce`.
- M10: a stale read after Stay brings the arrival back.
- M11: `announce` is dropped from the pass's write.
- M12: "Not now" dismisses before it leaves the route.

## Review round 1, 2026-10-19

- **Codex** (`gpt-6.1-sol`, high, session `01a1568b`): `findings`.
  1. (medium, demonstrated) An arrival whose network is deleted, or renamed, in Settings → Networks stays cached, and Stay then fails on the missing row. Fixed:
     - the shell refreshes when the network list changes;
     - the gate shows only a network the shell lists, with a test.
  2. (low) Comments that restate their declarations. Removed.
- **Opus** (diff review): `findings`.
  1. The same deletion and rename defect. Fixed as above.
  2. (low, traced) "Not now" marked the sheet dismissed while the route was still Home, so the arrival mounted for a moment. The handler now leaves the route first, with a regression test (M12).
  3. A dead `refuseRepeatEnter` import in the takeover. Removed.
  4. An inaccurate testid comment on the layout. Reworded.
  5. Capture scaffolding for OA-2's variant B. Removed: B's pictures already exist.
  6. A caught error was logged bare. It now goes under `{ error }`.
- **Gates before round 1:** `bun run test` passed 868 files; lint and typecheck exited 0; Chrome and Firefox smoke at retry 0 passed 19 tests each, in the arrival, stale-network and legal-acceptance files.

## Review round 2, 2026-10-19

- **Codex** (resumed): `clean`. Its words: "No new material findings." It checked each fix, and found no new storage writes, no new lock dependencies, and no drift from A1's invariants. The loop has converged.

## Final gates, merged head `e9f9cb5f` (origin/dev `33c0aa17`), 2026-10-20

- `bun run lint`, `typecheck:all`, `test:all` and `audit:vue` exit 0; `check:plans` reports 0 findings.
- Smoke at retry 0 on armed builds, the arrival, stale-network and legal-acceptance files, 19 tests on each browser:
  - Chrome: 209 s wall-clock; the arrival scenario takes 8.1 s.
  - Firefox: 367 s wall-clock; the arrival scenario takes 17.6 s.

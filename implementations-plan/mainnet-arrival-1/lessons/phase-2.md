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

# Phase 1: send the inventory's events through `sendEvent`

Branch `unit-flake-1-a1` off the plan commit 7062080a (base `origin/dev` 4aa9d1ab). Implementation commit 88bcd2ca.

## Gate (on 88bcd2ca)

- `bun run lint` exit 0 (Biome on the 13 changed files: clean); `bun run typecheck:all` exit 0.
- The 22 affected files (the 19 inventoried, SettingsSearch, and the two files that press a disabled submit): 344/344.
- Negative control (uncommitted): the reopened press back to a raw `click()` under the still clock: 5/5 red, `expected [ [] ] to have a length of 2 but got 1`. Restored.
- `bun run test` exit 0: 14283 passed, 5 skipped, 7 todo (14295), the base's count.
- `bun run test:all` exit 0 (load1 144 at start).
- `StaleNetworkConfirm.test.ts`, 200 runs at `--retry=0`, 6 in parallel under load: 200 passed (before: 200 passed).
- Quantized-clock sweep of the extension suite: 9 red, every one among the 10 Date-arithmetic tests of phase 0; none of the 24. The tenth (`session-manager` "getActive silently closes an expired session") passed this run: it depends on where the 1 s quantum falls.
- Path probe (guarded), whole suite: 865 files passed. Left: `RowTarget.test.ts:80` and `TransactionIncomingCard.test.ts` (clicks `RowTarget.activate()` sends), and `Popup.test.ts:238`, the detail-2 click Popup's own capture listener refuses first, which the plan keeps raw.

## Deviations

- The gate's probe list named only the two `RowTarget` sends; `Popup.test.ts:238` also remains, by the plan's own design (its presses that carry `detail` stay raw).
- The sweep's pass criterion said "exactly the 10"; the tenth is itself clock-quantum dependent. The intent holds: no red outside the 10, and none of the 24.

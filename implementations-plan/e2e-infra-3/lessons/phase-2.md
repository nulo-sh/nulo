# Phase 2: the fee read before the 240 px record (#1210)

## 2026-10-27 · Measurement (smoke build, `type-roles.test.ts -t Send`, 3 runs per browser)

- An in-page poller (5 ms) on `fee-settings-card[data-read-pending]` from the hash navigation to Send. Without a wait, the "a recipient typed" visit leaves Send with the read still pending, and in one Firefox run "a recipient chosen" recorded mid-read: #1210's race.
- With the wait in place, arrival to read end: the first Send visit Chrome 2.56-2.74 s, Firefox 2.27-2.74 s; the contact visit Chrome 1.59 s, Firefox 1.65-1.69 s. Slowest 2.74 s; the bound is 15 s (5.5×).
- A separate `waitForFunction` costs about 47 ms per call on Firefox (2 ms on Chrome) even when nothing is pending, and `expectFitsNarrow` runs on every sweep, so the read's wait shares the snack's: one selector list, bound 15 s (the snack's 10 s is inside it).

## 2026-10-27 · Gate

- `FeeSettingsCard.test.ts`: 174/174. The saved-pick loading test pins the mark (`true` while the read runs, absent after); it goes red with the attribute deleted.
- `type-roles.test.ts`, retry 0: Chrome 14 passed, 1 skipped, 116 s; Firefox 15/15, 175 s.

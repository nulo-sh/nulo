# Status: unit-flake-1

- 2026-10-19: CI log read (run 39332994479, job 118336467825); instrumented copy: one enabled RESET node, latch false at the reopened click.
- 2026-10-19: cause demonstrated: Vue's attach-time guard behind Popup's capture listener; frozen clock red every run, +1 ms green, capture listener removed green.
- 2026-10-20: before counts: unmodified file 200/200 at retry 0 under load1 140-220; probe copy 200/200, reopen gap min 1 ms, median 3 ms.
- 2026-10-20: sweep: quantized clock reds 24 tests in 14 files by the guard (plus 10 Date-arithmetic false positives); design package clean; path probe inventory 102 events in 19 files. Shared-helper prototype 323/323, reverted.
- 2026-10-20: plan drafted; panel audit started.
- 2026-10-20: audit r1: Codex conditional approve (5 findings), Opus conditional approve (7), all accepted; plan revised (sendEvent contract, enterOn for Enter sites, D6, D7, probe inlined).
- 2026-10-20: audit r2 (Codex resume): conditional approve, 1 finding (probe DOM guard), accepted.
- 2026-10-20: audit r3 (Codex resume): approve. Plan committed.
- 2026-10-20: arc 1 phase 1 on 88bcd2ca: lint, typecheck:all, test (14295, base count), test:all exit 0; negative control 5/5 red; 200/200 after; quantized sweep 9 red, all Date-arithmetic, none of the 24; probe leaves RowTarget sends and Popup.test.ts:238 (kept raw by design).
- 2026-10-20: Codex loop: r1 approve (1 nit), Opus diff approve (3 low), fixed in e5e9169e; r2 approve, converged.

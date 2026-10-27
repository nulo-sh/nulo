# Phase 3: the picker answered by the session (#1222)

## 2026-10-27 · Arming probe (Firefox 153.0.4)

- From privileged scope (`chromeScript`), `contractIDToCID("@mozilla.org/filepicker;1")`: `{bd57cee8-1dd1-11b2-9fe7-95cf4709aea3}` (native GTK) without `remote.bidi.dismiss_file_pickers.enabled`; a generated CID with it. I2 holds on 153: the pref arms the suite's session.

## 2026-10-27 · Paired runs

- `toolbar-panel.test.ts -t "export, restore and the contacts import"`, retry 0, 10 base and 10 pref runs interleaved, the run's tree and two busy loops on CPUs 186-187 (`taskset -c`), the loops killed by pid in a trap; none left after any batch.
- Click to `cancel` in the window's realm: base 6, 33, 33, 21, 14, 8, 6, 5, 13, 9 ms (median 11, max 33); pref 20, 18, 46, 27, 4, 5, 10, 16, 9, 5 ms (median 13, max 46). Every click active, every run green, 70-124 s per run. Uncontended: 6 ms and 18 ms.
- Inconclusive by D4's bar (neither a 10× median nor a base run past 10 s). I1 is not shown; contention on two CPUs is not the miss. No change ships; #1222 got the numbers as a comment and stays open.

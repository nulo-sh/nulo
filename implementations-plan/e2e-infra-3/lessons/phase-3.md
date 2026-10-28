# Phase 3: the picker answered by the session (#1222)

## 2026-10-27 · Arming probe (Firefox 153.0.4)

- From privileged scope (`chromeScript`), `contractIDToCID("@mozilla.org/filepicker;1")`: `{bd57cee8-1dd1-11b2-9fe7-95cf4709aea3}` (native GTK) without `remote.bidi.dismiss_file_pickers.enabled`; a generated CID with it. I2 holds on 153: the pref arms the suite's session.

## 2026-10-27 · Paired runs

- `toolbar-panel.test.ts -t "export, restore and the contacts import"`, retry 0, 10 base and 10 pref runs interleaved, the run's tree and two busy loops on CPUs 186-187 (`taskset -c`), the loops killed by pid in a trap; none left after any batch.
- Click to `cancel` in the window's realm: base 6, 33, 33, 21, 14, 8, 6, 5, 13, 9 ms (median 11, max 33); pref 20, 18, 46, 27, 4, 5, 10, 16, 9, 5 ms (median 13, max 46). Every click active, every run green, 70-124 s per run. Uncontended: 6 ms and 18 ms.
- Inconclusive by D4's bar (neither a 10× median nor a base run past 10 s). I1 is not shown; contention on two CPUs is not the miss. No change ships; #1222 got the numbers as a comment and stays open.

## 2026-10-28 · Arc 1 gate (head `e8a22a626`, retry 0)

- `lint`, `typecheck:all`, `test:all` (extension 15939 passed), `test:ci-gating` (686): exit 0.
- `legal-acceptance`: Chrome 3/3, 14/14 each, 139-151 s; Firefox 3/3, 14/14, 192-211 s. `type-roles`: Chrome 3/3 (14 passed, 1 skipped), 106-116 s; Firefox 3/3, 15/15, 147-179 s.
- Full smoke in six shards: Chrome 72 files, 273 passed, 27 skipped, 0 failed, 29 min; Firefox 72 files, 276 passed, 24 skipped, 0 failed, 44 min.
- Network, proverless as CI's shards run them (`cancel-mid-prove`, `in-flight-send-guard`, `type-roles-windows`): Chrome 7/7, 343 s; Firefox 7/7, 395 s.
- Update replay from v1.0.0: Chrome 4/4, 73 s; Firefox 4/4, 95 s. The smoke setup refuses a `dist/<browser>` the candidate build replaced, so rebuild the armed smoke build after `build-update-candidate.sh`.

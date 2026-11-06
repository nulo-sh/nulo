# p116-build-1 status

- 2026-11-06: recon done at 002b76fc7; plan drafted (tier light, one arc).
- 2026-11-06: Codex plan audit: round 1 approve-with-changes (folded), round 2 sampler gap (dropped, D7), rounds 3-4 approve.
- 2026-11-06: base times at 002b76fc7 (armed builds, retry 0, green): Chrome snackbar 46.7 s (Receive test 1.1 s), type-roles 128.4 s (seeded test 30.2 s); Firefox snackbar 51.7 s (Receive test 2.4 s), type-roles 175.2 s (seeded test 35.6 s).
- 2026-11-06: gate 1 (Chrome) green: lint, typecheck:all, ReceivePopup unit 5/5, snackbar.test.ts 9/9 at retry 0 (43.7 s; Receive test 2.4 s). First run red on the still-pointer test (`covered` false): the shorter sheet moved the snack off the address's last line, as the plan foresaw; the pointer now aims at the network line.
- 2026-11-06: gate 2 (Chrome) green: lint, typecheck:all, holdings unit 34/34 (8 red at base), type-roles 15 (1 skipped, as at base; seeded test 31.7 s) and token-list 2/2 at retry 0. D7 one-off on Chrome: every state 39 px.
- 2026-11-06: gate 3 green at fe1b559d1: lint, typecheck:all, test (17468 passed), test:components (1394), test:all; smoke at retry 0 on Chrome (5 files, 35 passed, 1 skipped as at base; 3:53) and Firefox (5 files, 36 passed; 5:30). Head times: Chrome snackbar 43.5 s (Receive test 2.6 s), type-roles 117.1 s (seeded test 27.4 s); Firefox snackbar 55.4 s (Receive test 4.2 s), type-roles 164.6 s (seeded test 34.3 s). D7 one-off on Firefox: every state 39 px. Captures taken (Chrome, both themes).
- 2026-11-06: Codex fix loop: round 1 changes-required (rename inside try), Opus review three test fixes, round 2 clean.
- 2026-11-06: final gates on the final code: lint, typecheck:all, test:all green; smoke at retry 0, Chrome 35 passed + 1 skipped (3:40; snackbar 39.6 s, Receive test 1.9 s; type-roles 111.1 s, seeded 30.5 s), Firefox 36 passed (5:04; snackbar 50.4 s, Receive test 2.9 s; type-roles 155.4 s, seeded 33.8 s).
- 2026-11-06: merged origin/dev (index.md conflict: dev archived lows-1; our line kept alone). At the merged head: bun install --frozen-lockfile, lint, typecheck:all, test:all green; smoke at retry 0 Chrome 35 + 1 skipped, Firefox 36 passed.

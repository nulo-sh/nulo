# flake-1 phase 2: the stand-in

- Attempt 1 (stand-in wired, no other change): `toolbar-panel.test.ts` on Firefox, 5 of 6 green. The unasked cancel came in 331 ms. The contacts card's later `pickFileByTestId` timed out: `pickFile: the click opened the file picker: not within 10000 ms; last: "not held"`.
- Diagnosis (scratch debug log in the stand-in): the arm named `browserId` 34 and the first, unasked pick's `open` came from 34, but the second click's `open` never came. Firefox 158's Remote Agent grants `userActivation` for the evaluate alone (`shared/Realm.sys.mjs:220-233`), and the contacts import clicks its input 50 ms later, so no picker opened. The base's Send Keys had filled the input of a pick whose picker never opened.
- Fix (D8): the two contacts openers use `pointerClick`. Attempt 2: `toolbar-panel.test.ts` 6 of 6 green (cancel 250 ms, 145.3 s, load1 84).
- Correction (Opus diff review, verified in 158's `omni.ja`): the "cleared as the call returns" diagnosis was wrong. `script.callFunction` sets `realm.userActivationEnabled` on every call (`windowglobal/script.sys.mjs:293`), and the setter acts only on a change; Puppeteer passes `true` every time, so a page is activated once and the first picker consumes it. The contacts card's miss came from its earlier, unasked pick.
- Attempt 3 (head `d8d1a767d`, the pointer-press fix): `restore-outcome.test.ts` on Firefox 1 of 3 green; SE1 and SE2 timed out on their second pick, `last: "not held"`.
- Fix (D8 revised): `prepareClick` turns the main realm's flag off and on before each scripted click; the pointer presses reverted. Attempt 4: `restore-outcome` 3/3, `toolbar-panel` 6/6, `contacts-import` 7/7 on Firefox (load1 28-88).
- Codex round 2 (resumed): the renewal over pointer presses, high confidence; one plausible finding left to the full suites (D9).
- Arc 1, Codex round 3 (resumed): clean, one comment nit (applied).

## Gate at the head (`7cc3a786e`, then a comment-only commit)

| run | kind | result | cancel half | file wall-clock | load |
|---|---|---|---|---|---|
| 1 | forced | green | 368 ms | 157.46s | 94.12 80.22 77.98 |
| 2 | forced | green | 247 ms | 137.99s | 144.21 112.11 90.60 |
| 3 | forced | green | 271 ms | 158.77s | 105.69 107.35 91.77 |
| 4 | normal | green | 238 ms | 159.42s | 148.61 124.08 100.43 |
| 5 | normal | green | 225 ms | 127.30s | 138.03 130.51 106.68 |
| 6 | normal | green | 230 ms | 128.74s | 103.03 117.85 104.89 |
| 7 | normal | green | 222 ms | 113.45s | 84.92 110.47 104.16 |
| 8 | normal | green | 286 ms | 120.63s | 39.60 85.21 95.68 |
| 9 | normal | green | 261 ms | 111.35s | 46.73 76.83 91.58 |
| 10 | normal | green | 232 ms | 111.30s | 34.61 62.17 84.49 |
| 11 | normal | green | 230 ms | 112.69s | 33.89 54.00 79.06 |
| 12 | normal | green | 234 ms | 117.16s | 31.04 46.67 73.48 |
| 13 | normal | green | 222 ms | 132.56s | 41.65 45.18 69.77 |

- Forced focus: 3 of 3 green (the base: 3 of 3 missed). Normal: 10 of 10 green; cancel 222-286 ms; file 111.3-159.4 s (median 118.9 s; the base: 110.9-142.3 s, median 119.5 s).
- Fast layers at the head: `bun run lint` 0, `bun run typecheck:all` 0; the unit cases 6 of 6, each of the two break mutations turning one red.
- Chrome, once each: `toolbar-panel.test.ts` skips (3.3 s, load1 72.72); `contacts-import.test.ts` 7 of 7 (63 s, load1 73.22).
- Whole Firefox smoke suite, once: 66 files passed, 7 skipped; 278 tests passed, 24 skipped, 0 failed (2668 s, load1 90.66 at start).
- Profile chaos seeds 9001-9005 on Firefox: 5 of 5 green, 8 picks through the stand-in (383 s, load1 81.31).
- Whole Firefox network suite, proverless, three shards (the five prover-ON files are CI's canary job), load1 at each start:

| shard | files | tests | wall-clock | load |
|---|---|---|---|---|
| 1/3 | 39 passed, 5 skipped | 64 passed, 6 skipped | 1772 s | 112.02 133.56 103.75 |
| 2/3 | 41 passed, 3 skipped | 102 passed, 5 skipped | 3022 s | 89.75 81.76 80.80 |
| 3/3 | 41 passed | 66 passed, 1 skipped | 2192 s | 27.59 54.71 64.69 |

- Network total: 121 files passed, 8 skipped; 232 tests passed, 12 skipped, 0 failed. Both network files that pick (`restore-again`, `account-balance-orphans`) green.
- D9: no red of its shape in any suite, so known limit #1410, closed as not planned.

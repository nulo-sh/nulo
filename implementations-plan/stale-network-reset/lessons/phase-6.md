# Phase 6: smoke e2e, captures, sign-off

## Built

- `tests/e2e/stale-network.test.ts`: S1a (network reset: A1, Networks and back, one reset from a double click, A4, then A5 with the account loaded and Local untouched), S1b (address change: A2; derived accounts back at their true addresses, the hidden one hidden, the imported one with its key), S1c (Mainnet: A6 with one button, and leaving it writes nothing to Mainnet's rows).
- `tests/e2e/stale-network-captures.test.ts`, opt-in (`STALE_NETWORK_CAPTURES=1`, Chrome only): every takeover state in both themes at 360×600 and 2×, into `tests/e2e/.captures/`, one file per `ui-spec/` reference. A running reset (A4, A4b, A15b) is frozen by holding one storage write inside the background, never by a build flag.
- Helpers: `helpers/stale-network.ts` (seeding the stale shapes, reading accounts and rows, the takeover trace, `takeoverScreen`), `helpers/stale-network-capture.ts` (when captures run, the frame, both themes), `helpers/stale-network-capture-seeds.ts` (the states only captures need).
- The root `.gitignore` ignores `apps/extension/tests/e2e/.captures/`; nothing ignored it before.

## Gotchas

- A10 cannot be captured here: the Send page reaches a send only over a live node's balance. The network suite captures it, opt-in with the others (Phase 8).
- `scripts/e2e/browser-seam.test.ts` refuses a shared helper that branches on the browser. The captures helper only reads the opt-in variable; each capture test skips Firefox itself.
- A frame taken while a transition runs differs between runs. `capture` waits two animation frames, then for every finite animation to finish; a spinner's infinite one is left running.

## Runtimes (retry 0)

Scratch copy, before the worktree gate: S1 3 tests, Chrome 41 s, Firefox 50 s; captures 37 s (Chrome).

## Sign-off

Sent on the review page (17 states, 34 frames, with five open asks). Pending.

## Gate

At the Phase 6 commit, retry 0, after the Phase 5 `audit:vue`, each browser on its armed build:

- Chrome: S1 3 tests passed (42.8 s); captures 1 test passed (35.2 s), 32 frames (16 states, both themes) in the ignored `.captures/`, none tracked; full smoke 53 files passed and 5 skipped, 231 tests passed and 13 skipped, 1354 s.
- Firefox: S1 3 tests passed (62.6 s); full smoke 55 files passed and 3 skipped, 230 tests passed and 14 skipped, 1946 s.

Suite wall-clock before this arc (Phase 4 gate): Chrome 1560 s, Firefox 2168 s. S1 adds about 43 s on Chrome and 63 s on Firefox; the run-to-run spread on this shared machine is larger than either.

The phase stays open until the owner signs off on the captures.

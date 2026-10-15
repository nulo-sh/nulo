# Phase 6: smoke e2e, captures, sign-off

## Built

- `tests/e2e/stale-network.test.ts`: S1a (network reset: A1, Networks and back, one reset from a double click, A4, then A5 with the account loaded and Local untouched), S1b (address change: A2; derived accounts back at their true addresses, the hidden one hidden, the imported one with its key), S1c (Mainnet: A6 with one button, and leaving it writes nothing to Mainnet's rows).
- `tests/e2e/stale-network-captures.test.ts`, opt-in (`STALE_NETWORK_CAPTURES=1`, Chrome only): every takeover state in both themes at 360×600 and 2×, into `tests/e2e/.captures/`, one file per `ui-spec/` reference. A running reset (A4, A4b, A15b) is frozen by holding one storage write inside the background, never by a build flag.
- S1d, from the final cross-arc review: R2, the holder deleted from Networks, then A1 again. It fails without the shell's watcher (the cached R2 stays) and passes with it, in 7.4 s on Chrome.
- Helpers: `helpers/stale-network.ts` (seeding the stale shapes, reading accounts and rows, the takeover trace, `takeoverScreen`), `helpers/stale-network-capture.ts` (when captures run, the frame, both themes), `helpers/stale-network-capture-seeds.ts` (the states only captures need).
- The root `.gitignore` ignores `apps/extension/tests/e2e/.captures/`; nothing ignored it before.

## Gotchas

- A10 cannot be captured here: the Send page reaches a send only over a live node's balance. The network suite captures it, opt-in with the others (Phase 8).
- `scripts/e2e/browser-seam.test.ts` refuses a shared helper that branches on the browser. The captures helper only reads the opt-in variable; each capture test skips Firefox itself.
- A frame taken while a transition runs differs between runs. `capture` waits two animation frames, then for every finite animation to finish; a spinner's infinite one is left running.

## Runtimes (retry 0)

Scratch copy, before the worktree gate: S1 3 tests, Chrome 41 s, Firefox 50 s; captures 37 s (Chrome).

## Deviations awaiting sign-off

- Type roles, not the mockups' type: eyebrows and box labels use `meta` (the mockups' 10 px wide-tracked mono is below the 11 px floor), the chip and LOCK `tag`, titles `row-title`, body text `body`. So A3's body wraps on three lines where the reference has four, and A1's chip and labels differ in face and tracking.
- A3 is the shared `Popup`: its backdrop dims less, and CANCEL shows the focus ring as the first focus.
- A4 uses the design system's spinner, and its first step reads "Removing old data" (the owner's A3 answer).
- The Header's network dot follows the node's real status.
- R3's eyebrow follows the active network's cause.
- The light theme is the app's own light tokens.
- A5 follows A5b, per the A8 answer.
- A popup open over Home closes when the takeover appears (D53).
- A run that moves no account shows a spinner with no copy (A4c, D54).
- Send and Receive do nothing until the switched-to network's account loads (D55); nothing on screen changes.

## Sign-off

Sent on the review page, now 18 states and 36 frames with A4c and the arc 2 review changes, with five open asks. Pending.

## Gate

At `562cb12a`, after the arc 2 review's fixes, retry 0, after `audit:vue` at `d41fc363` (the last commit changes one composable and its test, both re-run), each browser on its armed build:

- Chrome: S1 3 tests passed (36.4 s); captures 1 test passed (38.2 s), 34 frames (17 states, both themes, A4c new) in the ignored `.captures/`, none tracked; full smoke 53 files passed and 5 skipped, 231 tests passed and 13 skipped, 1509 s.
- Firefox: S1 3 tests passed (52.4 s); full smoke 55 files passed and 3 skipped, 230 tests passed and 14 skipped, 2076 s.

The first run, at the Phase 6 commit, after the Phase 5 `audit:vue`:

- Chrome: S1 3 tests passed (42.8 s); captures 1 test passed (35.2 s), 32 frames (16 states, both themes) in the ignored `.captures/`, none tracked; full smoke 53 files passed and 5 skipped, 231 tests passed and 13 skipped, 1354 s.
- Firefox: S1 3 tests passed (62.6 s); full smoke 55 files passed and 3 skipped, 230 tests passed and 14 skipped, 1946 s.

Suite wall-clock before this arc (Phase 4 gate): Chrome 1560 s, Firefox 2168 s. S1 adds about 43 s on Chrome and 63 s on Firefox; the run-to-run spread on this shared machine is larger than either.

The phase stays open until the owner signs off on the captures.

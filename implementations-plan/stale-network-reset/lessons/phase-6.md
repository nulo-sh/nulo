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
- A run that moves no account showed a spinner with no copy (A4c, D54); the review replaced it with "Opening …" on a never-opened network (D63).
- Send and Receive do nothing until the switched-to network's account loads (D55); nothing on screen changes.

## Sign-off

First review, 2026-10-15, on the 18 captured states: approved A1, A3, A3b, A4, A4b, A5, A10, A11, A15, A15b and R1–R4; asked for changes to A1b, A2, A4c and A6 and answered five asks (plan.md, A17). The proposals page answered A1b, A5, A4c, A10 and A6 and drew six changes; the owner approved them ("A1b: ok. A5: awesome. A4c: Lovely, looks much better. […] A6: Perfect. A11: lovely.") and the never-opened rule ("yes, Agree + approve."). Built as D61–D65, then captured beside the approved mockups (A1b, A2, R4, A1c, A3c, A4c, A6, A11, A10b), with one difference listed: A3c keeps A3's red-outline RESET where the mockup drew it filled. Signed off, 2026-10-15: “Approve.”

- The approved mockups, rendered at 360×600 and 2×, replace or join the references in `ui-spec/`.
- The signed-off frames, both themes, are committed under `screenshots/` (D60).

## Gate

At `3846f020`, arc 2's head after the rebase onto #431, retry 0, in a clean copy:

- Chrome: S1 4 tests passed (58.3 s). Captures 1 test passed (76.1 s): 38 frames (19 states, both themes), none tracked. Full smoke: 56 files passed and 5 skipped, 242 tests passed and 13 skipped, 1795 s.
- Firefox: S1 4 tests passed (90.5 s). The full suite's result is recorded at close-out.
- `bun run lint` exit 0 at this head.
- The unit gate ran at arc 3's head (`phase-8.md`), whose changes over this arc are e2e files, plan docs, comments and test names.

Earlier runs:

At `ac3768f5`, arc 2's head after the capture review's changes and their review loop, retry 0, after `bun run audit:vue` exit 0 at the same commit (794 files passed, 3 skipped; 12758 tests), each browser on its armed build, in a clean copy of the commit (`git archive`, `bun install --frozen-lockfile`):

- Chrome: S1 4 tests passed (54.8 s); captures 1 test passed (44.8 s), 38 frames (19 states, both themes) in the ignored `.captures/`, none tracked; full smoke 56 files passed and 5 skipped, 242 tests passed and 13 skipped, 1813 s.
- Firefox: S1 4 tests passed (84.7 s); full smoke 58 files passed and 3 skipped, 241 tests passed and 14 skipped, 2405 s.
- A10 and A10b, from the network suite's opt-in file at `62b7a8db`: 1 test passed (75.8 s), four frames.

The earlier gate, before the review's changes:

At `65cb3089`, the arc's head after the rebase onto `dev`, retry 0, after `bun run audit:vue` exit 0 at the same commit (794 files passed, 3 skipped; 12749 tests), each browser on its armed build:

- Chrome: S1 4 tests passed (46.7 s; S1d 6.7 s); captures 1 test passed (38.2 s), 34 frames (17 states, both themes) in the ignored `.captures/`, none tracked; full smoke 56 files passed and 5 skipped, 242 tests passed and 13 skipped, 1601 s.
- Firefox: S1 4 tests passed (61.2 s; S1d 9.9 s); full smoke 58 files passed and 3 skipped, 241 tests passed and 14 skipped, 2126 s.
- A10's two frames, from the network suite's opt-in file at `e681339f`: 1 test passed (61.3 s).

The retaken frames match the ones on the review page before the rebase, apart from the generated addresses and the spinners' animation.

Before the rebase, after the arc 2 review's fixes, the same gate passed with three S1 tests: Chrome S1 36.4 s, full smoke 1509 s; Firefox S1 52.4 s, full smoke 2076 s. The first run, at the Phase 6 commit, after the Phase 5 `audit:vue`:

- Chrome: S1 3 tests passed (42.8 s); captures 1 test passed (35.2 s), 32 frames (16 states, both themes) in the ignored `.captures/`, none tracked; full smoke 53 files passed and 5 skipped, 231 tests passed and 13 skipped, 1354 s.
- Firefox: S1 3 tests passed (62.6 s); full smoke 55 files passed and 3 skipped, 230 tests passed and 14 skipped, 1946 s.

Suite wall-clock before this arc (Phase 4 gate, over the older base): Chrome 1560 s, Firefox 2168 s; `dev` has since added three smoke files. S1 adds 47 s on Chrome and 61 s on Firefox; the run-to-run spread on this shared machine is larger than either.

The owner signed off on the captures (§ Sign-off); the phase is done.

# Phase 2: arc 2 (held reads, list owners, shells)

- 2026-10-10: start. Branch `forms-and-contacts-arc-2` off `origin/dev` af4afcc (arc 1 merged as #255). D-orch-4 and D-orch-5 recorded. A first `git fetch` hung on the SSH agent; rerun as `env -u SSH_AUTH_SOCK git fetch`.
- 2026-10-10: phase 2.1. `tests/helpers/held-read.ts` (`held`, `holdReads`, `liveBus`); `send.test.ts` moved onto it, 66/66 before and after.
- 2026-10-10: phase 2.2. `holdReads` sets a mock implementation, which `vi.clearAllMocks` keeps: each file that holds a read resets that mock per test (a `beforeEach` reset, or Send's `onTestFinished`). `ImportContactsPopup.test.ts`'s first held-read run failed because an earlier test's in-place add had pushed a row into the shared `SAVED` fixture (the popup adds to the array its read answered); the mount now hands over a copy (D-arc2-3). Writing Send's token-delete control exposed a pre-existing defect: deleting the active token selects no token (D-arc2-2), pinned and not repaired.
- 2026-10-10: phase 2.3. Parent commit for the proof: af4afcc. Builds: the armed smoke build (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<browser>`) at af4afcc (detached checkout, generated types restored before switching back) and at the arc's tree, each copied out of `dist/` and loaded through `EXTENSION_PATH`. A scratch spec, copied into `tests/e2e` for its runs and removed, captured at 360×600, device scale 1, retry 0:
  - Loader: the popup opened with `chrome.runtime.connect` replaced by a throwing stub through `evaluateOnNewDocument`, so the port never opens and the loader holds on "INITIALIZING"; theme set on `<html>`, transitions finished, other animations (the spinner) paused at 0, then a capture and the wrapper's computed `background-color`. On Firefox the stub did not take hold and the loader never showed (the wait for `global-loader` timed out on both builds; why was not pursued), so `GlobalLoader.test.ts`'s source pin is its proof, as the plan said.
  - Shake: a passkey profile, Settings → Security → full backup export, Protect with Password with a mismatched pair; in the page, the shake animation on the field's wrapper is found through `document.getAnimations()`, paused, and sought to 0, 60, 120, 180 and 240 ms, with every other animation settled before each capture.
  - The first comparison differed by 34 px (Chrome) and 20-21 px (Firefox) on the 0 ms frame only, all in rows 431-432 at x 25-151: the top edge of the "Passwords don't match" line, whose fade-in transition starts a frame after the shake and was captured mid-fade. The harness was fixed (other animations are settled over ten frames before every capture) and all four runs repeated; every pair is then identical.
  - Compared values: the keyframes rule text with its name replaced, the wrapper's computed animation duration, timing function, delay, iteration count, direction and fill mode (both browsers, both themes), and on Chrome under emulated `prefers-reduced-motion: reduce` the wrapper's computed `animation-name` (`none`, no running animation, the mismatch line shown). The built CSS agrees: parent `@keyframes _shakeInput_om09e_1 {…} ._shake_om09e_58{animation:.3s _shakeInput_om09e_1}` and its reduced-motion rule; after `._shake_password_17zix_23{animation:.3s _shakeInput_17zix_1}` with the same steps and its shared reduced-motion rule.
  - Control: the 0 ms and 60 ms frames of each series differ, so the comparison sees a 4 px move.

| Browser | Capture | Size | Parent pixels (sha256/12) | After vs parent |
|---|---|---|---|---|
| chrome | loader-dark | 360×600 | b5ddaebc8b74 | identical |
| chrome | loader-light | 360×600 | 48e720b0d1a4 | identical |
| chrome | shake-dark-0 | 360×600 | ecde1aa861c5 | identical |
| chrome | shake-dark-120 | 360×600 | 1654bca9103b | identical |
| chrome | shake-dark-180 | 360×600 | 60aaa5d0daf7 | identical |
| chrome | shake-dark-240 | 360×600 | 714568f53409 | identical |
| chrome | shake-dark-60 | 360×600 | b5252c1f8892 | identical |
| chrome | shake-light-0 | 360×600 | 85ee427c077e | identical |
| chrome | shake-light-120 | 360×600 | aadd93c77857 | identical |
| chrome | shake-light-180 | 360×600 | 005e7366508b | identical |
| chrome | shake-light-240 | 360×600 | 6267a1aec7a1 | identical |
| chrome | shake-light-60 | 360×600 | fd835b6000cc | identical |
| chrome | control: shake-dark 0 ms vs 60 ms (after) | | | differ (the pause seeks) |
| chrome | control: shake-light 0 ms vs 60 ms (after) | | | differ (the pause seeks) |
| chrome | values: loader.json | | | equal |
| chrome | values: shake.json | | | equal |
| firefox | shake-dark-0 | 360×600 | e7f2e439d71d | identical |
| firefox | shake-dark-120 | 360×600 | fdf58c85d938 | identical |
| firefox | shake-dark-180 | 360×600 | a2f351b6cd3d | identical |
| firefox | shake-dark-240 | 360×600 | dc83a3231219 | identical |
| firefox | shake-dark-60 | 360×600 | 7e14020d9026 | identical |
| firefox | shake-light-0 | 360×600 | fdd442cd125c | identical |
| firefox | shake-light-120 | 360×600 | a5973b14f9d4 | identical |
| firefox | shake-light-180 | 360×600 | 6cc0c2bfa96b | identical |
| firefox | shake-light-240 | 360×600 | 8008e13723d8 | identical |
| firefox | shake-light-60 | 360×600 | 0ae1abdf1031 | identical |
| firefox | control: shake-dark 0 ms vs 60 ms (after) | | | differ (the pause seeks) |
| firefox | control: shake-light 0 ms vs 60 ms (after) | | | differ (the pause seeks) |
| firefox | values: shake.json | | | equal |

## Post-implementation loop

- 2026-10-10: Codex arc-2 round 1 (session 01a12837): conditional approve, three Lows accepted (A2-C1..C3); Opus review: approve, four Lows accepted (A2-O1..O4). The Send contact pin's rework was proven by a scratch mutation of `send.vue` (contacts applied on arrival), reverted after the red run.
- 2026-10-10: an early `test:all` (before the round-1 fixes) was red on one test outside this arc, `scripts/e2e/owned-processes.test.ts` "an agent run's service, adopted by a bare run, outlives every reap until its adopter dies" (`{ cleared: false, reason: "its owner … is alive" }`), at a host load average near 90. The file passed 3/3 alone. Cause read from the code: the test's `kill` stops waiting once `/proc/<pid>/stat` shows a zombie, while `identityIsDead` still reads a zombie's start time and calls its owner alive, so a reap that runs before Node reaps the child refuses. Filed as an issue at delivery; not this lane's code.

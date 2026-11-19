# Phase 2: the runs, 2026-11-19

Every run at retry 0, through `e2e:agent` (live) or `test:e2e` (replay), with no rerun. Chrome 155.0.8059.79 (Puppeteer 25.14.0's pin), Firefox 158.0. Each started with load1 under 150 and `git status --porcelain -- apps/extension` empty, except the red control's one edit and the untracked recording before its commit. URLs in excerpts were replaced before copying.

| Run (UTC) | Commit | Outcome | Wall-clock |
|---|---|---|---|
| Red control: live, Chrome, v1.3.0's `send` set to `one-form`, 22:43:22-22:47:51 | `14d762072` | red as expected: `TimeoutError: Waiting failed: 10000ms exceeded` at `release-ui.ts:40`, the `send-from-type` wait, from `pickPreferences` (test 1, 100.7 s) and `populatePending` (test 2, 66.5 s), no error before it | vitest 264.2 s |
| Live, Chrome, `NULO_E2E_UPDATE_RECORD=1`, 22:48:39-22:52:55 | `14d762072` | test 1 red: `send-fee-done is covered at its centre by snackbar … "Pinned to Home"` in `doneSendFeeSheet`, from `pickReleaseSendFee`; test 2 passed (82.8 s). No recording written (populate stopped before it) | vitest 252.5 s |

- The second red was the driver's: the pin's success toast lasts 2 s and sits over the Fee sheet's Done, and the candidate's `pointerClick` refuses a covered target where the older releases' menu was clicked in page. Fix at the cause: `pickPreferences` waits for that toast to leave (`waitForToastGone`) before opening Send.

## At `3cf32b482` (candidates `1.3.0.1` naming it)

| Run (UTC) | Outcome | Wall-clock |
|---|---|---|
| Live, Chrome, `NULO_E2E_UPDATE_RECORD=1`, 22:54:44-22:59:13 | 2 passed: 128.1 s, 74.4 s | vitest 266.0 s |
| Live, Firefox, 22:59:34-23:05:42 | 2 passed: 180.7 s, 119.9 s | vitest 362.3 s |

The recording: written 22:57:40 UTC, SHA-256 `91d35df33073cceafa6f7b0b289fcd61ac61e4ab3d127bffc841b011b95c4263`, 41 keys, tag `v1.3.0`, browser `chrome`, 5 dials all loopback, no `nulo:e2e:` key, 5 plaintext URLs all loopback (the dials), no `0x` plaintext. Against `v1.2.0.storage.json`: the same families and counts plus `nulo:ui:whatsNewSeen` (`"1.3"`, F7). `update-recording.test.ts`: 19 passed. Its dApp session was made between 22:54:44 and 22:57:40; the replay refuses it from about 2026-11-26 22:44 UTC.

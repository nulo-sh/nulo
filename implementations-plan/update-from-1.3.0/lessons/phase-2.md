# Phase 2: the runs, 2026-11-19

Every run at retry 0, through `e2e:agent` (live) or `test:e2e` (replay), with no rerun. Chrome 155.0.8059.79 (Puppeteer 25.14.0's pin), Firefox 158.0. Each started with load1 under 150 and `git status --porcelain -- apps/extension` empty, except the red control's one edit and the untracked recording before its commit. URLs in excerpts were replaced before copying.

| Run (UTC) | Commit | Outcome | Wall-clock |
|---|---|---|---|
| Red control: live, Chrome, v1.3.0's `send` set to `one-form`, 22:43:22-22:47:51 | `14d762072` | red as expected: `TimeoutError: Waiting failed: 10000ms exceeded` at `release-ui.ts:40`, the `send-from-type` wait, from `pickPreferences` (test 1, 100.7 s) and `populatePending` (test 2, 66.5 s), no error before it | vitest 264.2 s |
| Live, Chrome, `NULO_E2E_UPDATE_RECORD=1`, 22:48:39-22:52:55 | `14d762072` | test 1 red: `send-fee-done is covered at its centre by snackbar … "Pinned to Home"` in `doneSendFeeSheet`, from `pickReleaseSendFee`; test 2 passed (82.8 s). No recording written (populate stopped before it) | vitest 252.5 s |

- The second red was the driver's: the pin's success toast lasts 2 s and sits over the Fee sheet's Done, and the candidate's `pointerClick` refuses a covered target where the older releases' menu was clicked in page. Fix at the cause: `pickPreferences` waits for that toast to leave (`waitForToastGone`) before opening Send.

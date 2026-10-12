# Phase 2: #325, every window a test asserts on is recorded

## 2026-10-12: the code (steps 1-6, 9)

- `recordPageErrors` is exported with a module-level `WeakSet<Page>` guard; `waitForPopup` calls it right after `target.asPage()`, with the attach comment (pre-attach errors may be absent; Chrome reports them nowhere). The Firefox clause waits for step 8.
- `PopupKind` gains `"logger"`, with its arming note.
- `own-window`'s `openWindow` records its window; `rows`' logger window is resolved with `waitForPopup(…, "logger")`, armed before the Enter, closed in the `finally`; its `before` target set stays for the count. `waitForTarget` dropped from `rows`' imports (no other use).
- `connect-one-window` drops its local `pageerror` listener and the `pageErrorOf` import, asserts `ctx.pageErrors` at the old point, and again after `waitForPopupClosed(caps)`.
- `data-testid="logger-window"` on the logger window's root `Flex` (same pattern as `network-unavailable-window`). The logger's unit test (`src/popup/windows/logger/index.test.ts`) has no snapshot.
- The capture test, "a window `waitForPopup` hands back is recorded once from then on", in `page-error-capture.test.ts`. Its two attributable reds: the first nonce missing (`"the window's throw is in the array when the call returns"`) without the attach, and the second-record nonce counted twice (`"a page recorded twice reports each error once"`) without the guard. Both assertions sit right after their raise, as the file's first test does, so neither red can come from the sentinel barrier.
- The skill: the reset sentence rewritten (both arrays restart at each `openPopup` and `openOnboarding`), "Approval sub-windows carry no listeners at all" replaced, `fixtures/popups.ts:53` → `:62`.

`bun run lint`, `bun run typecheck:all`, `bun run test` exit 0 on fda65f2 / 9a48003.

## 2026-10-12: step 6, the per-file audit

Two patterns per file: (a) an `openPopup` or `openOnboarding` (directly or inside a helper) between a window and the assertion; (b) a window still open or driven after the test's last assertion. Helpers checked for an inner `openPopup`: `fixtures/send.ts` (`sendDefaultTx`, `reconnectPlayground`), `fixtures/playground.ts`, the lock and profile helpers in `fixtures/helpers.ts` (none opens one). `fixtures/dappSession.ts`, `burst-account.ts`, `helpers/{backup-export,handshake-import,import-drivers}.ts` do, and none of the eight files imports them. Every dApp fixture runs its `openPopup` before `connectPlayground` (`setupConnectedPlayground`, `dappConnectedExtension`), so the fixture's windows sit under the body's first assertion if the body opens no popup before it.

Line numbers are at HEAD after the edits.

| File | (a) found | (b) found | Change |
|---|---|---|---|
| `connect-dapp` | the body's `openPopup` (`:29`) clears the fixture's setup popup and its connect window (discover and its check are one window: `approveConnect` throws if the check moves) | none | both arrays asserted at the top of the body |
| `connect-one-window` | none (the body's one `openPopup` precedes every window) | the verify approval and the capabilities window come after the only assertion | `ctx.pageErrors` replaces the local array; a final assertion after `waitForPopupClosed(caps)` |
| `connect-verify-mismatch` | none (`walletOnLocalNetwork`'s `openPopup` precedes every window; `registeredExtensionPerTest`) | none: each check window is closed by `refuseAndExpectForgotten` before the assertion | none |
| `delete-after-prove` | the body's `openPopup` (`:55`) clears the fixture's setup popup, connect and grant windows | none: `sendDefaultTx`'s window opens after `:55` and closes on approve, minutes before the assertion | `ctx.pageErrors` asserted at the top of the body |
| `execute-scope-account` | `:89` (fixture), `:132` (the follow window), `:167` (the declined window) | none: the contended window is closed before the last assertion | `ctx.consoleErrors` at the top and after each `waitForPopupClosed` before `:132`, `:167` |
| `execute-scope-chain` | `:45` (fixture), `:70` (the execute window) | none | `ctx.consoleErrors` at the top and after `waitForPopupClosed` before `:70` |
| `register-token` | none (the body opens no popup; the fixture's windows are covered) | the approved execute window may still be closing at the assertion | `waitForPopupClosed(execPopup)` before the assertions |
| `snack-placement` | each drain's `openPopup` (`:249`, inside `balanceDrainedBehindTheWallet`, called at `:304` and `:326`) clears that test's fixture (per-test scope: each test has its own launch) | test 3's execute window stays open after its last assertion (the estimate failed; nothing closes it) | `pageErrors` at the top of tests 1 and 2; test 3 rejects its window (`rejectExecute`), waits for it to close, then asserts |

One more gap, found by the pre-sweep Opus review (below): every cap fixture's top-of-body assertion ran before the grant window had closed. `grantCapBundle` returned on the dApp's answer, and the window resolves the request before `closeWindow(true)` (`src/popup/windows/capabilities/index.vue`), so a teardown error could land after the assertion and before the body's `openPopup` wiped it. `grantCapBundle` now waits for the window to close (10 s, as `approveVerify` waits for its own close). The fix sits in the helper that owns the window, so its other callers (`connect-unserved-chain`, `passkey-execution-canary`, `send-chaos`, `store-captures`, `tx-sendTx-noFrom`, `same-token-concurrent-sends`, `connect-locked-queue`) get it too.

Assertions only moved earlier or were added; none was removed, loosened or filtered.

## 2026-10-12: pre-sweep Opus review (general-purpose, opus), conditional approve

Run on the three committed Phase 1-2 commits while waiting for `e2e-followups-5`'s PR (decision 5), before any e2e spend. Every finding checked against the tree.

| # | Finding | Disposition |
|---|---|---|
| 1 | [major] `grantCapBundle` returns before the capabilities window closes (`resolveInteraction` precedes `closeWindow(true)`), so the cap fixtures' top-of-body assertions miss its teardown | **Accepted.** `waitForPopupClosed(capPopup, 10_000)` in `grantCapBundle`. |
| 2 | [minor] The audit table: base line numbers, snack-placement's fixture is per-test (not "test 1's tail"), discover and verify are one window | **Accepted.** Table corrected. |
| 3 | [nit] "Chrome reports it nowhere else" implies Firefox does; at HEAD Firefox's relay delivers to a `Page` with no listener | **Accepted.** "nothing reports it elsewhere" until step 8 decides the Firefox clause. |
| 4 | [nit] The top-of-body comments omit the fixture's setup popup, which the assertion also covers | **Accepted.** Reworded in the five files. |
| 5 | [nit] A window leaks when `waitForPopup` fails after the target appears (rows, the capture test) | **Rejected.** Only a second failure on a retry is affected, and the first attempt's error is printed by `RetryErrorReporter`; closing windows inside `waitForPopup` on failure would change every caller's failure path for no case the suite has hit. |
| 6 | [nit] Each test asserts only the arrays it already asserted | **Rejected for this arc** (the plan's choice: assertions move, none is added to a new array). The sweep's JSONL shows what the windows raise in each array; an entry there is a finding whichever array a test asserts. |
| 7 | [nit] The zombie helper leaks the background `sleep` if the shell prints no pid | **Rejected.** The plan's "once known"; the pid is unknown on that path, and the old fixture had the same exposure. |

## 2026-10-12: smoke on Chrome (armed build, `env -u EXTENSION_PATH`, retry 0, the sweep tap applied)

- `page-error-capture`, `own-window`, `rows`: 3 files, 11/11 green.
- Red-on-base proof 1 (the `recordPageErrors` call removed from `waitForPopup`, the `"logger"` kind kept): `AssertionError: the window's throw is in the array when the call returns: expected +0 to be 1`. The window was discovered, booted and showed `console._error`; the red is the missed capture.
- Red-on-base proof 2 (the `WeakSet` guard's early return removed): `AssertionError: a page recorded twice reports each error once: expected 2 to be 1`.
- Both files restored from copies and diffed clean before the next run.
- Full smoke suite on Chrome: 49 files passed, 4 skipped (214 tests passed, 10 skipped), 1,459 s.
- Firefox (armed Firefox build): the three files 11/11 green; proof 1 and proof 2 red with the same two messages as on Chrome.
- Sweep entries from every smoke run above (Chrome full suite, both browsers' three files, the four proof runs): 56 lines, every one a `NULO-PAGE-ERROR-` control nonce. No window, popup or onboarding page raised anything else.

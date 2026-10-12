# Recon: wallet-followups-5

Two read-only Explore agents (sonnet) on the worktree at `origin/dev` 04137a0, plus the planner's own reads. Every path is repo-relative; line numbers are at 04137a0.

## Reuse map

| Capability needed | Existing code found | Verdict |
|---|---|---|
| Close the page's own window, tolerating a window that is already gone | `apps/extension/src/utils/close-current-window.ts` (the one page-side remover, unhandled); every background remover already treats "gone" as success: `window-manager.ts:250` (`.catch(() => {})`, "Window may already be closed"), `wallet-sdk/background.ts:297`, `session-established.ts:235,284` | adapt (one line in the existing util) |
| A fake `chrome.windows` whose `remove` of a gone id rejects like the browser | `packages/wallet-core/src/testing/fake-browser-api.ts:243-247` (`FakeWindowsAdapter.remove` resolves silently on an unknown id; it fakes `WindowPort`, not `chrome.windows.getCurrent`); `wallet-sdk/test-ports.ts:4-9` (`remove: async () => {}`); `tests/vitest.setup.ts` stubs no `windows` (searched `windows`) | build new: a six-line `chrome.windows` stub inside the new test; neither fake rejects, and widening the shared fake changes its other consumers |
| Observe an unhandled rejection in a unit test | `wallet/services/account/serialize-per-tuple.test.ts:27-48` (`collectUnhandledRejections`, with the macrotask flush and the note that vitest defers to a process listener); `popup/auth-guard.test.ts:95-109` (the same, inline) | reuse the idiom (see D4 for where it lives) |
| A balanced-paren call window over noise-stripped text | `log-payload-ban.test.ts`: `callWindow` (line 314), `stripNoise` (168), `scannableLines` (129). Siblings: `toast-call-sites.test.ts:30-60` (`closing`, no template holes), `amount.callers.test.ts:31-64` (no string skipping), `JsonViewer/useLogFilters.scan.test.ts:54-84`, `copy-dash-ban.test.ts` (TypeScript AST) | adapt `callWindow` in place (return the closing column too); no sibling is reusable as is |
| The logger's level-method names | Aztec `Logger` (`@aztec-labs/foundation@6.0.0-rc.1`, `dest/log/log-levels.d.ts`): `silent, fatal, error, warn, info, verbose, debug, trace`, one method per level, no `.log`; `wallet-core/src/logger/interfaces.ts:13,43-50` (`LogLevel`, `consoleMethods`: trace, debug, log, info, warn, error); `console-sniffer.ts:4`; `copy-dash-ban.test.ts:259` (`LOG_NAMES`) | build new: one literal alternation in `LOG_CALL`; no list holds `verbose`/`fatal`, and importing a runtime list into the regex would couple the scanner to a type it does not need |
| The complexity-baseline regeneration | `bun run baseline:complexity` (`scripts/complexity-baseline/generate.ts`), `bun run baseline:rescore`, `scripts/ci-cd/complexity-baseline.test.ts`; manifest entry `findLoggedSecrets` (accepted 17) and `stripNoise` (41) | reuse as is |

## #312: who closes each window

`closeCurrentWindow()` (`close-current-window.ts:2-5`) is `chrome.windows.getCurrent(undefined, cb)` then `chrome.windows.remove(id)` with no handler. Callers: `verify/index.vue:87,113,170,177,193`, `composables/useDappApprovalWindow.ts:111` (execute, capabilities, discover, network-unavailable), `json/index.vue:19`, `logger/index.vue:15`. No other page calls `chrome.windows.remove`; `passkey`, `own-window.ts`, `display.vue` and onboarding close with `window.close()`, which returns nothing and cannot reject.

| Window and path | Background also removes it? | Page close needed for today's close step? |
|---|---|---|
| capabilities Approve (`index.vue:319,325`, awaited `resolveInteraction`) | yes, inside the awaited RPC: `detach` then `settle` → `_settle` (`dapp-interaction/service.ts:230,259`) | no |
| Reject on execute, capabilities, discover; network-unavailable dismiss (`rejectInteraction`, not awaited) | yes: `cancel` → `_settle` (`service.ts:282`); the RPC is not awaited, so the order is observed (20 of 20 in #312's probe), not guaranteed | no |
| A user's own close (the X) after `init()`: `beforeunload` → `reject()` → `closeWindow(true)` | no: `_settleUserClose` removes nothing (`window-manager.ts:223-234`); the browser is removing the window while the page's remove runs | the page's remove races the browser's |
| execute Approve (`index.vue:501-504`) | yes, after the execution (`service.ts:230,356,358`), which can end while the page still awaits `scopeFollow.follow` (`execute/index.vue:503-504`) | yes |
| discover Allow | no: `handOver` keeps the window for the verify step (`service.ts:267`) | not called |
| discover expired page (OK, 30 s timer, unmount), execute wrong-profile overlay, cancelled overlay when the flag came from `cancelInteraction` | no | yes |
| verify, all five paths | only on its creation and adoption failure paths (`session-established.ts:235,284`); the window is not WindowManager-managed (`verify-admission.ts:160-175`) | yes |
| json, logger (opened by a direct `chrome.windows.create`: `execute/index.vue:576`, `JsonViewer.vue:90`, `settings/developer/index.vue:~50`) | no | yes |

Test mocks: every page test stubs `getCurrent` in callback form and `remove` returning a number or `undefined`, never a promise (execute, capabilities, discover ×2, `useDappApprovalWindow`, network-unavailable, scope-follow, chain-switch, json, logger, verify ×2). Pinned call logs that include `windows.remove`: execute `index.test.ts:447-453,524-539`, capabilities `:362-367`, discover `index.lifecycle.test.ts:347-352`, json and logger `:60-66` (`remove.mock.calls` `[[7]]`), verify `index.window.test.ts:201,218`.

E2E: the six files exist under `apps/extension/tests/e2e/network/`. Approval windows get no `pageerror` listener (`fixtures/extension.ts:343-346`, `:1271-1274` attach one to the main page only; `connect-one-window.test.ts:126-130` adds its own). On Firefox no `pageerror` fires for an extension page at all (`tests/e2e/FIREFOX.md:46`, #281); geckodriver inherits stderr (`fixtures/browser/firefox.ts:166-175`), so a `JavaScript error:` line lands in the run's stderr and nothing records it.

## #302: the scanner

- `LOG_CALL` (`log-payload-ban.test.ts:96-97`): `.log|logDebug|logInfo|logWarn|logError(` on any receiver except `Math`, `console.<log|warn|error|info|debug|trace>(`, and a bare `log?.(`. `findLoggedSecrets` (`:431-466`) runs `LOG_CALL.exec` once per line (no `g` flag), and `callWindow` (`:314-327`) returns a line index, so a window runs to the end of the line holding the balancing paren.
- Whole-tree sweep of `(\?\.|\.)\s*(debug|info|warn|error|trace|verbose|fatal|silent)\s*\(` over the scan roots (allowlisted paths excluded): 100 hits, 89 on `console`, 11 on another receiver, all 11 loggers, 0 same-name non-logger methods (every toast goes through `openToast(`). See the match table in `plan.md`.
- Lines holding two log calls: `wallet/services/incoming-transfer/service.ts:376`, `packages/aztec-runtime/src/pxe/service.ts:685,708` (`level === "warn" ? this.logWarn(msg, ...rest) : this.logDebug(msg, ...rest),`). A log call followed by other code on its line: those three, and `wallet/services/token-balance/service.ts:550` (a `logDebug` inside a callback argument). None names a denied identifier. No `console.error("x", { error }); setError(err.message)` shape exists on the tree.
- Forms a level-name opener cannot reach (each searched, zero calls on the tree): a receiver and method split across lines with the dot ending the first line, bracket access `x["warn"](`, a bare destructured `warn(`. A line starting with `.method(` is read: the receiver alternative anchors on the dot.
- Complexity: `findLoggedSecrets` is accepted at 17 (`scripts/complexity-baseline/manifest.json:42-48`). `CLAUDE.md` § Complexity budgets pins the count in prose: "The residue is **24 acceptances**: 10 production functions … and 14 test/CI-harness directives". The manifest agrees (10 production, 14 harness). No test hard-codes the count.

## Open issues and PRs read

`gh pr list --state open`: #271 (tokens-and-balances) touches none of this lane's files. Out of scope per the lane brief: #308, #310, #294, #290, #281, #262, #277 (§ Issue map in `plan.md`).

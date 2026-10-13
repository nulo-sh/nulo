# Recon: e2e-followups-6

Base: `origin/dev` at 32b7bf4. One reuse sweep (Explore, sonnet) plus the planner's own reads. Every path is repo-relative.

## Reuse map

| Capability needed | Existing code | Verdict |
|---|---|---|
| Record a page's `pageerror` and `console` errors into the launch's arrays | `recordPageErrors(ctx, page)`, `apps/extension/tests/e2e/fixtures/extension.ts:1214-1233`, private; callers `openOnboarding` (`:327`) and `loadPopup` (`:1244`) | **adapt**: export it, and make it record each `Page` once |
| Record a page once, whoever asks | none. Searched `WeakSet`, `WeakMap`, `recordPageErrors`, `pageerror`, `.on("console"` over `apps/extension/tests` and `apps/extension/scripts/e2e`; the two WeakMaps found (`fixtures/browser/firefox.ts:46`, `fixtures/browser/standing-interception.ts:37`) are keyed by `Browser` | **build new**: a module-level `WeakSet<Page>` beside the recorder. puppeteer-core 25.8.0 `cdp/Target.js:54-69` caches `asPage()`, so a second `waitForPopup` on one target gets the same `Page` object |
| Hand back an approval window's page | `waitForPopup`, `apps/extension/tests/e2e/fixtures/popups.ts:22-100` (`target.asPage()` at `:53`) | **adapt**: attach the recorder right after `asPage()` |
| Hand back other extension windows the tests assert on | `openWindow` in `apps/extension/tests/e2e/own-window.test.ts:21-35` (asserts `pageErrors` at `:70`); the logger window in `apps/extension/tests/e2e/rows.test.ts:431-446` (asserts `pageErrors` at `:449`) | **adapt**: `own-window` calls the recorder; `rows` resolves the logger window through `waitForPopup` with a new `"logger"` kind |
| A per-test window recorder that #325 makes redundant | `apps/extension/tests/e2e/network/connect-one-window.test.ts:126-130`, asserted at `:182`; the only duplicate of `recordPageErrors` (the sweep's item 1) | **adapt**: delete it, assert `ctx.pageErrors` |
| Prove that the arrays capture a page's errors on both browsers | `apps/extension/tests/e2e/page-error-capture.test.ts` (smoke, `hear()` ground-truth listener, `expectExactly`, nonce helpers) | **reuse-as-is**: add one window test to this file |
| Wait for a condition in the zombie tests | `until(condition, 3_000)` at `apps/extension/scripts/e2e/owned-processes.test.ts:57-61`; `running(pid)` at `:64-71` | **reuse-as-is** |
| Read a process's `comm` | none. Searched `comm` over `scripts/e2e/owned-processes.test.ts`, `tests/e2e/owned-processes.ts`, `tests/e2e/sandbox-ownership.ts`; `statFields` (`tests/e2e/owned-processes.ts:38-42`) drops the comm field | **build new**: a test-local helper. Product code has no use for it |
| Other fixtures with a kill-before-`exec` zombie race | none. Searched `spawn(Sync)?\("(sh|bash)"`, `exec sleep`, `echo \$!`, `\) Z `, `zombie` over `apps/extension/scripts` and `apps/extension/tests`. `webdriver-ownership.test.ts:185` and `process-group.test.ts:20-73` depend on no zombie | n/a, except the sibling test below |

## Findings that shape the plan

- **Both zombie tests share the race.** "a zombie reads as gone, not unreadable" (`owned-processes.test.ts:412-421`, `sleep 0.1 & echo $!; exec sleep 5`) loses its zombie the same way when the parent has not reached its `exec` before the child exits. #326 names only the second test (`:423-438`).
- **The arrays are reset by every `openPopup`** (`extension.ts:1269-1270`) and by `openOnboarding` (`:324-325`), nowhere else. A recorded page keeps pushing into the current arrays after a reset.
- **Tests that filter the arrays** (all on "Client disconnected", except `security.test.ts:80-81, 115-116`): `account-import-export.test.ts:99`, `passkey-paths.test.ts:109, 195`, `passkey-backup.test.ts:241, 303, 362`, `network/account-balance-orphans.test.ts:224`, `network/imported-account-execution.test.ts:106, 184`. None of them opens an approval window.
- **Network files that open a window through `waitForPopup`, `connectPlayground` or a `dappConnected*` fixture and assert an array** (`grep -l` of both patterns over `tests/e2e/network/*.test.ts`): `connect-dapp`, `connect-one-window` (local array today), `connect-verify-mismatch`, `delete-after-prove`, `execute-scope-account`, `execute-scope-chain`, `register-token`, `snack-placement`. These eight are the assertions the wider recorder reaches. 78 of the 118 network files drive a window; the other 70 assert neither array. (The sweep agent also named `popup-escape-layered`; it opens no window.)
- **No smoke file calls `waitForPopup`.** The smoke files that open an extension window and assert the arrays are `rows.test.ts` (logger window) and `own-window.test.ts`.
- **Docs**: `.claude/skills/e2e-testing/SKILL.md:461` says "Approval sub-windows carry no listeners at all", false after the change; `:566-570` names `fixtures/popups.ts:53`. `tests/e2e/README.md` and `FIREFOX.md` state nothing the change makes false.

## Open work read

`gh pr list --state open` (2026-10-12): #271 only; `e2e-followups-5`'s PR is not open yet. Its branch (read through the shared refs, never its worktree) touches `tests/e2e/fixtures/browser/{bidi-attach,chrome,firefox,firefox-page-errors,index}.ts`, `tests/e2e/FIREFOX.md`, `tests/e2e/security.test.ts`, `tests/e2e/legal-acceptance.test.ts`, the popup's lock fence (`useProfileBootstrap.ts`, `app.vue`, `locked-state.ts`) and the e2e-testing skill. This lane's change map overlaps it only in `.claude/skills/e2e-testing/SKILL.md` and, if the implementer edits it, `FIREFOX.md`.

Issues read: #325, #326 (in scope); #324, #310 (`owner-decision`), #321, #316, #294, #290 (`owner-decision`), #262, #277 (product bugs), #322 (`e2e-followups-5`), #284 (closed; the earlier zombie-read-as-alive failure of the same test).

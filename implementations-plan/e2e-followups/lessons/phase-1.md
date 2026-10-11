# Phase 1: implementation log

## 1.1 (#249), 2026-10-11

- First run of the guard's unit test: 9 of 13 green, every watch case and the parse-failure case red. Cause: the test runs under `bun --bun vitest`, which puts Bun's `node` shim first on the child's PATH; the shim drops `--` and `-w` from `node -e`'s argv (`node --input-type=module -e 'console.log(process.argv)' -- -w a` prints `[bun, "a"]`), so the inline parse step answered `run`. Real Node prints `[node, "-w", "a"]`. A fail-open whenever the guard runs under a Bun parent.
- Fix (D14): the watch read moved to `scripts/e2e/watch-mode.ts`, run with `bun run`. Probe under bash (not zsh, which keeps an unquoted `$a` as one word): `bun run`, the shim and Node 24 give the same answer for every case: `-w`, `--watch`, `--watch=true`, `-w=true`, `--watch=0`, `--watch=no`, `--watch.enabled=true|false` → watch; `--watch=false`, `--no-watch`, `-w=false`, no watch flag → run; `--watch --watch=false` → exit 1; an unknown flag → run (the listing then refuses it).
- `vitest list --filesOnly --json` (vitest 4.1.10): `[{"file": "<absolute path>"}]`; an empty selection writes `[]` and exits 0; an unknown flag exits 1.
- Red on base: with the guard's body replaced by `af4afcc`'s inline block, 9 of 13 cases fail, the first two included. Restored.
- Gate: `bun run lint` 0; `bun run typecheck:all` 0; guard test 13/13 (about 3 s, concurrent); `bun run test` 735 files, 11125 passed; `bun run test:ci-gating` 480 pass; `shellcheck` 0; `bun run e2e:agent tests/e2e/network/import-handshake-note.test.ts --retry=0` exits 2 with the FATAL lines and no `resolving ports` line.

## 1.2 (#275), 2026-10-11

- First red-on-base attempt did not go red: the primitive rejections, scheduled inside a function `page.evaluate` defines, arrived as `Error`s on Chrome 152. A raw CDP session showed `Runtime.exceptionThrown` with `text` only and no `exceptionDetails.exception` for them, so Puppeteer's `createClientError` builds an `Error` from the text. The same `setTimeout(() => { throw 'x' })` from a string `evaluate` (page script) arrived as the string `x`, on the popup and on `about:blank` alike. The probe now schedules from page script (D16).
- Red on base (af4afcc's handlers, the extended probe): `TypeError: Cannot read properties of undefined (reading 'message')` unhandled in vitest, three of four entries recorded, the string stored raw. Green at head on Chrome.
- Firefox: the probe is red at head and at base (af4afcc's probe file and handlers): `ctx.pageErrors` = `[]` even for the `Error` throws. A scratch spec showed the popup gets no `console` and no `pageerror` event while a `data:` page in the same session gets both. Cause in Firefox 153.0.4's `omni.ja`, `chrome/remote/content/shared/BrowsingContextUtils.sys.mjs:240`: "extension contexts until we support debugging webextensions, see Bug 1755014". Panel consult (D15): Codex session `01a12864-e0eb-78d3-bbe6-2c05b7de86b2` (gpt-6.1-sol, high, account alejo-icloud via `CODEX_ACCOUNT=best`), verdict "Option 1 is justified"; Opus Plan agent, same verdict, found the Firefox source line. Issue #281 opened.
- Gate: lint 0; typecheck:all 0; page-errors test 7/7; `bun run test` 736 files, 11132 passed; probe Chrome 1/1 at retry 0; probe Firefox 0/1 at retry 0 (red at base too, #281).

## 1.3 (#274), 2026-10-11

- `openDropdown` replaces `setTheme`'s open block and the two token helpers' bare `querySelector(...)?.click()`; the token items click through `clickByTestId(page, item, 2_000)` inside `withTimeoutMessage`. A private `clickTokensMenuItem` holds the open-then-click pair the two token helpers share.
- The smoke test's barrier: a main-realm wrap of `Document.prototype.querySelector` and `querySelectorAll` records the first query naming `tokens-menu-trigger` and only then schedules the hash change to Home. Chrome and Firefox both observed `firstFoundNothing: true` and resolved after the navigation.
- Red on base: `openDropdown`'s body replaced by the old bare click plus the 2 s item wait failed with `TimeoutError: Waiting failed: 2000ms exceeded` on Chrome. Restored.
- Gate: smoke `navigation.test.ts` + `appearance.test.ts` at retry 0: Chrome 8 passed, 1 skipped; Firefox 8 passed, 1 skipped (the #269 title-bar case passed on both). Network, proverless, retry 0, `tokens`, `import-handshake-note-matrix`, `in-flight-send-guard`: Chrome 4/4, Firefox 4/4.

## 1.4 (#272), 2026-10-11

- `backup-import-stalled-network.test.ts` unwrapped (whitespace-only beyond the wrapper and two imports), `hangingRequest` removed from `CHROME_ONLY`; `git grep -n hangingRequest -- ':!implementations-plan'` prints nothing. The four prose sites (`CLAUDE.md`, `CI.md`, `FIREFOX.md`, the skill) now say two Chrome-only files.
- Flake-ledger rows 49 (#269, open until Phase 1.5) and 50 (#274, fixed) added; the skill's state-attributes rule and the e2e README's helper table name `openDropdown`.
- Gate: lint 0; typecheck:all 0; ci-gating 480 pass; check:plans 0 findings; network, proverless, retry 0: Chrome 2/2; Firefox 2/2 in each of 3 runs (main test 115-119 s).

## 1.5 (#269), 2026-10-11 (OA-1 = A, D-orch-2)

- Both observers read `entries.at(-1).isIntersecting`. The page unit tests now keep the stubbed observer's callback and deliver `[true, false]` (bar shown) and `[false, true]` (bar hidden); all four fail on af4afcc's pages and pass at head.
- Gate: `bun run audit:vue` 0 (736 files, 11136 passed; build ok). The phase-0 diagnostic on the armed Chrome build, three launches of 12 iterations: `failures=0` each, 0 of 36 stuck (4 of 12 at base); the logged callback tails still held twelve `[true, false]` two-entry deliveries, so the race occurred and the page now reads it right. Smoke `navigation.test.ts` at retry 0: Chrome 6/6, Firefox 6/6. The diagnostic and the screenshot specs were untracked and deleted after.
- Screenshots of the bar shown after a Tab walk and a scroll, Settings and History, Chrome armed build: kept in the lane's scratch directory for the PR (the CLI cannot upload images to a PR body).

---
plan: e2e-followups
tier: mid
status: implementing arc 1 (plan v5 approved by the orchestrator with OA-1 = A)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 Explore agent (sonnet) plus the planner's own probes; dual audit (Codex gpt-6.1-sol high + Opus Plan); one final fresh Codex pass
base: origin/dev at af4afcc
trunk: dev
issues: [249, 269, 272, 274, 275]
---

Live progress: [STATUS.md](STATUS.md). Owner questions: [OWNER-ASKS.md](OWNER-ASKS.md). Recon: [recon.md](recon.md). Consults and probes: [lessons/phase-0.md](lessons/phase-0.md).

## Tier and budget

`mid`, set by the orchestrator. Rubric: blast radius moderate (every e2e run goes through the runner and the fixtures, but nothing ships to users except the gated #269 line), novelty low, irreversibility low, migration cost none, external coupling low (Puppeteer and vitest behaviour), security sensitivity low. No HIGH. One arc, one PR against `dev` (the orchestrator's D-orch-1: no stack).

## Issue map (the arc that closes each issue)

| Issue | Arc | Phase | Waits on | Closes when |
|---|---|---|---|---|
| #249 | 1 | 1.1 | nothing | arc 1 merges |
| #275 | 1 | 1.2 | nothing | arc 1 merges |
| #274 | 1 | 1.3 | nothing | arc 1 merges |
| #272 | 1 | 1.4 | nothing | arc 1 merges |
| #269 | 1, only on OA-1 = A before arc 1 merges | 1.5 | OA-1 | arc 1 merges with Phase 1.5 in it; otherwise **no arc**: the cause is in the page (recon § #269) and the fix changes when the title bar shows, so it waits for the owner. Arc 1 ships the flake-ledger row naming its cause (Phase 1.4, no sanctioned rerun), and the issue stays open with a comment naming the cause, the fix and its tests. |

## Outcome & Quality Bar

**For whom.** The agents and contributors who run the e2e suites locally at retry 0 and must read a red as a flake or a bug, and the owner, who reads PR gates.

**What excellent looks like.**
- An unarmed run whose selection, before sharding and pre-parsing, holds a proverless-gated file is refused before any port or build, whatever vitest arguments come with it; so is an unarmed watch run. A run whose selection holds none is never refused. A tool error in the guard refuses with its own message; it never passes.
- A red names its real cause. A tokens-menu failure says which stage stalled and shows the page's state at that moment (trigger present, menu state, hash, visibility, focus). A page that rejects with a primitive is recorded as a page error, never thrown inside Puppeteer's emitter.
- The Chrome-only list states only what a browser cannot do: the stalled-network spec runs on Firefox, and every doc that names the set agrees with `CHROME_ONLY`.
- No wait is lengthened, no assertion loosened, no filter widened, no retry added. Each fix sits at its cause.

**What good enough looks like.** The other bare `querySelector(...)?.click()` sites in the e2e tree, and the other inline `instanceof Error` copies, stay as they are: no issue names them, and this lane does not sweep the tree.

## Scope

In: the five issues, as the issue map says. Out: `apps/playground`, `apps/extension/tests/e2e/network/tx-*.test.ts` (the `e2e-harness-gaps` lane holds them), any other dropdown helper, any change to what a user sees beyond OA-1.

## Architecture & Implementation

### #249: the guard asks vitest which files the run selects

- **Cause.** `agent.sh:27` hands vitest's arguments to `grep` as files. GNU grep parses `--retry=0`, `--exclude <path>` and `-t <name>` as its own options; a vitest name filter is no path. `2>/dev/null || true` turns every error into "no marked file".
- **Fix.** `agent.sh` names the network config once (`NETWORK_CONFIG=vitest.e2e.network.config.ts`) and passes it to the guard and to the run. A new script, `apps/extension/scripts/e2e/proverless-guard.sh <config> [vitest args…]`, replaces the inline block at the same place, before the port claim. The script:
  1. exits 0 when `NULO_E2E_PROVERLESS=1`;
  2. asks vitest's own parser whether the arguments start a watch run: `node --input-type=module -e "$read_mode" -- "$@"`, where the inline module prints `watch` when `Boolean(parseCLI(["vitest", "run", ...args]).options.watch)` and `run` otherwise. `parseCLI` is a public `vitest/node` export, the parser `vitest run` itself applies, on Node, the runtime `bun run vitest` uses; the truthiness test is the run's own rule (`run()` sets `options.run = !options.watch`), so a dotted `--watch.enabled=…` object counts as watch, as it does in the run. `watch` refuses with `[e2e:agent] FATAL: an unarmed run cannot watch (a watch run later runs whatever file changes)` and the remedy, exit 2; a non-zero exit or any other output refuses with `FATAL: vitest could not read this run's arguments`, exit 2. `vitest list` cannot answer this: it forces non-watch mode, and `vitest run -w` stays in watch mode (planner probe);
  3. creates a temporary file (removed by an EXIT trap) and runs `bun run vitest list --filesOnly --json="$listing" --config "$config" "$@"` from `apps/extension`, with stdout discarded and stderr shown. The JSON holds absolute module paths (`formatFilesAsJSON`), so a `--root` or a named project cannot change the paths the scan reads. A non-zero exit refuses with `[e2e:agent] FATAL: vitest could not list this run's files` and exit 2;
  4. reads the paths with `jq -r '.[].file'` inside an `if !` branch (a jq failure refuses the same way); an empty selection exits 0 without calling grep;
  5. runs `rc=0; marked=$(grep -l -- "@requires-proverless" "${files[@]}") || rc=$?`, then a `case` on `rc`: 0 refuses with today's FATAL lines (paths shown relative to `apps/extension`) and exit 2; 1 exits 0; anything else refuses with `FATAL: could not scan the selected files` and exit 2.
- **Why vitest list.** `list` and `run` select files through the same `getRelevantTestSpecifications` with the same config and arguments, so the guard and the run cannot disagree about the selection. `list --filesOnly` loads the config only: no global setup, about 0.7 s, nothing written to `.e2e-state`.
- **What the guard judges.** The selection before sharding and pre-parsing: `--shard` and `--experimental.preParse` narrow inside `run`, so an unarmed run with either is refused when any file of the whole selection is marked, and `-t` alone selects every file. Both refusals carry the remedy (`NULO_E2E_PROVERLESS=1`). This changes one real path: a prover-ON `extension-network-e2e-soak.yml` dispatch in `shard` mode, which the old guard let through to multi-minute timeouts, is now refused up front, as its `full` mode already was.
- **Why a separate script.** The unit test must run the guard alone: inside `agent.sh`, a passing guard goes on to claim ports and build. The FATAL text and exit code 2 stay, so `classify-exit.ts` and the docs stay true.

### #275: one normaliser for the three `pageerror` handlers

- **Cause.** Puppeteer's CDP driver emits a page's primitive throw or rejection value as is (`createClientError`, recon § #275); BiDi always emits an `Error`. `(err as Error).message?.includes(...)` throws on `undefined` and `null`, and any other primitive is stored in an `Error[]`.
- **Fix.** New `apps/extension/tests/e2e/fixtures/page-errors.ts` exporting `pageErrorOf(payload: unknown): Error | undefined`:
  - an `Error` whose message includes "Client disconnected" returns `undefined` (today's filter, unchanged in match and scope: the port-close cascade is always an `Error`, `packages/extension-messaging/src/core/base-client.ts:351`);
  - any other `Error` passes through as the same object;
  - anything else becomes `new Error(String(payload))` and is never filtered.
- **Contract.** Puppeteer builds every non-primitive payload itself, so a page object never reaches Node; `String` of every CDP primitive (string, number, bigint, boolean, symbol, `undefined`, `null`, the unserializable numbers) cannot throw. The TSDoc states that boundary and the cascade's why once, in place of the two copies of that comment in `extension.ts`.
- **Call sites.** `extension.ts:341` and `:1273` become `const err = pageErrorOf(payload); if (err) ctx.pageErrors.push(err)`. `connect-one-window.test.ts:106` uses the same helper and keeps its local list.

### #274: open the tokens menu through the dropdown's own state

- **Cause.** `importToken` (`helpers.ts:923`) and `refreshBalances` (`:974`) click the trigger with `querySelector(...)?.click()`. While Home is mounting, the trigger is absent, the click does nothing, and the 2 s item wait fails: the planner's probe reproduced this 6 of 6 times (lessons/phase-0.md). `DropdownRoot` toggles on each click, so a second blind click would close an open menu. The one recorded failure was on Firefox, where `prepareClick` brings the page to the front before a click; the bare click skipped that too.
- **Fix.** New `openDropdown(page, triggerTestId)` in `helpers.ts`:
  1. `prepareClick(page)` (the driver hook `clickByTestId` uses);
  2. one page-side `waitForFunction` picks the trigger by one rule for both the read and the click (the last visible match), resolves at once when its wrapper's `data-dropdown-open` is `"true"`, and otherwise clicks it and resolves; it clicks at most once;
  3. a wait for that wrapper to read `"true"`.
  `setTheme` (whose open block this replaces), `importToken` and `refreshBalances` call it. The two token helpers then click their item with `clickByTestId(page, item, 2_000)`, keeping today's 2 s item budget. Each wait sits in `withTimeoutMessage` with a function that reads the trigger's presence, the wrapper's state, the hash, `document.visibilityState` and `document.hasFocus()`, so a red shows the page's state at the boundary. No retry.
- **Budgets.** The trigger wait is the fix: the old helper did not wait for the trigger at all. It uses `clickByTestId`'s 10 s, and the open-state wait `setTheme`'s 5 s. No existing wait gets longer.

### #272: drop the Chrome-only entry

- **Fact.** The spec redirects the Testnet origin to a loopback stub; the Firefox driver's redirect serves exactly that. The planner ran it on Firefox at retry 0 with the skip removed: 2 of 2 passed (lessons/phase-0.md).
- **Fix.** Unwrap `backup-import-stalled-network.test.ts:154` (`describe.skipIf(isFirefox)(CHROME_ONLY.hangingRequest, …)`) to plain tests, drop the unused imports, remove `hangingRequest` from `CHROME_ONLY`, and make the four prose sites say two files: `CLAUDE.md:538`, `CI.md:87`, `apps/extension/tests/e2e/FIREFOX.md:30`, `.claude/skills/e2e-testing/SKILL.md:29`. No workflow or `behavior-gating.test.ts` pin changes: both Firefox lanes already run the file.
- If the implementer's runs show a real Firefox difference after all, the skip stays with that difference as its reason, and the docs say so.

### #269 (on OA-1 = A only): the observer reads the newest entry

- **Cause.** `settings/index.vue:97-102` and `activity.vue:133-138` take `([entry])`, the oldest of the entries queued since the last callback. Under fast scrolling two entries arrive together, `[true, false]`, and the bar stays hidden while the hero is off screen (recon § #269: 4 of 12 diagnostic iterations). The observer specification queues entries in order, so the newest is current.
- **Fix.** Both callbacks read `entries[entries.length - 1].isIntersecting`. One comment states the invariant: the callback batches every change since the last delivery, and only the newest is current.
- **Not taken.** A shared composable for the two observers: CLAUDE.md asks ten cases of a composable, for one line in two files.

### Docs the arc changes

- `.claude/skills/e2e-testing/SKILL.md`: § The agent runner (`:99-101`) says the guard judges vitest's own selection (a name filter is now caught); § Two browsers (`:29`) the Chrome-only set; § Flake ledger gains two rows: #269's fingerprint (`clickBelowBar`'s 5 s opacity wait), its cause (the page's stale observer entry, a product defect), `(open)` with the response "report the red as this row; never rerun it to green; the fix waits on the owner (#269)", and #274's fingerprint, cause and fix, "fixed".
- `CLAUDE.md:538`, `CI.md:87`, `FIREFOX.md:30`: the Chrome-only set.

### File-level change map

| File | Change | Phase |
|---|---|---|
| `apps/extension/scripts/e2e/proverless-guard.sh` | new | 1.1 |
| `apps/extension/scripts/e2e/agent.sh` | `NETWORK_CONFIG`; the inline guard replaced by the script call | 1.1 |
| `apps/extension/scripts/e2e/proverless-guard.test.ts` | new (vitest, `// @vitest-environment node`) | 1.1 |
| `.claude/skills/e2e-testing/SKILL.md` | the runner's guard text | 1.1 |
| `apps/extension/tests/e2e/fixtures/page-errors.ts` | new | 1.2 |
| `apps/extension/scripts/e2e/page-errors.test.ts` | new | 1.2 |
| `apps/extension/tests/e2e/fixtures/extension.ts` | two handlers | 1.2 |
| `apps/extension/tests/e2e/network/connect-one-window.test.ts` | its handler | 1.2 |
| `apps/extension/tests/e2e/_probe-console-capture.test.ts` | the rejection probe gains two primitive rejections | 1.2 |
| `apps/extension/tests/e2e/fixtures/helpers.ts` | `openDropdown`; `importToken`, `refreshBalances`, `setTheme` | 1.3 |
| `apps/extension/tests/e2e/navigation.test.ts` | one test: the opener waits for Home's trigger and leaves an open menu open | 1.3 |
| `apps/extension/tests/e2e/network/backup-import-stalled-network.test.ts` | skip removed | 1.4 |
| `apps/extension/tests/e2e/fixtures/browser/index.ts` | `hangingRequest` removed | 1.4 |
| `CLAUDE.md`, `CI.md`, `apps/extension/tests/e2e/FIREFOX.md`, `.claude/skills/e2e-testing/SKILL.md` | the Chrome-only set; the two ledger rows | 1.4 |
| `apps/extension/src/popup/pages/settings/index.vue`, `activity.vue` and their two `.test.ts` | newest entry; the callback driven in the unit tests; the #269 ledger row turns "fixed" | 1.5 (OA-1) |

### Trade-offs & alternatives not taken

See the decision ledger (D1-D13) and § Competing outline.

## Competing outline (Outline B: the issues' own suggestions, cheapest first)

- #249: `grep -rls -- "@requires-proverless"` over the arguments that do not start with `-`, without `|| true`.
- #269: in the test, scroll by one pixel after the Tab walk so the observer fires again, then do `clickBelowBar`.
- #274: wait for the trigger to be visible, click, and if the item is not there in 2 s, click the trigger once more.
- #275: an inline `err instanceof Error ? err : new Error(String(err))` in each handler.

Rejected (D1, D3, D4, D5); both reviewers agreed. B's #249 still reads a flag's value as a file and passes a name filter silently; its #269 hides a page bug a user meets; its #274 adds a retry over a race, and a second click on an open menu closes it; its #275 keeps three copies of the filter and its comment. Kept from B: the wait for the trigger, now inside `openDropdown`.

## Security & Adversarial Considerations

- **Threat model.** Test harness and runner only; nothing here ships, except #269's one line per page (gated). The inputs are a developer's own command line, the repo's own test files and config, and page-controlled `pageerror` payloads.
- **Command line.** The guard passes the arguments to vitest and to the parse step as an array (`"$@"`; the parse step reads them from `process.argv`, never from its source text), never through `eval` or an unquoted expansion; the listed paths go to `grep` after `--`, so a path cannot become an option. `vitest list` loads the same config the run executes next: listing is not a sandbox, and the repo's config and test files stay trusted code, as they are for the run.
- **A flag only `list` accepts.** `--json=<path>` passed by the caller would make the guard's listing write elsewhere and the guard pass; `vitest run` then rejects the flag before any test file loads, after the build. No marked file runs.
- **Page payloads.** `pageErrorOf` never reads a property of a non-`Error` payload, and the cascade filter applies to `Error` payloads only, so a primitive listener payload (CDP's) is never dropped for the disconnect text. On Firefox, BiDi turns every page error into an `Error` built from the log text, so a primitive's origin is lost there, and a page could already hide any `Error` behind that text before this change; the filter is unchanged, and #275 does not claim more.
- **Fail closed.** The guard refuses on a vitest, jq or grep error, and on watch mode, instead of passing.
- **Least privilege, crypto, supply chain.** No new dependency, token, permission or workflow. No secret is read or logged.
- **Logs.** The guard prints repo-relative test paths only; the menu diagnostics print the hash and DOM state of a test profile.

## UI impact

- Phases 1.1-1.4: **none**. Runner, fixtures, helpers, one smoke test, one spec's skip and docs; no screen changes.
- Phase 1.5 (#269), **only on OA-1 = A**: the Settings and History compact title bar. Before: after a fast scroll the bar can stay hidden while the large title is off screen, until the user scrolls back to the top. After: the bar shows whenever the large title is off screen, with the same look and fade. Recorded in [OWNER-ASKS.md](OWNER-ASKS.md) OA-1; the lane brief records no no-ask budget for it, so arc 1 ships without it.

## Assumptions

### Facts

- F1. `agent.sh:16-34` is the only reader of `@requires-proverless`; eleven network files carry it (recon).
- F2. Under `bash`, GNU grep 3.11 exits 2 on `--retry=0` and `-t`, and reads `--exclude <path>` as its own option; `|| true` hides each (planner run, recon § #249).
- F3. `vitest list --filesOnly` (vitest 4.1.10) returns the selection `run` would start from, before sharding and pre-parsing: it applies flags, `--exclude`, name filters and the config's include, ignores `--shard` and `--experimental.preParse`, lists every file for `-t` alone, forces non-watch mode, and exits 1 on an unknown flag. Its JSON gives absolute paths; its plain output is root-relative and prefixes named projects (planner probe; `cli-api` `formatFilesAsJSON`/`formatFilesAsString`).
- F10. `vitest run -w` and `vitest run --watch` stay in watch mode. `vitest run` decides watch mode by truthiness: `run()` sets `options.run = !options.watch` (vitest's `cac` chunk). On Node 24, `parseCLI` from `vitest/node` returns `true` for `-w`, `--watch`, `--watch=true`, `-w=true`, `--watch=0` and `--watch=no`, `false` for `--watch=false`, `--no-watch` and `-w=false`, an object for `--watch.enabled=<any value>` (truthy, so watch), nothing without a watch flag, and throws "Expected a single value" for `--watch --watch=false`; it does not reject an unknown flag (`vitest list` does). Puppeteer's `waitForFunction` runs in the page's main realm (`api/Frame.js:584`, both drivers) (planner probes; lessons/phase-0.md).
- F4. Every PR, nightly and canary prover-ON caller passes plain file paths; every other lane sets `NULO_E2E_PROVERLESS=1`. The prover-ON `extension-network-e2e-soak.yml` dispatch in `shard` mode passes `--shard` and no files: the old guard let it through, the new one refuses it (recon; Opus finding).
- F5. Puppeteer 25.8.0 emits a CDP page's primitive throw or rejection value as is (`cdp/utils.js:94-105`, `cdp/Page.js:711`) and always an `Error` on BiDi (`bidi/Frame.js:227-242`).
- F6. `importToken` and `refreshBalances` click the trigger through `querySelector(...)?.click()`; `DropdownRoot` toggles per click and exposes `data-dropdown-open`; a click during Home's mount does nothing, 6 of 6 times (planner probe).
- F7. `backup-import-stalled-network.test.ts` passed 2/2 on Firefox at retry 0 with its skip removed (unarmed prover-ON build, planner run).
- F8. Both hero observers read the first queued entry; 4 of 12 diagnostic iterations stuck the bar hidden after a two-entry callback (planner probe).
- F9. Every e2e lane triggers on `apps/extension/**`, so the PR needs no label (recon).

### Inferences

- I1. #274's one failure on Firefox came from a click while Home was mounting, from an unfocused window, or from a menu closed by a re-render; the old helper cannot tell which. The new opener covers the first two and its diagnostics name the third if it recurs.
- I2. The JSON shape of `vitest list --filesOnly` holds across vitest 4.1.x; the guard's unit test reds on a change.

### Asks

- A1 (OA-1). Fix the compact title bar's stale observer entry. Working assumption: not approved; arc 1 ships without Phase 1.5.

## Phases

Every gate runs from the repo root unless it says `apps/extension`. Retry 0 everywhere: smoke `--retry=0`, network `NULO_E2E_RETRY=0`. Network runs go through `agent.sh` (ports claimed in `~/.agents/ports.md`), one at a time in this worktree; the stall watchdog stays as it is. Smoke needs the armed build: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<browser>`, run with `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1`. A red/green proof takes the old code from `af4afcc`, never from `HEAD`.

### Phase 1.1: the proverless guard reads vitest's selection (#249)

1. Create `proverless-guard.sh` as § Architecture says. Keep the FATAL wording and exit code 2.
2. In `agent.sh`, add `NETWORK_CONFIG`, replace lines 16-34 with `bash scripts/e2e/proverless-guard.sh "$NETWORK_CONFIG" "$@"`, and use `"$NETWORK_CONFIG"` on the run line. Keep the call before the port claim.
3. Add `proverless-guard.test.ts` beside it. Follow `stall-watchdog.test.ts:20-30`: drop `VITEST*`, `NODE_OPTIONS` and `NULO_E2E_PROVERLESS` from the child's environment, set stdin to `ignore`, and give each test a timeout sized for a cold runner. Run the script with the network config:
   - `tests/e2e/network/import-handshake-note.test.ts --retry=0` exits 2 and the FATAL text names that file (the issue's case);
   - `import-handshake` (a name filter) exits 2 and names both handshake files;
   - `tests/e2e/network/tokens.test.ts --retry=0 --exclude tests/e2e/network/import-handshake-note.test.ts` exits 0 (the success control: flags pass, and an `--exclude` value is not read as a file);
   - the first case with `NULO_E2E_PROVERLESS=1` exits 0;
   - `--no-such-flag` exits 2 with "could not list";
   - `no-such-file-anywhere` exits 0 (an empty selection reaches no grep);
   - `--watch tests/e2e/network/tokens.test.ts`, `-w tests/e2e/network/tokens.test.ts` and `--watch.enabled=true --changed=HEAD` each exit 2 with the watch FATAL; `--watch=false tests/e2e/network/tokens.test.ts` exits 0 (an explicit non-watch run passes); `--watch --watch=false tests/e2e/network/tokens.test.ts` exits 2 with "could not read" (the parse step's failure branch);
   - with a `grep` stub on `PATH` that exits 2, and then a `jq` stub that exits 5 (the `runLive` stub shape, `scripts/ci-cd/behavior-gating.test.ts:277-300`), `tests/e2e/network/tokens.test.ts` exits 2 with the scan or listing FATAL (a tool error never passes, as #249 asks).
4. Rewrite the runner's guard text in `.claude/skills/e2e-testing/SKILL.md:99-101`.

**Validation gate.**
- Commands: `bun run lint`; `bun run typecheck:all`; `bun run --cwd apps/extension test -- scripts/e2e/proverless-guard.test.ts`; `bun run test`; `bun run test:ci-gating`; `shellcheck apps/extension/scripts/e2e/agent.sh apps/extension/scripts/e2e/proverless-guard.sh`; `bun run e2e:agent tests/e2e/network/import-handshake-note.test.ts --retry=0`.
- Pass: each exits 0, except the last, which exits 2 with the FATAL lines and no `[e2e:agent] resolving ports` line. With the guard body replaced by `af4afcc`'s inline block, the first two test cases fail.
- Layers: lint, typecheck, unit, ci-gating, shellcheck, the runner itself.

### Phase 1.2: one normaliser for page errors (#275)

1. Add `fixtures/page-errors.ts` with `pageErrorOf`.
2. Use it in the three handlers. Delete the duplicated comment in `extension.ts`.
3. Add `scripts/e2e/page-errors.test.ts`:
   - an `Error` passes through as the same object (success control);
   - `undefined`, `null`, a string and a number each become an `Error` whose message is `String(payload)`;
   - an `Error` whose message includes "Client disconnected" returns `undefined`;
   - a string primitive carrying "Client disconnected" is kept (the filter never widens).
4. Extend the probe "uncaught throw and unhandled rejection each reach pageerror": schedule `Promise.reject(nonce)` and `Promise.reject(undefined)` from a timer, without returning the promises. Assert `ctx.pageErrors` grew by exactly the four probes, every entry is an `Error`, and one message carries the primitive nonce.

**Validation gate.**
- Commands: lint; typecheck; `bun run --cwd apps/extension test -- scripts/e2e/page-errors.test.ts`; `bun run test`; on each browser, in `apps/extension`: `NULO_E2E_CONSOLE_PROBE=1 bun run test:e2e -- tests/e2e/_probe-console-capture.test.ts -t "reach pageerror" --retry=0`.
- Pass: green on both browsers. With `af4afcc`'s handlers, the Chrome probe run fails (the listener throws on `undefined`). The full smoke and network runs are in Phase 1.6.
- Layers: lint, typecheck, unit, smoke probe on both browsers.

### Phase 1.3: the tokens menu opens through the dropdown's state (#274)

1. Add `openDropdown` to `helpers.ts`, replacing `setTheme`'s open block.
2. Rewrite `setTheme`, `importToken` and `refreshBalances` on it. Click the items with `clickByTestId(page, item, 2_000)`. Wrap each wait in `withTimeoutMessage` with the diagnostic function.
3. Add one smoke test to `navigation.test.ts`:
   - on Settings, install a main-realm probe (the realm `waitForFunction` runs in, F10): wrap `Document.prototype.querySelector` and `querySelectorAll` so the first call whose selector names `tokens-menu-trigger` records whether it found nothing and only then schedules the navigation to Home (`setTimeout(() => { location.hash = "/popup/general" })`). Navigation is released by the opener's own first attempt, never by a clock. Await `openDropdown(page, "tokens-menu-trigger")`, then assert in order: the probe saw that first attempt find no trigger (the precondition, observed), the opener resolved after the navigation, and `tokens-menu-import` is visible. Restore both methods in a `finally`;
   - call the opener again on the open menu; the item is still visible (the menu was never toggled closed).
   - Red on base: with `af4afcc`'s inline open (`querySelector(...)?.click()`, then the 2 s item wait) in place of the opener's body, the bare query finds nothing, the probe releases the navigation, the click lands on nothing and the item wait fails, every time. That red is part of the gate.
4. Keep every existing wait value.

**Validation gate.**
- Commands: lint; typecheck; in `apps/extension`, on each browser, `bun run test:e2e -- tests/e2e/navigation.test.ts tests/e2e/appearance.test.ts --retry=0`; on each browser `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/tokens.test.ts tests/e2e/network/import-handshake-note-matrix.test.ts tests/e2e/network/in-flight-send-guard.test.ts` (Firefox: `NULO_E2E_BROWSER=firefox` added).
- Pass: every file green at retry 0 on both browsers. The new smoke test fails with `af4afcc`'s inline open (Phase 1.3 step 3, red on base).
- Layers: lint, typecheck, smoke and network e2e on both browsers.

### Phase 1.4: the stalled-network spec runs on Firefox (#272), and the ledger rows

1. Unwrap the `describe.skipIf`, drop the unused imports, remove `hangingRequest`.
2. Edit the four prose sites to two Chrome-only files.
3. Add the two flake-ledger rows (§ Docs the arc changes).

**Validation gate.**
- Commands: lint; typecheck; `bun run test:ci-gating`; `bun run check:plans`; on each browser `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/backup-import-stalled-network.test.ts`, three times on Firefox; `git grep -n hangingRequest -- ':!implementations-plan'`.
- Pass: green; Firefox 3 of 3; the `git grep` prints nothing.
- Layers: lint, typecheck, ci-gating, network e2e on both browsers.

### Phase 1.5: the hero observer reads the newest entry (#269; only on OA-1 = A)

1. Change both callbacks as § Architecture says.
2. In both page unit tests, let the stub keep its callback; add one test each: `[true, false]` shows the bar (its class list carries the visible class), and `[false, true]` hides it (control).
3. Turn #269's ledger row to "fixed".

**Validation gate.**
- Commands: `bun run audit:vue`; the planner's diagnostic loop (source in lessons/phase-0.md; untracked, deleted after) on the armed Chrome build, three launches; in `apps/extension`, `bun run test:e2e -- tests/e2e/navigation.test.ts --retry=0` on each browser.
- Pass: green. The two new unit tests fail on `af4afcc`'s pages. The diagnostic loop: 0 of 36 iterations stuck (4 of 12 at base).
- Layers: typecheck, unit, lint, build, smoke on both browsers.

### Phase 1.6: arc gate (fixtures changed: the whole smoke suite and the handlers' network files)

1. Merge `origin/dev` into the branch; read what changed in the touched files, `implementations-plan/index.md` and `lessons.md`. Never a union merge.
2. Run the gate.

**Validation gate.**
- Commands: `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run test:all`; `bun run test:ci-gating`; `bun run check:plans`; `bun run lint:actions`; in `apps/extension`, `bun run test:e2e -- --retry=0` on Chrome and on Firefox (armed builds); on each browser `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/connect-one-window.test.ts tests/e2e/network/account-balance-orphans.test.ts tests/e2e/network/imported-account-execution.test.ts tests/e2e/network/backup-import-stalled-network.test.ts tests/e2e/network/tokens.test.ts`.
- Pass: all green at retry 0. A red is read honestly: one rerun of that file for a fingerprint in the e2e skill's flake ledger whose row sanctions it, a fix for breakage. Until Phase 1.5 lands, a red of `navigation.test.ts`'s title-bar case on `clickBelowBar`'s opacity wait is #269's product defect, present at `af4afcc` in a case this arc does not change: report it with its log as #269 and never rerun it to green. The gate then stays red: reporting does not pass it, and § Delivery still waits for a green Phase 1.6. The orchestrator decides (OA-1 = A removes the cause).
- Layers: every layer the arc touches.

## Delivery

One PR against `dev`, no stack (D-orch-1). The close-out lands as the PR's final commits.

| Branch | Phases | Base | `/code-review` | PR title (≤ 93 characters) | Closes |
|---|---|---|---|---|---|
| `worktree-e2e-followups` (adopted; carries the plan commit) | 1.1-1.4, 1.6 (1.5 on OA-1 = A) | `dev` | off | `test(e2e): vitest-listed proverless guard, page-error normaliser, menu waits, firefox stall` (91) | #249, #275, #274, #272 (and #269 with Phase 1.5) |

- Open the PR only after Phase 1.6 is green and the Codex loop has converged: `gh pr create --base dev`. The body says what changed and why, the validation runs with outcomes, and `Closes #n` per issue. With Phase 1.5 in, the body quotes the owner's OA-1 record and attaches a screenshot of the bar shown after a fast scroll.
- No label: every e2e lane triggers on `apps/extension/**`.
- If OA-1 = A arrives after the PR opens and before it merges, add Phase 1.5 to the open PR, rerun its gate and the smoke suite on both browsers, resume the Codex session on the new diff (Post-implementation step 2), and add `Closes #269`.
- Then `gh pr checks --watch`. Never merge; never `--admin`; never force-push.

## Post-implementation

The implementing session runs these steps from this file. `code_review` is `off`, so no `/code-review` step exists. Single arc: the loop runs once, over the whole diff.

1. **Codex audit**, after Phase 1.6 is green (which merged `origin/dev` first).
   - Write a prompt file under `~/.cache/nulo-backlog/e2e-followups/`, then run `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol` on the default `~/.codex` login.
   - On a quota or 401 error, retry once with `CODEX_ACCOUNT=alejo-icloud`. If that fails too, log the failed consult in `lessons/phase-1.md` and continue on your own judgment within scope.
   - The prompt carries `git diff origin/dev...HEAD` (fetched just before, after Phase 1.6's merge; `af4afcc` stays the base for red-on-base proofs), this plan with its decision ledger, and an adversarial ask: can the guard pass a run that executes a marked file, or refuse one whose selection holds none; can a page payload make a listener throw or hide a primitive; can the menu helper click twice; is any assertion weaker, any filter wider or any wait longer than at base.
   - It ends with the two rules below, verbatim.
2. **Fix loop.** Verify each finding against the code first. Apply the accepted fixes and commit them. Rerun the gate of every phase a fix touches. Any code change or `dev` merge that touches a changed file after the loop converged reruns those gates and resumes the same session. Log the round in `lessons/phase-1.md`: the consult, the verdict, what was accepted, and what was rejected with reasons. Resume the same session with `resume-codex.sh <session-id> <followup-file> <codex-dir> high` and the fix diff. Stop when a round has no new material finding. **Hard stop at three rounds:** if the third round still finds material issues, stop and report it to the orchestrator.
3. **Delivery**, per § Delivery: the first time the PR opens. Before the push: `bun run test` and `bun run lint:actions`.
4. **Close-out**, as the PR's final commits:
   1. If `dev` moved, merge `origin/dev` again; read what changed in `implementations-plan/index.md` and `lessons.md`; another lane may have landed. Never a union merge. Rerun `bun run lint`, `bun run test` and `bun run check:plans`.
   2. Write `## Outcome` directly after the front matter: Date, Status, Shipped (the PR number), Dropped with a disposition line each, Open items, and "Seeds retired: the /goal and /loop seeds below are no longer live".
   3. File every open item in its home (table below), deduping first with `gh issue list --state all --search "<words>"`. An issue body has five sections: What happens, Where, Impact, Possible fix, Record. Without Phase 1.5, comment on #269 with the cause, the one-line fix, its tests and OA-1, and leave it open.
   4. Route what was learned (CLAUDE.md § Skills own their domains): flake causes and harness techniques to the `e2e-testing` skill (the ledger rows already landed in Phase 1.4); cross-task gotchas to `implementations-plan/lessons.md` (8 KiB budget, deduplicate, retire what an entry supersedes, date tool versions). Candidates: an `IntersectionObserver` callback batches entries, read the newest; `vitest list --filesOnly --json` gives the selection before sharding.
   5. Delete `STATUS.md` and the "Live progress" link at the top of this file.
   6. In its own commit, `git mv implementations-plan/e2e-followups implementations-plan/archive/e2e-followups`. Repair relative links the extra level breaks. Move the index line to `archive/index.md`.
   7. Push, `gh pr checks --watch`, report and stop. Merging is the orchestrator's call.
5. **Teardown after the merge.**
   - When `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/e2e-followups/plan.md` succeeds, run `agent-worktree done e2e-followups --merged`. This step needs no approval.
   - If it refuses, relay its output and stop; never force.
   - A `/loop` session checks this on every firing. A `/goal` session arms one background wait after its wrap-up report: `until git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/e2e-followups/plan.md; do sleep 300; done`.

**Where open work lives** (CLAUDE.md § Where open work lives):

| Situation | Home |
|---|---|
| Work inside the implementation you are on | this `plan.md` and the PR |
| Actionable work that outlives the plan | a GitHub issue, with a domain label and a `Record` link to the archived plan |
| Needs a product call, or waits on something outside the repo | an issue labelled `owner-decision` or `blocked:external` |
| A suspected exploitable weakness | a private draft security advisory; this plan records only "tracked privately: GHSA-…" |
| Rejected, superseded or already done | a disposition line in the Outcome; no open item anywhere |
| Knowledge that prevents a repeat | `implementations-plan/lessons.md` (8 KiB budget) |
| A legal or store blank with a release deadline | `BEFORE-LAUNCH.md` |
| Accepted code work that blocks launch | the `v1.0.0` milestone, pointed at once from `BEFORE-LAUNCH.md` |

**No-over-engineering rule** (verbatim in every post-implementation Codex prompt): *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."*

**Comment-quality rule** (verbatim in every post-implementation Codex prompt): *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*

## Owner dependencies

- OA-1 gates Phase 1.5 (#269).
- None on sibling lanes: no file here is in `apps/playground` or `tests/e2e/network/tx-*.test.ts`. The `e2e-harness-gaps-esm` branch adds `"type": "module"` and keeps the network config's name; the guard takes the config from `agent.sh`'s one `NETWORK_CONFIG`.

## Decision ledger

Each entry: the choice, the alternatives rejected, the reason, and the panel's view where it matters.

- **D1 (#249).** The guard judges `vitest list --filesOnly --json` with the run's arguments. Rejected: grepping non-flag arguments (reads `--exclude`'s value as a file and misses name filters); parsing vitest's flags in bash (a second copy of vitest's grammar); a check inside the vitest run (fires after the build and the sandbox boot, the cost the guard exists to avoid). Panel: both agree on `vitest list`.
- **D2 (#249).** A bash script on vitest's CLI, judging the selection before sharding. Rejected: Codex's TypeScript CLI on vitest's Node API applying the configured sequencer's shard (round 1, finding 2). Reason: no CI lane runs an unarmed shard; the one path that does (a prover-ON soak dispatch in `shard` mode) is better refused, since some shard runs marked files; a refusal is loud and names the remedy; and running vitest's Node API under the Bun runner adds the interop risk CLAUDE.md records, for that one path. The quality bar now states the pre-shard rule instead of claiming exactness. Codex's other half (absolute paths, not the plain listing) is adopted.
- **D3 (#269).** The cause is in the page; the test is right and stays. Rejected: any test-side nudge or settle (it would hide a bug a user meets). The page change goes to the owner (OA-1), per the lane brief. What ships now: the ledger row naming the cause, which sanctions no rerun (D13), and the issue comment. A red of that case keeps Phase 1.6 red until the orchestrator decides; reporting it never passes the gate. Panel: both agree.
- **D4 (#274).** One `openDropdown`: `prepareClick`, one page-side read-and-click on one trigger, a wait on `data-dropdown-open`, stage diagnostics; items clicked with the old 2 s budget; a smoke regression on a delayed mount and an already-open menu. Rejected: a second click on timeout (a retry over a race; it closes an open menu); a longer item wait; a read of the first trigger and a click of the last (Codex round 1, finding 5).
- **D5 (#275).** One `pageErrorOf` in a fixture module, unit-tested; the cascade filter applies to `Error` payloads only, as today. Rejected: filtering after `String()` (v1; it would hide a primitive rejection that mentions the text, both reviewers); the exact matcher `isClientDisconnectRejection` (Codex round 1, finding 4): BiDi builds its `Error` from the log entry's text, which this lane has not measured against the exact message, so a stricter match could start recording the benign cascade on Firefox; #275 is about the payload's type, not the filter's text.
- **D6 (#272).** Drop the entry; the planner's Firefox run passed. The issue's other sites (`behavior-gating.test.ts`, workflows) need no change.
- **D7 (validation).** The network files run proverless, as CI's pool runs them. The full smoke suite runs once, at the arc gate, on both browsers (CLAUDE.md § Quality gates: fixtures touched).
- **D8 (scope).** `refreshBalances` and `setTheme` join #274's fix (same cause, same file); the other bare clicks in the tree do not.
- **D9 (#249 tests).** The cases of Phase 1.1, in vitest beside the script (the `classify-exit.test.ts` placement, the `stall-watchdog.test.ts` child hygiene). Rejected: the `runLive` shape under `bun test scripts/ci-cd/` (its tests pin workflows, not the runner); Codex's wider list (`--dir`, `--root`, projects, `--changed`, typecheck, unreadable files, whitespace): each is vitest's own selection, which the design delegates to, and the JSON paths make `--root` and projects moot.
- **D10 (#275 probe).** The probe asserts the capture delta and types on the popup listener. Rejected: probing the onboarding listener too (Codex round 1, finding 7): both handlers are the same one-line call to the unit-tested helper.
- **D11 (#249).** `agent.sh` names the network config once and passes it to the guard (Opus round 1 corrected the plan's belief that a sibling branch renames it; one name is still the right shape for two readers).
- **D12 (#249).** The guard refuses an unarmed watch run by asking vitest's own `parseCLI` (public `vitest/node` export, on Node, the run's runtime) whether the parsed `watch` is truthy, the run's own rule (Codex round 2 finding 1, round 3 finding 1, round 4 finding 1). Rejected: v4's `=== true` (a dotted `--watch.enabled=true` parses to an object and passed it: round 4 finding 1, reproduced); v3's `--watch=false` placed before the caller's arguments in the listing (cac's alias reconciliation lets `-w` overwrite it, so `-w` passed, and an explicit `--watch=false` was refused: round 3 finding 1, reproduced); matching `--watch`/`-w` in bash (a second copy of vitest's grammar); appending `--watch=false` to the run line (refuses only after the build).
- **D13 (#269).** The `(open)` ledger row records the cause and sanctions no rerun (Codex final pass, finding 2, over the Opus round-1 suggestion of a sanctioned rerun): a known product defect is breakage, not a flake (CLAUDE.md § Quality gates), so a red is reported as #269 and the orchestrator decides.
- **D-orch-2 (OA-1 = A).** The orchestrator put Phase 1.5 into arc 1 as a no-ask, on the #210 precedent: the Settings and History pages reading the newest visibility report restores the approved design ("the compact bar shows once the hero leaves") with the same bar, fade and scroll positions; nothing new appears and no words change. Each page gets its one-line fix and its unit test. With the fix in, a retry-0 red of the smoke navigation title-bar case (Phase 1.6) is a real failure to diagnose, never #269 and never rerun to green.
- **D-orch-3 (Codex account).** The shell carries `CODEX_ACCOUNT=best` and keeps it (both roster accounts have headroom); each consult records the account it ran on.
- **D14 (#249, implementation).** The watch read is a file, `scripts/e2e/watch-mode.ts`, run with `bun run` like the runner's other helpers, not the plan's inline `node --input-type=module -e … -- "$@"`. Reason: under a `bun --bun` parent (the unit tests; any Bun-run caller) `node` is Bun's shim, which drops `--` and `-w` from `-e`'s argv, so the inline step answered `run` for `-w` and `--watch`: a fail-open (the guard's own unit test caught it). As a file, `parseCLI` gives the same answer on Bun, the shim and Node 24 for every F10 case (implementer probe, lessons/phase-1.md). The remedy line (`NULO_E2E_PROVERLESS=1`) follows the two selection refusals (marked file, watch run) only; a tool error prints its FATAL alone, since arming the build is no answer to a broken tool.
- **D15 (#275, Firefox).** Phase 1.2's Firefox probe gate is recorded red at base and at head, and arc 1 does not build the capture. Cause, verified: Firefox's WebDriver BiDi sends no `log.entryAdded` for an extension page (`isBrowsingContextCompatible` in `BrowsingContextUtils.sys.mjs` skips add-on principals until Bug 1755014; Firefox 153.0.4), so Puppeteer's `pageerror` and `console` never fire for a `moz-extension://` page and every `pageErrors`/`consoleErrors` assertion is vacuous on Firefox. Panel: Codex (session `01a12864-e0eb-78d3-bbe6-2c05b7de86b2`, account alejo-icloud) and Opus (Plan agent) both chose to keep #275's scope, open the capture as its own issue (#281: a driver capability or an armed in-build recorder, neither measured), add the FIREFOX.md row, qualify the fixture and skill text that called `pageerror` reliable, and tighten the probe to read only its own delta, with exact `nonce` and `"undefined"` messages; both rejected a `data:` control page (it proves Firefox, not #275) and any `skipIf`. A capture built here would be a new channel with its own attribution and teardown questions and would surface errors the Firefox lane has never seen: a separate change. #275 is proven on Chrome (red at base, green at head).
- **D16 (#275, probe).** The probe schedules its primitive rejections from page script (a string `evaluate`), not from a function `evaluate` defines: on Chrome 152, an exception raised by code Puppeteer's function form defined reaches `Runtime.exceptionThrown` without `exceptionDetails.exception`, so Puppeteer builds an `Error` from the text and the primitive path is never taken (raw CDP dump; a page script's string throw arrives as the string). With the function form the probe passed at base, proving nothing.

## Audit verdicts

### Round 1 (plan v1): dual audit

**Codex** (gpt-6.1-sol, high, session `01a12833-7519-7ef0-83d8-054ff4fd3a18`): `reject (with blocking findings: guard selection/path mismatch, broadened error suppression, unproved dropdown fix)`.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | High | The plain `list` output is root-relative and prefixes named projects; use absolute paths, keep diagnostics apart from data | **Accepted in part:** `--json=<temp file>`, absolute paths, stderr shown. The Node-API CLI rejected (D2). |
| 2 | High | The quality bar promises exactness; `--shard` and `preParse` narrow later | **Accepted in part:** the bar and F3 state the pre-shard rule; the soak path is named. Applying the sequencer rejected (D2). `experimental.preParse` is not configured in this repo. |
| 3 | Medium | Shell failure paths unspecified (set -e, grep on no operands, stdout pollution) | **Accepted:** explicit branches, empty-selection exit, two new tests. The wider test list rejected (D9). |
| 4 | High | The normaliser widens the disconnect filter to primitives | **Accepted:** `Error`-only filter, kept-string control. The exact matcher rejected (D5). |
| 5 | High | `setTheme` reads the first trigger and clicks the last; read-then-click race | **Accepted:** one page-side read-and-click on one trigger. |
| 6 | High | #274's cause unproved; v1's item click widens 2 s to 10 s | **Accepted:** the planner's probe reproduced the delayed-mount no-op 6 of 6; a deterministic smoke regression; the 2 s item budget kept; state diagnostics at the boundary. |
| 7 | Medium | "Never throws" overstated; probe underproves | **Accepted in part:** the contract states the verified payload boundary; the probe asserts the delta. Onboarding probe rejected (D10). |
| 8 | Medium | Drop I3 (unsupported Firefox explanation); keep OA-1 and "nothing ships now" | **Accepted.** |
| 9 | Medium | Delivery audits before merging `dev`; no gate rerun after fixes; `lint:actions`; watch checks; don't promote "list equals run" | **Accepted:** Phase 1.6 merges `dev` first; fixes rerun their gates; `lint:actions` before push; `gh pr checks --watch`; the lesson reads "before sharding". |

**Opus** (Plan agent, opus): `conditional approve (with conditions: findings 1-5 are fixed in the plan before implementation starts)`.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | Medium | Guard mechanics: empty selection, `set -e` with `$(grep)` exit 1, failed listing without FATAL | **Accepted** (same fix as Codex 3). Temp-file-free parsing not taken: the JSON file is what makes paths absolute (Codex 1). |
| 2 | Medium | Unit-test hygiene: scrub env, stdin ignore, timeout; say why vitest, not `runLive` | **Accepted** (D9). |
| 3 | Medium | `SKILL.md:99-101` describes the old guard | **Accepted:** in the change map. |
| 4 | Medium | Item clicks via `clickByTestId` default to 10 s; Firefox focus not in I1; diagnostics as functions | **Accepted:** `2_000` passed; `prepareClick` in the opener; I1 widened; diagnostic function reads hash, visibility and focus. |
| 5 | Medium | #269: no ledger row sanctions its rerun; flake causes route to the skill; "8 of 8" proves nothing; keep the diagnostic's source | **Accepted:** two ledger rows in Phase 1.4; close-out routes to the skill; Phase 1.5 proves by red unit tests and the 36-iteration loop; the source is in lessons/phase-0.md. |
| 6 | Low | Filter widened to primitives | **Accepted** (Codex 4). |
| 7 | Low | `git grep hangingRequest` matches the plan files | **Accepted:** pathspec excludes `implementations-plan`. |
| 8 | Low | F4 misses the soak `shard` path; the quality bar's "never refused" is false for `--shard`/`-t`; the ESM branch does not rename the config | **Accepted:** F4, the bar and Owner dependencies corrected. |
| 9 | Low | Fix rounds never rerun gates; OA-1 answered after the PR opens | **Accepted:** both in Post-implementation and Delivery. |

The planner also removed a stray file the Opus leg's probe wrote outside the worktree (`x_stderr_never` under the system temp directory).

### Round 2: final fresh Codex pass on plan v2

**Codex** (gpt-6.1-sol, high, new session `01a12843-d06d-76c2-87b7-cd18dfdce700`): `reject (with blocking findings: watch-mode guard bypass; sanctioned rerun over a known product race)`.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | High | `vitest run --watch` stays in watch mode; `list` forces non-watch, so the guard can pass a watch run that later runs a changed marked file | **Accepted:** verified (`cac` `run()` keeps watch; probe: `run --watch` waited until killed). v3's fix (`--watch=false` before the caller's arguments) rested on an invalid probe (zsh passed the flags as one word) and was replaced in round 3 (D12). |
| 2 | High | The ledger row sanctions a rerun of a known product defect | **Accepted:** the row sanctions no rerun; Phase 1.6 reports such a red as #269 (D13). |
| 3 | Medium | F3 overstates equivalence (`--experimental.preParse`); jq and grep failure branches untested | **Accepted in part:** F3, the quality bar and § What the guard judges name pre-parsing as a pre-run narrowing the guard does not apply (a conservative refusal); grep and jq failure cases added with PATH stubs (#249 asks for a loud failure on a grep error). A preParse test rejected: the rule is stated, and it errs on the refusing side. |
| 4 | Medium | The delayed-mount test has no barrier proving the first attempt ran while the trigger was absent | **Accepted:** a page-side timer schedules the navigation before the opener is called; it can weaken the proof on a loaded host but never cause a false red. |
| 5 | Medium | Changes after the converged audit are not re-audited; the diff "minus the merge" is vague; OA-1 cutoffs disagree | **Accepted:** `git diff origin/dev...HEAD` after the merge; later changes rerun gates and resume the session; OWNER-ASKS.md now says "before arc 1 merges". |
| 6 | Low | Primitive preservation holds for CDP payloads only; BiDi wraps everything | **Accepted:** § Security qualified. |

### Round 3: resumed final pass on plan v3

**Codex** (resumed session `01a12843-d06d-76c2-87b7-cd18dfdce700`): `reject (with blocking findings: short watch alias still bypasses the guard)`.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | High | `-w` overwrites the `--watch=false` sentinel (cac alias reconciliation), so `-w` passes; a caller's own `--watch=false` is refused; the probe record is wrong | **Accepted, reproduced** under bash: `list --watch=false -w <file>` exits 0 and lists, `--watch=false --watch=false` exits 1. The sentinel is gone; the guard asks `parseCLI` for effective watch mode before listing (D12, F10); tests for `--watch`, `-w`, `--watch=false` (passes) and a conflicting pair (parse failure). The lessons record is corrected. |
| 2 | Medium | A 300 ms page timer is a deadline, not an observed barrier; Firefox's awaited `prepareClick` makes the late opener likely | **Accepted:** a main-realm probe on the DOM query methods releases the navigation on the opener's first attempt and records that it found no trigger; the test asserts that ordering; red on base required; the already-open control kept. |
| 3 | Medium | D3 still says "with its sanctioned rerun", against D13 | **Accepted:** D3 rewritten; Phase 1.6 states that a #269 red keeps the gate red and that reporting never passes it. |

### Round 4: resumed final pass on plan v4

**Codex** (resumed session `01a12843-d06d-76c2-87b7-cd18dfdce700`): `reject (with blocking findings: strict-boolean watch check still permits watch mode)`.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | High | `=== true` misses `--watch.enabled=true`, which parses to an object the run treats as truthy (`run()`: `options.run = !options.watch`), so `--watch.enabled=true --changed=HEAD` would pass | **Accepted, reproduced:** `--watch.enabled=true` and `=false` both parse to objects; `--watch=0` and `--watch=no` parse to `true`. The check is now `Boolean(options.watch)`, the run's rule; a `--watch.enabled=true --changed=HEAD` refusal case added; F10 and D12 updated. |

### Round 5: resumed final pass on plan v5

**Codex** (resumed session `01a12843-d06d-76c2-87b7-cd18dfdce700`): `approve`. No new or unresolved material finding, including the round-4 questions it was asked to finish (Node for the parse step, the #274 DOM-method barrier on both drivers).

## Seeds

Draft until the orchestrator approves; no ELI5 is produced (orchestrator-owned).

**Recommended: `/goal`**

```
/goal Every phase of implementations-plan/e2e-followups/plan.md whose gate is open (1.1-1.4 and 1.6; 1.5 only after OA-1 is answered A) is marked ✓ in plan.md, each ✓ backed by its validation gate reported passing in the transcript; for each phase the agent printed LESSONS_FILE=implementations-plan/e2e-followups/lessons/phase-1.md; /code-review was NOT run (code_review is off); the Codex fix loop converged over git diff origin/dev...HEAD, quoted from a resumed Codex pass reporting no new material finding; the single PR against dev exists, opened only after the loop converged (gh pr view in the transcript), and its final commits close the plan (git show --stat of the archive-move commit); bun run test and bun run lint both report exit 0 in the transcript.
```

**Alternative: `/loop`**

```
/loop 15m Drive implementations-plan/e2e-followups forward. Never idle. Each firing: 1) Reality check: read plan.md, STATUS.md and lessons/; if git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/e2e-followups/plan.md succeeds, run agent-worktree done e2e-followups --merged, report, clear this loop and stop; if the PR is open with the close-out pushed, babysit CI only. 2) Pick the next open phase (1.5 only after OA-1 = A). 3) After each edit run bun run lint and the touched tests; commit signed. 4) Phase green means its gate in plan.md passes: paste it, mark ✓, write lessons, print LESSONS_FILE=…. 5) Network e2e only through agent.sh, one run in this worktree at a time, retry 0; never raise a timeout or the stall watchdog. 6) After Phase 1.6: the Codex loop per § Post-implementation (hard stop at three rounds; rerun the gates a fix touches), then Delivery and the close-out. 7) Stuck or facing a design fork: consult Codex (gpt-6.1-sol, high), log it, decide; anything a person would notice goes to OWNER-ASKS.md, never decided here. Hard limits: never merge, never push to main, never --admin, never force-push.
```

---
plan: test-infra-1
tier: mid
status: planned; final Codex pass approve; arc 1 running under auto-continue
issues: "#550 (arc 1 Closes), #561 (arc 3 Closes), #536 (arc 3 Closes), #540 (arc 4 Closes)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 explorers (sonnet); Codex review (gpt-6.1-sol high) with resume; one Opus Plan leg; a fresh final Codex pass
base: origin/dev at 0fe841be
trunk: dev
post_implementation_hardening: not scheduled
---

# test-infra-1: one walker, one tokenizer, one window harness, one wait per layer, shared builders

Four test-infrastructure refactors the owner picked on decision page 37 (option A each). Test code and test helpers only; no production file changes and nothing a user sees. Arc 1 and arc 2 take every site no running lane edits; arcs 3 and 4 take the rest once the colliding lanes merge. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none).

**Issue claims that did not hold** (at 0fe841be): every line number has moved. #536: 22 of its 25 `deferred` copies went in #595; `tests/e2e/fixtures/helpers.ts` is a barrel, its loops now live in `session.ts`, `profiles.ts` and `tokens.ts`; the token-balance comment (`service.test.ts:1084-1086`) calls the un-awaited dispatch the property under test, not a stand-in; the passkey observer covers only the Creating phase. #550: the capabilities header says the suite grades a planned extraction, not that one is pending (the extraction landed); `execute/index.test.ts:1-23,602-606` is stale too. #540: `dispatcher.test.ts` has 44 constructions over about 11 builders, not four; the fake's `clearProfile` also keeps the cursors and outbox the real one deletes, its `clearChain` matches values where the real one matches key prefixes, and its `commitAcceptance` is two writes, not one batch. #561: four more walkers (`icon-names`, `useConfirm`, `a11y-css`, `identifier-sites`) and two more hand call readers (`service.fence-entry`, `amount.callers`).

## Outcome & Quality Bar

- **For whom:** the next maintainer who changes a walk rule, the window shell, an event handler or an e2e wait, and the reviewer reading that diff.
- **Excellent:** (1) a walk rule (root, extension, skip) changes in one module, and a guard whose root yields nothing fails instead of passing; (2) no test asserts after a counted number of turns where a cause can be awaited, and each "has not happened yet" assertion awaits the cause first; (3) every e2e deadline loop goes through one helper whose timeout error names the label, the budget and the last value seen; (4) every migration keeps each guard's file list, each suite's test count minus the deletions this plan lists, and every assertion's strength.
- **Good enough:** sites outside the issues' lists (about 70 local `flush` helpers, the six persisting storage maps, the hold-for-a-window assertions) stay as they are.

## Assumptions

**Facts** (verified at 0fe841be; recon has the line evidence):
- F1 `source-scan.ts` is test support (8 importers; `identifier-sites.ts:475` also runs as a script, with the default walk) and already says it is "one reader of the wallet's sources".
- F2 `typescript ^6.0.3` and `@vue/compiler-sfc` are devDependencies of `apps/extension`; three guards already parse with `ts.createSourceFile`.
- F3 `bun run test` collects `src/**/*.test.ts`, `scripts/**/*.test.ts` and six packages' tests (`apps/extension/vitest.config.ts:37-49`), not `tests/helpers/**`; `tsconfig.json:22` includes `src/**` only, so a `tests/helpers` file is type-checked only through an importer.
- F4 `scripts/e2e/*.test.ts` unit-tests pure e2e fixtures (`chaos-seed.test.ts` and others) inside `bun run test`.
- F5 `vi.mock` is hoisted per file; an async factory may `await import()` a harness module.
- F6 The complexity manifest accepts `stripNoise` (41, `log-payload-ban.test.ts`) and the fake's `clearChain` (30, `service.scenarios.test.ts`); deleting each removes its record (the baseline shrinks).
- F7 No guarded call appears in a `.vue` template today (planner's scan of every SFC).
- F8 Running lanes' files are in recon § Running lanes; arcs 1 and 2 touch none of them.
- F9 An AST masker with D4's rules equals `stripNoise` on 997 of the 1000 files `log-payload-ban` walks, and all 59 of its tests (58 fixtures and the full scan) pass with it (scratch prototype, [lessons/phase-0.md](lessons/phase-0.md)). The three that differ are hand-lexer misreads: two shebangs, and `pages/about.vue`, whose one-line `<script setup>` leaves the per-line regex "inside a script" over the template. Codex found two more misreads the parser gets right: `/[))]/` after `if (ok)` kept as code, and a division after `x.in` blanked.

**Inferences** (unverified; audits, attack these):
- I1 No `log-payload-ban` fixture depends on a hand-lexer misread to pass. F9's run is the evidence; the Phase 2 comparison is the check.
- I2 In the token-balance tests each async handler returns the work its assertion waits for (`token-balance/service.ts:453-533`). Where a test parks a write to stage a race, a `deferred` pair (reached, release) in the spy keeps the race, and the spy calls through to the real write after release.
- I3 Every deadline loop fits one of recon's four contracts (throw, last state, best effort, hold). Phase 6's per-loop inventory is the check; a loop that fits none keeps its code, with the reason in the PR body.

**Asks:** none open. A step that would change a gate's strictness or a screen stops and becomes an `OWNER-ASKS.md` entry.

## Architecture & Implementation

**Walker (D2).** `source-scan.ts` gains `sourceFiles(policy?: SourcePolicy)`, where `SourcePolicy = { roots: readonly string[]; files?: readonly string[]; exts: readonly string[]; skip?: readonly RegExp[] }` (`files` carries `copy-dash-ban`'s one extra file; `skip` matches repo-relative paths). With no policy it returns today's typography walk. The rules that live once: repo-relative `/` paths, sorted; `node_modules` and `dist` never entered; a root that is missing or yields no file throws (the issue's path). Named exports carry the shared pieces: `PACKAGE_SRC_ROOTS` (every `packages/*/src`), `TEST_FILE`, `STORY_FILE`, `DECLARATION`, `GENERATED_TYPES`. Each guard states its policy with those names and keeps its own allowlists. A guard whose allowlist, denylist or expected list is keyed on `src`-relative paths (`storage-facade-ban`, `profile-ui-keys.scan`, `legal/call-sites`, `expiry-deferral.pins`) maps the walker's output back to that base in one line, so no anchor moves. No guard's file list widens or narrows (D3).

**Tokenizer (D4).** A sibling module, `scripts/type-roles/source-code.ts`, over the TypeScript parser:
- `codeLines(file, text): string[]`: the file's lines with noise blanked and every offset kept. The rules are `stripNoise`'s: comments, a shebang, regex bodies (flags stay), and the text of strings and template parts become spaces, delimiters and newlines kept; `${}` bodies stay code; a string or template text with at least one enclosing `${}` stays as text with `()[]{}` replaced by `\0`, so a bracket key (`${row["master-key"]}`) stays readable and its brackets are not counted. Literal spans come from the parser; comments are the `//` and `/*` runs outside every literal span, which finds a comment before a bare `)` or `,` too. A `.vue` file contributes its script blocks at their real lines (from `parseSource`); every other line is blank.
- `callsTo(file, text, callee: RegExp): Call[]`, with `Call = { line: number; callee: string; args: readonly ts.Expression[] }`. It reads every `CallExpression` and `NewExpression` whose callee text the pattern matches (so suffix rules like `this._logger.log` keep working); a guard reads an argument's shape from its node (`toast-call-sites` tells `{…}` from `{…} || x` that way) and its text with `getText()`. It looks in script blocks and, for `.vue`, in interpolations, directive values and dynamic directive arguments, each at its real line.
`log-payload-ban` keeps `LOG_CALL`, `callWindow` and `hazards` and reads `codeLines`. `stripNoise`, `startsRegex`, `skipRegex`, `LexState` and the per-line `<script>` regex go, with their manifest record. `useLogFilters.scan` and `toast-call-sites` read `callsTo`. In arc 3, `service.fence-entry` and `amount.callers` do too.

**Window harness (D5).** `tests/helpers/approval-window-harness.ts` exports the shared state (`callLog`, the request, dApp, payload and cancel refs, the init resolvers), the mock-module objects (`payloadModule`, `hostnameModule`, `profileClientModule`, `interactionClientModule`, `appStoreModule`, `routerModule`), `installWindowSpies()` (listener and `chrome.windows.remove` spies onto `callLog`), `resetWindowHarness()` and `completeInit()`. Each window suite keeps one line per mock, `vi.mock(path, async () => (await import("<literal path>")).<module>)` (a literal: a top-level constant is still in its temporal dead zone when the hoisted factory runs), plus its own extra mocks; the per-window differences stay in the window's file (`resolveInteraction` against `approveInteraction`, execute's `runtime.getURL` and fee-map reset, capabilities' `networks: []`, `vue-router` through `importOriginal`). A re-pin of the shell (A2, A3, A4, A6 `closeWindow`, A7) is deleted only when the shell suite pins the same assertion and a kept test in the same file asserts the window's own part of it. A4 (the window's init awaits its payload load before the listener) and A2 (the profile fetch sits inside init) have no such kept test today, so they are expected to stay; A3, A6 `closeWindow` and A7 are expected to go. A1, A5, C12, the A6 overlay dismiss, the init-throw case and every per-window test stay. The stale headers are rewritten to say what the file proves.

**Keyboard contract (D6).** `tests/helpers/send-popup-keyboard.ts`: `describeSendPopupKeyboard(options)` registers the seven "Enter elsewhere" tests and the button block (Enter, Space, held Enter, unset fee, second press in flight, click), with the nested-form fixture (`createApp`, because a second VTU mount drops the first's stubs). The options carry the mount, the submit element, the fee control with its click spy, the send spy and the hold and release of a send in flight, so every assertion of the originals stays, the positive ones too (the fee control ran once; the nested form submitted; the button disabled while a send is held). Revoke keeps its content-button, chunk-shortfall and error-keeps-disabled cases.

**Awaited bus (D7).** `awaitedBus<T>()` in `tests/helpers/held-read.ts`, beside `liveBus`: a real `EventHandler<T>` whose `add` registers one stable wrapper per callback (a `Map` keeps `remove` exact and a repeated `add` deduplicated). `dispatch(payload): Promise<void>` sets a collector local to that call, calls the real `invoke` (which runs every callback synchronously), and clears the collector. Each wrapper calls its callback at once and pushes its returned value into the collector; a synchronous throw is pushed as a rejection and re-thrown, so `invoke` still isolates and reports it. `dispatch` then awaits everything it collected and rejects with the first failure. Two dispatches started before either is awaited still interleave. Production `EventHandler.invoke` is unchanged.

**One poll (D8).** `tests/e2e/fixtures/poll.ts`: `pollUntil<T>(probe: () => Promise<T>, done: (value: T) => boolean, opts: { label: string; timeoutMs: number; intervalMs: number; show?: (value: T) => string }): Promise<T>`. It resolves with the first value `done` accepts. At the deadline it throws `PollTimeoutError` (with `label`, `timeoutMs` and `last`), and its message names all three. A probe's throw propagates, so a terminal failure (a dropped transaction, `send-burst.ts:219-220`) still fails fast. That is the one contract. Phases that share one deadline (`aztec.ts:464-486`, `journal.ts:352-377`) pass the remaining budget, `deadline - Date.now()`, never a fresh one. A loop whose documented contract returns the last state or proceeds best-effort (`send-burst.ts` `waitForEstimate`, `journal.ts:368-377`, `aztec.ts` `waitForL1ToL2Message` phase 2, `extension.ts` `fireCanary`, whose caller diagnoses the fall-through) catches `PollTimeoutError` at its own call site and does what its doc says. Not waits, and they stay: the hold-for-a-window assertions and `owned-processes.ts` `sweepPhase` (a stateful kill sweep).

**Builders (D9, D10).** `installChromeStorage(initial?, { persist: false })`: `set` and `remove` record their calls and keep nothing, and `get` answers `initial` or `{}`. That is the shape of the 24 hand stubs. The token-balance suite's `startWorld` becomes the file's one `world(opts)` builder, with options for the profile, accounts, tokens, task stub, deletion state and captured handlers. The 13 inline builds use it, and construction stays before `start()`. Arc 3 adds `useFullBackupImport.harness.ts` (the `seeder.harness.ts` shape: `buildBackup`, the mock-state objects, `makeOpts`; the storage roots import the real constants where the mocked spec module allows) and one options-based `makeDispatcher(...)` in `dispatcher.test.ts`. Arc 4 moves the scenario suite onto the real `IncomingTransferRepository` over the suite's own `FakeBrowserApi`.

**Trade-offs.** See the decision ledger. In short: an AST masker over a raw `ts.createScanner` (the scanner cannot tell a regex from a division or a template's `}` without the parser); exact per-guard coverage over normalised skip rules (normalising changes gate strictness, out of scope); deleting re-pins over a cross-window `describe.each` (one file would carry all three windows' mocks); one throwing poll with explicit call-site catches over a poll with three modes.

## Arc 1: source guards and the window contracts (one PR, `Closes #550`, refs #561)

### Phase 1 — one walker
1. Add `SourcePolicy`, `sourceFiles(policy?)`, the named skip classes and `PACKAGE_SRC_ROOTS` to `apps/extension/scripts/type-roles/source-scan.ts`.
2. Write the comparison under `~/.cache/nulo-backlog/test-infra-1/`: for each guard it runs the guard's old walker (taken with `git show 0fe841be:<file>`) and its new policy over the same working tree, and prints the count and the sha256 of each sorted repo-relative list, extra named files (`copy-dash-ban`'s `SCAN_FILES`) included. Record the command in `lessons/phase-1.md`.
3. Move each guard to `sourceFiles(policy)`: `copy-dash-ban`, `log-payload-ban`, `useLogFilters.scan`, `storage-facade-ban`, `profile-ui-keys.scan`, `toast-call-sites`, `legal/call-sites`, `expiry-deferral.pins`, `DottedTerm.scan` (it reads `<DottedTerm>` through `walkElements`), `icon-names`, `useConfirm`, `a11y-css` (its inline walk) and `identifier-sites.ts` `filesUnder`. Delete each local walker and the copied `SCAN_ROOTS`.
4. Run step 2's comparison; every pair must be byte-equal. `DottedTerm`'s occurrence list must also match.
- **Tests:** `scripts/type-roles/source-scan.test.ts` covers: a policy's roots, extensions and skip; sorted repo-relative output; `PACKAGE_SRC_ROOTS` lists every package with a `src`; a missing root throws; a root with no matching file throws. Every guard's own tests stay unchanged.
- **Validation gate:** `bun run lint && bun run typecheck:all && bun run test`. Pass: exit 0 each; the step 4 comparison shows 13 equal lists, logged in `lessons/phase-1.md`; `inventory.test.ts` green with `identifier-sites.expected.json` unchanged.

### Phase 2 — one tokenizer
1. Add `apps/extension/scripts/type-roles/source-code.ts` (`codeLines`, `callsTo`).
2. Move `log-payload-ban` to `codeLines`. Delete `stripNoise`, `startsRegex`, `skipRegex`, `LexState` and `scannableLines`, its `biome-ignore` and its manifest record (`bun run baseline:complexity`; the diff must remove only that record).
3. Move `useLogFilters.scan` (`skipToken`, `callArgs`, `COMMENTS`) and `toast-call-sites` (`pastString`, `closing`) to `callsTo`. `toast-call-sites`' `oneLiteralWithKind` reads the parsed argument, not a bracket walk.
4. Over the same tree, compare old and new derived outputs: `log-payload-ban`'s masked text, byte for byte over every scanned file, each differing line listed with its cause (only F9's misreads may differ), and per log window its pre-filter `occurrences()` (not empty: every `{ password }` key appears there); `useLogFilters.scan`'s registrations and `sourceExprs` for every file, and its refused sites; `toast-call-sites`' sites with their arguments. An unexplained difference fails the step.
- **Tests:** `scripts/type-roles/source-code.test.ts` covers: line, block and JSDoc comments and a shebang; escapes in strings; nested templates and `${}`; a bracket key inside `${}` kept with masked brackets; a regex after `throw`, `return`, `!` and `if (ok)`; division after `!`, `++` and `x.in`; a multi-line template keeping its line count; `.vue` script lines at their real numbers and a one-line `<script>`; `callsTo` on an optional call, a `new` expression, a suffix-matched member callee, a call in an interpolation, a directive value and a dynamic argument at its real line, and parens inside strings. The 58 `log-payload-ban` fixtures, its full scan and both other guards' self-tests stay unchanged and green.
- **Validation gate:** Phase 1's commands, then `bun scripts/complexity-baseline/check.ts`. Pass: exit 0; the manifest lost exactly the `stripNoise` record; step 4's lists are equal, logged.

### Phase 3 — window harness and keyboard contract
1. Add `apps/extension/tests/helpers/approval-window-harness.ts`. Move `capabilities/index.test.ts`, `discover/index.lifecycle.test.ts` and `execute/index.test.ts` onto it.
2. For each of A2, A3, A4, A6 `closeWindow` and A7 in each suite, name the shell test that pins it (`useDappApprovalWindow.test.ts:136,148,158,187,200`) and the kept test that asserts the window's own part. Delete it only when both exist. The table, with each deleted test's title, goes into the PR body.
3. Rewrite the stale headers (`capabilities/index.test.ts:1-19`, `execute/index.test.ts:1-23`, `:602-606`) to say what each file proves.
4. Add `apps/extension/tests/helpers/send-popup-keyboard.ts`. Move both authwit popup suites onto it. Revoke's own cases stay local.
- **Tests:** The harness is proven by the three suites. Before step 2, each suite passes on the harness with its test count unchanged. After, its count falls by exactly its rows in the deletion table. The keyboard contract is proven by both popups. Each passes with its count unchanged, and one temporary red run per popup shows the contract catches a removed `refuseRepeatEnter` (scratch, not committed).
- **Validation gate:** `bun run lint && bun run typecheck:all && bun run test && bun run test:all`. Pass: exit 0; test counts as stated, logged in `lessons/phase-3.md`. No e2e: the arc changes only unit tests and test helpers, which the extension bundle and the e2e specs never import.

## Arc 2: waits for causes and shared builders, free sites (one PR, refs #536 #540)

### Phase 4 — the awaited bus and the unit waits
1. Add `awaitedBus` to `apps/extension/tests/helpers/held-read.ts`. Add `"tests/helpers/**/*.test.ts"` to `apps/extension/vitest.config.ts` `include` and `"tests/helpers/**/*.ts"` to `apps/extension/tsconfig.json` `include`, so the new helper tests run and are type-checked.
2. `token-balance/service.test.ts` `:831, :895, :957, :1089, :1455`: replace each counted flush with `await bus.dispatch(…)`. Where a spy parks a write to stage a race (`:821-825`, `:881-895`, `:1069-1075`), give it a `deferred` reached and release pair and have it call through to the real write after release. Keep each test's own order: start the dispatch that parks, await its reached signal, start the other, release, then await both (`:840-895`: the deletion starts only after the creation reached its write, else the creation fails its liveness check and never reaches it).
3. `network/client.test.ts:8-10` and `composables/importChainSync.test.ts:207,324`: await the cause each drain stands for (the connect message; the code's own reaction to the late promise, `importChainSync.ts:122`). A site with no reachable cause keeps its drain, with the reason in the PR body.
4. Delete the local `deferred` in `FeeSettingsCard.test.ts:190` and `scope-follow.core.test.ts:50`, and `held()` in `popup/locked-state.test.ts:48`. Import `deferred` from `@nulo/wallet-core/utils`.
- **Tests:** `tests/helpers/held-read.test.ts` covers: `dispatch` resolves only after an async handler settles (control: `invoke` alone does not wait); a synchronous throw rejects `dispatch` while its sibling still runs; an async rejection rejects it; a repeated `add` runs once; `remove` of the original callback stops it; two overlapping dispatches settle independently. Each "has not happened" assertion it touches keeps or gains a success control in the same test.
- **Validation gate:** `bun run lint && bun run typecheck:all && bun run test`. Pass: exit 0; none of the five token-balance sites, `network/client.test.ts` or `importChainSync.test.ts:207,324` counts turns. The delays inside the mocks (`:824`, `:1074`) stay: they widen the race those tests pin, they are not waits.

### Phase 5 — storage stubs and the balance builder
1. Add `{ persist: false }` to `installChromeStorage`. Move the 19 discard-write stubs in files no lane edits (recon § Test collaborators lists 24; five wait for arc 3). Each test must see the same `chrome` members it saw before, added or removed (`settings/tokens/index.test.ts:30-43` stubs a `chrome` with no `runtime`); a file where that cannot hold keeps its stub, with the reason in the PR body.
2. Make `startWorld` the token-balance file's one `world(opts)` builder; move the 13 inline builds and `boot()`.
- **Tests:** `tests/helpers/chrome-storage-mock.test.ts` covers: `persist: false` records `set` and `remove` and keeps nothing; the default mode still persists. Each moved suite keeps its test count.
- **Validation gate:** Phase 4's commands plus `bun run test:all`. Pass: exit 0; test counts unchanged per moved file, logged.

### Phase 6 — one e2e poll
1. Add `apps/extension/tests/e2e/fixtures/poll.ts`, with `scripts/e2e/poll.test.ts`.
2. Write the per-loop inventory first (predicate, terminal failures, timeout result, deadline owner), into the PR body. Then move the deadline loops in fixture files no lane edits: `session.ts`, `tokens.ts`, `journal.ts` (the accepted predicates stay byte-identical), `send-burst.ts`, `aztec.ts`, `token-list.ts`, `incoming-poll-gate.ts`, `mining-hold.ts`, `popups.ts`, `browser/firefox.ts`, `browser/webdriver-classic.ts` (its `done` accepts the driver exiting, as the loop does today), `boot-guard.ts`, `extension.ts`. Then move the in-spec loops in specs no lane edits. At the arc's start, re-check each file with `git diff --name-only origin/dev...worktree-<lane>` for every running lane; a file in any lane's diff waits for arc 3.
3. `passkey-backup.test.ts`: parameterise `armProgressObserver` by its predicate, arm it for Encrypting (the card text only, as the poll checks today) before the second Protect click, and delete the 100 ms poll.
4. `account-switch-isolation.test.ts:371-393`: call the file's own `driveScanUntilHeld` and `pollIncomingRecordByHash`.
- **Tests:** `scripts/e2e/poll.test.ts`, on fake timers, covers: resolves with the first accepted value; throws `PollTimeoutError` with label, budget and last value; a probe's throw propagates at once; two phases sharing one deadline time out at the shared deadline. Each moved loop keeps its interval, its deadline and its terminal failures.
- **Validation gate:** the fast layers, then, with load1 under 150:
  - Smoke, per browser (`chrome`, then `firefox` with `NULO_E2E_BROWSER=firefox` on both commands): build the armed smoke build, `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<browser>`, then from `apps/extension`: `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 NULO_E2E_RETRY=0 bun run test:e2e`.
  - Network, per browser, from the root: `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent` (plus `NULO_E2E_BROWSER=firefox`). The prover-on canaries run in CI's canary jobs.
  Pass: every suite green, the run log showing retry 0. One rerun only for a flake already filed. The PR body compares each suite's CI wall-clock on the PR with dev's last green run (same CI hosts); the local runs are the gate, not the measure.

## Arc 3: the colliding sites (one PR, `Closes #561 #536`, refs #540; the orchestrator releases it when the lanes below have merged)

- **Phase 7 (#561)**, after execution-integrity-1 and ui-leftovers-1: `service.fence-entry.test.ts` and `amount.callers.test.ts` move to `sourceFiles` and `callsTo`. Their own `callArguments`, `callArgs` and `topLevelArgs` go. Gate: Phase 2's gate with the equal-lists proof for both.
- **Phase 8 (#536)**, after dapp-boundary-2, service-structure-1 (#545), storage-privacy-1, execution-integrity-1, onboarding-3, sheet-1 and type-roles-coverage:
  1. Move the `wallet-sdk/background.*` drains to the awaited callback or the reached signal they stand for.
  2. Do the same for `useArrivals.test.ts`'s `settle` and `dapp-send-executor.test.ts:2172-2174`.
  3. Delete the `deferred` copy in `send.integration.test.ts` and `held()` in `background.unserved-chain.test.ts`.
  4. Move the remaining e2e loops (`profiles.ts` and specs held back in Phase 6).
  5. Add a `pollUntil` line to `tests/e2e/README.md` and the `e2e-testing` skill.
  Gate: Phase 4's and Phase 6's gates.
- **Phase 9 (#540)**, after ui-dedupe-1 (#541), dapp-boundary-1/2, onboarding-3 and sheet-1: `useFullBackupImport.harness.ts` for the pair (the stages copy's drift is resolved toward the original's mocks), `makeDispatcher(...)` for the 44 constructions, and the five remaining storage stubs. Gate: Phase 5's gate; `dispatcher.test.ts` count unchanged.
- If one lane lags, the orchestrator may ship the released phases as the arc and move the rest to arc 4.

## Arc 4: the scenario suite on the real repository (one PR, `Closes #540`; after storage-privacy-1 and service-structure-1 #547 merge)

Phase 10 opens with a plan revision that the orchestrator approves before any code. It re-counts the suite at its new base and lists, for each of the five maps, the repository call or seeding builder that replaces it. Direction, already decided:
- the suite's existing `FakeBrowserApi` backs a real `IncomingTransferRepository`;
- seeds and reads go through the repository's own methods and key functions;
- parking uses `vi.spyOn(repo, "getTrust")`;
- `updatedAt` comes from `vi.setSystemTime`;
- the fake, its `readTrustForWrite` and its `clearChain` record go.
Each changed assertion is listed in the PR body with its reason (the fake's rule against the real one). Gate: `bun run lint && bun run typecheck:all && bun run test && bun run test:all`, then `bun scripts/complexity-baseline/check.ts`; `repository.test.ts` and `service.composition.test.ts` unchanged and green.

## Security & Adversarial Considerations

- **Threat model:** these tests are the controls for privacy rules (no secret flattened into a log, no raw `chrome.storage` in the UI, no broadcast without the legal guard). The attacker here is a future change that slips past a guard. The risk this plan creates is a guard that silently scans less: a narrower walk, a tokenizer that blanks a payload, or a call reader that misses a site.
- **Controls:** equal file lists and derived lists before and after each guard move (Phases 1, 2, 7); every existing self-test and fixture unchanged; a root that yields nothing throws; `callsTo` reads template expressions, so a `.vue` call keeps the coverage that raw-text scanning gave it.
- **Assertion strength:** a deleted window test needs its covering shell test and its kept wiring test named. A counted flush becomes an awaited cause, never a longer count or a `vi.waitFor` around a "not yet". An e2e loop keeps its interval and deadline, and a timeout throws unless the source documents otherwise.
- **Least privilege, crypto, supply chain:** no new dependency (`typescript` and `@vue/compiler-sfc` are already devDependencies), no workflow, permission or secret. `bun.lock` unchanged.

## UI impact

None. No production file changes in any arc; arc 4's revision stops if the real repository shows a product bug instead of a test bug (a production fix there is an `OWNER-ASKS.md` entry or its own issue).

## Delivery

- One branch and one PR per arc against `dev`, no stack (D-orch-1). Arc 1 on `worktree-test-infra-1`. Each later arc branches from `dev` after the previous arc merges and merges `dev` before its PR. A PR opens only after its arc's gates and its Codex loop.
- Titles (each 93 characters or fewer):
  - arc 1: `test: one source walker and ts tokenizer for the guards; one approval-window harness` (84);
  - arc 2: `test: await causes not turn counts; one e2e poll helper; shared storage and balance builders` (91);
  - arc 3: `test: move the remaining guards, waits and builders onto the shared helpers` (75);
  - arc 4: `test(incoming): run the scenario suite on the real repository over the fake browser` (85).
- Body: what changed and why, the deletion table (arc 1), the equal-lists proofs, gates with outcomes, the e2e wall-clock before and after (arcs 2 and 3), and `Closes #n` per the arc list.
- `apps/extension/**` trips both e2e path filters; add no label.
- **Parallelism:** arcs 1 and 2 touch disjoint files, but one worktree runs them in sequence; lanes would save less than 30 % and are not proposed.

## Post-implementation

Per `implementations-plan/README.md` § Post-implementation standard at 0fe841be:
- Step 1 is absent (`code_review: off`).
- Step 2 runs per arc, after the arc's last phase is green: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh` until a round has no material finding; hard stop at three rounds. One Opus diff review (`Agent`, `model: "opus"`, `general-purpose`) runs beside the first round. The arc map goes into every prompt. After arc 4, one fresh Codex session reviews the net diff from 0fe841be for cross-arc issues.
- Step 3: an arc's PR per Delivery; `gh pr checks <n> --watch`.
- Step 4, close-out, as arc 4's final commits: the `## Outcome` block; the lessons pass; the D11 client-mock `known-limit` issue filed and closed; a comment on each issue for any site the plan left; `STATUS.md` deleted; `git mv` into `archive/` in its own commit; the index line moved to `archive/index.md`.
- Step 5, after arc 4 merges: `agent-worktree done test-infra-1 --merged`, triggered by `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/test-infra-1/plan.md`.

## Review verdicts and decision ledger

**Competing outline** (reviewed with the first draft): the lane brief's literal shape, two arcs. Arc 1: each shared helper with one or two migrated suites. Arc 2: everything else after the colliding lanes merge.

- **D1 — arcs.** Four arcs: the free work in two (unit-only first, so arc 1 needs no e2e at a host load near 190), the colliding remainder, then the scenario suite alone. The competing outline would leave about 60 free sites waiting on lanes that do not touch them, and its arc 2 would carry the 7348-line scenario rewrite with every other migration.
- **D2 — the walker stays in `source-scan.ts`.** Not taken: moving it to `scripts/source-scan.ts` (a rename across 8 importers while three lanes edit the type-roles family); a `tests/helpers` copy (a second reader).
- **D3 — exact coverage per guard.** Not taken: one normalised skip set (a story or a declaration file would enter or leave some guards; strictness changes are out of scope).
- **D4 — an AST masker.** Not taken: `ts.createScanner` alone (it cannot tell a regex from a division, or a template's closing `}`, without parser context, so it would rebuild the hand lexer's heuristics); a full AST rewrite of `log-payload-ban`'s detection (it changes what the guard detects).
- **D5 — delete pure re-pins; no cross-window `describe.each`.** One file mounting three windows carries every window's mocks (execute alone adds ten).
- **D6 — the keyboard contract is named for the rule** (a popup that sends or signs answers only its confirm button), not for authwits; it registers tests, as `describe` blocks in the calling file.
- **D7 — the awaited bus wraps the real `invoke`.** Not taken: making production `invoke` return promises (it changes swallow semantics for every subscriber); a bus that calls callbacks itself (it would bypass the code under test).
- **D8 — one throwing poll.** Not taken: three modes in one helper (that is three contracts); converting documented L and B loops to throws (that changes those fixtures' behaviour).
- **D9 — `persist: false`, not a persisting swap.** The 24 stubs discard writes, so a persisting map changes what their tests read. The six persisting maps with extras stay, because each models a different behaviour.
- **D10 — the scenario suite waits for its own revision.** Its shape moves under storage-privacy-1 (row keys) and #547 (the outbox). A design drawn now would be redrawn.
- **D11 — out of scope:** client-mock builders (#540's fifth increment names no copy and traces no failure: a closed `known-limit` issue at close-out); guessed turns outside #536's list; `theme-vars.ts` (a package helper cannot import from an app); `owned-processes.ts` `sweepPhase` (a kill sweep, not a wait). Each gets a disposition line in the Outcome and a comment on its issue.
- **D12 — the e2e wall-clock is measured on CI**, the PR's run against dev's last green run. Not taken: a local base run (it doubles the heaviest gate on a host near load 200, and local and CI hosts differ anyway).

**Codex audit, round 1** (gpt-6.1-sol, high): `reject (with blocking findings: D4 erases sensitive bracket keys; callsTo excludes constructor sites already guarded)`. All taken:
- C1 (High) the masker must keep a string inside `${}` as text with masked brackets (fixtures `log-payload-ban.test.ts:741,941`): D4 restated; the prototype already did this (F9).
- C2 (High) `useLogFilters.scan` checks `new Lock(…)` sites (`:217-245`): `callsTo` reads `NewExpression` too, matched by pattern; compare `sourceExprs` and refused sites.
- C3 equal lists only over the same tree, the old walker taken from the base, derived outputs compared too: Phases 1 and 2.
- C4 `holdReads` has no reached signal: `deferred` pairs in the parking spies (I2, Phase 4).
- C5 `awaitedBus`: synchronous throws, stable wrappers, per-dispatch collection: D7.
- C6 shared deadlines pass the remaining budget; `journal.ts:368-377` is a last-state loop; a per-loop inventory: D8, Phase 6.
- C7 the keyboard contract keeps the positive spies: D6.
- C8 the `clearProfile` drift was written backwards: fixed.

**Opus Plan leg** (opus): `conditional approve` (six conditions). Taken beyond Codex's overlap:
- O1 comments are found outside every parser literal span, so one before a bare `)` is caught: D4.
- O2 the masked-text diff byte for byte and the pre-filter `occurrences()` per window make the Phase 2 check able to fail.
- O3 `callsTo` takes a pattern and returns argument nodes (`toast-call-sites` reads `{…} || x` by shape).
- O4 four guards key on `src`-relative paths: each maps the walker's output back in one line; `skip` is a list; `files` carries `copy-dash-ban`'s extra file.
- O5 A2 and A4 pin the window's own init content, which no kept test asserts: a re-pin goes only with its covering kept test named; the count falls by the table.
- O6 the Phase 4 criterion names its sites; the delays inside mocks (`:824`, `:1074`) stay (they widen the race, they are not waits).
- O7 a storage stub that removed `runtime` keeps it removed; O8 `fireCanary` is best-effort, `sweepPhase` is out, `webdriver-classic`'s `done` accepts the driver exiting; O9 literal import specifiers in the mock factories; O10 `tests/helpers/**/*.ts` into `tsconfig.json`; O11 the Encrypting probe checks text only; O12 as C5.
- Not taken: a local base e2e run for the wall-clock (D12). The client-mock increment becomes a closed `known-limit` issue (D11), as O's Ask suggested.

**Final Codex pass** (fresh session, gpt-6.1-sol, high): `conditional approve (with conditions: correct Phase 4's dispatch ordering and make Phase 6's e2e gates explicit and executable at retry zero)`. Both taken:
- F-1 (High) starting both dispatches first can hang the deletion race (`token-balance/service.test.ts:840-895`; creation fails its liveness check at `service.ts:290` before the write): Phase 4 keeps each test's own order.
- F-2 (Medium) smoke needs the armed build (`tests/e2e/global-setup-smoke.ts:20,53-59`); the full network selection needs `NULO_E2E_PROVERLESS=1` (`scripts/e2e/proverless-guard.sh`); the network config retries twice unless `NULO_E2E_RETRY=0` (`vite.shared.ts:118`): Phase 6's commands spelled out.
It reproduced F9's three differences independently and found none in the other 853 walked test files.

**Final Codex pass, resumed** (verification): `approve`. Both conditions hold; no new material defect.

## Seeds

```
/goal Arc 1 of implementations-plan/test-infra-1/plan.md (Phases 1-3) is marked ✓, each backed by its validation gate reported passing in the transcript; LESSONS_FILE=implementations-plan/test-infra-1/lessons/phase-N.md printed per phase; the Codex fix loop (gpt-6.1-sol, high) converged with a resumed round reporting no new material finding, quoted; one PR against dev exists, opened after the loop, with Closes #550; bun run test and bun run lint report exit 0.
```

```
/loop 15m Drive implementations-plan/test-infra-1 forward. Each firing: read plan.md and lessons/ as the state; if the plan is archived on origin/dev, run agent-worktree done test-infra-1 --merged and stop; if a PR exists, babysit its checks; otherwise take the next unchecked phase of the released arc, run its validation gate, mark ✓, log lessons. Decide with Codex (gpt-6.1-sol, high), never wait for the owner; never merge; never start an arc the orchestrator has not released.
```

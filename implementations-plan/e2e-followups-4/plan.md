---
plan: e2e-followups-4
tier: light
status: approved (orchestrator, 87db9bd); implementing arc 1
issues: "#308 (arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 Explore agents (sonnet); one Codex audit (gpt-6.1-sol, high) resumed to a final verdict; one Opus Plan lens beside it (the panel's same-family leg)
base: origin/dev at 6488b1b
trunk: dev
post_implementation_hardening: not scheduled
---

Owner questions: [OWNER-ASKS.md](OWNER-ASKS.md). Recon: [recon.md](recon.md). Status: [STATUS.md](STATUS.md).

# e2e-followups-4: the fee method picker's focused row on the artifact smoke (#308)

The 2026-10-11 nightly's Chrome `smoke-against-artifact` failed `send-keyboard.test.ts` › "the fee method picker: …": after ArrowDown the focused sponsor row was `da2d6064`, not the seeded `e2e-protocol-fpc-1`. This lane measures the failure by reproduction, fixes its cause, and proves the fix on both builds and both browsers. One arc, one PR against `dev`, no stack (D-orch-1). Nothing a person sees changes, and no file under `apps/extension/src` changes.

## Scope

**In:** #308: the Phase 1 reproduction, the fix its classification calls for, the Phase 3 proof, the e2e-testing skill's lines for the lesson.

**Out:** any change under `apps/extension/src` (a product cause becomes an issue, deduped first). #312, #302, #310. The shared interception fixture's diagnostics (D6). Two neighbours recon noted, `send-fee-privacy.test.ts` arming its refusal after registration and the `priced` tests seeding a token row beside an artifact run's shipped token list: Phase 1 watches them, and they become issues only on evidence.

**Filed, not fixed:** `addFpc` stores a sponsor at any address, so a person who adds Nulo's own sponsor address by hand also gets two "Sponsored" rows (`src/wallet/services/fpc/service.ts:284-293`, `fee-helpers.ts:202-223`). That is a product question; Phase 4 files it as an issue (deduped). It is not #308's cause: this spec adds no row by hand.

**Claims that did not hold, or hold narrower** (evidence in [`recon.md`](recon.md)):

- **"An FPC whose id reads as a short address prefix (`da2d6064`)."** Does not hold. It is a row id from `nextRandomId`, the eight random hex digits that protocol-FPC discovery stores a row under (`service.ts:222`). It names no address.
- **"The artifact build … where the sponsor list may open with a different first row."** Narrower. Nothing in `src` branches on the build mode, and no `VITE_*` flag touches FPC discovery. What differs is the run mode: an artifact run (`NULO_E2E_ARTIFACT_RUN=1`) has no egress guard and no Testnet stand-in, so the live Testnet node answers and discovery can store its own sponsor rows beside the seeded ones. Phase 1 measures whether the build adds anything to that.
- **"One observation so far … no second artifact-smoke sample yet."** Holds, and more strongly: the 10-11 run was the first artifact run of this test at all (the test landed after the 10-09 nightly; the 10-10 nightly skipped both artifact smoke jobs). The artifact lane is 1 red of 1 on Chrome and 1 green of 1 on Firefox.
- **"Where: `send-keyboard.test.ts:109`."** The failing assertion is at `:134`; `:108-111` is the test's header.
- **"`e2e-followups-3` (#281) is on the e2e tree now; this waits for it."** No longer applies: #281 is closed and that plan is archived.
- **Lane brief: "Use `agent.sh` for every run."** `agent.sh` (root `e2e:agent`) runs the network config only. Smoke runs go through `bun run test:e2e`: a guarded launch claims its loopback listeners in `~/.agents/ports.md` itself (`ownGuardedLaunch`), an artifact launch claims none, and `startNodeStub` claims its port through `listenClaimed`.

## Outcome & Quality Bar

**For whom.** The nightly and release pipelines, whose Chrome and Firefox artifact smoke gate a prerelease (#304) and a release's assets, and the maintainers who read that red or green as a fact about the shipped build.

**What excellent looks like.**

1. The fee-picker test means the same thing in every run mode: in a guarded run and in an artifact run, the wallet under test holds exactly the FPC rows the test seeded, and the test proves it instead of assuming it.
2. The test's assertions keep their strength: the first ArrowDown lands on the seeded sponsor, Enter picks it, and the saved pick names it.
3. The classification rests on runs: Phase 1's tally names, for every attempt, which rows existed, the menu's order and the focused row, and the PR body quotes it.

**What good enough looks like.** One spec fixed. This spec proves keyboard reach of the picker, not discovery: its rows are seeded, so a broken discovery or PXE path still passes it. Discovery against a real node is covered by the network suite (`network/fee-methods.test.ts`, `network/tx-sendTx-sponsoredFpc.test.ts`).

## Assumptions

### Facts (verified at `6488b1b` unless a log is named)

1. The failed run is the Chrome artifact smoke of nightly 38130969762 at dev `0643a14`; the assertion is `send-keyboard.test.ts:134`; the test pins `retry: 0` (`:110`); the same run's Firefox artifact smoke passed it (job 114446227139).
2. The focused row's `data-fpc-id` is `method.fpc?.id` (`FeeMethodSelector.vue:69`), and the Send page builds its methods from the FPC rows `getFpcs` read. So the nightly's Send page read a stored FPC row with id `da2d6064`.
3. Three code paths store an FPC row under a random id: discovery (`service.ts:222`), `addFpc` from the settings form (`:284-293`), and a backup restore. This spec drives neither of the last two.
4. Discovery stores a row only after `pxe.registerContract` resolves (`service.ts:215`), which needs a PXE runtime built against a node that answers (`packages/aztec-runtime/src/pxe/chain-runtime.ts:189`, `createPXE` at `:267`). A failure writes nothing (`service.ts:170-174`).
5. `global-setup-smoke.ts:72` arms the egress guard only outside artifact runs; only a guarded launch holds the Testnet stand-in (`fixtures/extension.ts:101`, `:141-151`). Every build's active network is Testnet (`src/wallet/services/network/service.ts:100-104`).
6. `registerProfile` waits on Home's `balance-amount` (`fixtures/extension.ts:329-373`); Home's `GasBalanceCard` calls `ensure(gas)` (`src/popup/components/modules/general/GasBalanceCard.vue:128`), and the service worker's gas read calls `getFpcs(chainId)` (`src/wallet/services/execution/gas-balance-reader.ts:183`). The test seeds its rows only after its own `openPopup` (`send-keyboard.test.ts:20-31`).
7. `buildFeeMethods` dedupes no sponsor row (`fee-helpers.ts:202-223`); `menuOrder` keeps the input order within Nulo's sponsors (`:260-265`); ArrowDown from the trigger focuses the first `[data-dropdown-item]` (`DropdownRoot.vue:241-256`); disabled rows carry no `data-dropdown-item`.
8. The Send page re-reads the FPC list on every mount (`FeeSettingsCard.vue:598-602`, `forceRefresh`), on a recovered degraded commit (`:715-725`) and on an identity change (`:788-797`); it never listens for `onFpcAdded` (`:438-439`). A row added while the Send page is open does not appear until one of those reads.
9. `interceptRpc` on an origin the launch holds replaces the launch's interception until `stop()`, then restores it and hands its failures to the launch's close check (`fixtures/browser/index.ts:244-250`, `standing-interception.ts:113-144`, `egress-guard.ts:304`). On Chrome it auto-attaches from the browser target with `waitForDebuggerOnStart`, so a later target (the offscreen document, a successor service worker) is held until armed (`chrome-rpc-intercept.ts:96-112`); a reply that fails later is recorded asynchronously (`:68`); on Firefox one parent-process observer sees every channel (`firefox-rpc-intercept.ts:15-19`). `import-dead-rpc.test.ts:136-161` (`withFreshExtension`) arms it on a fresh launch before any profile exists.
10. `startNodeStub` (`fixtures/node-stub.ts:21`) answers HTTP 400 with a JSON-RPC body, on which the node client stops at once; a refused connection it retries for seconds per call (`node-stub.ts:1-4`).
11. `TESTNET_RPC_URL` carries a dRPC key in its path; the constant is committed in this public repository (`src/wallet/constants/network-endpoints.ts:2`) and shipped in every bundle. The interception fixture's failure strings and its `NULO_E2E_INTERCEPT_LOG=1` log carry the request path (`chrome-rpc-intercept.ts:63-68`).

### Inferences (unverified; audits attack these)

- **I1.** Facts 2-4 make discovery the writer of `da2d6064`, so a node answered that nightly's wallet, which only an artifact run allows (Fact 5). Inferred: discovery stored its rows before the Send page read the list, and the random id came first in storage order. Phase 1 measures it.
- **I2.** Chrome's `storage.local.get()` returns keys in byte order. Phase 1 records the menu's order beside the ids, so the plan does not rest on it, and Fix A makes it moot.
- **I3.** The live Testnet endpoint answers this host's wallet as it answered the CI runner. The dRPC origin answers here, which does not prove the keyed RPC path does; Phase 0 sends one JSON-RPC request and Phase 1 records the wallet-level outcome.
- **I4.** A stub redirect makes registration behave as on a guarded launch (Fact 10). Phase 3 confirms it.
- **I5.** Fix A on the release build creates a state no spec has run: the shipped Testnet token list meets a node that answers 400 from the first call, so the token seeder schedules its retries at 15 s and 60 s (`src/wallet/services/token/seeder.ts:28`), while the test seeds its own token row and price (`priced: true`, `send-keyboard.test.ts:25-28`) into the same token store. Inferred harmless to the fee picker's assertions; Phase 3's C1 runs it, and a red there is read as this state, not as a flake.

### Asks (each with the working assumption the plan proceeds on)

- None for the owner: nothing a person sees changes. Decisions inside the lane go to the panel (ledger below). Owner disposition becomes necessary only if a required gate stays red; the lane then stops and reports.

## Architecture & Implementation

### Phase 1: reproduce and classify

Three Chrome cells and two Firefox runs, on the current tree with a local probe. The counts, the build order, the environments and the stop rule are fixed here, before the first run.

**Builds, in this order** (each build writes `apps/extension/dist/<browser>`, so copy out before the next):

0. Check that no `.env*` file exists in `apps/extension` (Vite's env dir; no config sets `envDir`) or the repo root: `ls -a apps/extension . | grep '^\.env'` prints nothing. Vite loads `.env*`, so this check is what makes `env -u` sufficient. Do not set an unwanted flag to an empty value instead: `VITE_LOCAL_NETWORK_RPC_URL ?? "http://localhost:8080"` keeps an empty string (`src/wallet/services/network/service.ts:95`), so the build would differ from the nightly's. Both build commands below spell out the full `env -u` list; copy them whole, since zsh does not word-split a variable.
1. Release-shaped Chrome: `env -u VITE_NULO_E2E_PRICE_MAP -u VITE_NULO_E2E_PROVERLESS -u VITE_NULO_E2E_PROVERLESS_CONFIRM -u VITE_NULO_PRESTO_REQUIRED -u VITE_LOCAL_NETWORK_RPC_URL -u VITE_COINGECKO_API_KEY -u VITE_NULO_FEE_MULTIPLIER -u VITE_NULO_E2E_MIGRATION_FIXTURE -u VITE_NULO_E2E_TOKEN_SEEDS -u VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM -u VITE_NULO_E2E_CSP_REPORT bun run --cwd apps/extension build:chrome`, then copy `dist/chrome` to `~/.cache/nulo-backlog/e2e-followups-4/release/chrome`. Same for Firefox into `…/release/firefox`.
2. Armed Chrome: `env -u VITE_NULO_E2E_PRICE_MAP -u VITE_NULO_E2E_PROVERLESS -u VITE_NULO_E2E_PROVERLESS_CONFIRM -u VITE_NULO_PRESTO_REQUIRED -u VITE_LOCAL_NETWORK_RPC_URL -u VITE_COINGECKO_API_KEY -u VITE_NULO_FEE_MULTIPLIER VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome` (the PR lane's flags, `_extension-smoke-e2e.yml`; it stays in `dist/chrome`), then copy to `~/.cache/nulo-backlog/e2e-followups-4/armed/chrome`. Same for Firefox (it stays in `dist/firefox`).
3. Check each release dir with the marker list of `_build-extension.yml`'s "Assert test-only markers absent" step, run as a scratch loop over that dir: no marker found. Check each armed dir: `NULO_E2E_TOKEN_SEEDS_BUILD_STAMP` and `nulo:e2e:csp-violations` found, `NULO_E2E_PRICE_MAP_BUILD_STAMP` and `NULO_E2E_PROVERLESS_BUILD_STAMP` not found.

None of these paths prefixes another, nor the sibling worktree's `dist`, so the smoke teardown's prefix `pkill` (`global-setup-smoke.ts:28`) touches only this run's browsers.

**Cells.** Every command runs from `apps/extension`, with `taskset -c 0,1` (the skill's CI amplifier, `e2e-testing/SKILL.md` § Reproduce like CI) and `-t "the fee method picker: a Tab stop"`; one whole-file run per cell comes first, without `-t`. Never set `NULO_E2E_INTERCEPT_LOG`.

| Cell | Environment | Runs |
|---|---|---|
| C1 (the nightly) | `env -u NULO_E2E_MIGRATION_FIXTURE -u NULO_E2E_CSP_REPORT NULO_E2E_BROWSER=chrome NULO_E2E_ARTIFACT_RUN=1 EXTENSION_PATH=<release/chrome>` | 1 file + 20 |
| C2 (the PR lane) | `env -u EXTENSION_PATH -u NULO_E2E_ARTIFACT_RUN NULO_E2E_BROWSER=chrome NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1` (loads `dist/chrome`, the armed build) | 1 file + 20 |
| C3 (run mode, armed build) | as C1, with `EXTENSION_PATH=<armed/chrome>` | 1 file + 20 |
| F1, F2 | as C1 and C2 with `NULO_E2E_BROWSER=firefox` and the Firefox dirs | 1 file each |

The command is `<env> taskset -c 0,1 bun run test:e2e -- tests/e2e/send-keyboard.test.ts --retry=0 [-t "the fee method picker: a Tab stop"]`. One run at a time; never two smoke suites of this lane at once. Before each cell, record `uptime`; lane `wallet-followups-5` may run on this host, so the loop cannot run alone, and the tally says so. A scratch loop under `~/.cache/nulo-backlog/e2e-followups-4/` drives the runs and tallies.

**Probe (local, never committed).** Edit the fee-picker test in place to log one JSON line per probe point, tagged `[p308]`, with a millisecond timestamp. It prints no URL and no request body.

- P0, just before `seedProtocolFpcs`: every `nulo:core:fpcs@*` row (raw key, `id`, `profileId`, `chainId`, `type`, `address` in full), plus the scope's `profileId` and `chainId`.
- P1, after the menu opens and before ArrowDown: the same rows; the menu's rows in order (`data-testid`, `data-fpc-id`, `aria-disabled`, `data-checking`, presence of `data-dropdown-item`); the focused element's `data-testid`.
- P2, after ArrowDown and before the assertion: the rows again, the menu again, and the focused row's `data-fpc-id`.

Each row records whether its address equals the protocol sponsor address `helpers/fpc-seeds.ts` pins, compared in full. The probe's own reads can shift timing slightly; the tally says so.

**Attempt accounting.** Each cell has 21 counted slots: slot 0 is the whole-file run, slots 1-20 the filtered runs. Every attempt is recorded, red or green, under its slot. A red is a counted red unless independent evidence shows a host fault (the port-registry lock timed out, the host ran out of memory, Chrome failed to start with a host error); only then is the slot run again, and the replaced attempt stays in the tally beside its evidence. A red before the picker opens is a counted red of unknown class. Four replaced attempts in one cell stop the phase; consult Codex.

**Reading the tally.** A red counts as reproduced only when its focused `data-fpc-id` is a stored row with the protocol sponsor address, `type` 1, the scope's profile and chain, an id not seeded, and the menu at P2 lists it before the seeded row. Apply the rules in order; the first that matches decides, and rule 5 catches the rest. A slot-0 red in one of the file's other four tests is recorded as a neighbour observation (the `priced` tests share the token store with an artifact run's shipped token list, recon § Collisions) and leaves the classification to the fee-picker test's runs; Phase 4 files it if the tally explains it or it recurs.

| # | Observation | Classification | Next |
|---|---|---|---|
| 1 | Any anomaly: a non-seeded FPC row in C2, a red of the fee-picker test that is not reproduced as defined (its focused row seeded, or a red before the picker), a Firefox red of the fee-picker test, a host fault behind four replacements | unclassified | stop; consult Codex with the tally; the lane brief's outcomes 1 or 3 decide the fix, still with no `src` change |
| 2 | C1 or C3 has a reproduced red, or a non-seeded row at either protocol address at P0-P2 | I1 holds: discovery wrote beside the seed in an artifact run. Report what each of C1 and C3 showed, without assigning the difference a cause | Fix A |
| 3 | No non-seeded row in any cell, Phase 0's request answered | not reproduced locally. Facts 2-4 still name discovery as the writer of the nightly's row, and Fact 5 the artifact run's live node as what let it run: that is the named mechanism. The storage order and any build effect stay unmeasured, and the PR says so | Fix A, with "not reproduced locally" in the PR |
| 4 | No non-seeded row in any cell, Phase 0's request did not answer | not reproduced locally: no discovery row was observed, and Phase 0's separate request did not answer. Facts 2-5 still name the mechanism | Fix A on Facts 2-5, with both observations in the PR |
| 5 | Anything rules 1-4 do not cover (for example, a green artifact run holding an unexpected FPC row at another address) | unclassified | as rule 1 |

The 2026-10-12 nightly's two artifact smoke jobs are read if the run exists by then (`gh run list --workflow nightly.yml`); nothing waits for it, and it is never dispatched.

### Fix A: the spec holds its node from before the profile exists

The cause, if I1 holds: the spec seeds a value only a node gives, on the premise that no node answers (its comment says so, `send-keyboard.test.ts:112`), but in an artifact run the live one does, and the wallet's own discovery writes beside the seed. The fix makes the premise true in every run mode instead of assuming it. It follows `import-dead-rpc.test.ts`'s `withFreshExtension`: arm the interception on a fresh launch, before the wallet can call the node.

- The fee-picker test takes `freshExtensionPerTest` instead of `registeredExtensionPerTest`. Before `registerProfile(ctx)`, it starts a stub and redirects the Testnet origin to it: `startNodeStub()`, then `interceptRpc(ctx.browser, ctx.extensionId, new URL(TESTNET_RPC_URL).origin, { kind: "redirect", to: stub.url })`. On a guarded launch this replaces the launch's own stand-in until `stop()` (Fact 9); on an artifact launch it is the only one. No PXE runtime exists before the profile does, so this arms early enough.
- Cleanup is nested: the stub's `stop()` runs in an outer `finally`, the interception's in an inner one, so the stub stops even if arming or the interception's teardown throws. Both run before the fixture closes the browser.
- New assertions, each pair with its control:
  - Never-happens: just before `seedProtocolFpcs`, the browser holds no FPC row; after Escape returns focus, it holds exactly the two seeded rows. `fpcRowIds(page)` beside the seed in `helpers/fpc-seeds.ts` lists the ids of every raw `nulo:core:fpcs@` key, unparsed, so a malformed row counts too; the test compares the sorted lists. Success control: the existing assertions, unchanged (the focused row is the seeded sponsor; Enter picks it; the saved pick names it).
  - The node was held: immediately before the interception's `stop()`, `failures()` is empty and `hits()` is above zero; after it, `stub.requests()` is above zero. Firefox drops its tally at `stop()` (`firefox-rpc-intercept.ts:64`), so the reads come first. On Chrome a reply failure is recorded asynchronously, so the check covers the scenario up to that read, not the teardown after it. On Firefox a redirect that fails later still counts a hit, so the stub's own count is the proof the stub answered.
- Two negative controls, each run once in Phase 2 and never committed, each required to fail at its own assertion line (the logged error names that line and the extra row):
  - N1: write an extra sponsor row at the protocol address just before the pre-seed check. The pre-seed never-happens assertion fails.
  - N2: write it just after the pre-seed check, under the id `ffffffff`, which sorts after `e2e-protocol-fpc-1`, so the focus and pick assertions still pass. The after-Escape never-happens assertion fails. If N2 fails earlier, at the focused-row assertion, that is evidence against I2: record it and consult Codex.
- The comment at `:112` states the new invariant in one sentence. The doc comment of `seedProtocolFpcs` says the seeded rows stand alone only while no node answers, which a spec ensures by holding the node from before the profile exists.
- Nothing changes for the other four tests in the file.

### File-level change map

| File | Change |
|---|---|
| `apps/extension/tests/e2e/send-keyboard.test.ts` | the fee-picker test: fixture swap, node held before `registerProfile`, nested cleanup, the new assertions, the comment |
| `apps/extension/tests/e2e/helpers/fpc-seeds.ts` | `fpcRowIds(page)`; the doc comment's caveat |
| `.claude/skills/e2e-testing/SKILL.md` | § Build-armed tests: the seeding rule gains "and holds the node from before the profile exists"; a flake-ledger row for this symptom; one line with the local release-shaped smoke recipe |
| `implementations-plan/e2e-followups-4/**` | plan, recon, lessons, status; archived at close-out |

No file under `apps/extension/src`, `scripts/` or `.github/` changes.

### Trade-offs and alternatives not taken

- **B. Assert against whatever row the menu offers first** (focus equals the first enabled row; the saved pick equals the focused row's id). Smallest diff, and the picker does promise "first enabled row". Not taken: the spec would still run against a state the harness makes (two Nulo sponsors), and in an artifact run the Send page's FPC read can wait on a discovery that holds the FPC lock against the live node, so the spec would still depend on that node's latency. It also drops the check that the seeded sponsor is the one offered.
- **C. Arrow down until the seeded row is focused.** Keeps the seeded identity but adds a loop and still runs against the duplicate state.
- **D. Seed before discovery can start.** No hook exists: the profile, and with it the scope the seed needs, appears only when Home is already reading balances.
- **E. Wait for discovery to finish in an artifact run, then use its row.** Needs a mode branch and makes the spec depend on the live node being up.
- **F. Hold the Testnet node for every artifact launch.** Removes the artifact run's documented live leg (the shipped token list against the live chain, `global-setup-smoke.ts:71`) for every spec, to fix one.
- **G. Dedupe Nulo sponsors in `buildFeeMethods`.** A product change, out of the lane. A hand-added sponsor at the protocol address also makes two rows, so the product question exists apart from this test; Phase 4 files it.
- **Fix A with `{ kind: "refuse" }`** instead of a stub redirect: one helper fewer, but the node client retries a refused connection for seconds per call (Fact 10), so registration and Home slow down; the stub gives the answer every guarded launch already gives. `holdNodeStub` is not usable here: it holds for the launch's life, and a guarded launch already holds one.

## UI impact

None. No surface a person sees changes; the lane edits one e2e spec, one e2e helper and the e2e-testing skill.

## Security & Adversarial Considerations

- **Threat model.** Test-harness change only. The trust question is the nightly and release gates: a fix that hid a product fault would let a broken build publish. Fix A removes no assertion and adds three. It does not cover discovery (§ Outcome & Quality Bar), which the network suite covers.
- **What the gate trusts.** That the interception covers every target that could reach the node; Fact 9 shows how, and `failures()` reports a target it could not arm or answer, up to the read. `hits()` and `stub.requests()` prove only that some requests were redirected, not that every one was. The never-happens assertions fail the test when discovery wrote a row anyway, whatever the cause, up to the final snapshot.
- **The dRPC key.** It is a constant committed in this public repository and shipped in every bundle (Fact 11), so a CI log that prints it exposes nothing new. The lane still adds no output that carries it: the probe, the tally, the plan and the PR print no URL; runs never set `NULO_E2E_INTERCEPT_LOG`. An interception failure string can carry the path (Fact 11), as it can for every spec that uses `interceptRpc` today; changing the shared fixture is outside this lane (D6).
- **Egress.** Phase 0's one request and Phase 1's artifact-mode runs reach the live Testnet node and dRPC from this host, as the nightly does; nothing else outside is called.
- **Run isolation.** Smoke runs one at a time; `startNodeStub` claims its port in `~/.agents/ports.md`; the scratch builds live under `~/.cache/nulo-backlog/e2e-followups-4/`, at paths that prefix no other `EXTENSION_PATH`.
- **Supply chain.** No dependency change.

## Phases

### Phase 0: preflight ✓

1. Run `git rev-parse --show-toplevel`, `git fetch -q origin dev`, `git merge-base --is-ancestor 6488b1b origin/dev`, and `gh issue view 308 --repo nulo-sh/nulo --json state -q .state`.
2. Send one JSON-RPC request to the Testnet node from a scratch script under `~/.cache/nulo-backlog/e2e-followups-4/`: read `TESTNET_RPC_URL` from `src/wallet/constants/network-endpoints.ts`, POST `{"jsonrpc":"2.0","id":1,"method":"aztec_getNodeInfo","params":[]}` (the method `import-dead-rpc.test.ts:189` sees the wallet send), and print only the HTTP status and whether the reply has a `result`. Never print the URL.
3. Run `gh run list --repo nulo-sh/nulo --workflow nightly.yml --limit 3`.

**Validation gate.** Pass: the worktree path prints; the ancestry check exits 0; #308 is `OPEN`; the request's status and `result` presence are recorded in `lessons/phase-1.md`, whatever they are. Layers: none.

### Phase 1: reproduce and classify ✓

1. Apply the probe. Make the builds in the order § Phase 1 gives, and check their stamps.
2. Run C2, then C1, then C3, then F1 and F2, as the cells table says.
3. Write the tally to `lessons/phase-1.md`: per attempt the cell, the outcome, the load, the rows at P0-P2, the menu at P1 and P2, the focused row, and any replaced attempt with its evidence.
4. Classify with the table. Read the 10-12 nightly if it exists.
5. Revert the probe: `git checkout -- apps/extension/tests/e2e/send-keyboard.test.ts`.

**Validation gate.** Commands: the runs above; `git diff --quiet -- apps/extension/tests/e2e/send-keyboard.test.ts`. Pass: all 21 slots of each of C1, C2 and C3 and both Firefox runs recorded, with every replaced attempt beside its evidence; the tally written; one rule of the table named with its evidence; the probe diff gone (exit 0). Rule 1 stops here for the panel. Layers: smoke e2e, Chrome and Firefox, both run modes.

### Phase 2: fix ✓

1. Implement Fix A as the change map says (or the fix the panel chose for an unclassified row).
2. Run the fast layers after each edit.
3. Run N1, then N2, once each: apply the control, run it under C2's environment with `-t "the fee method picker: a Tab stop"`, check that the red is the intended assertion line and names the extra row, then revert it and check the revert with `git diff`.

**Validation gate.** Commands: `bun run lint`; `bun run typecheck:all`; `bun run test` (it runs `apps/extension/scripts/e2e/*.test.ts`, the harness seam checks); `bun run test:all`; `bun run test:ci-gating`; then from `apps/extension`, C2's environment with `taskset -c 0,1 bun run test:e2e -- tests/e2e/send-keyboard.test.ts --retry=0`. Pass: every command exits 0; the file shows 5 passed; N1's and N2's reds, each at its intended line, are logged in `lessons/phase-2.md`. Layers: lint, typecheck, unit, smoke e2e.

### Phase 3: prove ✓

1. Reuse Phase 1's four build dirs. Rebuild them only if a merge from `origin/dev` changed a file outside `apps/extension/tests/`.
2. Run C1, C2 and C3 (one file run plus 20) and F1 and F2 once each, as in Phase 1, with no probe.
3. Run the whole smoke suite once on C1: from `apps/extension`, C1's environment with `bun run test:e2e -- --retry=0`.
4. Write the tally to `lessons/phase-3.md`, every attempt included.

**Validation gate.** Pass: all 63 Chrome slots and both Firefox runs green on their first attempt, with no replaced attempt; the whole artifact suite green on its first run. Any red fails the gate; a rerun never turns it green. For a red in a file this lane does not touch, rerun that file once at retry 0 only to classify it, record both runs, file or extend the issue (deduped), and report the gate as failed to the orchestrator, who decides. The arc does not deliver on a failed gate. Layers: smoke e2e, both browsers, both run modes, the whole suite once.

### Phase 4: docs and issues ✓

1. Update the e2e-testing skill as the change map says.
2. File the `addFpc` duplicate-sponsor issue (dedupe first: `gh issue list --repo nulo-sh/nulo --state all --search "fpc sponsor duplicate"`), and any neighbour issue Phase 1 or 3 gave evidence for.
3. Run `bun run lint` and `bun run check:plans`.

**Validation gate.** Pass: both commands exit 0; each filed issue's number is in `lessons/phase-4.md`.

## Decision ledger

| # | Decision | Chosen | Rejected, and why | Source |
|---|---|---|---|---|
| D1 | Where the fix lives | the spec (Fix A) | B-G above | driver; Codex and Opus agree (round 1) |
| D2 | How the spec holds the node | a fresh `startNodeStub` behind `interceptRpc` redirect | `refuse` (slower registration, Fact 10); `holdNodeStub` (launch-scoped) | driver; Codex and Opus agree |
| D3 | Phase 1 counts | three Chrome cells, each one file run plus 20 runs of the one test, every attempt kept; Firefox once per build | fewer cells (C3 is what separates the build from the run mode); twenty whole-file runs (5x the cost for four tests the cause does not touch) | lane brief floor; Opus round 1 |
| D4 | Settling when Phase 1 does not reproduce | Facts 2-5 name the mechanism; the PR says "not reproduced here" | "I1 refuted" (round 1 draft): a local miss cannot refute a writer the nightly's own message proves | Opus F1, Codex F2, round 1 |
| D5 | The CI amplifier | `taskset -c 0,1`, load recorded per cell | running alone on the host (a parallel lane holds it) | Opus F3 |
| D6 | The interception fixture's path-bearing diagnostics | no fixture change in this lane | sanitising `chrome-rpc-intercept.ts` and its Firefox twin here: the key is public (Fact 11), the strings serve every `interceptRpc` spec, and the change would widen the lane to every spec that uses them | driver; Codex and Opus accept (round 2) |
| D7 | Never-happens points | before the seed and after Escape, each shown to fail by its own negative control (N1, N2) | at P2 only (a write after P2 would escape it); one random-id control (it can fail at the focused-row assertion first) | Opus F2; Codex and Opus round 2 |
| D8 | Phase 3's gate when a file this lane does not touch goes red | the gate fails; one rerun only classifies; the orchestrator decides | passing the gate on a known-flake rerun (v2): the common brief allows a rerun to read a red, but a green rerun does not show the first red had the ledger's cause | Codex round 2 F3 (Opus round 2 accepted v2's rule; the driver takes the stricter one) |
| D9 | Build flags the release-shaped build must not carry | `env -u`, after checking no `.env*` file exists | explicit empty values (Codex round 2): `VITE_LOCAL_NETWORK_RPC_URL ?? default` keeps an empty string, so the build would differ from the nightly's | driver, after checking `network/service.ts:95` |
| D-orch-1 | Delivery shape | one PR against `dev`, no stack | a stack for one arc | orchestrator |
| D-orch-2 | Order of Phase 1 and Phase 2 | Phase 1's measurement (the focused row, the sponsor rows' ids and order, per run and per mode) is logged in `lessons/phase-1.md` before any fix lands; another cause stops the arc for a re-plan | building Fix A on I1 as an inference | orchestrator |
| D-orch-3 | Phase 3's gate | strict (D8): any red fails it, a rerun only classifies, a red in an untouched file goes to the orchestrator | a rerun to green, a skip, a filter, a retry or a wait | orchestrator |
| D-orch-4 | Issues at close-out | two, each deduped, five sections, `Record` link to the archived plan: (a) `addFpc` stores a sponsor at any address (`ux`, `owner-decision`); (b) the artifact smoke runs unguarded against the live network while the source-build smoke sits behind #171's guard (`ci`) | (b) disposed of as not a gap: alternative F rejects guarding artifact runs as this lane's fix, which does not make the exposure intended for every spec | orchestrator |
| D-orch-5 | Nightly and release workflows | never dispatched or re-run; the 10-12 nightly's `smoke-against-artifact` read if it exists when Phase 1 is reached, never waited for | dispatching a nightly for a second sample | orchestrator |
| D-orch-6 | `apps/extension/src` and the interception fixture's key | no file under `src` changes; the dRPC key is printed in no progress line, report, lesson or plan | — | orchestrator (D6 stands) |
| D-orch-7 | `lessons.md` | at its 8 KiB budget: nothing promoted unless a retirement pays for it; `origin/dev` merged before the final gates and `index.md` and `lessons.md` read; never a union merge | — | orchestrator |

## Audit verdicts

### Round 1 (plan v1)

**Codex** (gpt-6.1-sol, high): `reject (with blocking findings: unsound classification rules, ambiguous validation gates, secret-bearing diagnostics)`.

| # | Finding | Disposition |
|---|---|---|
| C1 | Fact 7 overstated "reads once"; G's "only a test" is false (`addFpc` stores any address) | accepted: Fact 8 narrowed; G rewritten; the `addFpc` duplicate is filed in Phase 4 |
| C2 | the table overclaims causality; C3 positive does not exclude the build; the fallback cannot refute I1 | accepted: the reproduced-red definition, the C1-positive/C3-negative wording, D4 |
| C3 | I3 unsafe: a 404 on `/` is not an answering RPC | accepted: Phase 0's JSON-RPC request, the wallet-level outcome in Phase 1 |
| C4 | no unclassified branch; the probe lacks attribution, full addresses, row state, pre-ArrowDown focus, timestamps; probe timing effect | accepted: the table's last row; P0-P2 |
| C5 | infra replacement by default; Phase 3's exception lets a failed gate pass | accepted: attempt accounting; Phase 3's rule keeps the first red on record and fails the gate unless a known flake reruns green |
| C6 | "origin only" is false: interception logs and failure strings carry the key-bearing path | accepted in part: the statement is corrected and the debug flag forbidden; fixture sanitisation rejected for this lane (D6) |
| C7 | nested cleanup; check `stub.requests()` | accepted |
| C8 | `fpcRowIds`: raw keys, no silent discard, order-independent | accepted |
| C9 | state the coverage limit | accepted (§ Outcome & Quality Bar) |
| C10 | environments not fully specified; Phase 0 lacks commands; "clean tree" wrong | accepted |

**Opus** (Plan lens): `conditional approve (with conditions: fix the fallback's "I1 refuted" branch; check the never-happens assertion at the end as well as at P2 and prove it can fail; run Phase 1 the way the skill reproduces CI)`.

| # | Finding | Disposition |
|---|---|---|
| O1 | the fallback's negative branch is unsound; drop the dependence on the 10-12 nightly | accepted (D4; the nightly is read only if it exists) |
| O2 | never-happens before the seed and at the end; `stub.requests()`; one negative control | accepted (D7, Phase 2 step 3) |
| O3 | `taskset -c 0,1`, `-t`, load per cell | accepted (D3, D5) |
| O4 | name I5, the shipped seeder against a 400 node | accepted |
| O5 | cite `import-dead-rpc`'s `withFreshExtension` | accepted |
| O6 | build order and paths | accepted |
| O7 | forbid `NULO_E2E_INTERCEPT_LOG` | accepted |
| O8 | `createPXE` is at `:267` for these builds | accepted |
| O9 | Phase 3's rerun is a retry inside a gate | accepted in part: the common brief allows one rerun for a known flake; the first red stays on record and in the PR body |

### Round 2 (plan v2)

**Codex** (resumed session): `reject (with blocking findings: overlapping classification branches, incomplete build isolation, contradictory gate criteria)`. It accepted D6 (the key is a published constant; logging it breaches nothing) and D4 for the writer inference (local reproduction is not needed to justify isolating the node), and confirmed the `-t` filter matches only the fee-picker test.

| # | Finding | Disposition |
|---|---|---|
| C2.1 | the table's branches overlap; C1-positive/C3-negative does not show a build effect | accepted: ordered rules with the anomaly rule first; C1 and C3 are reported without assigning a cause |
| C2.2 | `env -u` lets `.env*` reintroduce flags; the armed build inherits other flags; stamp checks alone are not release equivalence | accepted in part: a no-`.env*` check, the full `env -u` list on both builds, the release workflow's marker list on the release dirs. Explicit empty values rejected (D9) |
| C2.3 | the Phase 3 gate contradicts itself; a green rerun does not show the first red's cause | accepted (D8) |
| C2.4 | attempt accounting: 21 slots plus replacements; a non-host red stays counted | accepted |
| C2.5 | the random negative control can fail at the focused-row assertion first | accepted: N1 and N2, each pinned to its line |
| C2.6 | Chrome reply failures arrive asynchronously; narrow the claim; Fact 9's citation; I5's "no token row is read" is wrong | accepted |

**Opus** (resumed): `conditional approve (with conditions: pin the negative control so its red comes from the never-happens assertion, not from :134)`. Its three round-1 conditions: the fallback and the CI shape are met; the never-happens condition is met once the negative control is pinned. It found D6 sound, the cell environments consistent with the build order, and the cleanup order (reads before `stop()`, `stub.requests()` after it) safe.

| # | Finding | Disposition |
|---|---|---|
| O2.2 | pin the negative control (write after the pre-seed check under an id that sorts after the seed) | accepted: N2; N1 covers the pre-seed point |
| O2.3 | Fact 9's `:220-258` does not exist | accepted (`:96-112`) |
| O2.4 | "21 recorded attempts" conflicts with keeping replaced ones | accepted |

### Round 3 (plan v3)

**Codex** (resumed): `conditional approve (with conditions: make UNARMED executable and remove rule 4's unsupported causal conclusion)`. It found D9 sound (an empty `VITE_LOCAL_NETWORK_RPC_URL` changes the compiled preset).

| # | Finding | Disposition |
|---|---|---|
| C3.1 | `UNARMED` is a placeholder, and a scalar does not word-split in zsh | accepted: both commands spell out the full `env -u` list |
| C3.2 | rule 4 claims one failed request means local runs could not show discovery | accepted: rule 4 states only the two observations |
| C3.3 | no catch-all rule | accepted: rule 5 |

### Round 4 (plan v4)

**Codex** (resumed): `approve`, with no new finding.

**Opus** (resumed): `approve`, with one low finding: a slot-0 red in one of the file's other four tests would fall to rule 5 and stop Phase 1. Accepted: such a red is recorded as a neighbour observation and leaves the classification to the fee-picker test's runs (rule 1 now names the fee-picker test). Codex confirmed the edit (round 5 below).

### Round 5 (the Opus edit)

**Codex** (resumed): `approve`. Rule 1 still catches every unreproduced fee-picker red, a red before the picker, every Firefox fee-picker red and any unexpected row in C2; the exception covers only the other four tests, whose reds stay recorded and still fail Phase 3's gate.

### Post-implementation round 1 (the arc's diff)

**Codex** (gpt-6.1-sol, high, read-only; session `01a12da3`): `findings`, three nits, no blocking or material one. It found the cleanup order sound on both browsers and both launch modes, `fpcRowIds` correct, and an origin mismatch with the installed artifact caught by `hits()`.

| # | Finding | Disposition |
|---|---|---|
| P1.1 | the skill's `NULO_E2E_ARTIFACT_RUN` row says the live node answers every spec, which this fix contradicts | accepted: "a spec reaches the live Testnet node unless it intercepts it" |
| P1.2 | ledger row 53 says the seeded rows are the only rows before the seed; the check there wants none | accepted |
| P1.3 | § Security overstates the counters: `hits()` and `stub.requests()` prove some redirection, not complete coverage | accepted: the sentence now says what each check proves |

**Opus** (general-purpose diff review, beside round 1): `sound, one material finding`.

| # | Finding | Disposition |
|---|---|---|
| O-P1.1 | material: ledger row 53 cites `implementations-plan/archive/e2e-followups-4/`, which does not resolve before the archive move, so `check:plans` fails at every commit until then (confirmed: one `path-token` finding) | accepted: the row cites the live plan dir; the close-out's move repoints it |
| O-P1.2 | the two skill nits Codex raised | same fix |
| O-P1.3 | `send-fee-privacy.test.ts` arms its refusal after registration, so on an artifact run registration reaches the live node; the skill's "replaces the stand-in" holds on guarded runs only | accepted as evidence for the D-orch-4(b) issue, which names it; no change to that spec in this lane |
| O-P1.4 | `fpc-seeds.ts` re-spells the product's `FPC_STORAGE_ROOT` | accepted: the key prefix derives from it |

## Delivery

One PR against `dev`, no stack (D-orch-1), from `worktree-e2e-followups-4`. The close-out lands as its final commits.

| Branch | Phases | PR title (≤ 93 chars) | Closes | code_review |
|---|---|---|---|---|
| `worktree-e2e-followups-4` | 0-4 | `test(e2e): hold the testnet node in the fee picker spec so artifact runs seed alone` | #308 | off |

- Open the PR only after the Codex loop converges and every local gate passes. Open it without labels. Add `e2e:extension-smoke` afterwards only if the path filter would skip the smoke suite; a label at creation cancels the run.
- PR body: what changed and why; the Phase 1 tally and classification; the Phase 3 tally; the coverage limit; `Closes #308`; the issues Phase 4 filed.
- Commits are signed and conventional, with a lower-case subject, ending with the `Co-Authored-By` trailer that names the model that wrote them. Afterwards `git log --format='%h %G?' -3` shows no `N`. On a hang, rerun as `env -u SSH_AUTH_SOCK git <cmd>`.

### Issue to arc

| Issue | Arc | Closed by |
|---|---|---|
| #308 | arc 1, Phases 0-4 | the PR (`Closes #308`); if Phase 1 ends unclassified and the panel finds a product cause, #308 stays open with a comment and the product issue is filed instead |
| the `addFpc` duplicate-sponsor issue | no arc | filed in Phase 4; a product question outside this lane |
| a neighbour Phase 1 or 3 shows at risk | no arc | an issue, deduped, outside this lane |

## Post-implementation

This section is self-contained: the implementing session follows it from here.

### Quality loop (once, over the whole arc, after Phase 3's gate)

1. Codex audit: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`. On a quota or 401 error, retry once with `CODEX_ACCOUNT=alejo-icloud`. If that fails too, log the failed consult in `lessons/phase-4.md` and continue on your own judgment within scope. The prompt carries the arc's diff against the merge base with `origin/dev`, this plan and its ledger, the Phase 1 and Phase 3 tallies, the adversarial ask (what could go wrong, what would an attacker target, what are we trusting that we should not), and the two rules below, verbatim.
2. Triage each finding. Verify Codex's factual claims against the repo first. Apply the accepted fixes, commit, and log the round in `lessons/phase-4.md`.
3. Resume the same session (`resume-codex.sh "" <followup-file> <codex-dir> high`) with the fix diff. Repeat until a round yields no new material finding; rejected nitpicks do not count. Still material after three rounds: stop and surface it to the orchestrator.

**The no-over-engineering rule** (verbatim in every post-implementation Codex prompt): *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."*

**The comment-quality rule** (verbatim in every post-implementation Codex prompt): *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*

### Delivery

4. Run `bun run test` and `bun run lint:actions`. Then run `gh pr create --base dev` per § Delivery: the first PR of this lane, drafts included. Then run `gh pr checks --watch`.

### Close-out (the PR's final commits)

5. Merge `origin/dev` into the branch. Read what changed in `implementations-plan/index.md` and `lessons.md` (lane `wallet-followups-5` may have landed); never use a union merge. If the merge brought changes under `tests/e2e/fixtures/**` or to `send-keyboard.test.ts`, rerun the file on C2 and C1 at retry 0 before the push.
6. Write an `## Outcome` block directly after the front matter: the date and status; what shipped, with the PR number; one disposition line for each thing dropped or not holding; an `Open items:` line (issue numbers, or `none`); a line that retires the `/goal` and `/loop` seeds below.
7. Promote a generalizable gotcha into `implementations-plan/lessons.md` only if it is not e2e-domain (e2e lessons live in the e2e-testing skill). Keep the file under 8 KiB, deduplicate, retire what a new line supersedes, date tool-specific lines.
8. File every open item in its home:

| Situation | Home |
|---|---|
| Work inside the implementation you are on | this `plan.md` and the PR |
| Actionable work that outlives the plan | a GitHub issue with a domain label and a `Record` link to the archived plan |
| Needs a product call, or waits on something outside the repo | an issue labelled `owner-decision` or `blocked:external` |
| A suspected exploitable weakness | a private draft security advisory; the plan records only "tracked privately: GHSA-…" |
| Rejected, superseded or already done | a disposition line in the Outcome block |
| Knowledge that prevents a repeat | `implementations-plan/lessons.md` |
| A legal or store blank with a release deadline | `BEFORE-LAUNCH.md` |
| Accepted code work that blocks launch | the `v1.0.0` milestone, pointed at once from `BEFORE-LAUNCH.md` |

   Dedupe first (`gh issue list --state all --search "<words>"`). An issue body has `## What happens`, `## Where`, `## Impact`, `## Possible fix`, `## Record`. An issue left open, or a claim that did not hold, gets a comment with the reason.
9. Delete `STATUS.md`. Keep `OWNER-ASKS.md`; it archives with the plan. Run `git mv implementations-plan/e2e-followups-4 implementations-plan/archive/e2e-followups-4` in its own commit. Repair the relative links the extra level breaks (`git grep -n 'e2e-followups-4'`). Move the index line to `implementations-plan/archive/index.md`. Run `bun run check:plans`.
10. Push and report. Merging is the orchestrator's call; the merge completes the plan.

### Teardown after the merge

11. Once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/e2e-followups-4/plan.md` succeeds, run `agent-worktree done e2e-followups-4 --merged --trunk dev` without asking. A session that started inside the worktree has nothing to exit. The helper refuses rather than forces: relay a refusal and stop.
    - A `/loop` session checks this on every firing.
    - A `/goal` session arms one background wait after its wrap-up report: `until git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/e2e-followups-4/plan.md; do sleep 300; done`.

## Seeds

Recommended: `/goal`. Use exactly one per session. Both are drafts until the orchestrator approves the plan.

```
/goal Phases 0-4 of implementations-plan/e2e-followups-4/plan.md are marked ✓, each backed by its validation gate reported passing in the transcript; Phase 1's tally (C1, C2, C3 at one file run plus 20 each, F1 and F2 once, every attempt kept) and its classification are written in lessons/phase-1.md; the Phase 2 negative controls N1 and N2 each went red at their intended line, logged in lessons/phase-2.md; Phase 3's tally (the same counts on the fixed tree, plus the whole smoke suite on the release-shaped build) is in lessons/phase-3.md; for each phase the transcript prints LESSONS_FILE=implementations-plan/e2e-followups-4/lessons/phase-N.md; no file under apps/extension/src changed (git diff --stat origin/dev in the transcript); /code-review was NOT run (code_review is off); the Codex fix loop (run-codex.sh … high read-only gpt-6.1-sol) converged over the arc, evidenced by a resumed Codex pass reporting no new material findings, quoted in the transcript; the PR against dev exists, created only after the loop converged (gh pr view in the transcript), says Closes #308, and carries the close-out commits that archived the plan (git show --stat of the archive-move commit); bun run test and bun run lint both exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/e2e-followups-4 forward. Never idle. Each firing: (1) read plan.md, STATUS.md and lessons/; if the plan path is gone, check `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/e2e-followups-4/plan.md`: success means merged, so run `agent-worktree done e2e-followups-4 --merged --trunk dev`, report, clear this loop and stop; failure means delivered, so babysit CI only. (2) Waiting on CI is fine; confirm it progresses. (3) No task in hand: take the next pending step; run lint and the touched tests after each edit; commit. Never run two smoke suites of this lane at once; never set NULO_E2E_INTERCEPT_LOG. (4) A decision you would bring to a person: consult Codex (run-codex.sh … high read-only gpt-6.1-sol) and act on the stronger argument; log it in lessons/. Anything a person would see goes to OWNER-ASKS.md, never decided. Never merge, never push to main, never expand scope, never change apps/extension/src, never add a retry, a timer wait, a skipIf or a looser assertion. (5) Same step failed five times: stop and reassess with Codex; a gate that failed three times on one step ends the arc with ARC_FAILED; an unclassified Phase 1 stops for the panel. (6) Phase green per its gate: mark ✓, log lessons, print LESSONS_FILE=…. (7) All phases ✓: run the quality loop, then Delivery, then the close-out per Post-implementation, then report and stop.
```

---
plan: e2e-clocks-1
tier: light
status: planned (Codex approve, round 5)
issues: "#992 (arc 1: Closes on the ship path; closed as a known limit with the numbers on the no-ship path)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); one Codex audit round-trip (gpt-6.1-sol high) plus one Opus Plan leg
base: origin/dev at 34609f33d
trunk: dev
post_implementation_hardening: not scheduled
---

# e2e-clocks-1: the network e2e build runs the wallet's two clocks faster, if the numbers hold

One arc, one PR against `dev`. The owner's pick (page 78, P78-14 B, 2026-10-21): "An e2e-only build constant for the two intervals: faster suites, but the e2e no longer runs the cadence users get, and a build flag joins what a release must keep off." Owner note: "Again, let's try this out to see how it goes. But I'm not fully committed." So the arc measures before it ships, and ships only on the evidence. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

**Invariant:** a build made without `VITE_NULO_E2E_WALLET_CLOCKS=1` scans incoming transfers every 30 s and re-reads finality every 60 s, and no release artifact can carry the e2e values: the flag is compiled in, nothing at run time reads it, only `src/e2e/config.ts` may import the values, and the release gate refuses the stamp that travels with them.

## Outcome & Quality Bar

- **For whom:** the owner, who decides from the numbers whether the trade is worth it, and every contributor who waits on the network lanes.
- **Excellent:** (1) the PR shows, per browser and from six balanced local runs, the clock-bound files faster by at least the predicted amount, their mechanism lines moved as predicted, no new failure and no other file slower; (2) a release build provably carries 30 s and 60 s: literal unit pins, the marker step on a real bundle, CI's grep on every artifact; (3) no test proves less than today.
- **Good enough:** three pairs are a pilot for a large effect, not a reliability claim; CI confirms the direction. Shard balance stays with #972.

## Assumptions

**Facts** (recon.md has the evidence)
- F1 The tick is a constructor parameter (`incoming-transfer/service.ts:314`); `runtime.ts:565` passes `undefined`. `FINALITY_READ_INTERVAL_MS` is a module constant. `TransactionService` reads a mined row first one interval after its mined commit (`service.ts:569`), again one interval after each unsettled read (`:446`), at once after a worker restart (`:149`). `SendCheck` reads at its next 5 s tick after a mined write (`send-check.ts:150`); the interval only spaces its unsettled re-reads (`:272`), and no e2e file waits on them.
- F2 A tick reuses the last tips read while it settled under 5 s ago (`service.ts:1261`); a read slower than 5 s is reused by the next 10 s tick. Every 4th tick forces both arms.
- F3 `incoming-transfers.test.ts:73` and `incoming-public-transfers.test.ts:145` assert `elapsed < INCOMING_SCAN_INTERVAL_MS` (30 000, `fixtures/auth.ts:326`) to prove the unlock's own scan found the receipt. A lock commits an empty scheduler set and an unlock re-installs it with an immediate poll (`service.ts:1047-1049, 1103-1106, 1154`), so a tick-found receipt shows more than one tick after the helper starts. CI: 1.5-2.1 s, both browsers.
- F4 CI: `snack-placement`'s three grants read final 53.7-56.8 s after the chain is (2.0 s); `incoming-arrival` 327-345 s (Chrome), `snack-placement` 460 s, `failed-send-check` 251 s, whose Finalized wait (`:344`) is `TransactionService`'s.
- F5 The release env guard refuses any unlisted `VITE_*` var (`build-env-guard.test.ts`); the marker step greps a fixed list; no test pins the list.
- F6 Three sites deliver a note, then arm the poll gate for its hash: `account-switch-isolation.test.ts:129-139` (with the sender's cleanup between) and `:359-363`, `incoming-arrival.test.ts:435-436`. A tick whose scan commits the note in that window leaves the hold nothing to park, or parks a later scan after the record exists.
- F7 Only `send-check.test.ts:793-815` pins a production value by count (12 ticks of 5 s); `service.finality.test.ts` follows the constant by import.

**Inferences**
- I1 A 10 s tick costs 6 idle tips reads a minute per network (2 today), a forced scan of both arms every 40 s, and a PXE sync per note scan that other PXE work in the file queues behind; finality reads rise sixfold per awaiting row. Moderate; rule (c) checks the effect.
- I2 `snack-placement`'s precondition (the grant still awaits finality) runs about 3 s after the mined commit on CI, before a 10 s read. Low risk; watched.
- I3 F6's race exists at 30 s and is about three times likelier at 10 s; the window is widest where the sender's cleanup sits inside it. Plausible; Phase 2 proves the mechanism.

**Asks:** none for the owner. Every lane that builds through agent.sh proverless (PR, nightly, soak, the release's pre-publish network lane) moves to the e2e cadence: that is the owner's "the e2e no longer runs the cadence users get"; the prover-ON canary keeps the users' cadence (D6). The brief's claim that `behavior-gating.test.ts` pins the release list did not hold (F5); `shard-timings.json` is not on `dev` (draft #978), and this arc never edits it.

## Architecture & Implementation

- **`src/e2e/wallet-clocks.ts`** (new, no env read): `E2E_WALLET_CLOCK_VALUES = { incomingPollMs: 10_000, finalityReadMs: 10_000 } as const`, one comment on why (D4). A Biome `noRestrictedImports` override lets only `src/e2e/config.ts` import it under `apps/extension/src/`; tests may.
- **`src/e2e/config.ts`:** `VITE_NULO_E2E_WALLET_CLOCKS`, a single flag; `E2E_WALLET_CLOCKS` (the values or `null`) and `E2E_WALLET_CLOCKS_BUILD_STAMP`, documented like the migration fixture's.
- **`src/wallet/runtime.ts`:** pins the stamp on `globalThis` beside the token stamps; passes `E2E_WALLET_CLOCKS?.incomingPollMs` to `IncomingTransferService` and `E2E_WALLET_CLOCKS?.finalityReadMs` to `TransactionService`; its "Default poll interval kept" comment goes.
- **`transaction/service.ts`:** `constructor(logger, browserApi, finalityReadMs = FINALITY_READ_INTERVAL_MS)` at both re-arm sites. `SendCheck` is unchanged (D9). `incoming-transfer/service.ts:51-55` drops "a future PR can tune".
- **Harness:** `scripts/e2e/agent.sh` sets the flag in its proverless branch only, passes it as `0` to the prover-ON build (an explicit value outranks a `.env` line), and checks the stamp inside the existing `NULO_E2E_PROVERLESS=1` block. `fixtures/auth.ts`: `INCOMING_SCAN_INTERVAL_MS = E2E_WALLET_CLOCK_VALUES.incomingPollMs` (D5). `fixtures/incoming-poll-gate.ts`: one helper that locks the wallet, runs the delivery, arms the hold for the hash it returns, unlocks and returns once the route reaches Home, used at the three F6 sites; the arrival case still waits for seeding before it releases the hold; every assertion stays. Stale comments: `snack-placement.test.ts:225`, `account-switch-isolation.test.ts:149`, `token-add-auto-trust.test.ts:129`, `incoming-public-transfers.test.ts:11-12`, `helpers/handshake-import.ts:14, 64`. No timeout or other assertion value changes.
- **Release gate:** the marker list gains the stamp. `gh-step-harness.ts` `runStep` gains an optional `cwd` and returns `stderr`. `build-env-guard.test.ts` (its header names both guards) runs the marker step.
- **Docs:** `tests/e2e/README.md` (flags, `finalizeThrough` row), `.claude/skills/e2e-testing/SKILL.md` (flags, rows 56 and 58), `CI.md` flags list, `ARCHITECTURE.md:131`.
- **Alternative not taken:** set the values at the constants from `@/e2e/config`: two lines, but an e2e branch inside two service modules (D3).

## Security & Adversarial Considerations

- **Threat:** the values shipping. Consequence: every wallet reads tips three times and finality six times as often, on the public endpoints and their keyed quota; no funds or data at stake. Nothing in an installed extension can set them: a build-time literal, with no storage key, message or log line.
- **Layers:** the env allowlist refuses the var in every `_build-extension.yml` build (release, nightly, source rebuild, PR); the marker step refuses the stamp there; the import restriction keeps the values behind the flag that carries the stamp; the reviewers' source rebuild (`store/SOURCE-BUILD.md`) sets no flag. A stray `.env` line passes the env guard, not the marker step (the Phase 1 real-bundle check). The guards stop accidents, not a hostile source change, which review owns.
- **Fidelity (the owner's trade):** unit tests still drive the production cadence (`service.scenarios.test.ts:6453`, T1b, `send-check.test.ts:793-815`), and so does the canary lane. Never print or open `src/wallet/constants/network-endpoints.ts`.

## UI impact

None. A production build keeps both intervals; no screen, copy or timing a person meets changes.

## Phases (arc 1, branch `e2e-clocks-1-a1` off `origin/dev`, this plan's commit cherry-picked first)

### Phase 1: the flag, the seams and the release gate
- The changes above, comments written to the house bar as they land.
- Tests: T1 `config.test.ts`: unset gives `null` and no stamp; set gives the values and the literal. T1b literal production pins: a default-built `TransactionService` reads a mined row at 60 000 ms, not at 59 000; a default-built `IncomingTransferService` polls again at 30 000 ms, not at 29 999. T2 the marker step run with `cwd` a temp root: `test.each` over every `NULO_*_BUILD_STAMP` literal in non-test `apps/extension/src/**`, a file under `<root>/apps/extension/dist/chrome/` carrying it exits 1 with the literal in `stderr`; control, a clean dist exits 0. T3 `TransactionService` built with `10_000` re-reads an unsettled row at 10 s, not before.
- **Validation gate:** `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`, `bun run test:ci-gating`, `bun run test:release`, `bun run lint:actions` exit 0. T2 fails with the stamp removed from the workflow's list, then restore; T1b fails with either default edited, then restore; an import of `@/e2e/wallet-clocks` from `runtime.ts` fails `bun run lint`, then remove it. Real bundle: `bun run --cwd apps/extension build:chrome` with no `VITE_*` set, the marker step's script exits 0; with `VITE_NULO_E2E_WALLET_CLOCKS=1` it exits 1 naming the stamp. Layers: lint, typecheck, unit, CI-shape.

### Phase 2: the touched e2e files, both browsers
- Widened-copy proof of F6 (scratch, never committed): a 25 s pause between delivery and arming in `account-switch-isolation`'s first case is red at the e2e cadence with the old order and green with the helper; revert the pause.
- One run each, retry 0, Chrome then Firefox: `cd <worktree> && NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 bun run e2e:agent tests/e2e/network/{incoming-transfers,incoming-public-transfers,incoming-arrival,account-switch-isolation,snack-placement,failed-send-check}.test.ts`, then with `NULO_E2E_BROWSER=firefox`.
- **Validation gate:** all green; agent.sh prints the stamp check; every `[install-run]` under 10 000 ms; every `[snack-placement] … wallet final` under 20 000 ms. Layers: e2e-live-network, both browsers.

### Phase 3: review loop, then the measurement
- Run the Post-implementation review loop to convergence first; then freeze the head SHA, the P SHA and `bun.lock` (D8).
- **Arms:** F = the frozen head; P = F plus one local commit, never pushed, that sets the flag to `0` in agent.sh's proverless branch and turns its stamp check into an absence check, so an inherited or `.env` value cannot arm P and the arms differ only in the two clocks (Codex r2, r3). Each run: the whole suite, `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NULO_E2E_RESULTS_FILE=<run>/results.json bun run e2e:agent`. Order: Chrome P F F P P F, then Firefox F P P F F P, one run at a time.
- **While at P** (`git switch --detach <P>`): write nothing under the worktree; never switch with a run in flight; the state is the run directories plus `git rev-parse HEAD`; write `lessons/phase-3.md` back on the arc branch.
- **Records:** `~/.cache/nulo-backlog/e2e-clocks-1/runs/<id>/`: log, `results.json`, `env.txt` (HEAD, browser, start and end), `load.txt` (load1 and the `nulo-e2e-*` row count of `~/.agents/ports.md` every 60 s). Every result is kept; a rerun never replaces one. Budget about 24 h; project after the first two runs, drop nothing.
- **Predictions** (median paired saving per run; scanner waits from #992's local figures): `snack-placement` 120-150 s (three grants, 55 s to about 7 s each); `failed-send-check` 35-50 s; `incoming-arrival` 70-115 s Chrome, 50-85 s Firefox (173 s and 128 s of scanner waits, to about a third). Faster, not gated: `incoming-public-transfers`, `account-switch-isolation`, `import-handshake-note*`. Envelope, secondary: Chrome's pool shard 2/5 falls about 110 s; Firefox's stays near 4/5's 1115 s.
- **Gate (ship rule), per browser:** (a) no unresolved F failure. A run is invalid only when no test ran (boot failure, exit 86); it is rerun and both are reported. Any F test failure counts unless its trace shows a cause outside the two clocks and what they drive; an open issue's name alone exempts nothing, nor does load; each gets its mechanism, a rerun of its file at P and at F, and a label. (b) The three target files' median savings sum to at least the lower predictions' sum (225 s Chrome, 205 s Firefox), all three pairs favour F in each file, every F `wallet final` is under 20 s and every F `[install-run]` under 10 s. (c) No other file is slower in all three pairs by more than max(10 % of its P median, 10 s) without a traced unrelated cause. Report raw times, pairs and load beside the verdict.

### Phase 4: ship, or write it up
- **Ship:** the PR per Delivery. **No ship:** revert the clock commits on the arc branch, keep T2's list pin and the F6 helper, and carry the close-out with the numbers (`Refs #992`); #992 gets the numbers, the `known-limit` label and closes as not planned. Reopen on the failing criterion: a different interval, a deterministic setup for the failing case, or a host or CI change.
- **Validation gate:** the Phase 1 commands green on the final head; `bun run check:plans` after staging.

## Decision ledger

- **D1 A compiled constant, no runtime knob.** Rejected: a `chrome.storage.session` override like the gates (reachable in a release build). Both legs agree.
- **D2 One flag**, like the migration fixture and the price map: shipped values cost node traffic, not funds, and the marker step catches what the env guard cannot. Rejected: a confirm pair. Both legs agree.
- **D3 Injection at the composition root**; the services keep the production defaults. Rejected: the constant-site form. Both legs agree.
- **D4 10 s for both, a candidate the measurement tests, not a proven floor.** The tick clears the 5 s tips cache for a read that settles within 5 s (F2) and is five times the unlock scan's worst CI latency (F3); a mined row stays visible 10 s before its first read. Rejected: 5 s (the cache; the 5 s `SendCheck` tick), 15 s (a third less gain).
- **D5 The install-run bound follows the build's tick**, from one module. Rejected: keeping 30 s (proves nothing at a 10 s tick); a scan-trigger field in the poll gate (a new protocol for one assertion).
- **D6 Proverless branch only** (Opus 6): the canary's five files wait on neither clock and stay the one network lane at the users' cadence. Smoke stays unarmed: no node.
- **D7 P is the head with the flag set to `0` and the stamp required absent** in a local commit (Codex r2: the base lacks D10's helper, which alone could speed `incoming-arrival`). Rejected: the base commit (that confound); a knob in agent.sh (a switch for the measurement alone).
- **D8 Review before measuring**; a later change to the plumbing, the values or a measured test re-runs the affected cells.
- **D9 No `SendCheck` seam** (Opus 5, Codex 2): no e2e file waits on its re-reads and its first read ignores the interval; the e2e keeps its production cadence.
- **D10 The F6 race is fixed at the three sites** (Codex 3): delivery and arming happen while locked, where no scheduler runs, so the order holds at any cadence. Rejected: moving the arm before the sender's cleanup (narrows the window, keeps the race); a hold keyed on the target without a hash (gate protocol change).
- **D11 No e2e scenario added**; the six runs are the measurement, D5 the coverage.

## Review verdicts

- **Round 1, Codex (gpt-6.1-sol high, session 01a15eea): `conditional approve`.** Accepted: (1) literal production pins (T1b) and T2 under a `dist/chrome` it creates, reading `stderr`; (2) `SendCheck`'s first read ignores the interval (F1, D9), F7 corrected; (3) the deliver-then-arm race (F6, I3, D10, Phase 2); (4) D4 a candidate, I1's costs widened; (5) no exemption by issue name or load, every result kept, invalid only without a test run; (6) balanced order, frozen SHAs, a load sample a minute, raw results, three pairs a pilot; reopening tied to the failing criterion. Rejected: none.
- **Round 1, Opus Plan leg: `conditional approve`.** Accepted: (1) the values behind the flag by a distinct name and an import restriction; (2) the detached-checkout rules; (3) the summed savings criterion beside per-file signs and the mechanism lines; (4) the missed comments and I1's costs; (5) as D9; (6) as D6; (7) T2 over every stamp in `src/`, kept on the no-ship path; (8) the scanner-wait figures sourced. Rejected: none.

- **Round 2, Codex resumed: `conditional approve`.** Accepted: (1) P would lack D10's helper, a confound in `incoming-arrival`: P is now the head built with the clocks off (D7 revised on that new evidence); (2) recon's reuse table and unit-test note synced with D6 and D9. D10 holds if the helper returns after the route settles and the arrival case waits for seeding before release (Architecture). Rejected: none.

- **Round 3, Codex resumed: `conditional approve`.** Accepted: removing the flag's line would not disarm P against an inherited or `.env` value, so P sets it to `0` and requires the stamp absent; the prover-ON build gets `0` for the same reason. Rejected: none.
- **Round 4, Codex resumed: `conditional approve`.** Accepted: an `unset` leaves a `.env` value in force, so the prover-ON build passes `0` explicitly. Rejected: none.
- **Round 5, Codex resumed: `approve`.** No new material findings; P stays disarmed with its absence check.

## Delivery

- **Arc 1** = Phases 1-4, one PR against `dev` (D-orch-1: no stack), ready, opened after Phase 4. Ship title: `test(e2e): the network e2e build scans incoming and re-reads finality every 10 s` (80 characters). Body: what changed and why, the measurement tables per browser (per file, P and F, pairs, load, every failure and its label), the CI wall-clock before and after per browser, the release-gate proofs, `Closes #992`. No label: the extension's source trips the network path filters.

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at `34609f33d`. Plan-specific values:
- **Diff review:** `code_review: off`; the step is absent.
- **Review loop**, at the start of Phase 3 over the arc diff from `origin/dev`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; the prompt carries the diff, this plan and its ledger, the adversarial ask and the README's two rules verbatim. One Opus `general-purpose` review beside round 1. Hard stop at three rounds; log each in `lessons/phase-3.md` and under Review verdicts.
- **Delivery:** `gh pr create --base dev`, then `gh pr checks <n> --watch`; one rerun for a known flake. Never merge.
- **Close-out:** the PR's final commits, or a docs-only PR after the merge if the orchestrator says so: merge `origin/dev` and read `index.md` and `lessons.md`; the `## Outcome` block (`Known limits:`, `Open items:`); lessons within the 8 KiB budget; delete `STATUS.md`; `git mv implementations-plan/e2e-clocks-1 implementations-plan/archive/e2e-clocks-1` in its own commit, index line to `archive/index.md`; `bun run check:plans` green after staging.
- **Teardown after the merge** (standing authorization): once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/e2e-clocks-1/plan.md` succeeds, run `agent-worktree done e2e-clocks-1 --merged`; relay a refusal, never force. A `/loop` session checks on every firing; a `/goal` session arms one background wait after its wrap-up report.

## Seeds (draft)

```
/goal Arc 1 of implementations-plan/e2e-clocks-1/plan.md done: Phases 1-4 marked ✓, each gate reported passing in the transcript; the Codex loop (gpt-6.1-sol high) converged before the measurement, quoted; the twelve runs' tables in lessons/phase-3.md; the PR open against dev (gh pr view output).
```

```
/loop 15m Drive arc 1 of implementations-plan/e2e-clocks-1 per its plan.md (plan.md is the state; while detached at P, the run directories are). Next unchecked step, fast gates after each edit, signed commits, one e2e run at a time polled in a bounded loop. Review loop before the measurement. After Phase 4 open the PR, watch checks, report and stop. Never merge.
```

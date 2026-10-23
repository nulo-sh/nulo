---
plan: soak-flakes-1
tier: light
status: planned, Codex approve
issues: "#1101, #1102 (arc 1 closes both)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon in the lead session plus one sonnet sweep; one Codex audit (gpt-6.1-sol, high) and its resumes; one Opus Plan leg
base: origin/dev at 0e4bec132
trunk: dev
post_implementation_hardening: not scheduled
---

# soak-flakes-1: take the re-import and the zero-gap restart out of two soak-red tests

One arc, one PR against `dev`. One product line moves and compiles to the same bytes; the rest is test code. Measurements: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Root causes: reproductions consistent with the reported reds, whose runs kept no decisive state (recon.md)

**#1101.** Initial conditions: `background.ts:114` reads `VITE_NULO_ALLOW_IFRAME_DAPPS` into a module-level const. So the three flag-on tests (`background.transport.test.ts:355-386`) each call `vi.stubEnv` and `vi.resetModules()`, then `await import("./background")` inside the timed body.
- The import re-runs 372 modules and makes 5 or 6 `fetch` RPCs. It takes 290 to 580 ms alone, and 1136 to 1835 ms while the suite holds 162 to 166 forks.
- Every other step stays at 60 ms or under.
- Two reproductions time out the flag-on tests at 5000 ms: CPU contention (one CPU, 40 busy loops), and a 1000 ms delay on each `fetch`, which is deterministic in its counts.

Invariant broken: a test's timed body holds only the work it asserts on. Consequence: a red whenever the import slows past the budget. Which resource starved it in the soak (the fork's CPU, or those RPCs behind a main loop delayed up to 3 s) is unknown, and moot once the import is gone (I1). The issue's question is answered: the import stalls, not the boot or the exchange. The matched control at `0fe71361a` still does not show the stall predates vitest 4.1.12.

**#1102.** Initial conditions: test 2 of `sealed-journal.composition.test.ts` creates `qDead`. It then boots the restarted worker, which takes `bootCutoff = Date.now()`, often in the same millisecond.
- With `createdAt === bootCutoff`, `shouldSkipRecord` (`reaper.ts:250`, `>=`) skips `qDead`, so it stays `simulating`. The poll at line 134 then fails with #1102's exact message.
- Gap 0 came in 39 of 120 iterations alone and 17 of 120 in the suite. Every gap-0 record stayed `simulating`, and every other record was `failed`.
- 240 sweeps ended 1.5 to 24 ms after the unlock, so the slow sweep was not seen (I2).

Invariant broken: the test's restart models a dead worker's records as older than the new cutoff. Consequence: a clock-dependent red.

**The product rule stays (D3, KL-1).** A real restart takes the cutoff after the browser restarted the worker (`runtime.ts:285`). Nothing guarantees a millisecond passed: a backward clock step, or a clock coarser than a restart, can skip a dead record (plausible, not measured). A person would then see the record's stage ("Simulating…", "Proving…") until the minute tick fails it. That happens once its grace window has passed on `updatedAt` (simulating 10 min, proving 35 min, `reaper.ts:73-83`), with the profile unlocked. This is the documented conservative rule (`reaper.ts:242-246`). `>=` must stay: the cutoff is taken before `services.start()`, so a record created in its millisecond can be live. A worker-identity scheme would add persistent state for an unmeasured case.

## Outcome & Quality Bar

For the maintainer running the fail-closed soak before a dependency change, deps-audit-1 next:
- Neither test's outcome depends on how fast its fork evaluates code or where a millisecond boundary falls. The deterministic reproductions are the proof: red on base, green on the fix. The 100-run and 30-run soaks are regression smoke runs; at 1 red in 30, a 30-of-30 pass alone would prove little.
- Each fix states its reason once, in one sentence, at the line it guards.
- Good enough: two test files and one read site. The other in-body re-imports measured ≤ 60 ms in the suite (recon § Reuse map), so they stay.

## Architecture & Implementation

- `apps/extension/src/wallet/services/wallet-sdk/background.ts`: delete the module-level const at `:114`. `admitContentMessage` (`:379`) reads the flag once, before it returns the wrapper: `const allowIframeDapps = import.meta.env?.VITE_NULO_ALLOW_IFRAME_DAPPS === "1"`. The subframe check at `:407` uses it. The JSDoc moves with the read and keeps "build-time, immutable per release", with one clause added: the read sits here so a test can set it with `vi.stubEnv`.
- `background.transport.test.ts`: `withFlag()` becomes synchronous (`vi.stubEnv(...)`, then `boot()`) and serves all three flag-on tests. `boot()` loses its unused `init` parameter. No `vi.resetModules()` or dynamic import remains.
- `sealed-journal.composition.test.ts`, test 2 only:
  - `vi.setSystemTime(Date.now())` at entry, with `vi.useRealTimers()` in a `finally`. With no fake timers this mocks `Date` alone, so `expect.poll` advances nothing (recon § Reuse map).
  - `vi.setSystemTime(Date.now() + 1)` and `const restartedAt = Date.now()` before the restart's `boot(api)`; after `qLive`'s creation, `expect(...createdAt).toBe(restartedAt)`.
  - One comment: a restart's cutoff is strictly later than every record of the dead worker, and a real clock gives no such guarantee within a millisecond.
  - With 1 ms, line 134 pins a record at cutoff − 1 as failed, and line 147 pins one at the cutoff as live: both sides of `>=`.

Mechanics. `handler.initialize()` attaches the wrapper inside `boot()` (`background.ts:203`, `:369`), after the test's `vi.stubEnv`. `background.ts` holds no module-level mutable state (`:114`, `:117` are constants), and the relay is mocked (`:19-23`). So one module instance shared by the file's 25 tests changes nothing the other 22 did not share already.

Alternatives not taken, besides the lane brief's bans (J: a raised timeout, longer poll, retry or smaller pool):
- (B) A second file that sets the env before its static import. It moves the evaluation outside the timer, banned by the lane brief.
- (C) A parameter on `initWalletSdkHandler`: an option for one caller, and a runtime seam the build-time rationale rejects.
- (E) `>` in `reaper.ts`: it would fail a live record created in the cutoff's millisecond. (F) Spin until `Date.now()` moves, or (G) compute a cutoff from the records: neither states the model.
- (H) `vi.useFakeTimers({ toFake: ["Date"] })`: the polls would advance the clock. (I) +1000 ms: it pins only one side of `>=`.

## Phase 1 (arc 1): the flag is read where it is used ✓

1. Branch `soak-flakes-1-a1` off `origin/dev` with the plan commit, and merge `origin/dev` (auto-continue).
2. On base, run four builds and keep `sha256sum` of every `*.js` under `dist/<browser>`: `bun run --cwd apps/extension build` and `build:firefox`, each with the flag unset and with `VITE_NULO_ALLOW_IFRAME_DAPPS=1`.
3. On base, run the fetch-delay copy with `DIAG_FETCH_DELAY_MS=5000`: one fresh vitest invocation per flag-on test (`-t "<its name>"`), 3 rounds. The copy is the test file with the proxy in [lessons/phase-0.md](lessons/phase-0.md) § Fetch-delay proxy appended, uncommitted. Each invocation must time its test out at 5000 ms with ≥ 1 fetch counted.
4. On base, run the contention recipe once (below) and record each flag-on test's time.
5. Make the two changes above.
6. Rerun step 3 on a fresh copy, the same invocations: each green with 0 fetches. Then run that copy's whole file once: 25 of 25 green. Rerun step 4: 25 of 25 green. Each flag-on test must be no slower than the slowest unflagged test that sets up a session, in the same run.
7. Rerun step 2: every hash must equal base. A difference is a finding: stop the arc.

Contention recipe (evidence only): `setsid sh -c 'echo $$ > $0; for i in $(seq 40); do taskset -c 187 sh -c "while :; do :; done" & done; wait' <pgfile> &`. Wait until `<pgfile>` exists, set `PG` from it, check `ps -o pgid= -p $PG` equals `PG`, and `trap 'kill -TERM -- -$PG' EXIT INT TERM`. Run `taskset -c 187 bun --no-install run --cwd apps/extension vitest run src/wallet/services/wallet-sdk/background.transport.test.ts --retry=0 --reporter=verbose`. Then `kill -TERM -- -$PG`, wait for its members to exit, and check `pgrep -g $PG` finds nothing.

Gate: `bun run lint` and `bun run typecheck:all` exit 0. `bun --no-install run --cwd apps/extension vitest run src/wallet/services/wallet-sdk` exits 0. Steps 3, 4, 6 and 7 hold, recorded in `lessons/phase-1.md`. Layers: lint, typecheck, unit, four production builds.

## Phase 2 (arc 1): the restart comes one millisecond after the dead worker

1. Add test 2's mocked `Date` without the +1 step, so the restart lands in the dead worker's millisecond. Run the file 3 times: test 2 must be red each time, at line 134, with `expected 'simulating' to be 'failed'`.
2. Add the +1 step and the `createdAt` assertion. Run the file 3 times: 4 of 4 green each time.

Gate: lint and typecheck exit 0. `bun --no-install run --cwd apps/extension vitest run src/wallet/services/operation-journal` exits 0. Steps 1 and 2 hold, recorded in `lessons/phase-2.md`. Layers: lint, typecheck, unit and composition.

## Phase 3 (arc 1): acceptance at the delivered head, after the Codex loop

Run these on a clean tree at the final commit. A later executable change reruns them. Keep load5 samples (one a minute) under `~/.cache/nulo-backlog/soak-flakes-1/`, and summarize them in `lessons/phase-3.md`.
1. `bun scripts/ci-cd/test-soak/cli.ts soak --cwd apps/extension --runtime node --runs 100 --out ~/.cache/nulo-backlog/soak-flakes-1/files-100.json -- src/wallet/services/wallet-sdk/background.transport.test.ts src/wallet/services/operation-journal/sealed-journal.composition.test.ts`: exit 0, `failedRuns=0`.
2. `bun scripts/ci-cd/test-soak/cli.ts soak --cwd apps/extension --runtime node --runs 30 --out ~/.cache/nulo-backlog/soak-flakes-1/extension-30.json`: exit 0, 30 of 30. A red is a finding: keep its raw report, name the test, stop. Never retry.
3. `bun run test:all`, `bun run lint:actions` and `bun run check:plans` (after staging) exit 0.

Gate: items 1 to 3 pass, and each soak summary binds the head SHA with `gitDirty` false.

## UI impact

None: every bundle is byte-identical to base (Phase 1 step 7).

## Security & Adversarial Considerations

The subframe check is a trust boundary: a cross-origin iframe must not inherit its parent page's grants (`background.ts:385-406`). D1 keeps the policy a build-time literal, and Phase 1 step 7 proves it: each build's JS is byte-identical to base, both browsers, flag unset and set. Tests still cover both sides: a subframe dropped with the flag off (`:146`), and with it on a same-origin subframe connecting and a cross-origin one refused (`:362-374`). No dependency, permission, secret or stored shape changes. The diag copies and busy loops are uncommitted and owned by their process group.

## Assumptions

Facts:
- F1. `background.ts:114` is that module's only read of the flag, used only at `:407`. The test mocks the relay (`:19-23`).
- F2. In vitest 4.1.10, `vi.resetModules()` keeps fetched code and resets evaluation. With fake timers on, `expect.poll` and `vi.waitFor` advance them each attempt. `vi.setSystemTime` with fake timers off mocks `Date` alone.
- F3. The D1 trial edit builds byte-identical JS to base in four builds (recon).
- F4. Test 2 is the file's only test whose outcome depends on the cutoff. Tests 1 and 3 restart over terminal records only, and test 4 has no restart.

Inferences:
- I1 (moderate). The soak's 5 s stall was this import under a starved fork CPU or queued RPCs; the split at 160+ forks is unmeasured.
- I2 (high). #1102's red was the gap-0 path: its 2128 ms run (about 1000 ms over its siblings) and its message match, and no sweep took over 24 ms.

Asks: none for the owner.

## Decision ledger

| Id | Decision | Rejected | Why |
|---|---|---|---|
| D1 | #1101: the flag is read in `admitContentMessage`; tests stub it with no re-import | B, C, J; a read per message (more reads, same result) | Removes the re-evaluation instead of moving it; bundles byte-identical |
| D2 | #1102: mock `Date` alone in test 2; restart at +1 ms; assert `qLive.createdAt` | E, F, G, H, I, J | States the restart's precondition; pins both sides of `>=` on every run |
| D3 | No product change; KL-1 at close-out | E, a worker-identity scheme | Unmeasured clock conditions; the minute tick bounds the wait; identity adds persistent state |
| D4 | Deterministic reproductions are the proof; soaks are smoke runs | soaks as proof | 30/30 passes 36% of the time with nothing fixed, at 1 red in 30 |

## Delivery

One PR against `dev`, opened ready after Phase 3 and an `origin/dev` merge. No label: `apps/extension/**` trips both e2e lanes on both browsers. No e2e scenario changes.
- Title: `test(extension): drop the re-import and zero-gap restart behind two soak reds` (77 characters).
- Body: both mechanisms with their numbers, the reproductions, the soaks with load5, `UI impact: none`, `Closes #1101`, `Closes #1102`.
- The close-out lands as the PR's final commits.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at `246c8851b`, once over the arc's diff, after Phase 2 and before Phase 3. `code_review: off`.
- Codex loop: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; prompts under `~/.cache/nulo-backlog/soak-flakes-1/`. Hard stop at three rounds. One Opus diff review beside round 1. Log rounds in `lessons/phase-2.md` and under Audit verdicts.
- Close-out: the standard's step 4. Add one `lessons.md` line, deduped and within budget: a re-import in a test body times the graph's evaluation; a test restart needs a strictly later clock. File KL-1 closed as not planned with the `known-limit` label. Its reopening condition: a report of a record left in progress past its grace window after a restart, or a supported browser whose `Date.now()` is coarser than a worker restart.
- Teardown after the merge: `agent-worktree done soak-flakes-1 --merged`.

## Audit verdicts

- Codex round 1 (gpt-6.1-sol, high): conditional approve, six findings, all accepted. The key one: fake timers advance `Date` in polls, so D2 moved to `vi.setSystemTime` alone. Detail: [lessons/phase-0.md](lessons/phase-0.md).
- Opus Plan leg: conditional approve, nine findings, all accepted, with +1 ms (I) over +1000.
- Codex round 2 (resumed): conditional approve; two diagnostic fixes accepted (the loops' pgid read from their own leader; one vitest invocation per timed-out probe). Round 3: **approve**.

## Seeds

`/goal`: `/goal Phases 1-3 of implementations-plan/soak-flakes-1/plan.md are ✓, each backed by its gate in the transcript (lint, typecheck:all, the fetch-delay copy red on base and green on the fix, the contention run, four builds byte-identical to base, test 2 red with the zero-gap restart and green at +1 ms, 100/100 of both files and 30/30 of the extension through the soak's Node reference at the delivered head, test:all, lint:actions, check:plans); code_review is off and /code-review was not run; the Codex loop converged (a resumed pass with no new material finding, quoted); the PR closing #1101 and #1102 exists, opened after Phase 3.`

`/loop`: `/loop 15m Drive implementations-plan/soak-flakes-1 forward; never idle. If the plan directory is gone, git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/soak-flakes-1/plan.md: success means merged, so run agent-worktree done soak-flakes-1 --merged and stop; failure means delivered, so watch the PR's checks. Otherwise run the next phase's gate, then Post-implementation. Never merge; never retry a red soak. The same step failing 3 times ends the arc as ARC_FAILED.`

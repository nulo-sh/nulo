---
plan: e2e-tmp-3
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 6da033705
trunk: dev
issues: "#1076 (A1 closes it); #1077 (filed in recon, A1 closes it, D2); #1078 (filed in recon, no arc: other runner and workspace)"
post_implementation_hardening: not scheduled
status: approved by Codex r3 (auto-continue); A1 phase 1 green, review loop
---

# e2e-tmp-3: `test:release` leaves three temp dirs per run

One arc, one PR against `dev` (the orchestrator's D-orch-1, no stack). Each dir is made where it is used and removed by what made it. The two opt-in probes make theirs in their block's `beforeAll`, which a skipped block never runs, and keep the `afterAll` that removes it; tag-by-hand's runner test kills its runner and then removes the fake-tools dir through `onTestFinished`. The proof is a run-level count under a scratch `TMPDIR`: 3 on the base, 0 after, and an opt-in run of each probe that leaves nothing. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## The claims and what did not hold

- **#1076** holds: `attach-assets-run.test.ts:406` and `verify-provenance.test.ts:15` make a dir in a `describe.skipIf` body, and the removing `afterAll` (`:407`, `:17`) is in the skipped block. Bun 1.4.2 runs the body and no hook (probe, [recon.md](recon.md#hook-rules-probed-scratch-files-outside-the-repo)).
- **#1076 is incomplete**: the same `test:release` run leaves a third dir, `tag-by-hand-*`, which nothing removes (`tag-by-hand-run.test.ts:182`). Filed as #1077; D2 folds it in.
- **Lane brief, "whether e2e-tmp-2's `testTempDir` helper fits a `bun test` file"**: it does not. It is a vitest module under `apps/extension/tests/e2e/helpers/`, and a root `scripts/` test may not import an app's test tree. Bun's own hooks do the job (D1).

## Outcome & Quality Bar

- **For whom:** an agent or contributor who runs `bun run test:release` many times a day on a shared host.
- **Excellent:** (1) after any `test:release` run with the probes off, pass or fail, the run's `TMPDIR` holds nothing the tests made (the runtimes' `node-compile-cache` excepted, recon); (2) the opt-in probes still run as before, their dir is made only when they run, and it lives exactly as long as on the base.
- **Good enough:** a `bun test` process killed by a signal leaves the dir of the test or block it was in (the class of the closed known limit #1075). An opt-in release probe whose download outlives its describe can rewrite its dir after the `afterAll`, as on the base (known limit #1079).

## UI impact

None. Three root `scripts/` test files change; no extension, landing or playground source. No orchestrator no-ask record applies.

## Architecture & Implementation

- **The two probes** (`verify-provenance.test.ts:15-22`, the dir shared by four tests through the packed tarball; `attach-assets-run.test.ts:406-407`, the dir read by the first probe test): `let dir = ""` at describe level, `dir = mkdtempSync(…)` as the first statement of a `beforeAll` (the existing one in `verify-provenance`, a new one in `attach-assets-run`), the `afterAll` unchanged. A skipped block runs neither hook; a running block keeps the base's lifetime, so a timed-out download that finishes during the next test still writes into a live dir. Bun runs the `afterAll` after a throwing `beforeAll` (probe), so a failed `npm pack` still removes the dir. `attach-assets-run`'s `bun:test` import gains `beforeAll`.
- **`tag-by-hand-run.test.ts`** (`fakeTools()`, one caller): `fakeTools()` is unchanged. Right after the test's `Bun.spawn` (`:216`), the test registers `onTestFinished(async () => { child.kill("SIGKILL"); await child.exited; rmSync(dir, { recursive: true, force: true }) })`. The order matters: on a timeout Bun sends the runner SIGTERM and then runs the hook; the runner traps SIGTERM and goes on to `close()`, which runs `gh api -X PUT …/rulesets/…` through `PATH` (`tag-by-hand-run.ts:50`, `:241-246`). A dir removed while the runner lives would hand it the real, logged-in `gh` (Opus r1, probed in parts). After a pass the runner has exited, and the kill does nothing. `onTestFinished` and `rmSync` join the imports.
- **Comments.** One line at each probe site, since moving the call back into the body would pass every gate but the count: `// A skipped describe runs its body but no hook: the dir is made in one.` One line at the tag-by-hand hook: `// The runner traps SIGTERM and goes on to close: kill it before its fake gh and git leave PATH.`
- **Not taken.** (a) A shared helper for root script tests (`scripts/ci-cd/plans/fixture-repo.ts` has a one-purpose one): three sites, two idioms Bun already has. (b) `onTestFinished` in `attach-assets-run`'s probe test: it removes the dir as the test times out, while a download (300 s abort, `attach-assets-run.ts:442-449`, which recreates the parent dir) may still finish and recreate it during the next test (probe: a late continuation left its dir); the base's `afterAll` lifetime does not widen that window. (c) `try/finally` in the tag-by-hand test, the dominant idiom in `scripts/` (23): in a timed-out test it runs only when the pending await settles, during a later test or never (Opus probe); `onTestFinished` runs at the timeout. (c2) The removal inside `fakeTools()`: it cannot see the child, so it would run before the runner is dead. (d) A committed self-test that runs `bun test` on the three files under its own `TMPDIR`: every `test:release` run would pay a nested runner to re-prove three files, and it would not catch a new file with the same fault; e2e-tmp-2 rejected the same shape. (e) A static guard on `mkdtempSync` in a describe body: 48 `mkdtempSync` calls in 20 script test files, and the run-level count found no other residue in `test:release`; a guard is a separate decision.

## Decision ledger

| # | Question | Decision |
|---|---|---|
| D1 | Where each dir is made | each probe's dir in its block's `beforeAll`, removed by the `afterAll` it already has: the base's lifetime, minus the skipped-body run (Codex r1). The fake-tools dir: removed by the test's `onTestFinished`, after it kills and awaits the runner (Opus r1) |
| D2 | #1077 (tag-by-hand) in this arc | folded in: the same command, the same consequence, a few lines; the run-level count of `test:release` is this lane's proof and cannot read 0 without it. A separate lane would cost a plan, two audits and a PR for a few lines |
| D3 | The proof | the run-level count, red on base (3) and green after (0), plus an opt-in run of each probe as the success control (D5). No committed self-test (Not taken d); the PR body says so |
| D4 | #1078 (two vitest files, non-Linux hosts) | no arc: another runner, workspace and platform, not reachable from this host; filed for its own lane |
| D6 | Deviation: step 4's skip count | 11, not 10. Bun 1.4.2 reports each hook of a skipped describe as a skipped entry, and `attach-assets-run`'s block gains a `beforeAll` (base 3 skipped, after 4; total 351 → 352). No test was added or skipped; the tree wins |
| D5 | The release probe's opt-in run | run with `GH_TOKEN` unset (Opus r1): `realIO` then sends an empty bearer token, GitHub refuses, and the block's hooks still run, so the count proves the moved dir is made and removed. An agent does not move a credential into a command, so its passing path is not run |

## Security & Adversarial Considerations

- **A real write from a unit test.** The tag-by-hand test runs the real runner with fake `gh` and `git` first on `PATH`. If those fakes leave `PATH` while the runner lives, its SIGTERM path reaches the owner's logged-in `gh` and writes the tag ruleset. D1 orders the hook (kill, await, then remove) so this cannot happen; the base never removes the dir, so the hazard exists only in a naive fix. No attacker capability is involved; CI jobs carry `contents: read`.
- **Threat model.** Test-only code on developer hosts and CI runners. `mkdtempSync` makes each dir 0700; same-user processes are already trusted. `rmSync` takes only the path `mkdtempSync` returned in the same scope. The probe dirs hold a public npm tarball or a public release's `SHASUMS256.txt`; the fake-tools dir holds two shell stand-ins and their call log.
- **Gates.** No assertion, timeout, retry or skip condition changes; no suppression. The probes stay opt-in on the same env vars.
- **Input validation, crypto, least privilege, supply chain.** No new input, key, permission or dependency. No token is read or passed (D5); the release probe runs with `GH_TOKEN` unset.

## Assumptions

**Facts:** F1 the two probe sites and their `afterAll`s (`attach-assets-run.test.ts:403-424`, `verify-provenance.test.ts:14-57`). F2 Bun 1.4.2: a skipped describe's body runs, its hooks and tests do not; `onTestFinished` runs after a pass, a failed assertion and a timeout, and throws outside `bun test`; `afterAll` runs after a throwing `beforeAll`; a timed-out test's continuation keeps running and can recreate a removed dir; on a timeout Bun sends the test's child processes SIGTERM before it runs `onTestFinished` (recon and Opus probes). F3 `test:release` on the base leaves 3 dirs under a scratch `TMPDIR` (recon). F4 no workflow sets either probe var; `test:release` runs in `_unit-tests.yml:38` and `publish-packages.yml:63`. F5 `typecheck:scripts` (`tsc -p scripts/tsconfig.json`, `include: **/*.ts`) types the three files. F6 the provenance probe passes opt-in on the base in 15 s and leaves nothing.
**Inferences:** I1 `node-compile-cache` is the runtimes' compile cache: each fresh `TMPDIR` gets one, and runs under one `TMPDIR` reuse it. The tests do not make it, so the count excludes it by name; removing the scratch dir removes it.
**Asks:** none. [OWNER-ASKS.md](OWNER-ASKS.md) says why.

## Phases

### Arc A1 (branch `worktree-e2e-tmp-3`, from the `origin/dev` head at its start)

**Phase 1 — the three dirs and the proof.** ✓ (2026-10-22, [lessons/phase-1.md](lessons/phase-1.md)) Do these steps in order. Use scratch dirs under `~/.cache/nulo-backlog/e2e-tmp-3/`.
1. Merge `origin/dev` into the branch. Make an empty scratch dir `t0`.
2. Before any edit, run `env -u NULO_RELEASE_PROBE -u NULO_PROVENANCE_PROBE TMPDIR=$T0 bun run test:release`. Count with `find "$T0" -mindepth 1 -maxdepth 1 ! -name node-compile-cache | wc -l` (expect 3).
3. Make the three edits (Architecture).
4. Repeat step 2 under an empty `t1` (expect 0).
5. Run `NULO_PROVENANCE_PROBE=1 TMPDIR=$T2 bun test scripts/publish/verify-provenance.test.ts` under an empty `t2`. Count as in step 2 (expect 0).
6. Run `env -u GH_TOKEN NULO_RELEASE_PROBE=1 TMPDIR=$T3 bun test scripts/release/attach-assets-run.test.ts` under an empty `t3`. Count as in step 2 (expect 0). Record which tests failed.
7. Remove `t0` to `t3`.

Gate: step 2 prints 3 and step 4 prints 0, each run exit 0 with 0 failed and 10 skipped tests. Step 5 exits 0 with 4 passed tests and prints 0. If step 5 fails, read the printed stderr: a DNS, registry, `npm pack` or `gh` login error is rerun once and recorded; any other failure is breakage. Step 6 exits non-zero and prints 0: both probe tests fail with `HTTP 401` (GitHub refuses the empty token in `releasesFor` and in `attested`), and every other test passes; any other failure is breakage. `bun run lint`, `bun run typecheck:all` and `bun run test:ci-gating` exit 0.

**Phase 2 — close-out.** As Post-implementation. Gate: `bun run lint`, `bun run typecheck:all`, `bun run test:all` and `bun run check:plans` after staging exit 0, and the Phase 1 step 4 count on the final head prints 0. `test:all` runs no root `scripts/` test; the count is this diff's proof.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `6da033705`; step 1 absent (`code_review: off`). After Phase 1: the Codex loop over the arc's diff against its merge base with `origin/dev` (`~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`), the two verbatim rules in every prompt, hard stop at three rounds; one Opus review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1; each round in `lessons/phase-1.md` and § Audit verdicts. A fix reruns Phase 1's gate. Then the PR, then the close-out as its final commits: merge `origin/dev` first and read what changed in `index.md` and `lessons.md`; the Outcome (`Known limits:` #1079; #1075 already covers killed workers; `Open items:` #1078); a lessons pass (the skipped-body rule is a candidate if the 8 KiB budget allows; dedupe first); `STATUS.md` deleted; `git mv` into `archive/` in its own commit, index line moved to `archive/index.md`. Teardown once `implementations-plan/archive/e2e-tmp-3/plan.md` is on `origin/dev`: `agent-worktree done e2e-tmp-3 --merged`.

## Delivery

| Arc | Phases | Base | PR title (≤ 93) | Issues |
|---|---|---|---|---|
| A1 | 1, 2 | the `origin/dev` head at its start, `origin/dev` merged before its gates | `test(release): the release-script tests leave no temp dir behind` (63) | Closes #1076, Closes #1077 |

Opened ready, without labels, after the loop converges; no e2e label (nothing under `apps/extension` changes). The body states the 3 → 0 count, both probes' opt-in runs, D3's departure from a committed self-test, the kill-before-remove order (D1), and that no e2e scenario is added or changed. Parallelism: none.

## Audit verdicts

- **Codex r1** (gpt-6.1-sol, high, session `01a164fc`): **conditional approve**. Kept D2, D3, D4, D5, the probe-site comment (shortened). Accepted: a timed-out release-probe test whose download finishes later can recreate a dir `onTestFinished` already removed (probed: demonstrated), so both probes keep the base's `afterAll` lifetime (D1) and the remaining window, which the base has too, is the closed known limit #1079; `node-compile-cache` is runtime output under each fresh `TMPDIR`, not proof of one per host (I1 reworded); the failure paths needed probes (an ordinary failed assertion runs `onTestFinished`; a throwing `beforeAll` still runs `afterAll`; both done in planning, F2).
- **Opus 5.5 r1** (Plan): **conditional approve**. Kept D2, D3, D4, create-then-register at the probes. Accepted: on a timeout Bun SIGTERMs the runner and then runs `onTestFinished`; the runner traps SIGTERM and runs `close()` through `PATH`, so removing the fakes first would reach the owner's real `gh` (probed in parts; trace `tag-by-hand-run.ts:50,241-246`): the hook now kills and awaits the runner before it removes the dir (D1, Security); `finally` in a timed-out test runs late or never (Not taken c); the skip count is 10; `test:all` runs no root script test; step 5's rerun rule reads the stderr; the release probe runs with `GH_TOKEN` unset (D5; GitHub answers 401 to an empty bearer token, checked).
- **Codex r2** (resumed `01a164fc`): **conditional approve**. Verified the kill, await, remove order (once `child.exited` resolves the runner starts no command; a fake script already running does not switch to the real `gh`), the probes' lifetime, I1, the gates. Accepted: with `GH_TOKEN` unset both probe tests fail with `HTTP 401`, since `attested` also calls the REST API (`attach-assets-run.ts:430-433`; step 6's criterion fixed); the close-out names #1079. Rejected: the fake `gh`'s `sleep 30` descendant may outlive a timed-out test; it is not a defect (it ends itself within 30 s, writes nothing that recreates the dir, reaches no real tool), and the base behaves the same.
- **Codex r3** (resumed `01a164fc`): **approve**. Both round-2 conditions verified; no new finding or regression; the descendant disposition stands.
- **The one divergence**: Codex r1 placed the fake-tools removal in `fakeTools()` after `mkdtempSync`; Opus showed that placement removes the fakes before the runner is dead. Opus's order taken.

## Seeds

- `/goal` Phases 1–2 marked ✓ in implementations-plan/e2e-tmp-3/plan.md, each with its gate's output in the transcript; the Codex loop converged (a resumed pass with no new material finding quoted); PR `test(release): the release-script tests leave no temp dir behind` open against `dev`; `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/e2e-tmp-3: read plan.md and lessons/, run the next phase and its gate, tick it, run the Codex loop, open the PR, write the close-out; never merge.

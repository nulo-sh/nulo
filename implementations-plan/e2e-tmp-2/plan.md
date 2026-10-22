---
plan: e2e-tmp-2
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 6da033705 (carries e2e-tmp-1, #1074)
trunk: dev
issues: "#1071 (A1 closes it); #1076 (filed in recon, no arc: other owner)"
post_implementation_hardening: not scheduled
status: approved by Codex r3 (auto-continue); A1 implementing
---

# e2e-tmp-2: the stage-log cases leave three temp dirs per smoke run

One arc, one PR against `dev` (the orchestrator's D-orch-1, no stack). The dir half of `writeBackupToTemp` becomes `testTempDir(prefix)`: a dir under `os.tmpdir()` that the calling test owns through `onTestFinished`. The three stage-log cases take their dirs from it. The self-test proves the owner; the unmodified file leaves 3 `nulo-stage-log-*` dirs under a scratch `TMPDIR` and the changed file and each smoke run leave 0. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## The claims and what did not hold

- **#1071** holds as written: three `mkdtempSync` calls (`import-stage-timing.test.ts:204, 214, 231`), an `afterEach` (`:193-198`) that only restores env vars, the file in the smoke selection. The host count is now 159. Nothing reads the dirs after their case ([recon.md](recon.md#readers-of-the-stage-log-dir)).
- **Lane brief, "the way e2e-tmp-1 landed it, or the sibling cleanup in the same file"**: D1 takes the first, by sharing e2e-tmp-1's owner rather than copying it.
- **Lane brief, "red on base and green after, under a scratch `TMPDIR` that must hold no `nulo-stage-log-*` dir after the file runs"**: the committed self-test proves the owner, and the file's proof is the run-level count, not a committed test (D2). The PR body says so.

## Outcome & Quality Bar

- **For whom:** an agent or contributor who runs the smoke suite many times a day on a shared host.
- **Excellent:** (1) after any smoke run, on either browser, pass or fail, at any retry count, no `nulo-stage-log-*` dir remains under the run's `TMPDIR`; (2) one owner primitive for a test's temp dir, proven once, so the next test that needs a dir has one to take.
- **Good enough:** a worker killed by a signal leaves the dir of the case it was running (the class of the closed known limit #1075).

## UI impact

None. Test code and a harness self-test only; no extension source changes. No orchestrator no-ask record applies.

## Architecture & Implementation

- **The primitive.** `tests/e2e/helpers/backup-temp.ts` is renamed `helpers/test-temp-dir.ts` (D3) and gains `testTempDir(prefix: string): string`: `let dir`; `onTestFinished(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })`; `dir = mkdtempSync(join(tmpdir(), prefix))`; return it. The TSDoc moves to it, unchanged in substance: the dir lives until the calling test's attempt ends, pass or fail; never keep the path past it; with no current test it throws before creating anything; not for concurrent tests. `writeBackupToTemp(content, filename)` keeps its signature and becomes `join(testTempDir("nulo-e2e-backup-"), filename)` plus the write. `import-drivers.ts:44` re-exports from the new path; no caller changes.
- **The cases.** In `import-stage-timing.test.ts` the three `mkdtempSync(join(tmpdir(), "nulo-stage-log-"))` become `testTempDir("nulo-stage-log-")`, imported from `./helpers/test-temp-dir` (a light module; `import-drivers.ts` would pull the fixture graph). `mkdtempSync` and `tmpdir` imports go; `join` stays for the nested missing path. The `afterEach` env restore is unchanged; vitest runs it before the removal, which reads no env.
- **The self-test.** `scripts/e2e/backup-temp.test.ts` is renamed `scripts/e2e/test-temp-dir.test.ts`. Its scratch `TMPDIR` root, its restore and its recorded-path checks stay. `testTempDir` takes the self-test's own prefix, `nulo-test-temp-dir-` (a caller's prefix would claim a guarantee about that caller's file that the case does not give). Its cases: the refusal outside a test (no such dir under the root); a pass control (the dir exists, is empty, sits directly under the root; its path recorded); that path gone after the test; a `test.fails` case that records its path, then throws; that path gone too. `writeBackupToTemp` keeps its control (content under the given name in a `nulo-e2e-backup-*` dir under the root, path recorded) and one "gone" case. Seven cases, one an expected fail; prefix counts only supplement the per-path checks.
- **Mutation check.** Give `testTempDir` the body the stage-log cases have on the base, `mkdtempSync(join(tmpdir(), prefix))` alone, and run the self-test: exactly four cases fail (the refusal, both `testTempDir` "gone" cases, the `writeBackupToTemp` "gone" case), every control passes. Stage the finished helper (`git add`) before the mutation; after restoring the body, `git diff --exit-code -- apps/extension/tests/e2e/helpers/test-temp-dir.ts` (worktree against index) is clean. The literal base proof is the file itself: unmodified, under a scratch `TMPDIR`, it leaves 3 `nulo-stage-log-*` dirs; changed, 0.
- **Not taken.** (a) A local `stageLogDir()` in the describe: a second copy of the register-then-create idiom, which no self-test can reach from outside the file. (b) The describe's `afterEach` removing a tracked `let dir`: shared mutable state per case, a second owner idiom beside e2e-tmp-1's. (c) A unit self-test that runs the file in a nested vitest under its own `TMPDIR`: feasible (the file imports only `node:*` and vitest, vitest 4.1.10 takes `--no-config`, and `scripts/e2e/stall-watchdog.test.ts` spawns a nested vitest), but every `bun run test` would pay a child vitest for one file's hygiene, a load-sensitive case on a shared host; the run-level count gives the same evidence on the PR. (d) A static guard on raw `mkdtempSync(join(tmpdir()` in e2e files: 24 sites today, most removed in a `finally` or `afterAll`; a guard is a separate decision.

## Decision ledger

| # | Question | Decision |
|---|---|---|
| D1 | Who owns each stage-log dir | the case that made it, through `testTempDir`, the dir half of e2e-tmp-1's owner. One idiom in one place, already proven; a helper that removes a copy |
| D2 | The proof | the self-test on the primitive, with its own prefix (red under the mutation, green after), and the run-level count: the unmodified file leaves 3 dirs under a scratch `TMPDIR`, the changed file and each full smoke run leave 0. No committed test of the file itself (Not taken c); a departure from the brief's literal reading, stated in the PR body |
| D3 | Module name | rename `backup-temp` to `test-temp-dir` (helper and self-test, `git mv`): the module's first export is no longer about backups. Two import lines change |
| D4 | e2e scope | the whole smoke suite at retry 0, Chrome then Firefox, each under a scratch `TMPDIR` (lane brief). No local network run: the extraction keeps `writeBackupToTemp`'s order (register, create, write), smoke calls it at 18 sites in 10 files, and the PR's network workflows run on any `apps/extension/**` change |
| D5 | Killed workers | accepted residue under the closed known limit #1075 (its class: a killed worker skips `onTestFinished`); no new issue |
| D6 | The neighbour leak in `test:release` | #1076, filed in recon; other owner, no arc |

## Security & Adversarial Considerations

- **Threat model.** Test-only code on developer hosts and CI runners. The dirs hold synthetic stage-log records. `mkdtempSync` makes each dir 0700; same-user processes are already trusted by the harness. `rmSync` takes only the path `mkdtempSync` returned in the same call.
- **Gates.** No assertion, timeout or retry changes; no suppression; the smoke suite's scenarios are unchanged.
- **Input validation, crypto, least privilege, supply chain.** No new input, key, permission or dependency.

## Assumptions

**Facts:** F1 the three dirs and the inert `afterEach` (`import-stage-timing.test.ts:193-235`). F2 vitest 4.1.10 runs `onTestFinished` hooks per attempt after `afterEach`, then resets them (`chunk-artifact.js:2973-2990`); the imported `onTestFinished` throws only with no current test (`:910-918`); from `beforeEach` or `afterEach` it registers and runs; called from inside an `onTestFinished` callback it registers after the snapshot and is dropped, so that dir would stay (no caller does this; the TSDoc promises nothing there). F3 smoke retries twice by default (`vitest.e2e.config.ts:30`). F4 nothing reads a `nulo-stage-log-*` dir after its case; CI sets no stage-log env (recon). F5 only `import-drivers.ts:44` and the self-test import `backup-temp` (`git grep`). F6 Bun and Node `os.tmpdir()` follow `TMPDIR` at call time (e2e-tmp-1, F5).
**Inferences:** none left; the rename (D3) is a naming choice both reviewers accepted.
**Asks:** none. [OWNER-ASKS.md](OWNER-ASKS.md) says why.

## Phases

### Arc A1 (branch `worktree-e2e-tmp-2`, on `origin/dev` at `6da033705`)

**Phase 1 — the primitive, the cases, the self-test.** Do these steps in order.
1. Build the armed Chrome build: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`.
2. Before any edit, run the file under an empty scratch `TMPDIR=~/.cache/nulo-backlog/e2e-tmp-2/t0`: `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/import-stage-timing.test.ts --retry=0`. Count `nulo-stage-log-*` in it (expect 3).
3. `git mv` the helper and the self-test; add `testTempDir`; write the self-test cases; change the three cases and the re-export.
4. Run the mutation check (Architecture), then restore the body.
5. Repeat step 2 under `t1`; then remove `t0` and `t1`.

Gate: step 2 prints 3 and step 5 prints 0, each run exit 0; in step 4 exactly the four named cases fail and the file-scoped `git diff --exit-code` is clean after the restore; `cd apps/extension && bun --bun vitest run scripts/e2e/test-temp-dir.test.ts` passes every case (one expected fail); `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all` exit 0.

**Phase 2 — the smoke gates.** Run the whole smoke suite at retry 0, Chrome then Firefox, one run at a time, each under its own empty scratch `TMPDIR` (`~/.cache/nulo-backlog/e2e-tmp-2/s<n>`, short for socket paths). Chrome: the build from Phase 1, then `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- --retry=0`. Firefox: the same armed build with `build:firefox`, then the same command with `NULO_E2E_BROWSER=firefox`. Poll each log in a bounded loop. A red is diagnosed first: rerun that file alone at retry 0 and record both results; a solo pass proves nothing, since the changed helper reaches unchanged files. A red that an open `flake` issue names earns one rerun of the whole suite; any other red is breakage and gets a fix. Gate: a whole suite at retry 0 exits 0 with no failed test; afterwards `find "$TMPDIR" -maxdepth 1 \( -name 'nulo-stage-log-*' -o -name 'nulo-e2e-backup-*' \) | wc -l` prints 0; record each wall-clock (before: Chrome 31 min, Firefox 50 min, e2e-tmp-1's runs on this host); then remove the scratch dir.

**Phase 3 — close-out.** As Post-implementation. Gate: `bun run lint`, `bun run test:ci-gating`, and `bun run check:plans` after staging exit 0.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `6da033705`; step 1 absent (`code_review: off`). After Phase 2: the Codex loop over the arc's diff against `6da033705` (`~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`), the two verbatim rules in every prompt, hard stop at three rounds; one Opus review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1; each round in `lessons/phase-1.md` and § Audit verdicts. A fix that changes the helper or the file reruns Phase 1's gate, and Phase 2's when a smoke file changes. Then the PR, then the close-out as its final commits: merge `origin/dev` first and read what changed in `index.md` and `lessons.md`; the Outcome (`Known limits: none`, #1075 already covers killed workers; `Open items:` #1076); a lessons pass; `STATUS.md` deleted; `git mv` into `archive/` in its own commit, index line moved. Teardown once `implementations-plan/archive/e2e-tmp-2/plan.md` is on `origin/dev`: `agent-worktree done e2e-tmp-2 --merged`.

## Delivery

| Arc | Phases | Base | PR title (≤ 93) | Issues |
|---|---|---|---|---|
| A1 | 1, 2, 3 | `origin/dev` at `6da033705` | `fix(e2e): a stage-log dir a test makes lives until that test finishes` (69) | Closes #1071 |

Opened ready, without labels, after the loop converges; then add `e2e:extension-smoke` only if the path filter skips smoke. The body states the red/green self-test, the 3 → 0 count on the file, each smoke run's wall-clock and residue count, and that no e2e scenario is added or changed. Parallelism: none.

## Audit verdicts

- **Codex r1** (gpt-6.1-sol, high, session `01a164cf`): **conditional approve**. Kept A over B, D3, D4 (on semantic equivalence, not the shared worker), D5. Accepted: F2 conflated the imported hook with the context guard (a call from inside an `onTestFinished` callback is dropped silently; from `beforeEach`/`afterEach` it works); the mutation fails four cases, not three (`writeBackupToTemp`'s "gone" too); keep the per-path checks; 18 smoke call sites, not 17. Held: the stage-log prefix in the self-test is sound input (overruled below).
- **Opus 5.5 r1** (Plan): **conditional approve**. A over B. Accepted: the same four-failure correction and F2; a neutral prefix for the primitive's cases, since the stage-log prefix proved nothing about the file (a raw `mkdtempSync` put back in the file leaves the self-test green); Not taken (c)'s premise was wrong (the file needs no build, `--no-config` exists), so (c) is now rejected on cost, and D2 states the departure from the brief; a flake rule and the "before" wall-clock for Phase 2; `git diff --exit-code` after the mutation. Confirmed `bun run test:e2e -- <file> --retry=0` runs one file at retry 0 (Bun strips the `--`), and the PR's network workflows run on `apps/extension/**`.
- **Codex r2** (resumed `01a164cf`): **conditional approve**. Verified F2, the four failures, the per-path checks, D4; accepted the neutral prefix; did not reopen D2. Accepted: the Phase 2 flake rule weakened the gate (a solo pass of an unchanged file that the changed helper reaches proves nothing): a solo rerun is now diagnostic only, a red an open `flake` issue names earns one whole-suite rerun, the gate stays a whole suite at retry 0; the mutation's `git diff` needed a baseline after `git mv` and the edits: the helper is staged first and the diff is worktree against index.
- **Codex r3** (resumed `01a164cf`): **approve**. Both round-2 fixes verified; no new finding.
- **Prefix (the one disagreement)**: Opus's neutral prefix taken. Codex's point stands (no production coupling), but a case named for one caller reads as a guarantee about that caller's file, which only the run-level count gives.

## Seeds

- `/goal` Phases 1–3 marked ✓ in implementations-plan/e2e-tmp-2/plan.md, each with its gate's output in the transcript; the Codex loop converged (a resumed pass with no new material finding quoted); PR `fix(e2e): a stage-log dir a test makes lives until that test finishes` open against `dev`; `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/e2e-tmp-2: read plan.md and lessons/, run the next phase and its gate, tick it, run the Codex loop, open the PR, write the close-out; never merge.

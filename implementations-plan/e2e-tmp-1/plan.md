---
plan: e2e-tmp-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 5c35ca934
trunk: dev
issues: "#1064 (A1 closes it); #1071 (filed in recon, not this lane's scope)"
post_implementation_hardening: not scheduled
---

# e2e-tmp-1: every backup a test imports leaves a temp dir behind

One arc, one PR against `dev` (the orchestrator's D-orch-1, no stack). `writeBackupToTemp` registers the removal of its own dir on the test that called it, through vitest's `onTestFinished`; called outside a test it throws before it writes. Every caller is covered without an edit, and a unit self-test proves the dir is gone after a passing and after a failing test. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## The claims and what did not hold

- **#1064, the helper and the leak:** holds. `import-drivers.ts:588-593` makes a `nulo-e2e-backup-*` dir per call and nothing removes it; no teardown or `e2e:reap` looks under `os.tmpdir()`. This host held 1,334 again at 15:2xZ on 2026-10-22, hours after the morning's removal.
- **#1064, the callers:** **did not hold.** It names five call sites; there are 25 in 17 files, and two more test files reach it through `crash-truth.ts`'s `exportFundedBackup`, whose cached path two network tests share. Eight of the 18 test files are network files, and one (`profile-reimport-matrix`) already removes its dir ([recon.md](recon.md#callers-of-writebackuptotemp-25-call-sites-17-files)).
- **Lane brief, "a run writes under its run dir, never under `/tmp`":** the smoke suite has no run dir, and the network run dir belongs to the sandbox, which a reused lock keeps across vitest runs (`global-setup.ts:328`). See D1 and D2.

## Outcome & Quality Bar

- **For whom:** an agent or contributor who runs the e2e suites many times a day on a shared host.
- **Excellent:** (1) after any run, passing or failing, on either browser and either suite, no `nulo-e2e-backup-*` dir remains under the run's `TMPDIR`; (2) a new caller cannot leak: the helper refuses to write outside a test, and no caller writes cleanup code.
- **Good enough:** a test process killed by a signal (the stall watchdog, an OOM, Ctrl-C) leaves the dirs of the test it was running; each holds one backup of a few KB.

## UI impact

None. Test helpers and a harness self-test only; no extension source changes.

## Architecture & Implementation

- **The owner.** `writeBackupToTemp(content, filename)` keeps its signature and return value, and moves to `tests/e2e/helpers/backup-temp.ts`, re-exported from `import-drivers.ts` (D7). Its body: `let dir`; `onTestFinished(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })`; then `mkdtempSync(join(tmpdir(), "nulo-e2e-backup-"))` and `writeFileSync`. Registering first means a call outside a test throws before anything exists. vitest runs the hook at the end of each attempt, pass or fail: after `afterEach` and the cleanup of fixtures the test itself created, before `onTestFailed` and an `aroundEach` teardown; a call from `beforeEach` has the same owner (recon). The TSDoc says, in one sentence each: the path lives until the calling test finishes, so never cache it across tests; a call with no current test throws; it is not for concurrent tests, whose current test is ambiguous.
- **The cache.** `exportFundedBackup` (`crash-truth.ts:97-110`) caches the sealed backup text and the funded address, not the path, and writes a fresh file per call. Exporting stays once per file; each test, and each retry attempt, gets a file it owns. Its comment changes to match.
- **One owner.** `profile-reimport-matrix.test.ts:170` stops removing `dirname(backupPath)`; its unused `rmSync` and `dirname` imports go.
- **The self-test.** New `apps/extension/scripts/e2e/backup-temp.test.ts` (unit layer, `bun run test`; vitest's default `forks` pool with `isolate: true` gives the file its own process). Module scope: `ROOT = mkdtempSync(join(tmpdir(), "nulo-backup-temp-test-"))`, `process.env.TMPDIR = ROOT`; `afterAll` restores `TMPDIR` (deletes it if it was unset) and removes `ROOT`. Only `nulo-e2e-backup-*` entries of `ROOT` are counted, since the runtime may write its own temp files there.
  - `describe` "outside a test": its `beforeAll` calls the helper inside `try` and keeps what it threw; one test asserts the error names `inside a test` and that `ROOT` holds no backup dir (the refusal writes nothing).
  - `describe` "inside a test": a test writes, reads back the exact content under the given name in a `nulo-e2e-backup-` dir directly under `tmpdir()`, and records the path (success control); the next test asserts a path was recorded and its dir no longer exists; a `test.fails` case writes, records the path, then throws; the next test asserts that path was recorded (a `test.fails` passes on any throw, the helper's own included) and its dir no longer exists.
  - Red on the base: the refusal case and both "gone" cases, each for its own reason; the success control green. The probe on 2026-10-22 already failed a "gone" case on the base (`expected true to be false`).
- **Not taken.** (a) Return the dir and remove it in each caller's `finally`, like `account-io.ts`: 25 edits in 17 files, three writes sit before their `try`, and the next caller can forget. (b) A run dir from global setup, passed by `provide`/`inject`: smoke has none, so it adds state, a teardown and a reap rule; the network dir outlives a run on lock reuse. (c) A per-file `backupFiles()` like `contactsFiles()` with `afterAll` in each file: the same edit across the test files, and files outlive their test. (d) A teardown scan of the host's `/tmp`: it sees every other worktree's leftovers on a shared host, so it would fail for runs that are not this one.

## Decision ledger

| # | Question | Decision |
|---|---|---|
| D1 | Who owns the dir | The test that called the helper (`onTestFinished` inside the helper). Smallest change: one helper, every caller covered, a new caller cannot opt out. vitest documents this hook for cleanup inside reusable helpers |
| D2 | Where the dir lives | `os.tmpdir()`, as the sibling helpers. The run-isolation rule against `/tmp` targets service stores held open by a killed process; this file is a few KB, read at pick, and removed when its test ends. Real disk would need a reap of its own |
| D3 | `exportFundedBackup`'s cache | caches text, writes a file per call (two tests in `backup-restore-sw-restart` share it today) |
| D4 | The proof | the unit self-test (red then green), plus each e2e gate run under a scratch `TMPDIR` that must hold no `nulo-e2e-backup-*` dir afterwards; no committed host scan (Not taken d) |
| D5 | e2e scope | the whole smoke suite at retry 0 on Chrome and Firefox (lane brief); the eight network caller files at retry 0 on Chrome, `NULO_E2E_PROVERLESS=1` (`backup-restore-sw-restart` is proverless-gated). No Firefox network twin: no fixture, focus, window, activation or WebAuthn change |
| D7 | Where the helper lives (implementation deviation) | its own module, `helpers/backup-temp.ts`, re-exported from `import-drivers.ts` as `TEST_PASSWORD` already is. The self-test importing `import-drivers.ts` ran, but put its fixture graph under `tsconfig.scripts.json`, which lacks the e2e program's ambient types (19 TS errors in `typecheck:all`); existing self-tests import only light modules. Callers unchanged |
| D6 | Killed processes | accepted residue (Outcome & Quality Bar), no reap: a closed `known-limit` issue at close-out (reopen on a host count that grows faster than killed runs explain, or a caller that needs a file after its test) |

## Security & Adversarial Considerations

- **Threat model.** Test-only code on developer hosts and CI runners. The files hold synthetic test-wallet backups. `mkdtempSync` makes each dir private to its user (0700); processes of the same user are trusted by the harness, as they can already signal its runs. The change shortens how long these files stay on disk. `rmSync` takes only the path `mkdtempSync` returned in the same call, never a computed or caller-supplied one.
- **Gates.** No assertion, timeout or retry changes; no suppression. The refusal outside a test is a new failure mode for a misplaced caller, loud by design.
- **Input validation, crypto, least privilege, supply chain.** No new input, key, permission or dependency (`onTestFinished` and `rmSync` come from packages already imported).

## Assumptions

**Facts:** F1 the helper's 25 call sites in 17 files, plus two test files through `crash-truth.ts` (recon). F2 vitest 4.1.10 runs `onTestFinished` hooks at the end of each attempt, pass or fail, then clears them; it throws when no test is current (`beforeAll`, module scope), not in `beforeEach`. F3 no e2e caller writes outside a test body or a helper called from one, and none uses `test.concurrent`. F4 the page reads a picked backup at pick on both browsers. F5 Bun and Node `os.tmpdir()` read `TMPDIR` at call time. F6 a `scripts/e2e/` unit test can run `import-drivers.ts`, but `tsconfig.scripts.json` cannot type its fixture graph (D7).
**Inferences:** I1 no caller reads the file after its test ends, once D3 lands: today `exportFundedBackup` hands one path to two tests (from F3 and F4; the full smoke and network runs check it).
**Asks:** none. OWNER-ASKS.md says why.

## Phases

### Arc A1 (branch `worktree-e2e-tmp-1`, on `origin/dev` after #1063's squash, else with `origin/dev` merged before the gates)

**Phase 1 — the owner and the self-test.** ✓ 2026-10-22: base body red on the refusal and both "gone" cases, success control green; new helper 4 passed, 1 expected fail; lint, `typecheck:all`, `test` (908 files), `test:all` exit 0. Write `backup-temp.test.ts` first and run it against the base helper (`git show 5c35ca934:apps/extension/tests/e2e/helpers/import-drivers.ts`, never `HEAD`). Then change `import-drivers.ts`, `crash-truth.ts` and `profile-reimport-matrix.test.ts` as above. Gate: `cd apps/extension && bun --bun vitest run scripts/e2e/backup-temp.test.ts` on the base helper fails exactly the refusal case and the two "gone" cases with the success control green, and on the new helper passes every case; `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all` exit 0.

**Phase 2 — the e2e gates.** Run each under a scratch `TMPDIR=~/.cache/nulo-backlog/e2e-tmp-1/t<n>` (short, for socket paths; created empty first; it also takes the run's Chrome profiles and other temp dirs). Smoke: build the armed smoke build (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<browser>`), then `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 [NULO_E2E_BROWSER=firefox] bun run test:e2e -- --retry=0`, Chrome then Firefox. Network: `cd <worktree> && NULO_E2E_PROVERLESS=1 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent` with the eight files of D5 and `--retry=0`. One run at a time in this worktree; poll each log in a bounded loop. Pass: each run exits 0 with no failed test; afterwards `find "$TMPDIR" -maxdepth 1 -name 'nulo-e2e-backup-*' | wc -l` prints 0; then remove the scratch dir; record each wall-clock.

**Phase 3 — close-out.** As Post-implementation step 4. Gate: `bun run lint`, `bun run test:ci-gating`, and `bun run check:plans` after staging exit 0.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `246c8851b`; step 1 absent (`code_review: off`). After Phase 2: the Codex loop over the arc's diff against its base (`~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`), the two verbatim rules in every prompt, hard stop at three rounds; one Opus review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1; each round in `lessons/phase-1.md` and § Audit verdicts. A fix that re-runs an e2e file reruns its Phase 2 gate. Then the PR, then the close-out as its final commits: merge `origin/dev` first and read what changed in `index.md` and `lessons.md`; the Outcome (`Known limits:` D6's issue; `Open items: #1071`); a lessons pass (candidate: `onTestFinished` gives a helper's resource a test-scoped owner); `STATUS.md` deleted; `git mv` into `archive/` in its own commit, index line moved. Teardown once `implementations-plan/archive/e2e-tmp-1/plan.md` is on `origin/dev`: `agent-worktree done e2e-tmp-1 --merged`.

## Delivery

| Arc | Phases | Base | PR title (≤ 93) | Issues |
|---|---|---|---|---|
| A1 | 1, 2, 3 | `origin/dev` with #1063 | `fix(e2e): a backup a test imports lives until that test finishes` (65) | Closes #1064 |

Opened ready, without labels, after the loop converges; then add `e2e:extension-smoke` and `e2e:extension-network` only if the path filters skip a suite (helpers under `tests/e2e/**`). The body states the 25 call sites, the red/green self-test, each suite's wall-clock and residue count, that no e2e scenario changes, and that D1 and D2 depart from the lane brief's two shapes and its run-dir framing, with the reasons. Parallelism: none.

**Overlaps.** #1026 edits `toolbar-panel.test.ts`, which A1 does not touch. #1063 shares no file. If either lands first, merge `origin/dev` and rerun Phase 1's gate.

## Audit verdicts

- **Codex r1** (gpt-6.1-sol, high, session `01a16436`): **conditional approve**. Kept D1 (smaller than either brief shape; #1063 sets only the node child's `TMPDIR`), D2, D5, D6. Accepted: the base run's refusal check would fail first, so the red proved the refusal, not the leak (gate restructured); the `test.fails` case must prove it wrote (path recorded and checked next); F1's count (25 sites, 17 files, plus two via `crash-truth`), the hook order (before `onTestFailed` and an `aroundEach` teardown; `beforeEach` counts as in a test), I1 true only with D3, the 0700 wording, `TMPDIR` restored by deletion when unset.
- **Opus 5.5 r1** (Plan): **conditional approve**. Accepted: the same red-gate flaw (refusal in its own `describe`; each case checks its own dir; listing filtered to the prefix, since the runtime may write into `TMPDIR`); the count; a TSDoc sentence on lifetime, no caching and no concurrency; deleting the scratch `TMPDIR` after the count; the PR body says where D1 and D2 depart from the brief. Not taken: guarding a call made from inside another `onTestFinished` hook (no such caller; the TSDoc covers it).
- **Codex r2** (resumed `01a16436`): **approve**. Verified every condition; a 53-byte scratch `TMPDIR` keeps Chrome's singleton socket at 98 of 107 bytes; after #1063 the node sets its own `TMPDIR`. One recon wording fix, applied.

## Seeds

- `/goal` Phases 1–3 marked ✓ in implementations-plan/e2e-tmp-1/plan.md, each with its gate's output in the transcript; the Codex loop converged (a resumed pass with no new material finding quoted); PR `fix(e2e): a backup a test imports lives until that test finishes` open against `dev`; `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/e2e-tmp-1: read plan.md and lessons/, run the next phase and its gate, tick it, run the Codex loop, open the PR, write the close-out; never merge.

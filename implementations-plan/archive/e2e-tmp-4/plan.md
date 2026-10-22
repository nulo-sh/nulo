---
plan: e2e-tmp-4
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 2afb3260e
trunk: dev
issues: "#1078 (A1 closes it, with the third file and the failure-path dir recon added to it, D2, D3); #1082 (known limit, filed closed in planning)"
post_implementation_hardening: not scheduled
status: closed with its one PR; the merge closes the plan
---

## Outcome

- **Date:** 2026-10-22.
- **Status:** closed with its one PR, #1085 (`worktree-e2e-tmp-4` → `dev`, `Closes #1078`), which carries this close-out; the merge closes the plan.
- **Shipped:**
  - **The two env-reading files** (`webdriver-ownership.test.ts`, `owned-processes.test.ts`): the dir's name is fixed at import with a 6-character random suffix; the Linux block's `beforeAll` makes it (`mkdirSync`, mode `0o700`), and its `afterAll` removes it only once made.
  - **`reconcile-lock.test.ts`**: `boot-guard.test.ts`'s shape, the dir made and removed by the Linux block.
  - **`outside`** (`owned-processes.test.ts`): a `testTempDir`, removed when its test ends, so a failed case no longer leaves it (D7).
  - **The proof:** stubbed non-Linux 3 → 0; Linux under a long scratch `TMPDIR` 1 → 0 with the same 4 named failures; Linux default `TMPDIR` 44 passed ([lessons/phase-1.md](lessons/phase-1.md)). No native macOS run.
- **Dispositions:**
  - The plan passed its own gate on auto-continue: Codex approve at r2, no owner ask.
  - D2 (`reconcile-lock`) and D3 (`outside`) were folded in and recorded on #1078 by a comment.
  - D7, an implementation deviation: e2e-tmp-2's `testTempDir` landed on `dev` while the PR was open, and `outside` takes it instead of the inline `onTestFinished` pair.
  - The review loop converged at round 3: Codex r1 one low comment suggestion (rejected), Opus clean, Codex r2 clean, Codex r3 clean on D7.
- **Lessons:** nothing promoted. `lessons.md` is at its budget (8,192 bytes) and nothing in it is superseded. The all-skipped-file rule stays in the three block comments and in this plan's F2.
- **Known limits:** #1082 (an `owned-processes` case leaves an idle `sleep 120`); #1075 already covers a killed worker.
- **Open items:** #1086 (a unit flake in `fpc/service-create.test.ts`, seen while gating, outside this arc).
- **Seeds retired:** the `/goal` and `/loop` below; they are no live instructions.

# e2e-tmp-4: three e2e-script unit tests leave their temp dir on a non-Linux host

One arc, one PR against `dev` (the orchestrator's D-orch-1, no stack). Each Linux-only dir is made by the Linux block's `beforeAll` and removed by its `afterAll`, so a host that skips the block makes nothing. Two files must still fix the dir's name at import, because the modules they import read it there; the third takes `boot-guard.test.ts`'s shape as is. The proof is a count under a scratch `TMPDIR` with `process.platform` stubbed to `"darwin"` (3 on the base, 0 after) and a Linux run that leaves 0, pass or fail. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## The claims and what did not hold

- **#1078, the two files:** holds, demonstrated under the stub (recon). Each dir is empty: the imported modules write nothing at import.
- **#1078, "`reconcile-lock.test.ts` … is removed":** does not hold off Linux. Its only `describe` is Linux-only, and vitest runs no hook of a file whose every test is skipped, its module-level `afterAll` included (probe). It leaves a third dir; D2 folds it in (recorded on #1078).
- **#1078's second fix** (module-level `afterAll`): fails for `webdriver-ownership` (every test is Linux-only) and holds for `owned-processes` only while its two cross-platform tests (`:414`, `:511`) exist. D1 takes the first fix.

## Outcome & Quality Bar

- **For whom:** a contributor who runs `bun run test` in `apps/extension` on macOS, many times a day.
- **Excellent:** (1) after a run on a non-Linux host, the three files leave nothing in `TMPDIR`; (2) on Linux they run as before and leave nothing, pass or fail, the `nulo-aztec-outside-*` dir included.
- **Good enough:** a worker killed by a signal leaves the dirs of the block it was in (the class of the closed known limit #1075); one case leaves an idle `sleep` for up to 120 s (#1082).

## UI impact

None. Three test files under `apps/extension/scripts/e2e/` change; no extension, landing or playground source. No orchestrator no-ask record applies.

## Architecture & Implementation

- **`webdriver-ownership.test.ts`** (`:7-10`, `:102-112`): `ROOT` becomes `path.join(tmpdir(), \`nulo-ownership-test-${randomBytes(4).toString("base64url")}\`)`, still set into `NULO_E2E_DATA_ROOT` before the `await import(…)`s: `tests/e2e/lockfile.ts:44` reads it at import, and `fixtures/browser/ownership.ts:28,31` derive their roots from it. Below it, `let rootMade = false`. The Linux block gains, before its `afterAll`, `beforeAll(() => { mkdirSync(ROOT, { mode: 0o700 }); rootMade = true })`; its `afterAll` keeps the kill loop and removes `ROOT` only `if (rootMade)`. Imports: `mkdtempSync` leaves `node:fs`; `randomBytes` from `node:crypto`; `beforeAll` joins the vitest import.
- **`owned-processes.test.ts`** (`:8-11`, `:139-149`): the same change, prefix `nulo-owned-processes-test-`, in the first Linux block ("sandbox ownership by marker"), the only block that uses `ROOT` (`:122` builds a path, no I/O). The base removes `ROOT` before the later blocks run; that lifetime stays. Imports: `mkdtempSync` stays (`:238`); `randomBytes` added; `beforeAll` and `onTestFinished` join the vitest import.
- **`reconcile-lock.test.ts`** (`:15-20`): `boot-guard.test.ts:152-164`'s shape. `let DIR = ""` at module level (`lockFile()` reads it lazily); in the Linux block, `beforeAll(() => { DIR = mkdtempSync(…) })` and `afterAll(() => { if (DIR) rmSync(DIR, …) })`; the module `afterAll` goes; `beforeAll` joins the vitest import.
- **`owned-processes.test.ts:238-253`** (`outside`): `onTestFinished(() => rmSync(outside, { recursive: true, force: true }))` right after its `mkdtempSync`, replacing the test's last line (D3).
- **Name length.** The node's socket path under a run dir must fit 107 bytes (`sandbox-ownership.ts:31-50`). Under `/tmp`, the longest one these cases build (`<ROOT>/nulo-aztec-<7-digit pid>-1/tmp` plus 28) is 90 bytes with a 6-character suffix, as on the base; `randomUUID()` would make it 120, and 4 cases would throw (both reviewers, probed). `randomBytes(4).toString("base64url")` is 6 characters and 32 bits.
- **Comment**, at each of the three `beforeAll`s: `// Made and removed by this block, so a host that skips it makes nothing.` The import-time comments (`webdriver-ownership.test.ts:7-8`, `owned-processes.test.ts:8-9`) stay as they are.
- **Not taken.** (a) A module-level `afterAll` (#1078's second fix): no hook runs in an all-skipped file (recon). (b) The `await import`s moved into the block's `beforeAll`, so `mkdtempSync` could stay: about 34 names become `let` bindings, and `owned-processes`'s cross-platform test needs `nodeTmpDir` at module level, whose static import would read `E2E_DATA_ROOT` before the env var is set. (c) `mkdtempSync` gated on a hoisted `process.platform === "linux"`: the skip rule lives twice, and a non-Linux run still needs a name. (d) A committed self-test (a nested vitest run of the three files under the stub): every `bun run test` pays a nested runner to re-prove three files; it would not catch a new file; the stub breaks any file that loads a platform native binding (4 of 48 script files, recon). e2e-tmp-2 and e2e-tmp-3 rejected the same shape. (e) A static guard on module-scope `mkdtempSync`: a separate decision (e2e-tmp-3 (e)). (f) A shorter prefix with `randomUUID()` (Codex r1's example): a prefix that no longer says which test made the dir, for bits the suite does not need.

## Decision ledger

| # | Question | Decision |
|---|---|---|
| D1 | Where each dir is made | in the Linux block's `beforeAll`, removed by its `afterAll`. The two env-reading files fix the name at import (a 6-character random suffix, Name length) and make it with `mkdirSync(ROOT, { mode: 0o700 })`, which fails on any existing entry; the `afterAll` removes only what the `beforeAll` made (`rootMade`, both reviewers r1). Same shape in both files, as the lane brief asks |
| D2 | `reconcile-lock` in this arc | folded in, recorded on #1078: the issue named it as the working shape, the same command leaves its dir, and the proof cannot read 0 without it |
| D3 | `outside` in this arc | folded in: same file, demonstrated (a failed case left it, recon), one line with an idiom the e2e tree uses; it makes "pass or fail" true for the three files |
| D4 | The proof | the stubbed count, red on base (3) and green after (0); and a Linux run under a scratch `TMPDIR` too long for 4 socket-path cases, red on base (1, `outside`) and green after (0). Those 4 failures are the input condition, named in the gate, on base and after; no assertion changes. A short private `TMPDIR` (Codex r1) would have to sit under `/tmp`, which the lane's scratch rule excludes; the `/tmp` run has no attribution and only proves the 44 cases pass. No committed self-test (Not taken d) |
| D5 | The stub is honest | it changes one input, the value the `skipIf`s and `SOCKET_PATH_MAX` read, on the real files with the real config; the cases it runs are the ones macOS runs. It simulates the branch, not the kernel: the PR says no native macOS run was made |
| D6 | The orphaned `sleep` (Opus r1) | a known limit, #1082, filed closed: no dir, no resource, ends within 120 s |
| D7 | Deviation: `outside` | e2e-tmp-2 (#1084) landed `tests/e2e/helpers/test-temp-dir.ts` on `dev` after recon; its `testTempDir(prefix)` is the same `onTestFinished` plus `mkdtempSync` pair, so `outside` takes it (`e2feee6e0`). The tree wins |

## Security & Adversarial Considerations

- **Threat model.** Test-only code on developer hosts and CI runners. No input, key, permission, dependency or token changes; `randomBytes` names a dir and protects nothing.
- **A name known before its dir exists.** `mkdirSync` without `recursive` fails on any existing entry, a symlink included, so a planted entry fails the block loudly (its tests do not run) and is never followed or removed (`rootMade`). Mode `0o700` matches `mkdtempSync`. `rmSync` takes only paths the same file made.
- **Gates.** No assertion, timeout, retry or skip condition changes; no suppression.

## Assumptions

**Facts:** F1 the sites: `webdriver-ownership.test.ts:9,102-112`, `owned-processes.test.ts:10,139-149,238-253`, `reconcile-lock.test.ts:15-22`. F2 vitest 4.1.10 on Bun 1.4.2 runs no hook of a skipped block nor of a file whose every test is skipped; runs a module `afterAll` when one test runs; after a throwing `beforeAll` skips the block's tests and runs its `afterAll`; runs `onTestFinished` after a failed assertion (recon probes, reproduced by both reviewers). F3 `E2E_DATA_ROOT` is a module const read at import (`tests/e2e/lockfile.ts:44`). F4 under the stub, the base leaves exactly the three dirs, from the three files and from all of `apps/extension/scripts/`; 2 tests passed, 42 skipped. F5 on Linux under `/tmp` the base passes 44 tests; the socket budget then has 17 bytes to spare and does not allow a 36-character suffix (Name length); under a scratch `TMPDIR` in `~/.cache` 4 cases fail and `outside` is left. F6 `bun --bun vitest run` in `apps/extension` runs `scripts/**`; the root `test` and `test:all` reach it; no other vitest config includes these files (recon).
**Inferences:** I1 macOS runs these files as the stub does: only the `skipIf`s, `SOCKET_PATH_MAX` and `:512` read the platform, and the stubbed run took the same branches. No macOS run was made. I2 a 32-bit name does not collide with a live run's dir in practice; if it did, the block fails loudly and removes nothing.
**Asks:** none. [OWNER-ASKS.md](OWNER-ASKS.md) says why.

## Phases

### Arc A1 (branch `worktree-e2e-tmp-4`, from the `origin/dev` head at its start)

**Phase 1 — the three dirs, the failure-path dir and the proof.** ✓ (2026-10-22, [lessons/phase-1.md](lessons/phase-1.md)) Assumptions: F1–F6, I1, I2. Put scratch files under `~/.cache/nulo-backlog/e2e-tmp-4/`. Run each vitest command from `apps/extension`; run `bun run lint` and `bun run typecheck:all` from the repo root.
1. Merge `origin/dev` into the branch.
2. Write the setup file `platform-darwin.setup.ts`: `Object.defineProperty(process, "platform", { value: "darwin" })`.
3. Write `vitest.darwin.config.mts`. It imports `<worktree>/apps/extension/vitest.config.ts` as `base` and exports `{ ...base, root: "<worktree>/apps/extension", test: { ...base.test, setupFiles: [base.test.setupFiles, "<the setup file>"] } }`.
4. Before any edit, make empty dirs `t0` and `u0`. Below, FILES is `scripts/e2e/webdriver-ownership.test.ts scripts/e2e/owned-processes.test.ts scripts/e2e/reconcile-lock.test.ts`, written out.
   - Run `TMPDIR=$T0 bun --bun vitest run --config <the config> FILES`. Count with `ls -A "$T0" | wc -l` (expect 3).
   - Run `TMPDIR=$U0 bun --bun vitest run FILES`. Count `u0` the same way (expect 1).
5. Make the four edits (Architecture).
6. Repeat step 4's first run under an empty `t1` (expect 0).
7. Run `env -u TMPDIR bun --bun vitest run FILES`.
8. Repeat step 4's second run under an empty `u1` (expect 0).

Gate: steps 4 and 6 exit 0 with 1 file passed and 2 skipped, 2 tests passed and 42 skipped; step 4 prints 3, step 6 prints 0. Step 7 exits 0 with 3 files and 44 tests passed. Steps 4 and 8 each fail exactly these 4 cases of `owned-processes`, each with "would exceed 107 bytes; set NULO_E2E_DATA_ROOT to a shorter directory", and pass the other 40; step 4 prints 1 (`nulo-aztec-outside-*`), step 8 prints 0. The 4 cases start at `:163`, `:180`, `:236` and `:256` on the base. Any other failure is breakage. `bun run lint` and `bun run typecheck:all` exit 0. A rerun after a fix is steps 6, 7 and 8 under new empty dirs.

**Phase 2 — close-out.** ✓ (2026-10-22) As Post-implementation. Gate: from the repo root, `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all` and `bun run check:plans` after staging exit 0; Phase 1 steps 6 and 8 on the final head print 0. Then remove the scratch dirs and the two scratch files.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `2afb3260e`; step 1 absent (`code_review: off`). After Phase 1: the Codex loop over the arc's diff against its merge base with `origin/dev` (`~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`), the two verbatim rules in every prompt, hard stop at three rounds; one Opus review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1; each round in `lessons/phase-1.md` and § Audit verdicts. A fix reruns Phase 1's gate (steps 6–8). Then the PR, then the close-out as its final commits: merge `origin/dev` first and read what changed in `index.md` and `lessons.md`; the Outcome (`Known limits: #1082`, and #1075 covers killed workers; `Open items: none`); a lessons pass (the all-skipped-file rule is a candidate if the 8 KiB budget allows; dedupe first); `STATUS.md` deleted; `git mv` into `archive/` in its own commit, index line moved to `archive/index.md`. Teardown once `implementations-plan/archive/e2e-tmp-4/plan.md` is on `origin/dev`: `agent-worktree done e2e-tmp-4 --merged`.

## Delivery

| Arc | Phases | Base | PR title (≤ 93) | Issues |
|---|---|---|---|---|
| A1 | 1, 2 | the `origin/dev` head at its start, `origin/dev` merged before its gates | `test(e2e): the e2e-script tests leave no temp dir behind on any platform` (72) | Closes #1078 |

Opened ready, without labels, after the loop converges. No e2e label: the change touches no e2e scenario and no file under `tests/e2e/`. The body states the stubbed 3 → 0 and Linux 1 → 0 counts, that no native macOS run was made (D5), D4's departure from a committed self-test, and that no e2e scenario is added or changed. Parallelism: none.

## Audit verdicts

- **Codex r1** (gpt-6.1-sol, high, session `01a16532`): **conditional approve**. Reproduced F2. Accepted: `randomUUID()` pushes the socket path to 114–120 bytes and breaks 4 Linux cases (demonstrated; a 6-character suffix, Name length); the `afterAll` removed a planted entry after `mkdirSync` threw (demonstrated in a probe; `rootMade`); a `find -newer` on `/tmp` cannot attribute a dir (D4 now counts private scratch dirs); gate working dirs named; F6 reworded. Rejected: a short private `TMPDIR` under `/tmp` (D4); a shorter prefix (Not taken f); the comment wording (Opus's invariant taken instead).
- **Opus 5.5 r1** (Plan): **conditional approve**. Same suffix finding (traced through the real `nodeTmpDir`). Accepted: the base64url suffix, `rootMade`, step 8 as D3's after-proof, scratch removal moved after Phase 2's gate with a defined rerun, the import wording per file, the invariant comment, `env -u TMPDIR`, F2's skipped-tests clause, the two cross-platform tests. The orphaned `sleep` (demonstrated, no dir): known limit #1082.
- **Codex r2** (resumed `01a16532`): **approve**. Ran the plan's edits as an in-memory transform: stubbed 3 → 0 with 2 passed and 42 skipped; long Linux `TMPDIR` 1 → 0 with the same 4 named failures and their message; default `TMPDIR` 44 passed. Verified the 90-byte arithmetic, `rootMade`, and D4's rejection of a `/tmp` parent under the scratch rule. No new finding.
- **Post-implementation, Codex r1** (gpt-6.1-sol, high, fresh session `01a16543`, the code diff against `421bf33b4`): no bug. Probed collisions (`rootMade` kept both planted dirs), the kill-then-remove order, lazy `DIR` reads, the `outside` hook placement, and reproduced the gate (3 → 0, 1 → 0, 44 passed). One low suggestion, a comment on the suffix's length at `owned-processes.test.ts:11`: rejected, since a longer suffix fails four cases with `nodeTmpDir`'s own message naming the cause and the remedy.
- **Post-implementation, Opus 5.5** (general-purpose, beside r1): **clean**. Nothing touches the filesystem under `ROOT` or `DIR` before its block's `beforeAll`; a failed `beforeAll` skips the block's tests; imports and comments clean; judged the suffix note duplicative. Side effect it found: on the base, a `-t` run of a later block alone leaked `ROOT`; it no longer does.
- **Post-implementation, Codex r2** (resumed `01a16543`): **clean**. The suggestion is not material; no regression.
- **Post-implementation, Codex r3** (resumed `01a16543`, the D7 fix diff after merging `origin/dev`): **clean**. The helper's module graph reads no `E2E_DATA_ROOT`; its hook is registered before `createRunDir(outside)` can throw; reproduced the gate. The loop converged.

## Seeds

- `/goal` Phases 1–2 marked ✓ in implementations-plan/e2e-tmp-4/plan.md, each with its gate's output in the transcript; the Codex loop converged (a resumed pass with no new material finding quoted); PR `test(e2e): the e2e-script tests leave no temp dir behind on any platform` open against `dev`; `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/e2e-tmp-4: read plan.md and lessons/, run the next phase and its gate, tick it, run the Codex loop, open the PR, write the close-out; never merge.

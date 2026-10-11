---
plan: ci-followups
tier: mid
status: v2.1 approved by the orchestrator (8751330); arc 1 phases 1-3 implemented, Codex fix loop next
issues: "#260, #250, #239 (arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 Explore agents (sonnet); dual audit (Codex gpt-6.1-sol high + one Opus Plan agent); one final fresh Codex pass
post_implementation_hardening: not scheduled
base: origin/dev at af4afcc
trunk: dev
---

# CI follow-ups: no auto-install, a live move label, the Docker Bun pins

Three CI follow-ups in one arc and one PR against `dev`. None of them changes a screen, makes a gate advisory, removes a required check or adds a bypass.

- **#260.** Jobs that install nothing let Bun fetch a bare import from npm at run time. The fix turns Bun's runtime auto-install off in the root `bunfig.toml`, which every job that runs its own revision reads. The three jobs that run another revision's code (the two store publishers and the preview comment) also pass `--no-install`, because the file they would read is that revision's. A static check pins that every Bun call in a no-install job has one of the two controls, and a test proves Bun really refuses under the committed file.
- **#250.** The complexity ratchet reads the `baseline:move-approved` label from the event's snapshot. The fix reads the pull request's live labels in the job that runs the ratchet, through the existing `live-labels.sh`, and passes the answer in.
- **#239.** CLAUDE.md's Bun-bump list gains the Docker runner's two pins. The test that catches a missed site already exists.

Recon: [recon.md](recon.md). Owner questions: [OWNER-ASKS.md](OWNER-ASKS.md) (one, non-blocking). Consults and the probe: [lessons/phase-0.md](lessons/phase-0.md). Live progress: [STATUS.md](STATUS.md).

## Claims that did not hold, or hold narrower

- **#260, "Where".** The list misses three jobs that run Bun with nothing installed: `_release-pr-lockfile.yml#lock-version` (release App token, `contents: write`) and `store-check.yml`'s `chrome` and `firefox` jobs (store credentials). The fix covers them without naming them.
- **#260, "Possible fix".** `auto = "disable"` "makes a missing module an error everywhere" only where Bun's working directory holds that file at the revision checked out. The probe shows Bun 1.4.2 reads it from the working directory alone, never a parent. `pr-quick.yml#preview-comment` checks out a sparse tree without it, and three jobs check out a revision other than their workflow's, so a `bunfig.toml`-only fix would have left them open.
- **#250.** Holds. Also: `pr-quick.yml`'s trigger comment says "nothing in this workflow reads labels", which was already false, since the ratchet read the event's labels.
- **#239.** Holds. The pin test it names, `scripts/ci-cd/docker-ci-like-pins.test.ts`, already exists and already fails a bump that misses either site; only the runbook line is missing.

## Outcome & Quality Bar

- **For whom.** The owner and future maintainers who bump Bun, approve a moved complexity acceptance, or add a CI job; and every release job that holds a credential.
- **What excellent looks like.**
  - A bare import added to any script a no-install job runs fails that job at once, before any network request, and a test proves Bun still behaves so after a Bun bump.
  - A Bun call added to a no-install job without a control that reaches it (a sparse checkout without the file, another directory, another revision without `--no-install`) fails `test:ci-gating` with a message that names the job.
  - Applying or removing `baseline:move-approved` and re-running the failed job takes effect on that re-run; the event's snapshot plays no part.
  - The Bun-bump runbook names every site a bump must touch.
- **Good enough.** Removing the label does not re-run a run that already passed: it takes effect on the next run of that job (OWNER-ASKS OA-1 records the choice). A Bun process that a repository script starts from another directory is not visible to the static check; the check's comment says so.

## Assumptions

**Facts** (verified at `af4afcc`):
1. Bun 1.4.2 auto-installs a bare import when no `node_modules` exists, for `bun <file>` and `bun -e`. `--no-install` stops it for both. `[install] auto = "disable"` in the working directory's `bunfig.toml` stops it for `bun <file>`. A `bunfig.toml` in a parent directory is not read (lessons/phase-0.md § Probe).
2. No script run by a no-install job has a bare or version-specified import, spawns `bun`, or changes directory (recon.md).
3. No no-install job sets `working-directory:` on a Bun step or `defaults.run`. The store jobs' `working-directory: dist/release` steps run `sha256sum`, not Bun (`release.yml:680,745`). `attach-assets` and `publish-nightly` run `cd dist/release` after their Bun lines (`release.yml:519`, `nightly.yml:568`).
4. Three no-install jobs run code from a revision other than their workflow's: `publish-chrome-store` and `publish-firefox-amo` check out `needs.resolve.outputs.sha` (`release.yml:665-669,730-734`), and `preview-comment` checks out the head, sparse, without `bunfig.toml` (`pr-quick.yml:284-293`). Every other no-install job checks out its own revision, full.
5. The only stable tag is `v0.30.2`; it and `origin/main` (`80890f3`) carry no bare import in `scripts/release/` (checked with `git show <ref>:<file>` over every non-test file).
6. `test:ci-gating` runs in `_unit-tests.yml` (step at lines 43-53), called by `pr-quick.yml:235`, `release.yml:246` and `nightly.yml:181`. `_unit-tests.yml` has no `permissions:` block and already guards its steps with `[ -d … ]` for refs that predate a directory. `pr-quick.yml:36-38` grants `contents: read` and `pull-requests: read`.
7. `complexity-baseline.test.ts:351-355` reads the label from `GITHUB_EVENT_PATH`. The ratchet returns before deciding moves when `GITHUB_BASE_REF` is empty, that is off a pull request (`:326-336`).
8. `live-labels.sh` takes the labels as arguments and writes `label-hit=true|false`. It fails closed on an API failure after one retry, fails a run whose head the pull request has moved past, and refuses any event but `pull_request` and `workflow_dispatch` (`scripts/ci-cd/live-labels.sh:35-63`). It came with #252 and is not on `main` (`80890f3`).
9. `bunfig.toml` is in `pr-quick.yml`'s `deps` and `root-config` filters and in all four e2e lanes' filters (`pr-extension-smoke-e2e.yml:91`, `pr-extension-network-e2e.yml:96`, the Firefox twins at `:76` and `:82`). This PR therefore runs the audit gate in enforce mode, the full builds, and the smoke and network suites on Chrome and Firefox.

**Inferences** (attack these):
- I1. Nothing rests on how a re-run treats the event payload: a live read is correct either way. GitHub documents that a re-run reuses the original `GITHUB_SHA` and `GITHUB_REF`; no scratch PR is opened to probe the rest.
- I2. `install.auto` does not change `bunx` / `bun x`, `bun install` or `bun test` in an installed tree: "auto" never installs when `node_modules` exists, and `disable` only removes that branch. Phase 1's gate checks a cold `bunx` fetch; the PR's builds and e2e suites check the installed jobs.
- I3. The audit gate passes in enforce mode on this PR. Phase 1's gate runs it locally the way CI does. If it reports an unacknowledged advisory, stop and surface it: an acknowledgement is not this lane's call.

**Asks**: none blocking. OWNER-ASKS OA-1 (label revocation) ships its option A now.

## Architecture & Implementation

### #260: turn off runtime auto-install where the jobs run

- **The rule.** Each Bun call in a job with nothing installed has exactly one guaranteed control:
  - a job that runs **its own revision** from the root reads the root `bunfig.toml`, which now says `auto = "disable"`;
  - a job that runs **another revision's** code passes `bun --no-install`, because the `bunfig.toml` it would read is that revision's, which may predate the control.
- **`bunfig.toml`.** Add `auto = "disable"` under `[install]`, with a comment: a bare import in a job with nothing installed would be fetched from npm at run time, past `bun.lock` and the age gate; Bun reads this file from its working directory only.
- **`--no-install` on three jobs.**
  - `release.yml#publish-chrome-store` and `#publish-firefox-amo`: one line each, `bun --no-install scripts/release/publish-…-run.ts`. These are the lines #260 names; no other `release.yml` line changes.
  - `pr-quick.yml#preview-comment`: both Bun lines (`bun --no-install -e …`, `bun --no-install scripts/ci-cd/preview-comment.ts`), with one comment: the checkout is the pull request's head, whose `bunfig.toml` may predate the control. Its sparse list does not change.
- **Unchanged.** `verify-store-copies.yml` keeps its `bun --no-install` (own revision, so redundant, but pinned at `behavior-gating.test.ts:936` and owned by `ci-release-supply`). `nightly.yml`, `store-check.yml` and `_release-pr-lockfile.yml` do not change.
- **Pin, in `scripts/ci-cd/release-integrity.test.ts`, beside `CLEAN`** (its shape: a finding function, a clean-tree test, a `test.each` over `mutated` copies). `autoInstallFindings(tree, bunfigText)`:
  - `Bun.TOML.parse(bunfigText).install?.auto !== "disable"` → `bunfig.toml: Bun may auto-install a missing import`.
  - **Selection.** Every job from `jobs(tree)` that sets Bun up without installing: a step `uses: ./.github/actions/setup-bun` with `install: "false"`, or a step `uses: oven-sh/setup-bun@…` with no step of the job's own matching the file's `INSTALLS`. The composite's own install step is not read here: it runs only under `inputs.install == 'true'`, which `cleanFindings` already pins. (`publish-packages.yml#pack` installs and is not selected.)
  - **Selection control.** A constant `NO_INSTALL` lists the fourteen jobs the rule selects at `af4afcc`: recon.md's twelve, plus `source-rebuild.yml#rebuild-x64` and `#rebuild-arm64`, which have no Bun call in YAML (their script installs first). The clean-tree test asserts the selection equals it exactly, so a job dropped from the selection, or a new no-install job, fails until it is reviewed. A planning prototype of the rule flagged exactly the four calls Phase 1 edits and nothing else (lessons/phase-0.md § Rule prototype).
  - **Steps read.** The job's own steps plus the steps of any local composite other than `setup-bun` (`expanded`, minus `SETUP_BUN`'s).
  - **Own revision.** The job's `actions/checkout` step exists and has no `with.ref` and no `with.path`; and either it has no `sparse-checkout`, or it keeps cone mode (cone mode always includes root files), or its non-cone list (`sparse-checkout-cone-mode: false`) names `/bunfig.toml`.
  - **A Bun call** is a match of `/(^|[\s;&|(])bun(\s|$)/m` in a read step's `run`; its arguments run to the next `&&`, `||`, `;`, `|` or line end. If the clean tree shows a false match (Bun named in an `echo`), narrow the match to a command position; never drop a job from the selection.
    - **Flag path.** The call passes when its first argument is `--no-install` (`bun --no-install …`, the form `verify-store-copies.yml` uses), and it carries no `--install` and no `-i`.
    - **File path.** Otherwise all of these must hold, or the finding names the job and the reason:
      - the job runs its own revision (`<where>: runs another revision's code without --no-install`);
      - its step has no `working-directory`, and the job and workflow set no `defaults.run.working-directory` (`<where>: runs Bun outside the checkout root`);
      - the call carries no `--cwd`, and no `cd` or `pushd` comes before it in the same `run` (`<where>: runs Bun after changing directory`);
      - the call carries no `--config`, `-c`, `--install` or `-i`, which choose another configuration or install mode (`<where>: overrides Bun's configuration`).
  - **Comment.** The function's comment states the one blind spot: a script that starts Bun itself (as `source-rebuild.sh` does, after its own install) is not read.
  - **Mutations,** each must yield a finding:
    1. the `auto` line removed from the file's text;
    2. `--no-install` removed from `publish-chrome-store`'s Bun line;
    3. `--no-install` removed from `preview-comment`'s script line;
    4. a `bun …` line appended after `cd dist/release` in `attach-assets`' zip step;
    5. `working-directory: dist` on `auto-unstick`'s Bun step;
    6. `--cwd dist` added to `sync-main-to-dev`'s Bun line;
    7. `path: src` on `lock-version`'s checkout;
    8. a non-cone `sparse-checkout` of `/scripts/release/` (with `sparse-checkout-cone-mode: false`) on `store-check.yml#chrome`'s checkout;
    9. `defaults.run.working-directory` on `publish-nightly`;
    10. `--config other.toml` added to `auto-unstick`'s Bun line;
    11. `--install=force` added after `--no-install` on `publish-firefox-amo`'s Bun line;
    12. `attach-assets` removed from `NO_INSTALL` (the selection control fails).
  - `Step`, `Job` and `Workflow` gain the keys the function reads (`working-directory`, `defaults`).
- **Behaviour test** (same file): Bun really refuses under the committed file.
  - Start `Bun.serve({ hostname: "127.0.0.1", port: 0 })` that records each request path and answers 404.
  - Make a `mkdtempSync(tmpdir())` directory. Assert that no ancestor of it holds `node_modules`.
  - In it, write `s.ts` with a top-level static import of a never-published, unscoped specifier (`left-pad-nulo-probe-zz`), and the committed `bunfig.toml`.
  - Spawn `process.execPath` with `s.ts`, `cwd` that directory, and `env` exactly `{ PATH, HOME: <temp>, TMPDIR: <temp>, BUN_INSTALL_CACHE_DIR: <temp>/cache, BUN_CONFIG_REGISTRY: <server> }`, so no user-level `.bunfig.toml` or `.npmrc` is read.
  - Refusal: exit code not 0 and zero requests. Control: the same file with its `auto` line removed (assert the edit changed the text) gives at least one request for that specifier.
  - Spawn with `Bun.spawn`, discard its output, and `await proc.exited`; never `spawnSync`, which blocks the event loop the server answers on. In `finally`: kill a child that still runs, `server.stop(true)`, remove the directory.
- **Docs.** `SECURITY.md` § Dependency policy gains one paragraph beside the age gate: what the two controls stop, where each applies, and that `release-integrity.test.ts` pins them.

### #250: read the move-approval label live

- **Read.** `_unit-tests.yml`'s job gains a step, directly before "Run CI-gating guard test":
  ```yaml
  - name: Read the live move-approval label
    id: live
    if: github.event_name == 'pull_request'
    env:
      GH_TOKEN: ${{ github.token }}
      EVENT: ${{ github.event_name }}
      REPO: ${{ github.repository }}
      PR: ${{ github.event.pull_request.number }}
      HEAD_SHA: ${{ github.event.pull_request.head.sha }}
    # Guarded as the steps below are: a head that predates the script also predates the ratchet that reads its answer.
    run: |
      if [ -f scripts/ci-cd/live-labels.sh ]; then
        bash scripts/ci-cd/live-labels.sh baseline:move-approved
      else
        echo "scripts/ci-cd/live-labels.sh not present on this ref — skipping."
      fi
  ```
  The ci-gating step gains `env: BASELINE_MOVE_APPROVED: ${{ steps.live.outputs.label-hit }}`.
  - The read sits in the job that runs the ratchet, so "Re-run failed jobs" repeats it. A read in `changes` would carry its first value into the re-run.
  - `if: pull_request`: the same reusable workflow serves `release.yml` (push, dispatch) and `nightly.yml` (schedule, dispatch), where `live-labels.sh` refuses the event and the ratchet does not decide moves.
  - The file guard: the workflow comes from the merge commit but the job checks out the head. A head cut from `main` before the next promote (the post-release `main → dev` sync PR) has no `live-labels.sh` and runs the old ratchet, which never reads the variable. A head that has the new ratchet always has the script. A head that deleted the script fails the ratchet's refusal below, so the guard opens nothing.
  - No new permission. `pr-quick.yml` already grants `pull-requests: read`, and a called workflow cannot ask for more than its caller grants.
- **Decide.** In `complexity-baseline.test.ts`, `movesApproved(eventPath)` becomes `movesApproved(env)`:
  - off Actions (`env.GITHUB_ACTIONS !== "true"`) → `false`, as today;
  - under Actions, `env.BASELINE_MOVE_APPROVED` `"true"` → `true`, `"false"` → `false`;
  - anything else → throw `BASELINE_MOVE_APPROVED must be "true" or "false" on a pull request run; the unit-tests job's live step sets it`.
  - It never reads `GITHUB_EVENT_PATH`; `pullRequestEvent`'s type drops `labels`.
  - Its doc comment: read live when the unit-tests job runs, so apply the label and re-run the failed job; removing it takes effect at that job's next run.
- **Tests** (`complexity-baseline.test.ts`, a `describe("move approval")`, explicit env objects):
  - stale snapshot refused: `GITHUB_ACTIONS=true`, `GITHUB_EVENT_PATH` at a temp event whose `pull_request.labels` carry the label, `BASELINE_MOVE_APPROVED=false` → `false`;
  - live label accepted: an event without the label, `BASELINE_MOVE_APPROVED=true` → `true`;
  - `test.each` of wiring refusals under Actions: unset, and `"yes"` → each throws;
  - local: `GITHUB_ACTIONS` unset with `BASELINE_MOVE_APPROVED=true` → `false`.
  - The existing ratchet tests (`:229-249`) already prove what approval permits; they do not change.
- **Pin** (`behavior-gating.test.ts` § live labels): `_unit-tests.yml`'s step `live` has exactly the `run` above with `MOVE_APPROVED_LABEL` imported from `scripts/complexity-baseline/scan.ts`, exactly that `if`, the five-key `env` the lanes use, no `continue-on-error`, and comes before the ci-gating step. The ci-gating step binds `BASELINE_MOVE_APPROVED` to `${{ steps.live.outputs.label-hit }}`. `pr-quick.yml`'s workflow permissions include `pull-requests: read`.
- **Docs.** `pr-quick.yml`'s trigger comment: only the unit-tests job reads a label, live, so a label event would only queue a duplicate run; apply the label and re-run the failed job. CLAUDE.md § Complexity budgets: the label is read live when the unit-tests job runs; apply it, then re-run the failed job.

### #239: the Docker runner's Bun pins in the runbook

- CLAUDE.md § Dependency policy, "A Bun-version bump needs a manual sync": add `apps/extension/scripts/e2e/docker-ci-like.sh`'s `BUN_VERSION` and the Bun line of `docker-ci-like.pins.sha256`, re-pinned from the release's `SHASUMS256.txt`. Say that `scripts/ci-cd/docker-ci-like-pins.test.ts` fails until both match `packageManager`, the one site CI catches.
- No new test: the one the issue names exists and binds both sites.

### File-level change map

| File | Change | Issue |
|---|---|---|
| `bunfig.toml` | `auto = "disable"` under `[install]`, with its comment | #260 |
| `.github/workflows/release.yml` | `--no-install` on the two store publishers' Bun lines (two lines) | #260 |
| `.github/workflows/pr-quick.yml` | `--no-install` on `preview-comment`'s two Bun lines and one comment; the trigger comment on labels | #260, #250 |
| `.github/workflows/_unit-tests.yml` | the `live` step; `BASELINE_MOVE_APPROVED` on the ci-gating step | #250 |
| `scripts/ci-cd/release-integrity.test.ts` | `autoInstallFindings`, `NO_INSTALL`, its clean test and twelve mutations; the behaviour test | #260 |
| `scripts/ci-cd/complexity-baseline.test.ts` | `movesApproved(env)`; the move-approval tests | #250 |
| `scripts/ci-cd/behavior-gating.test.ts` | the `_unit-tests.yml` live-step pin | #250 |
| `SECURITY.md` | one paragraph in § Dependency policy | #260 |
| `CLAUDE.md` | the Complexity budgets label sentence; the Bun-bump bullet | #250, #239 |

### Trade-offs and alternatives not taken

See the decision ledger.

**Competing outline B: `bun --no-install` on every run line, no `bunfig.toml` change.** Add the flag to every no-install job's Bun lines (nine in `release.yml`, four in `nightly.yml`, two in `store-check.yml`, one in `_release-pr-lockfile.yml`, three in `pr-quick.yml`) and pin that every Bun call in a no-install job carries it.
- For: independent of the checkout's shape, the working directory and the revision checked out; the form `verify-store-copies.yml` and `ci-release-supply` already use; visible at the call site.
- Against: nineteen edits across five files, fifteen in files `ci-release-supply` owns; a nested `bun` spawn is not covered; developer machines stay open (a script run in a fresh clone before `bun install` fetches from npm past the age gate). Where it buys something, on the three jobs that run another revision, the chosen design takes it.
- Not taken (D1).

**Outline v1 (`bunfig.toml` alone, plus `/bunfig.toml` in `preview-comment`'s sparse list).** Rejected in round 1: the store publishers and `preview-comment` read the revision they check out, so a revision that predates the control (a pull request cut before it lands, a release tag) runs without it.

## Security & Adversarial Considerations

- **Threat model.** The threat is not a malicious pull request author: the jobs that run pull-request code (`preview-comment`, the audit-mode step, the ratchet itself) already run that author's code. It is an unpinned fetch: a bare import added by mistake, in a job's script or a module it imports, that pulls whatever npm serves at that moment (a worm's fresh publish, a typosquat) past `bun.lock`'s integrity hashes and the seven-day gate, into a job that holds a release App token, `id-token: write`, `attestations: write` or a store credential.
- **Coverage by revision.** A job that runs its own revision reads the control from the same commit as the code it protects, so the two cannot drift; the pin keeps the control in every later commit. A job that runs another revision passes `--no-install` from the workflow, which covers revisions that predate the control. `store-check.yml` runs `main` before the next promote carries the control; `main`'s scripts are clean (Fact 5), and its next change arrives with the control.
- **What the control does not cover.** A Bun process that a repository script starts with its own directory or flags. The pin's comment names it; today only `source-rebuild.sh` runs Bun from a script, after its own install. `bunx` / `bun x` fetch by design and stay in installed jobs; `CLEAN` already refuses them in the tagging jobs.
- **Least privilege.** No permission is added. The live read uses the `pull-requests: read` that `pr-quick.yml` already grants; on fork pull requests the token is read-only and the repository is public, so the read works.
- **Fail closed.** An API failure fails the live step after one retry, so the unit-tests job and `quality-status` go red; a re-run recovers. A missing or malformed `BASELINE_MOVE_APPROVED` on a pull request run fails the ratchet instead of approving. A run whose head the pull request has moved past fails in the live step; its red result lands on that old head only, as a cancelled run's already does.
- **Label trust.** Who can apply `baseline:move-approved` does not change (anyone with triage access; a fork author cannot). The live read removes the stale copy. A label removed after the read and before the ratchet still counts for that run; the read sits directly before the ratchet to keep that window short.
- **Test isolation.** The behaviour test sends its one possible fetch to a loopback server, under a temporary `HOME`, for a never-published name, so a misrouted request cannot reach npm or run code.
- **Supply chain.** No dependency is added. `Bun.TOML`, `Bun.serve` and `Bun.spawn` are built-ins.
- **No gate is weakened.** Nothing becomes advisory, no required check is removed or renamed, nothing gains a bypass. The quality gate gains one fail-closed API dependency, as the four e2e lanes have.

## UI impact

None. This lane touches no screen, copy or formatted value. No no-ask record is used.

## Owner dependencies

- `ci-release-supply` owns `release.yml`, `nightly.yml` and the store workflows. This plan edits two lines of `release.yml`, one in each store publisher (`--no-install`), the lines #260 names; nothing else in those files. Arc 5 of that lane is held and not built, so no branch conflicts.
- `pr-quick.yml` changes in three places (the two `preview-comment` lines and two comments). No open PR touches it (`gh pr list` at planning: #271 only).
- OWNER-ASKS OA-1: how removing `baseline:move-approved` revokes. Option A ships now.

## Phases

All three phases form arc 1. Phase gates are cumulative.

**Gate commands used below.**
- **Fast:** `bun run lint && bun run typecheck:all`.
- **Gating:** `bun run test:ci-gating && bun run test:release`.
- **Actions:** `bun run lint:actions`.
- **Units:** `bun run test && bun run test:all`.

**How to show a new test red on the base.** Do it only after the phase's work is committed, so the restore brings the work back.
1. Overwrite the file under test with `git show af4afcc:<path> > <path>`.
2. Run the one test file. The new test must fail on its own assertion, not on a load or reference error.
3. Restore with `git checkout HEAD -- <path>`, check that `git status --short` shows nothing, and run the test file again: green.
Never change a test for this.

### Phase 1: no auto-install in no-install jobs (#260) ✓

Steps:
1. Add `auto = "disable"` under `[install]` in `bunfig.toml`, with its comment.
2. Add `--no-install` to the two store publishers' Bun lines in `release.yml`.
3. Add `--no-install` to `preview-comment`'s two Bun lines in `pr-quick.yml`, with its comment.
4. Add `autoInstallFindings`, its clean-tree test and its twelve mutations to `release-integrity.test.ts`.
5. Add the behaviour test.
6. Commit steps 1-5 (signed).
7. Show the clean-tree test red on the base copies of `bunfig.toml`, `release.yml` and `pr-quick.yml`, and the behaviour test red on the base `bunfig.toml`, by the procedure above. Record both in `lessons/phase-1.md`.
8. Run the job probe. Write the logging registry script under `~/.cache/nulo-backlog/ci-followups/`, outside any copy. Export the commit with `git archive HEAD` into `~/.cache/nulo-backlog/ci-followups/probe-260/`. In the copy, add a top-level static bare import to `scripts/release/lock-version-run.ts`. Run `bun scripts/release/lock-version-run.ts` from the copy's root with `BUN_CONFIG_REGISTRY` at the logging server. Expect zero requests and a non-zero exit. Then drop the `auto` line from the copy's `bunfig.toml`, run again, and expect one request. Record both in `lessons/phase-1.md`, then delete the copy.
9. Add the SECURITY.md paragraph.
10. Check I2 and I3:
    - `BUN_INSTALL_CACHE_DIR=$(mktemp -d -p ~/.cache/nulo-backlog/ci-followups) bun run audit:dup` exits 0 (a cold `bunx jscpd@…` fetch).
    - `bun scripts/ci-cd/audit-gate.ts mode --base "$(git rev-parse af4afcc)" --head "$(git rev-parse HEAD)"` prints `audit mode: enforce`.
    - `bun audit --audit-level=low --json > ~/.cache/nulo-backlog/ci-followups/audit.json; code=$?; bun scripts/ci-cd/audit-gate.ts ~/.cache/nulo-backlog/ci-followups/audit.json --exit-code "$code" --mode enforce` exits 0. On a non-zero exit, stop and surface it.

Validation gate: Fast; Gating; Actions; Units. Pass: every command exits 0; step 7 shows both new tests red on the base copies and green after the restore; step 8 records zero requests with the committed file and one without its `auto` line; step 10 passes as written. Layers: lint, typecheck, unit (pins and the behaviour test).

### Phase 2: the live move-approval label (#250) ✓

Steps:
1. Add the `live` step and the ci-gating step's env to `_unit-tests.yml`.
2. Change `movesApproved` to read the environment, drop `labels` from `pullRequestEvent`'s type, and rewrite its doc comment.
3. Add the move-approval tests.
4. Add the `_unit-tests.yml` pin to `behavior-gating.test.ts`.
5. Rewrite `pr-quick.yml`'s trigger comment and the CLAUDE.md sentence. Commit steps 1-5 (signed).
6. Show the stale-snapshot test red against the old behaviour, in place:
   - in `complexity-baseline.test.ts`, give `pullRequestEvent`'s type its `labels` back and make `movesApproved(env)` return `(pullRequestEvent(env.GITHUB_EVENT_PATH)?.labels ?? []).some((l) => l?.name === MOVE_APPROVED_LABEL)`, the base rule under the new signature;
   - run `bun test scripts/ci-cd/complexity-baseline.test.ts -t "move approval"`: the stale-snapshot case fails on its assertion;
   - restore with `git checkout HEAD -- scripts/ci-cd/complexity-baseline.test.ts` and rerun: green.
7. Show the pin red on the base `_unit-tests.yml` by the procedure above. Record both reds in `lessons/phase-2.md`.

Validation gate: Fast; Gating; Actions; Units. Pass: every command exits 0; steps 6 and 7 record each red on its own assertion and green after the restore; `bun test scripts/ci-cd/complexity-baseline.test.ts` passes locally with `GITHUB_ACTIONS` unset. Hosted proof waits for the PR (§ Delivery). Layers: lint, typecheck, unit.

### Phase 3: the Docker Bun pins in the runbook (#239) ✓

Steps:
1. Edit CLAUDE.md's Bun-bump bullet as § #239 says.

Validation gate: Fast; Gating. Pass: both exit 0; `./scripts/check-no-local-paths.sh` passes with CLAUDE.md staged. Layers: lint.

## Delivery

One arc, one PR against `dev` (the orchestrator's D-orch-1: no stack). The close-out lands as the same PR's final commits.

| Arc | Branch | Phases | Base | `/code-review` | PR title (≤ 93 characters) | Closes |
|---|---|---|---|---|---|---|
| 1 | `worktree-ci-followups` (adopted; carries the plan commit) | 1-3, then the close-out | `dev` | off | `ci: refuse bun auto-install, read the baseline move label live, name docker bun pins` (84) | #260, #250, #239 |

- Open the PR with `gh pr create --base dev` only after every gate above passes and the Codex fix loop converges. Open it without labels.
- **What CI runs.** `bunfig.toml` is in every lane's path filter, so `quality-status`, the full builds, and the smoke and network suites on Chrome and Firefox all run without a label. They are the hosted check of I2 for installed jobs. Watch them to the end; a red is one rerun for a known flake, or a fix.
- **Hosted proof.** In the quality run, the "Read the live move-approval label" step prints `label-hit=false (any of: baseline:move-approved)`, and the ratchet passes. Quote both in the PR body. No `workflow_dispatch` is run: the live step and the preview job run on `pull_request` only.
- Body: what changed and why per issue; the validation runs with outcomes; the probe's table; `Closes #260`, `Closes #250`, `Closes #239`.
- Never merge, never `--admin`, never force-push.

## Pickup map

- **Arc 1:** #260 (Phase 1), #250 (Phase 2), #239 (Phase 3).
- **No arc:** none.

## Post-implementation

Run this section in order. It is the whole procedure; no other document is needed.

1. **No `/code-review`.** `code_review` is `off`.
2. **Codex audit** of the whole diff from `af4afcc`, after Phase 3's gate passes. Run `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol` with:
   - the diff;
   - this plan and its decision ledger;
   - the adversarial ask ("What could go wrong? What would an attacker target? What are we trusting that we shouldn't? Does any change weaken a gate?");
   - these two rules, verbatim:
     - *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."*
     - *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*
3. **Fix loop.**
   - Verify each finding against the tree first.
   - Apply the accepted fixes, commit, and log the round in `lessons/phase-3.md`.
   - Resume the same session with `resume-codex.sh` and the fix diff.
   - Stop when a round has no new material finding. If findings are still material after three rounds, stop and surface them.
4. **Delivery**, per the Delivery section. This is the first time any PR opens.
5. **Close-out**, as the PR's final commits:
   - **Merge `origin/dev` first**, and read what changed in `index.md` and `lessons.md`. Never a union merge.
   - **The `## Outcome` block**, directly after the front matter: the date and the status; what shipped, with the PR number; each dropped or declined item with its reason; an `Open items:` line; a line retiring this plan's `/goal` and `/loop` seeds.
   - **Promote the generalizable gotchas** to `implementations-plan/lessons.md` (≤ 8 KiB; dedupe, retire, date tool versions). Candidate: "Bun reads `bunfig.toml` from the working directory only; with no `node_modules` it auto-installs a bare import unless `auto = "disable"` there or `--no-install` (1.4.2)".
   - **File every open item where it lives:**

     | Situation | Home |
     |---|---|
     | Work inside the implementation you are on | the active `plan.md` and the PR |
     | Actionable work that outlives the plan | a GitHub issue, with a domain label and a `Record` link to the archived plan |
     | Needs a product call, or waits on something outside the repo | an issue labelled `owner-decision` or `blocked:external` |
     | A suspected exploitable weakness | a private draft security advisory; the plan records only "tracked privately: GHSA-…" |
     | Rejected, superseded or already done | a disposition line in the Outcome block |
     | Knowledge that prevents a repeat | `implementations-plan/lessons.md` |
     | A legal or store blank with a release deadline | `BEFORE-LAUNCH.md` |

     Dedupe first (`gh issue list --state all --search "<words>"`). An issue body has `## What happens`, `## Where`, `## Impact`, `## Possible fix`, `## Record`.
   - **OA-1 unanswered at close-out:** open an `owner-decision` issue for it (option A shipped), and name it on the `Open items:` line.
   - **Archive the plan:** `git mv implementations-plan/ci-followups implementations-plan/archive/ci-followups` in its own commit; repair the links the extra directory level breaks; move the index line to `archive/index.md`; delete `STATUS.md`.
   - **Report and wait.** Merging is the orchestrator's call.
6. **Teardown after the merge.**
   - When `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/ci-followups/plan.md` succeeds, run `agent-worktree done ci-followups --merged --trunk dev` without asking. This session did not enter through `EnterWorktree`, so there is nothing to exit.
   - The command refuses rather than forces. Relay a refusal and stop.
   - A `/loop` session checks this on every firing. A `/goal` session arms one background wait after its wrap-up: `until git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/ci-followups/plan.md; do sleep 300; done`.

## Decision ledger

| # | Decision | Why | Panel |
|---|---|---|---|
| D1 | #260: `auto = "disable"` in `bunfig.toml` for every job that runs its own revision, and `--no-install` on the three jobs that run another revision's code; not outline B, not `bunfig.toml` alone | Each Bun call gets the one control guaranteed to reach it. The file travels with the code it protects and covers imports, `bun -e`, nested spawns, future jobs and developer machines; the flag covers code whose `bunfig.toml` may predate the control. Outline B needs nineteen edits, fifteen in another lane's files | Round 1: Codex (finding 1, High) and Opus (finding 4) showed `bunfig.toml` alone misses the store publishers' older revisions; both kept the file as the primary control and proposed targeted flags. Accepted: v1's sparse-list change for `preview-comment` is replaced by the flag, which also covers heads cut before this lands |
| D2 | The pin checks each Bun call's control: `bun --no-install` with no install override, or its own revision at the root with the file present, no change of directory before the call and no configuration override; the selected jobs must equal `NO_INSTALL` | Bun reads the file from the working directory only (probe), so the value alone proves nothing | Round 1: Codex (finding 2, High) and Opus (finding 3) found v1 missed a `cd` before a Bun line, `--cwd`, composite steps, a checkout `path:`, and selected `publish-packages.yml#pack`. Accepted: all added, selection excludes installing jobs. Rejected: Codex's "reject uncovered wrapper scripts" via an allowlist, because an allowlist entry pins nothing about the script's own Bun calls; the one wrapper (`source-rebuild.sh`) installs first, and the blind spot is stated in the comment (Opus agreed; the final pass agreed). Final pass: the composite's guarded install must not deselect jobs, `--config`/`--install` overrides, cone mode; all accepted |
| D3 | A behaviour test proves Bun refuses under the committed file; its control is the same file minus `auto` | A Bun bump that drops the key passes any static check; error text cannot tell a refused install from a failed one (probe), so the test counts requests | Round 1: both kept it (Opus: `publish-packages.test.ts:217-240` uses the same shape). Accepted from both: `process.execPath`, temporary `HOME`/`TMPDIR`/cache, a never-published name, an ancestor `node_modules` check, cleanup in `finally`; Opus's stronger control adopted |
| D4 | `verify-store-copies.yml` keeps its `bun --no-install` | Harmless, pinned, owned by `ci-release-supply` | Not challenged |
| D5 | #250 reads the label through `live-labels.sh` in the unit-tests job, on `pull_request` only, directly before the ratchet, guarded on the script's presence | Tested reader already used by the e2e lanes; "Re-run failed jobs" repeats it; the test stays network-free; the guard follows the file's own `[ -d … ]` convention | Round 1: both found it sound for every caller and event. Opus (finding 7) found the merge-commit workflow / head checkout mismatch fails a head without the script (the post-release sync PR, since `main` lacks #252): accepted as the guard, which opens nothing (D6) |
| D6 | On a pull request run the value must be `true` or `false`, else the ratchet fails; off Actions it is `false` | A wiring regression shows at once instead of as a mysterious refusal; matches the e2e lanes' `LABEL_HIT` refusal | Round 1: Codex (finding 6, Low) asked for the malformed and local cases: accepted |
| D7 | No `labeled`/`unlabeled` trigger; a removed label takes effect at the job's next run | A label event would re-run the whole quality battery for every label | Round 1: Codex (finding 5, Medium) held the revocation semantics are the owner's call. Accepted: OWNER-ASKS OA-1, option A (today's semantics, made live) ships now. Opus judged D7 fine |
| D8 | #239 is a docs change only; no test reads CLAUDE.md | The named pin test exists; a test of runbook prose would pin wording, not behaviour | Both agreed |
| D9 | One arc, one PR | D-orch-1; small changes in CI files, reviewable in one sitting | — |
| D-orch-2 | OA-1 ships as option A: applying or removing `baseline:move-approved` takes effect at the unit-tests job's next run. No issue is filed for OA-1 | The orchestrator carries OA-1 to the owner's decision page (page 5); the Outcome records it open there | Orchestrator, 2026-10-11 |
| D-orch-3 | The two `release.yml` lines (`--no-install` on the store publishers' Bun lines) are this lane's, and nothing else in that file. The PR runs the audit gate in enforce mode, the full builds and both e2e suites on both browsers; an unacknowledged advisory stops the arc | `ci-release-supply` holds no open PR, and its arc 5 waits on page 5 | Orchestrator, 2026-10-11 |
| D10 | Implementation deviations from D2, each stricter than the plan: the own-revision check also refuses a checkout's `with.repository`; the composite's `install` input is compared as a string, so an unquoted YAML `false` still selects the job; the Bun-call matcher is a non-global constant, and each step is scanned with a fresh global copy | `repository` is the same class as `ref` and `path` (another tree's `bunfig.toml`, or none at the root). A shared `g` regex carries `lastIndex` between `test()` and `matchAll` (lessons/phase-1.md) | Implementer, 2026-10-11 |

## Audit verdicts

### Round 1, Codex (gpt-6.1-sol, high, read-only), 2026-10-10

Session `01a1282e-51fd-7a82-a68c-8eeb9d785707`. Verdict: **conditional approve** (with conditions: close D2's coverage gaps, resolve historical-checkout coverage, repair the audit validation commands, and make the registry test hermetic).

| # | Finding | Disposition |
|---|---|---|
| 1 | High. The store publishers check out `resolve.sha`, whose `bunfig.toml` can predate the fix; target those revisions explicitly, by targeted `--no-install` | Accepted (D1). Every revision they can check out today is clean (Fact 5), but the flag makes that independent of history; `preview-comment` gets the same treatment |
| 2 | High. The pin misses `cd … && bun`, `bun run --cwd`, wrapper scripts, composite actions, checkout `path:` and a missing checkout; reuse `expanded()` | Accepted except the wrapper allowlist (D2) |
| 3 | Medium. Step 8's `audit-gate.ts mode` needs 40-hex SHAs; `mode` does not judge advisories; raw `bun audit` ignores the acknowledgements | Accepted: Phase 1 step 10 runs CI's two commands with resolved SHAs |
| 4 | Medium. Make the behaviour test hermetic (`process.execPath`, temporary `HOME` and cache, unique name, ancestor `node_modules`, cleanup); the archive probe duplicates it | Accepted the hermeticity. The job probe stays: the lane brief requires it, and it runs a real job script from a real tree, which the test does not |
| 5 | Medium. Revocation semantics are an owner decision | Accepted (D7, OA-1) |
| 6 | Low. Add the malformed-value and off-Actions cases | Accepted (D6) |

I1: "reasonable, moderate confidence; the live read remains correct regardless" (rewritten so nothing rests on it). I2: keep the smoke checks.

### Round 1, Opus (Plan agent, read-only), 2026-10-10

Verdict: **conditional approve** (with conditions: fix Phase 1 step 8's audit command; correct the "no e2e suite is affected" claim; make the pin catch a `cd` before `bun` and tighten which jobs it selects; say that the two store-publish jobs read the tag's `bunfig.toml`; isolate the behaviour test from the user's `HOME`).

| # | Finding | Disposition |
|---|---|---|
| 1 | Medium. The audit command cannot pass as written; run CI's form; on an advisory, stop | Accepted (Phase 1 step 10, I3) |
| 2 | Medium. `bunfig.toml` is in all four e2e lanes' filters: the PR runs smoke and network | Accepted (Fact 9, § Delivery) |
| 3 | Medium. Catch a `cd` before a Bun call; exclude installing jobs (`publish-packages.yml#pack`); flag `with.path`; scan `expanded()` | Accepted (D2) |
| 4 | Medium. The store publishers read the tag's file; say so, and `--no-install` on those two lines is where outline B buys something | Accepted, done in this lane (the two lines #260 names) rather than filed for `ci-release-supply` |
| 5 | Medium. Isolate the behaviour test from `HOME` (`~/.bunfig.toml`, `~/.npmrc`); never-published name; `process.execPath`; stronger control | Accepted (D3) |
| 6 | Low-Medium. I2's `bunx` check passes on a warm cache | Accepted: a fresh `BUN_INSTALL_CACHE_DIR` |
| 7 | Low. A head without `live-labels.sh` fails the new step (the sync PR from `main`) | Accepted: the file guard (D5) |
| 8 | Low. Steps 5 and 6 can be read two ways | Accepted: § Phases states the red-on-base procedure; the probe step is spelled out |
| 9 | Low. No index line to move | Accepted: the index line lands with the plan commit |

Facts: F1 narrowed (`auto = "disable"` was probed for `bun <file>` only; the `bun -e` line now carries the flag); F5's line numbers corrected.

### Final fresh Codex pass (gpt-6.1-sol, high, read-only, new session), 2026-10-10

Session `01a1283c-c981-7061-9ea9-00efa5946a7d`. Verdict: **conditional approve** (with conditions: repair D2's selection and control checks, correct the sparse-checkout mutation, and make the red-on-base procedures executable). It found F1-F9 hold, D1 the right architecture, D5/D6 sound, the behaviour test appropriate, and both round-1 rejections justified. Every finding was checked against the tree before it was applied.

| # | Finding | Disposition |
|---|---|---|
| 1 | High. `expanded()` includes the composite's `bun install` step without its `if`, so an `INSTALLS` test on expanded steps drops every composite job; mutations 4, 5, 6 and 9 would find nothing | Accepted, verified (`release-integrity.test.ts:49-52`, `setup-bun/action.yml:46`): the selection reads the job's own steps for installs and skips `setup-bun`'s internals; `NO_INSTALL` and the exact-selection assertion are the success control |
| 2 | High. `--config`/`-c` and `--install`/`-i` override the root file on the file path; `--no-install` must belong to the call | Accepted, verified (`bun-types` `docs/snippets/cli/run.mdx:160-166,303`): the flag path needs `bun --no-install` first and no `--install`/`-i`; the file path refuses all four; mutations 10 and 11 |
| 3 | Medium. Cone-mode sparse checkout always includes root files, so mutation 8 as written removes nothing | Accepted, verified (`git help sparse-checkout`): the own-revision rule distinguishes cone from non-cone; mutation 8 is non-cone |
| 4 | Medium. Restoring with `git checkout -- <path>` before committing discards the work | Accepted: commit first, restore from `HEAD`, rerun green |
| 5 | Medium. A scratch copy of the test under `~/.cache` breaks its relative imports, and the old body references `eventPath` | Accepted: the red is shown in place with the base rule adapted to the new signature, then restored from `HEAD` |
| 6 | Low. Keep OA-1's exact revocation limits in delivery | Already in OWNER-ASKS.md; the PR body repeats them |

Also: recon.md's "edits none" collision line was stale; corrected to the two store-publisher lines.

**Resumed final pass (same session), 2026-10-11.** Verdict: **approve**. All six conditions met; `NO_INSTALL` checks the dynamic selection rather than replacing it, the flag path needs a real leading flag, cone handling is correct, mutations 10-12 cover the new controls, and Phase 2's red keeps its imports. Two Low documentation corrections, both applied: Phase 1 step 4 said "nine mutations" (now twelve), and the prototype log said 19 file-path calls (it is fifteen; 20 calls in all).

### Fix loop round 1, Codex (gpt-6.1-sol, high, read-only) and Opus (general-purpose), 2026-10-11

Codex session `01a1285a-fdc6-72c2-806e-162c15c0b13d`. Codex: **approve with fixes** (3 Medium, 2 Low). Opus: **approve once its finding 1 is fixed** (1 Medium, 4 Low). All ten verified against the tree or by probe (lessons/phase-3.md) and accepted; fixed in one commit.

| # | Finding | Disposition |
|---|---|---|
| Opus 1 | Medium. `bun x` and `bun create` fetch under `auto = "disable"` and escape both `INSTALLS` and the per-call check; § Security's "`CLEAN` already refuses them" was false for `bun x` | Accepted: `INSTALLS` counts them as installs, so a listed job that gains one fails the selection control and the tagging jobs refuse it; a `CLEAN` mutation; SECURITY.md says so |
| Codex 1 | Medium. Argument parsing stopped at a `;` inside quoted `-e` code and at a line continuation | Accepted: continuations joined, quoted text blanked before cutting; two mutations |
| Codex 2 | Medium. setup-bun's steps were skipped wholesale; composites were read one level deep | Accepted: `expanded()` recurses; only setup-bun's input-guarded install step is dropped; two mutations |
| Codex 3 | Medium. A non-cone list with `/bunfig.toml` then `!/bunfig.toml` passed | Accepted: a `!` pattern fails the own-revision rule; one mutation |
| Codex 4, Opus 3 | Low. "overrides --no-install" is false on Bun 1.4.2 (`--no-install` wins in either order) | Accepted: refusal kept as strictness, renamed "conflicting auto-install flags" |
| Codex 5 | Low. A tautological comment; selection's reason unstated | Accepted |
| Opus 2 | Low. A Bun call in backticks was not matched | Accepted; one mutation |
| Opus 4 | Low. A `git checkout`/`switch` in a step moves the revision, as `with.ref` does | Accepted: any such step fails the own-revision rule (none today); one mutation |
| Opus 5 | Low. A docblock line left at 176 characters | Accepted |

### Fix loop round 2, Codex (same session), 2026-10-11

Verdict: **approve with fixes** (three new Medium). All verified and accepted; fixed in one commit.

| # | Finding | Disposition |
|---|---|---|
| 1 | Medium. Round 1's blanking erased quoted flags (`bun "--install=force" -e '…'` passed and fetches; a quoted `"--no-install"` became a false positive) | Accepted: a quoted word without whitespace or a separator is unquoted, quoted code stays blanked; a mutation and a success control |
| 2 | Medium. `INSTALLS` read raw text, so `bun \`-newline-`x pkg` escaped selection and `CLEAN` | Accepted: one `script(step)` joins continuations for every check; two mutations |
| 3 | Medium. `git -c … checkout` and `git -C dir checkout` escaped the revision-switch rule | Accepted: options before the subcommand are skipped; two mutations |

The comment over `NO_INSTALL` now names the check's second blind spot, a command the shell assembles at run time (a variable, `eval`); the threat is an accidental import or call, not an evasive author (§ Security).

### Fix loop round 3, Codex (same session), 2026-10-11, the last

Verdict: **approve with fixes** (one new Medium). `bun --silent x <pkg>` and `bun --silent create <t>` fetch under `auto = "disable"` and escaped `INSTALLS`, whose round-1 pattern expected the subcommand right after `bun`. Accepted: option words may precede `x`/`create`; two mutations, red on the previous pattern. A value-taking option before the subcommand (`--cwd dir x`) still escapes `INSTALLS`, but in a job that installs nothing the per-call check refuses `--cwd` and `-c` by itself. The hard stop is three rounds, so this last fix had no fourth Codex pass; the round's other areas (composite recursion, sparse exclusions, quoting, the conflict rename, comments) drew no finding.

## Seeds

Recommended: `/goal`. Use exactly one per session.

```
/goal All phases of implementations-plan/ci-followups/plan.md marked ✓ in the file, each backed by its validation gate reported passing in the transcript; for each phase `LESSONS_FILE=implementations-plan/ci-followups/lessons/phase-N.md` printed; `/code-review` NOT run (code_review is off); the Codex fix loop on the whole diff from af4afcc converged, evidenced by a resumed gpt-6.1-sol pass reporting no new material findings, quoted in the transcript; one PR against dev exists, created only after the loop converged (`gh pr view` output in the transcript), carrying `Closes #260`, `Closes #250`, `Closes #239`, with every check green including the smoke and network suites, and the close-out as its final commits (`git show --stat` of the archive-move commit in the transcript); `bun run test:ci-gating` and `bun run lint` both exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/ci-followups forward. Never idle waiting for my input. Each firing:
1. Reality check: read implementations-plan/ci-followups/plan.md and lessons/ (authoritative, not the chat), including the Outcome & Quality Bar. If that path is gone, the close-out ran: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/ci-followups/plan.md` succeeds → run `agent-worktree done ci-followups --merged --trunk dev` without asking, report its output (verbatim on refusal, never force), clear this loop and STOP; fails → delivered and awaiting the merge: babysit CI only, report once when green, then STOP. A live plan.md with an `## Outcome` block means an interrupted close-out: finish it. Otherwise rebuild the task list from plan.md, run `git status` and `git log --oneline -5`; with a PR, `gh pr view --json statusCheckRollup`.
2. Waiting on CI is fine: confirm progress with `gh run watch <id>` up to 10 minutes; stuck → read the logs and log it in lessons.
3. No task in hand? Take the next pending step from plan.md. After each edit run `bun run lint` and the touched test file. Commit (signed, conventional, lower-case subject).
4. Stuck or facing a decision? Consult `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` and settle on the stronger argument; log it in lessons/phase-N.md. Hard limits stay hard: never merge, never edit release.yml beyond the two store-publisher lines, never touch nightly.yml or the store workflows, never weaken a gate, never expand scope.
5. Same step failed 5 times? Stop and reassess with Codex.
6. Phase green means its plan.md validation gate passes: paste the result, mark ✓, write lessons, print `LESSONS_FILE=implementations-plan/ci-followups/lessons/phase-N.md`.
7. All phases ✓? Run the Post-implementation section: the Codex loop with its two verbatim rules until a round has nothing material (3-round hard stop), then `gh pr create --base dev`, then the close-out commits, then `gh pr checks --watch`, then the wrap-up report. Merging is not yours.
```

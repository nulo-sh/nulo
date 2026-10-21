---
plan: soak-mode-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at cef87d9de
trunk: dev
issues: "#1014 (A1 closes it)"
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-21.
- **Status:** delivered as one ready PR against `dev`, #1020, which carries this close-out; its merge closes
  the plan and #1014.
- **Shipped:** the soak takes named network files only (`test_files` required, `mode` and `shard` gone);
  `prep` refuses a bad token, a missing file, `repeats` outside 1 to 25 and `retry` other than empty or one
  digit; each iteration reads its report back through `assert-canary-results.ts --allow-unlisted`; `Status`
  states the true count, claims zero test retries only at `retry=0` and names a cancel as one. Pinned in
  `behavior-gating.test.ts`, `aggregators.test.ts` and `assert-canary-results.test.ts`; `CI.md`,
  `.github/WORKFLOWS.md` and the `e2e-testing` skill say the nightly builds `dev` only and the branch's
  whole-suite retry-0 run is a dispatch of the two PR network workflows.
- **Dispatch proof:** a blank list gets HTTP 422 at dispatch and no run; 39673385943 refused a typo at
  `prep` in 5 s; 39673485998 ran `cap-request-basic` once green, read back, at retry 0.
- **Review loop:** plan: Codex four rounds, approve at r4, Opus beside r1 and r3. Arc: Codex r1 one
  finding and Opus r1 five, all fixed; Codex r2 clean.
- **Gates at the head:** `lint`, `typecheck:all`, `test:all`, `test:ci-gating`, `test:release`,
  `lint:actions`, `check:plans` exit 0; `bun run test` red only on static-scan timeouts at load 281 on 188
  cores, a different file each run, each green alone.
- **Dispositions:** D1's F (fan-out through the lane) not taken: eleven runners per iteration, and the
  whole suite at retry 0 already exists per browser; revisit when one commit needs repeated whole-suite
  qualification. D2's shard mode dropped, a deviation from #1014's `n ≥ 2` stated in the PR body. The
  inference that whitespace passes `required` was false; the docs say GitHub refuses a blank list.
- **Known limits:** #1018 (D5); #977 unchanged. **Open items:** none.
- **Lessons:** none promoted. The candidate (the nightly builds `dev` only; a branch's whole-suite run is
  a PR-workflow dispatch) is stated in `CI.md` and the `e2e-testing` skill, its owners, and `lessons.md`
  has 18 B left.
- **Seeds retired:** the `/goal` and `/loop` seeds below.

# soak-mode-1: the network soak runs only named files, and says what it proved

One arc, one PR against `dev` (the orchestrator's D-orch-1: no stack). **A1** (branch `soak-mode-1-a1`)
makes `extension-network-e2e-soak.yml` a files-only repeat-runner that refuses what it cannot run,
reads each iteration's vitest report back so a green soak means every named test ran and passed, makes
its `Status` line true, pins all of it, and says in `CI.md`, `.github/WORKFLOWS.md` and the `e2e-testing`
skill what a soak is and which instrument runs the whole suite. Closes #1014. Recon: [recon.md](recon.md).
Consults: [lessons/phase-0.md](lessons/phase-0.md).

## The claims and what did not hold

- **"`mode=full` runs the whole suite in one job; the 30-minute limit kills it."** Holds (run
  39642793500: 30:20, 30:18). **Added**, demonstrated from the code: an empty or whitespace-only list
  reaches the same branch (`_extension-network-e2e.yml:271,280-285`); tokens reach vitest as arguments,
  so `--passWithNoTests --exclude=**` greens an iteration that ran nothing; vitest ORs its positional
  filters case-insensitively, so a typo beside a real path is dropped; `prep` clamps `repeats`
  (`extension-network-e2e-soak.yml:67-70`) while `Status` prints the raw input (`:112`), claims "zero
  retries consumed" at any `retry` and calls a refused dispatch "a flake to fix" (`:109`); a bad `retry`
  reds every iteration only after setup (`apps/extension/vite.shared.ts:113-122`).
- **Seven network files run nothing real on a Chrome soak**: `send-chaos` (armed only by the lane's chaos
  jobs), `_probe-warmup-effect`, `update-in-place`, `store-captures`, `stale-anchor-recovery`,
  `stale-network-a10-capture` (opt-ins no workflow sets, one through a helper) and
  `firefox-background-restart` (Firefox only). `stale-anchor-recovery`'s setup-contract test passes alone.
- **`mode=shard` names a set nobody can name**: a split of all 133 network-config files with no exclude
  list. Estimated file time for `1/2` is 2093 s, about 35 minutes before the build (`assignShards`
  recomputed); `1/5` passed once in 11:56 (run 38972587282).
- **"The nightly dry-run on a branch is one green soak; run 39652968832 is one."** **Does not hold.**
  `nightly.yml`'s `resolve` refuses every ref but `dev` (`:108-111`); that run failed there in 10 s. The
  nightly runs the lane at the config-default retries (`:39-45`); its one `nightly` group cancels a run
  in flight (`:71-79`). The whole-suite retry-0 run on any ref is a dispatch of
  `pr-extension-network-e2e.yml` and of its Firefox twin, or a green PR run.
- **"`CI.md` has a soak section and names 'one green soak'."** Neither exists. The `release` skill never
  names the soak: no change there.

## Decision ledger

| # | Decision | Codex | Opus | Reason |
|---|---|---|---|---|
| D1 | Refuse (R), not fan out (F) | R | R | Below. |
| D2 | Drop `mode` and `shard`: named files only | accept, loss stated | drop | A file list names its set; run 38972587282's workload can be written as one. Deviates from #1014's `n ≥ 2`: the PR body says so. |
| D3 | `prep` refuses a token outside `^tests/e2e/(network/[A-Za-z0-9_-]+\|egress-guard)\.test\.ts$` or naming no file in a sparse checkout | yes | yes | Options, directories, globs, `..`, smoke files and typos, before any build. |
| D4 | Each iteration reads its vitest report back: every named file present, every test `passed`, canary titles kept where `canary-expectations.json` lists the file | read-back | read-back | Reuses the suite's own answer to this class. A name list (r2) missed two of the seven hollow files. |
| D5 | Strict: any skipped test reds, so `window-placement` (a Firefox-only block) and `import-handshake-note-matrix` (a row skipped on CI) cannot soak green | document | document | Looser ("one passed") greens `stale-anchor-recovery`. A known limit, filed at close-out. |
| D6 | Refuse `repeats` outside 1 to 25 and `retry` outside empty or one digit; claim zero test retries only at `retry=0` | yes | yes | False lines in the soak's own evidence. |
| D7 | `status`: any `prep` result but `success` reads "the iteration matrix was not built (prep=…)" | yes | yes | Never misnames a cancel as a refusal. |
| D8 | `prep` pins in `behavior-gating.test.ts`; `status` in `aggregators.test.ts`'s `CASES`; the flag in `assert-canary-results.test.ts` | — | yes | Each file already owns its kind. |

**D1.** F calls `_extension-network-e2e-lane.yml` per iteration: a second soak job (`uses:` cannot follow an
input) and a `Status` over both; unique log-artifact names per iteration (the lane's fixed `shard_label`s
collide at `_extension-network-e2e.yml:416`); a `LANE_CALLERS` row with `strategy`, which the key-set pin
refuses (`behavior-gating.test.ts:986`), and a `fromJSON` matrix `legsOf` refuses (`:183-190`); eleven
runners for about 15 minutes per iteration (run 39654525827: 112 runner-minutes). R keeps the soak's job,
repeating a narrow workload at retry 0 to prove a flake fix; the whole-suite retry-0 run exists per
browser. Stated cost: nothing repeats the whole suite N times at retry 0 in one dispatch. **Revisit** when
a plan or the owner needs repeated whole-suite qualification of one commit.

**Not done**: pinning the soak to one SHA (closed known limit #977, condition not met); a Firefox soak (no
`browser` input; the docs say so); copying `proverless-guard.sh` into `prep` (with `proverless=false` it
refuses a `@requires-proverless` file at each iteration's start, before the build: an honest red).

## Outcome & Quality Bar

- **For whom**: a maintainer or the orchestrator dispatching a soak to prove a flake fix, who reads only
  `Status` and the run's colour.
- **Excellent**: (1) a malformed or missing file, `repeats` or `retry` is refused inside `prep`, with one
  `::error::` line naming the input and the rule (and, for an empty list, the whole-suite instruments);
  (2) a green `Status` means every test of every named file ran and passed in every iteration, states the
  true count, and claims zero test retries only at `retry=0`.
- **Good enough**: a hollow file is red only after each iteration's build; a list too long for one
  30-minute job still times out (the docs say so).

## Assumptions

**Facts** (verified at `cef87d9de`):
1. The soak hands `shard: ''`, `test_files: ''` for `mode=full` (`extension-network-e2e-soak.yml:84-90`); the suite
   then runs `bun run e2e:agent` with neither (`_extension-network-e2e.yml:285`) under `timeout-minutes: 30`
   (`:115`); `agent.sh:239` forwards every argument to `vitest run`.
2. The suite tokenizes with `read -ra TEST_FILE_LIST <<< "${TEST_FILES//$'\n'/ }"` (`:271`), again in its
   canary step (`:321`): shell state does not cross steps.
3. Inputs reach `prep` and `status` only through `env:` (`extension-network-e2e-soak.yml:63-64,101-105`).
4. Both PR network workflows run the lane at `retry: "0"` on `workflow_dispatch`
   (`pr-extension-network-e2e.yml:109-111,123-133`; Firefox twin `:95-97,109-117`); a second dispatch on one
   sha cancels the first (`:21-25`).
5. 132 network files `tests/e2e/network/<name>.test.ts`, `<name>` in `[A-Za-z0-9_-]`; the network config adds
   `tests/e2e/egress-guard.test.ts` (`apps/extension/vitest.e2e.network.config.ts:19`).
6. `canaryProblems` (`scripts/ci-cd/assert-canary-results.ts`) fails a file absent from the report, a file
   with no test, any test not `passed`, and a listed title not reported; the suite writes the json report
   only when `NULO_E2E_RESULTS_FILE` is set (`vite.shared.ts:102`), today for chaos or `canary*` labels.
   vitest 4.1.10 reports a skipped `describe`'s tests as `skipped` (fixture `skipped-chrome.json`).
7. No lane or nightly label starts with `soak`; the soak's is `soak-${{ matrix.iteration }}`.

**Verified at dispatch** (the inference here was wrong): GitHub trims a required input before its check,
so an empty, space, newline or tab `test_files` is refused with HTTP 422 and starts no run. `prep`'s
empty-list refusal stays, pinned, for the day `required` goes.

**Asks**: none for the owner. No product surface changes; the soak's dispatch form loses `mode` and `shard`
(maintainer tooling, the panel's call, stated in the PR body with the new command).

## Architecture & Implementation

- **Soak inputs**: `mode`, `shard` and `test_files`' default go; `test_files` is `required: true`, its
  description states D3 to D5 and names the whole-suite instruments; `repeats` says 1 to 25, `retry`
  empty or one digit. `proverless`, `disable_presto` stay.
- **`prep`**: a sparse checkout of `apps/extension/tests/e2e` (`actions/checkout` at the SHA the repo pins,
  `persist-credentials: false`), then `gen` with `env:` `TEST_FILES`, `REPEATS`, `RETRY`: tokenize with the
  suite's line verbatim; refuse zero tokens (naming both PR network workflows); check every token against
  D3 and `-f`, naming the first offender; check `REPEATS` against `^([1-9]|1[0-9]|2[0-5])$` and `RETRY`
  against `^[0-9]?$`; write `iterations` as today. Idiom: `::error::… got '$X'` + `exit 1`.
- **`soak`**: hands `test_files: ${{ inputs.test_files }}`, no `shard`; the rest unchanged.
- **`status`**: `prep` not `success` → D7's line, exit 1; `soak` not `success` → "Soak NOT clean (soak=…)",
  exit 1; else "all N iteration(s) green, every named test ran", adding "with zero test retries" only when
  `RETRY` is `0` (the suite's exit-86 boot retry is not a test retry). "do NOT flip the gate" goes.
- **Suite** (`_extension-network-e2e.yml`): the run step's `NULO_E2E_RESULTS_FILE` condition gains
  `|| startsWith(inputs.shard_label, 'soak')`; a new step "Assert soak results", `if: ${{ always() &&
  !cancelled() && startsWith(inputs.shard_label, 'soak') }}`, `env: TEST_FILES`, re-tokenizes with the same
  line and runs `bun scripts/ci-cd/assert-canary-results.ts --allow-unlisted "${RUNNER_TEMP}/canary-results.json"
  "${TEST_FILE_LIST[@]}"`. The canary step and its `if` stay; the comment above both says chaos, canary and soak.
- **`assert-canary-results.ts`**: `--allow-unlisted`, read before the report path, gives an unlisted file
  an empty title list and keeps listed files' titles; without it nothing changes. Usage line and header
  updated.

## Security & Adversarial Considerations

- **Who dispatches**: a repository writer; a fork cannot. The boundary is evidence integrity: a green soak
  ran every named test at the stated retry. Option tokens, typos and hollow files are the paths to a green
  that ran less; D3 and D4 close them, D4 from the report, so a future opt-in file is caught unlisted.
- **Shell**: inputs stay in `env:` and quoted arrays; no `${{ }}` in `gen`'s, `status`'s or the new step's `run:` (pinned).
- **Lane isolation**: the suite change acts only on `soak*` labels, which no lane, nightly or release job
  carries (pinned); a missing report fails closed.
- **Least privilege and supply chain**: permissions unchanged; the one added action is `actions/checkout`
  at the repo's pinned SHA, persisting no credential. Crypto, frontend, contracts: N/A.

## Phase 1 (A1): refusals, read-back and `Status`

- **Change map**: `.github/workflows/extension-network-e2e-soak.yml`; `.github/workflows/_extension-network-e2e.yml`;
  `scripts/ci-cd/assert-canary-results.ts`; tests in `scripts/ci-cd/behavior-gating.test.ts`
  (`describe("network soak")`, and the suite pin at `:1146-1162`), `scripts/ci-cd/aggregators.test.ts`,
  `scripts/ci-cd/assert-canary-results.test.ts`.
- **Tests** (`gen` runs as `nightly-resolve.test.ts` runs a step: cwd the repo root, env `PATH` plus its
  three keys, a temp `GITHUB_OUTPUT`; each refusal asserts exit ≠ 0 and no `iterations=`):
  1. Bindings: the five inputs, `test_files` required with no default; the checkout pinned, sparse, no
     credential; `gen`'s `env:` exactly the three inputs; `prep.outputs.iterations`, `soak.needs`, the
     matrix expression and `soak.with` (`toStrictEqual` a literal, label included); `status`'s `needs`,
     `if` and four-key `env:`; no `${{` in any of the three `run:`s; `gen`'s and the new step's tokenizing
     line equal the suite's.
  2. Refused, no file: `""`, `" \n "`; the error names both PR network workflows.
  3. Refused, not a soakable file: `--passWithNoTests`, `tests/e2e/network`, `tests/e2e/network/../x.test.ts`,
     `tests/e2e/network/*.test.ts`, a real smoke file, a real file beside `tests/e2e/network/typo.test.ts`.
  4. Refused: repeats `0`, `26`, `5x`, `""`; retry `abc`, `10`.
  5. Success: two real network files on two lines; repeats `1` and `25`; retry `""`, `0`, `9` → exit 0 and the
     matching `iterations`.
  6. The suite: the soak step exists with exactly its `if`, `env:`, call and no `continue-on-error`; the
     report condition names `soak`; the canary step is unchanged.
  7. `assert-canary-results.test.ts`: under `--allow-unlisted` (the CLI spawned, as its tests do) the
     `skipped-chrome.json` report is refused, a clean report passes for an unlisted file, a file absent from
     the report is refused, and a listed canary still needs its title; without the flag an unlisted file
     is still refused.
  8. `aggregators.test.ts`: the soak's `status` in `CASES` (always runs, nothing suppresses, waits on both,
     passes the green world, fails on every other result); stdout states the count and says zero test
     retries at `retry=0` only.
- **Validation gate**: `bun run lint:actions`; `bun test scripts/ci-cd/behavior-gating.test.ts
  scripts/ci-cd/aggregators.test.ts scripts/ci-cd/assert-canary-results.test.ts`; `bun run test:ci-gating`;
  `bun run lint`: each exit 0. Red/green: tests 2 to 8 fail against the files from `cef87d9de` (never
  `HEAD`), then pass. Layers: lint, unit.

## Phase 2 (A1): the documents

- **Change map**: `CI.md`: a `### extension-network-e2e-soak.yml` section after `nightly.yml` (what a soak is,
  refuses and reads back; a file with a browser- or CI-gated test cannot soak green; a list must fit one
  30-minute job; Chrome only; `proverless` picks the build; a second dispatch on one ref cancels the first;
  no push mid-soak, #977; the whole-suite retry-0 run is a dispatch of each PR network workflow or a green
  PR run; the nightly is `dev`-only at default retries), two "What runs when" rows, and `:62` naming the soak
  read-back. `.github/WORKFLOWS.md`: a soak row; `workflow_dispatch` in both PR network rows.
  `.claude/skills/e2e-testing/SKILL.md:257`: the soak sentence, two lines.
- **Validation gate**: `bun run lint`, `bun run test:ci-gating`, `scripts/check-no-local-paths.sh`: each exit 0.

## Delivery

- Branch `soak-mode-1-a1`; one PR against `dev` after the gates and the review loop: `ci(e2e): the soak
  runs only named files and says what it proved` (68 characters). Body: what and why, the D2 deviation
  from #1014, the new command (`gh workflow run extension-network-e2e-soak.yml --ref <branch> -f
  test_files="<files>" -f repeats=5`), the gate runs, `Closes #1014`. The suite edit trips both network
  lanes' path filters, so both run on the PR; no e2e scenario changes, so no wall-clock line, no label.
- Before the PR: `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`,
  `bun run test:ci-gating`, `bun run test:release`, `bun run lint:actions`: each exit 0.
- Dispatch proof on the branch (the orchestrator's addition), exactly two runs. A blank list cannot be one:
  `""`, `" "`, `"\n"` and `"\t"` each got HTTP 422 and no run. Run 39673385943 named the smallest file
  beside a one-letter typo of it: `prep` refused the typo by name in 5 s, no iteration ran, `Status` named
  the unbuilt matrix. Run 39673485998, `cap-request-basic` at `repeats=1`: green in 1:54, the read-back
  "1 file(s) present, every test passed" at `NULO_E2E_RETRY: 0`.

## Post-implementation

Contract: this plan plus [`implementations-plan/README.md` § Post-implementation
standard](../README.md#post-implementation-standard) at `cef87d9de`. Plan-specific values:

1. No diff review (`code_review: off`).
2. Review loop: Codex `gpt-6.1-sol` at `high` (`run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`)
   over the arc's diff after Phase 2; resume per round; hard stop at three. Log rounds in `lessons/phase-1.md`.
3. Delivery as above; then `gh pr checks <n> --watch` (both network lanes included).
4. Close-out as the PR's final commits: Outcome (D1's F and D2's shard mode as disposition lines); a
   closed `known-limit` issue for D5 (reopen when a soak of a file with a browser- or CI-gated test is
   needed); lessons promotion (candidate: "`nightly.yml` builds `dev` only, at default retries; a branch's
   whole-suite retry-0 run is a dispatch of the PR network workflows"); `STATUS.md` deleted; the `git mv`
   into `archive/` in its own commit; the index line moved; `bun run check:plans` green after staging.
5. Teardown after the merge: `agent-worktree done soak-mode-1 --merged`, once `git fetch -q origin dev &&
   git cat-file -e FETCH_HEAD:implementations-plan/archive/soak-mode-1/plan.md` succeeds.

Seeds (not run; the orchestrator spawns the implementer):
`/goal Implement implementations-plan/soak-mode-1/plan.md arc A1; done when its gates pass, the Codex loop converges and the PR closing #1014 is open.`
`/loop Continue implementations-plan/soak-mode-1/plan.md A1: run the next unmet gate, else the review loop, else open the PR, else watch its checks.`

## Audit verdicts

Over the 150-line light target: the claims and the ledger carry evidence both legs asked for.

- Decision consult: Codex (`01a15fd0`) R; Opus R plus D2.
- Round 1: Codex (`01a15fd8`) approve with changes, six findings; Opus approve with changes, nine. All
  accepted but one: Opus's `nightly.yml` group at `:70-78` (rejected: `:71`, `:79`; Codex agreed in r2).
- Round 2 (Codex resumed): approve with changes; three more opt-in files, and missing `status`/matrix
  bindings. Both accepted; the name list it implied was replaced in round 3.
- Round 3 (Codex resumed; Opus fresh): both chose the read-back (D4) over the name list, strict (D5);
  Opus found two more hollow files. Folded: `--allow-unlisted` keeping canary titles, the new step's own
  tokenizing, the flag parsed before the report path, D5 as a known limit.
- Round 4 (Codex resumed, verify only): **approve**, no new material defect.

Implementation review (arc A1, diff `4cc6e5c75..HEAD`):

- Round 1: Codex (`01a16010`) changes needed, one finding (the title test bypassed the CLI); Opus
  (general-purpose) changes needed, five (cancel misnamed in `Status`, two CI.md overstatements, the
  `soak*` label claim only partly pinned, a header that restated the YAML). All six accepted and fixed.
- Round 2 (Codex resumed): **clean**, every fix verified, no regression.

# Phase 1 lessons: arc 1, workflows

## 1.1 Storybook gate (#166)

- Local `STORYBOOK_DISABLE_TELEMETRY=1 bun run --cwd apps/extension build-storybook`: 8.9 s wall (22.7 s user), "Storybook build completed successfully". `storybook-static/` is already in the root `.gitignore`.
- Red on the old shape: with the `expect build-storybook` line removed, `aggregators.test.ts` fails the four "fails … once any one need ends otherwise" cases for `pr-quick.yml` (61 pass, 4 fail). With the base copy of `pr-quick.yml` (ac259a7), the new `behavior-gating.test.ts` case "Storybook builds wherever the extension does, and reports nothing to Storybook" fails (0 pass, 1 fail).
- Gate, 2026-10-10: `lint` 0, `typecheck:all` 0, `test` 0 (Tests  10715 passed | 4 skipped | 7 todo (10726)), `test:ci-gating` 0 (449 tests, 0 fail), `lint:actions` 0, `build-storybook` 0.

## 1.2 Live labels and live head (#167)

- Deviation (D13): the step runs `scripts/ci-cd/live-labels.sh` after the checkout rather than four inline copies; the four lanes are pinned to one script and their own two labels.
- `gh api` prints `gh: <message> (HTTP <code>)` on stderr (`gh: Not Found (HTTP 404)`, gh 2.85.0), so the retry rule matches `HTTP 4xx` other than 403/429 as a refusal and retries everything else once. The body is buffered per attempt, so a failed attempt's error JSON never reaches the parsed output.
- Red on the base copies of the four lanes (ac259a7): `behavior-gating.test.ts -t "live labels"` 6 pass, 2 fail (the snapshot ban and the wiring pin); `aggregators.test.ts -t "live label"` 0 pass, 4 fail (the base `decide` reads an empty `LABEL_HIT` as false). Script mutations: dropping the head comparison fails "moved past"; dropping the retry fails "fails closed".
- Gate, 2026-10-10: `lint` 0, `typecheck:all` 0, `test` 0 (Tests  10715 passed | 4 skipped | 7 todo (10726)), `test:ci-gating` 0 (461 tests, 0 fail), `lint:actions` 0; `shellcheck scripts/ci-cd/live-labels.sh` clean.

## 1.3 Per-head queues and the supersede workflow (#167)

- The runs API reports `path` as the bare workflow path (`.github/workflows/pr-quick.yml`) and `pull_requests[].number` for same-repository pull requests (read on PR #247's and #248's runs), which the selection matches exactly.
- `supersede.test.ts` runs the step's script under a `gh` shim whose head moves when the first listing lands, which is the push the order defends against. Mutations, each red: reading the head before the listing fails "lists … before it reads the head" and "a head pushed while it sweeps keeps its runs"; dropping the head filter fails the selection count (the per-cancel re-read would otherwise still save the run, so the case asserts what was selected); dropping the re-read fails the rewind case; dropping the PR-number filter fails the same-branch-name case.
- A pull request read that returns no 40-hex head fails the sweep and cancels nothing (`select(test("^[0-9a-f]{40}$"))` under `jq -e`).
- Red on the base copies of the six workflows (ac259a7): `behavior-gating.test.ts -t "PR concurrency"` 1 pass, 2 fail. A planted `actions: write` in `source-rebuild.yml` fails "no other workflow can cancel or re-run a run".
- `implementations-plan/lessons.md`'s concurrency line is rewritten in this arc rather than at close-out, because it states the rule this arc replaces (8162 bytes after, budget 8192).
- Local gate, 2026-10-10: `lint` 0, `typecheck:all` 0 (after typing the parsed step; the first run failed with TS2571 on `supersede.test.ts`), `test` 0 (Tests  10715 passed | 4 skipped | 7 todo (10726)), `test:ci-gating` 0 (469 tests, 0 fail), `lint:actions` 0. The phase gate also waits on the first Codex round and the Opus review (D-orch-4).

## Arc 1 review round 1 (after phase 1.3)

- Codex round 1 rejected; the Opus review approved with fixes. Both found a partial re-run that carries an earlier attempt's skip; Codex evaluated all four aggregator scripts on those carried inputs and got exit 0. Fixed by `read-attempt` (D16), the live base (D15) and the event-head rule for the sweep (D17); verdicts in plan.md § Audit verdicts.
- The ci-gates evidence matters for the residuals: a red copy of a required name on a head is not hidden by a newer green copy in the rollup, so a cancelled run's FAILURE on a head that becomes current again reads red until that run is re-run.
- Mutations on the new sweep, each red: head read before the listing (call order), the event-head filter removed (selection count), the per-cancel head check removed (rewind case), the PR filter removed, the old listing order. The four lanes at the pre-fix commit fail the eight new decide and freshness cases.
- `test.each([...] as const)` makes readonly tuples that `tsc` refuses where a mutable `Scenario` is expected; type the table instead.
- Out-of-scope finding filed as #250 (the complexity ratchet reads `baseline:move-approved` from the event payload).
- Gate after the fixes: `lint` 0, `typecheck:all` 0, `test` 0, `test:ci-gating` 0 (474 tests), `lint:actions` 0.

## 1.4 The fold probe (#168)

Branch `ci-release-supply-probe` (commit 03c11c0 off dev ed59711, signed, two probe workflows, push-triggered only), run [38013958157](https://github.com/nulo-sh/nulo/actions/runs/38013958157). Each re-run was `gh run rerun <run> --job <id>` on the latest attempt's job id, awaited to completion before the next. Every reading below comes from the `status` job GitHub re-ran as the dependent, at the re-run's attempt.

| Attempt | Re-run | Re-run leg (filter=latest) | `status` attempt | needs.m | needs.rm | needs.ja | needs.jb | needs.rja | needs.rjb | sk / rsk |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | — (push) | — | 1 | failure | failure | failure | failure | failure | failure | skipped / skipped |
| 2 | `m (a)` | `m (a)` attempt 2 success | 2 | **failure** | failure | failure | failure | failure | failure | skipped / skipped |
| 3 | `rm (a) / leg` | attempt 3 success | 3 | failure | **failure** | failure | failure | failure | failure | skipped / skipped |
| 4 | `ja` | attempt 4 success | 4 | failure | failure | success | failure | failure | failure | skipped / skipped |
| 5 | `rja / leg` | attempt 5 success | 5 | failure | failure | success | failure | **success** | **failure** | skipped / skipped |

- The untouched `m (b)` and `rm (b) / leg` read `failure` at every attempt.
- `filter=latest` lists every job at the newest attempt: GitHub copies each job it did not re-run into the new attempt under a new job id with its old conclusion (`ja` stayed `failure` at attempts 2 and 3, though leg `a` passes from attempt 2 on, so those rows are copies, not runs). `filter=all` lists one row per job per attempt (80 rows at attempt 5).
- A matrix whose `if` is false never expands: GitHub records one skipped job named with the unexpanded expression (`sk (${{ matrix.leg }})`, `rsk (${{ matrix.leg }})`), with no legs, and `needs.<job>.result` reads `skipped`.
- Decision rule: rule 1. After single-leg re-runs, a fresh dependent `status` read `needs.m.result` and `needs.rm.result` as `failure` with the other leg's failure standing; the community report of a fold did not reproduce. No workflow changes; CI.md states the measured behaviour with the run link, and #168 closes on it.
- Branch deleted; `git ls-remote origin ci-release-supply-probe` prints nothing. The run and its logs stay readable at the link.
- zsh expands `"$c:refs/…"` as the `:r` modifier on `$c`, so the first push named a mangled ref and failed harmlessly; brace the variable (`"${c}:refs/…"`).

## 1.5 Rule 1 (#168)

- CI.md's smoke paragraph now states the measured behaviour with the run link, replacing "never one shard". No workflow, gate, `release.yml` or `nightly.yml` change.
- Gate, 2026-10-10: `lint` 0, `typecheck:all` 0, `test` 0, `test:ci-gating` 0, `lint:actions` 0. `test:release` 1: 235 of 238 pass; the three failures are `zip-reproducible.test.ts`, which shells out to `zip`, absent on this host (`which zip` finds nothing, no busybox or 7z either), and arc 1 changes nothing under `scripts/release/` or `scripts/publish/` (`git diff ac259a7 --stat -- scripts/release scripts/publish` is empty). CI's runner has `zip`, so the PR's `quality-status` runs them.

## Hosted proof on PR #252 (#167)

- **Live read.** Head 02176f1, Chrome network lane run 38015158283: `label-hit=false (any of: e2e:extension-network e2e:network), base=dev, read at attempt 1`.
- **A second push while the network lane ran.** With all eight network suite jobs of 02176f1 in progress, commit d00e067 was pushed. Its sweep (run 38015202493, success) logged five cancels, `cancelled run <id> (<workflow>) on superseded head 02176f1…` for `pr-quick.yml`, both smoke lanes and both network lanes, then `head d00e067…; 5 superseded run(s) found; 16 API call(s)` (five listings, one head read, and a head read plus a cancel per run). `actionlint.yml` had already finished. Every run of 02176f1 then read `cancelled`, and every run of d00e067 (`Quality`, `Lint workflows`, both smoke and both network lanes) completed `success`.
- **The label, added and removed, on d00e067.** Adding `e2e:extension-smoke` (01:59:22Z) queued a `labeled` run of every lane as `pending` behind that head's in-flight run in its per-head group. The Chrome smoke one (38015275642) read `label-hit=true (any of: e2e:extension-smoke e2e:smoke), base=dev, read at attempt 1`, and its `Decide` bound `LABEL_HIT: true`, `BASE: dev`. Removing the label (02:07:35Z) queued `unlabeled` runs, which replaced the three labelled runs still waiting (they read `cancelled` with no jobs); the Chrome smoke one (38015805869) read `label-hit=false … base=dev, read at attempt 1` and its `Decide` bound `LABEL_HIT: false`.
- The labelled Chrome smoke run failed shard 3/3 on `settings-crud.test.ts > delete network row via confirm popup` (a `waitForHash` timeout after the confirm, three attempts; a neighbouring test passed on its retry). The same head's first Chrome smoke run passed that test, arc 1 changes no extension or e2e code, and no other recent smoke run failed it: read as a runner flake. Its FAILURE copy stays on d00e067 only; the head that carries this note re-runs every suite.

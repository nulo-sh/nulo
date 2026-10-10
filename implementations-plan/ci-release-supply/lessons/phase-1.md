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

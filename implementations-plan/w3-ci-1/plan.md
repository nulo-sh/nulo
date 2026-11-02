---
plan: w3-ci-1
tier: light
status: approved by the final Codex pass; arc 1 next
issues: "#1419, #1493"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet) + 3 Docker reproductions; Codex gpt-6.1-sol high audit round trip + Opus Plan leg
base: origin/dev at b24357921
trunk: dev
post_implementation_hardening: not scheduled
---

# w3-ci-1: the Docker CI-like runner and the e2e lane filters

Two CI issues, one arc, one PR:
- **#1419:** the local Docker runner reaches no test.
- **#1493:** the CI entries in the e2e lane filters are kept by hand, not derived from what each lane runs.

Recon, the reproductions and the reuse map are in [recon.md](recon.md). The owner asks are in [OWNER-ASKS.md](OWNER-ASKS.md).

## The items, checked

- **#1419: demonstrated, with two causes** (Facts 1 and 2):
  - (a) A tree that already holds `node_modules` gets no browser. Puppeteer's postinstall runs only when `bun install` links the package, and it downloads into the container's home, which is discarded with the container.
  - (b) Vite binds `localhost` to `::1`. Node's client drops `::1` on a host with no non-loopback IPv6 address.
  - What did not hold: Bun prints nothing for a postinstall that succeeds, so the log cannot show whether it ran. None of the issue's three candidate causes is the cause.
- **#1493: demonstrated on the live tree.** Beyond the issue's examples:
  - No filter lists `live-labels.sh`, which every lane runs.
  - The network filters omit `assert-canary-results.ts`, which the canary and soak jobs run.
  - The smoke filters hold `_build-extension.yml`, which no smoke job reaches.

## Outcome & Quality Bar

- **For whom:**
  - a contributor who reproduces a network lane locally;
  - a PR author whose change touches only CI files that a lane runs.
- **Excellent:**
  - (1) Two runs of the runner on one tree, with no extra options, both pass a network file, and the second run downloads its own browser.
  - (2) If a lane's filter drops a CI file the lane runs, or adds one it does not run, `test:ci-gating` fails and names that file.
- **Good enough:**
  - The check covers what lane YAML names: the workflows, the local actions, and the `scripts/ci-cd/` files that `run:` lines name. It does not cover what those scripts import or read (KL-1).
  - It guards against drift, not against a hostile author: a PR can also edit the gate scripts and this test.

## Assumptions

**Facts** (recon gives the commands and the output):
1. Fresh tree, empty volume: the runner's install leaves `chrome/linux-155.0.8059.79` in the container's `~/.cache/puppeteer`. Second run on the same tree: `bun install` prints `(no changes)`, and that directory is absent.
2. In the container, Vite with `host: "localhost"` answers only on `[::1]`.
   - A Node 24 `http.get("http://localhost:5174/")` tries only `127.0.0.1` and gets `ECONNREFUSED`.
   - With `--dns-result-order=ipv4first`, both sides use `127.0.0.1`.
3. `puppeteer browsers install`, with no browser named:
   - installs each pinned browser that is not skipped, and throws if one fails;
   - returns early when the build is already present (`@puppeteer/browsers` 3.2.5: `lib/CLI.js:173-195`, `lib/install.js:220-230`).

   By contrast, `install.mjs` only warns on a failed download and exits 0.
4. The lane graphs, the gaps and the dead entry are as recon's table states. No composite action calls a local action today.
5. In `behavior-gating.test.ts`:
   - `:723` checks only that two gate scripts are present.
   - `:996` pins each Firefox filter to its Chrome twin's, repointed at its own file, plus `setup-geckodriver`.
   - `:860` (`LANE_INFRASTRUCTURE`) keeps CI entries out of the build-surface comparison.
6. This host has no global IPv6 address. `apps/extension/tests/e2e/README.md:210,246` pass `ipv4first` to `e2e:agent`. No workflow sets it.
7. The harness already binds `127.0.0.1` while naming `localhost`:
   - `fixtures/egress-guard.ts:153` listens on `127.0.0.1`;
   - `fixtures/token-list.ts:138` serves at `http://localhost:<port>`;
   - `scripts/e2e/resolve-ports.ts:106` reserves ports on `127.0.0.1`.

**Inferences:**
1. With Vite bound to `127.0.0.1` and the URL kept `localhost`, both browsers reach the playground, as they reach Fact 7's fixtures.
   - Proven for hosts without non-loopback IPv6 by Phase 2: the container and this host.
   - Proven for GitHub's runners, whatever their IPv6 status, by the PR's four lanes.
   - Expected, not proven, for other hosts with IPv6.
2. On this host, `e2e:agent` without the flag fails today with cause (b). Phase 2 step 2 records that failure before the fix.

**Asks:** none blocking. OA-1: the smoke filters stop listing `_build-extension.yml`, which narrows a required lane's trigger. The PR body states this, and the orchestrator decides at merge.

## Decisions

| # | Decision | Alternatives rejected, and why |
|---|---|---|
| D1 | After `bun install`, the runner installs Puppeteer's pinned browsers through the installed launcher: `(cd apps/extension && bun --no-install ./node_modules/.bin/puppeteer browsers install)`. No browser volume: each run downloads its own browser. | A cache volume, alone or beside the fix: an empty volume on a linked tree still has no browser. It is also shared persistent bytes, and with it the Docker proof passes without the fix. `bun install --force`: it relinks the contributor's tree. Running `install.mjs` again: it swallows a failed download, which then shows up later as "Could not find Chrome". |
| D2 | The playground's Vite binds `127.0.0.1`. Every URL stays `http://localhost:<port>`. This matches the harness (Fact 7): the bind matches the port reservation, and the origin does not change. | `NODE_OPTIONS=ipv4first` in the runner: it hides the mismatch in one environment, and every other host without IPv6 still needs the flag. Binding and naming `127.0.0.1`: it moves the dApp origin that every network test drives, and `127.0.0.1` has its own host permission (`tab-lifecycle.ts:31`). A probe that tries both address families: it patches one client out of several. `host: true`: it exposes the dev server beyond loopback. |
| D3 | A lane's CI entries (`.github/**` and `scripts/ci-cd/**`) must equal the set below. A named file that does not exist, or an action with no `action.yml`, is an error. A script's own imports and data are outside the set (KL-1). | Checking only the issue's `.github/**` half: the same gap stays for two scripts. Following imports: that puts a module resolver inside a filter test. |
| D4 | The walker decides only `inputs.<k> == '<lit>'` or `!= '<lit>'` (with or without `${{ }}`), and only when the input is bound to a string with no `${{`. The value comes from the caller's `with:`, else from the callee's default, and the comparison ignores case, as GitHub's does. Any other `if:` counts as reached. | Ignoring `if:`: both Chrome filters would gain `setup-geckodriver` as a dead trigger. Failing closed, as `laneCalls` does: the compound `if:` on `setup-presto-server` would stop the walk. Comparing unresolved text: a future `==` would drop a step. |
| D5 | The walker lives in `behavior-gating.test.ts`, beside `bind`, `filtersOf`, `commandLines` and `LANE_INFRASTRUCTURE`. It reads through an injected `read(path)`, so tests overlay copies in memory. | A new module: these helpers are local to the file, so a second module would copy them. A generic `callsOf`: it carries the network suite's job-name semantics, which other tests pin. |
| D6 | Remove the containment test at `:723`; the derived equality is strictly stronger. Keep the twin test at `:996`, which still holds. Keep `GATE_SCRIPTS` for the draft-flag test at `:1059`. | Keeping both: two tests for one property. Moving the draft-flag test onto the derived scripts (Opus): a different property, outside these issues. |
| D7 | `README.md:210,246` drop the flag only after Phase 2 step 4 passes without it on both browsers. Otherwise keep it and record the other cause in lessons. | Dropping it untested: the README is the documented path. |

The set D3 requires:
- the lane file;
- every local reusable workflow reached through `uses:`;
- `.github/actions/<name>/**` for every local action those reach, following composites recursively;
- every `scripts/ci-cd/<file>` named, as a path from the repo root, in a reached `run:` command line.

## Architecture & Implementation

- **#1493, in `scripts/ci-cd/behavior-gating.test.ts`.** `laneInfrastructure(file, read)` visits jobs and steps, each with its bound inputs:
  - A job with `uses: ./.github/workflows/X` adds X, then visits X. X's inputs are its declared defaults, overlaid with the job's `bind`-ed `with:`.
  - A step with `uses: ./.github/actions/N` adds `N/**`, then visits `N/action.yml`'s steps the same way.
  - For every reached step, `commandLines(run)` adds each `(?<![\w./-])scripts/ci-cd/[\w.-]+` it names.
  - `decided(if, inputs)` implements D4.
  - `infrastructureFindings(file, read)` compares the filter's `LANE_INFRASTRUCTURE` entries against that set and returns `missing <path>` and `dead <path>` lines.
  - Separate visits for workflows, jobs, steps and actions keep each function within the complexity budget.
  - Rewrite the comment at `:855-859`.
- **Filters** (`.github/workflows/pr-extension-{smoke,network}-e2e{,-firefox}.yml`):
  - Smoke: drop `.github/workflows/_build-extension.yml`; add `scripts/ci-cd/live-labels.sh`.
  - Network: add `live-labels.sh` and `scripts/ci-cd/assert-canary-results.ts`.
  - Each header comment says the entries are derived and pinned.
  - `CI.md` § CI gating says lane CI entries are exact, not over-triggered.
- **#1419:**
  - `apps/extension/scripts/e2e/docker-ci-like.sh`: D1's line, placed after the install in the `bun install` group, with a one-sentence why.
  - `apps/playground/vite.config.ts`: `host: "127.0.0.1"`, with a one-sentence why. The playground README keeps `localhost`.
- **UI impact:** none. The playground is a test harness; only its printed dev URL changes, to `http://127.0.0.1:5174/`.

## Security & Adversarial Considerations

- **Threat model.** A filter is a gate. Today, a PR that changes only a lane-only composite or gate script skips the lane, and the lane's aggregator still passes.
  - After the change, drift fails `quality-status`.
  - An `if:` the walker cannot decide counts as reached, so errors fall toward running the lane.
  - **KL-1 stays open:** a PR that changes only `scripts/ci-cd/canary-expectations.json` skips both network lanes until the nightly. `assert-canary-results.test.ts` does not catch a semantic error in that file (Codex reproduced this in memory).
- **Narrowing (OA-1).** No smoke job calls `_build-extension.yml`, and `pr-quick`'s builds run it whenever it changes.
- **Supply chain.**
  - The runner's Chrome is Chrome for Testing, fetched over HTTPS by Puppeteer's CLI. That is the same source and trust as CI's postinstall.
  - The pins file covers only Bun and Node.
  - `--no-install` means the runner makes no registry fetch and calls neither `bunx` nor `npx`.
  - No `curl` is added outside `fetch_pinned`, and no volume keeps the browser.
- **Exposure.** The playground stays on loopback.
  - With D2, `[::1]:<port>` is unbound. A local process that binds it after boot could serve Chrome the playground's origin. That needs a hostile local process, which a dev or CI host does not support.
  - No permission changes.

## Phase 1: #1493, the derived filter check ✓

1. Commit the test first: the helpers (D3-D5), and the describe "each e2e lane's filter names the CI files it runs". In the same commit, remove the test at `:723`.
   - **Live case:** `infrastructureFindings` returns `[]` on all four lanes.
   - **Copy cases:** each copy adds exactly one line to the live findings, as listed.
     - (i) The network Chrome filter without `setup-bun/**` adds `missing .github/actions/setup-bun/**`.
     - (ii) A smoke filter given `.github/workflows/_extension-network-e2e.yml` adds `dead …`.
     - (iii) `setup-bun/action.yml` gets a step `uses: ./.github/actions/setup-x`, where `setup-x` is a composite with no steps. On every lane, this adds `missing .github/actions/setup-x/**`.
     - (iv) The suite's geckodriver `if:` becomes `inputs.browser == inputs.other`. On both Chrome lanes, this adds `missing .github/actions/setup-geckodriver/**`.
2. Commit the filter edits, the comments and the `CI.md` line.

**Validation gate:**
- After step 1, `bun test scripts/ci-cd/behavior-gating.test.ts` fails only the live case, with eight lines:
  - smoke: `dead .github/workflows/_build-extension.yml` and `missing scripts/ci-cd/live-labels.sh`;
  - network: `missing` for `live-labels.sh` and for `assert-canary-results.ts`.
- After step 2, that file passes.
- These then exit 0: `bun run lint`, `lint:actions`, `typecheck:all`, `test`, `test:all`, `test:ci-gating`, `test:release`, `check:plans`.
- Layers: lint, typecheck, unit.

## Phase 2: #1419, the runner reaches its tests

1. Commit the tests first:
   - In `scripts/ci-cd/docker-ci-like-pins.test.ts`: the script's line `(cd apps/extension && bun --no-install ./node_modules/.bin/puppeteer browsers install)` comes after its `bun install --frozen-lockfile` line.
   - In `apps/playground/test/vite-config.test.ts`: `server.host` is `"127.0.0.1"`. Run this test once with `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0`.
2. Run the host base at that commit, with no `NODE_OPTIONS` and with `NULO_E2E_RETRY=0`: `bun run e2e:agent tests/e2e/network/connect-dapp.test.ts`. Record the failure.
3. Commit the runner line and the Vite change.
4. Run the host proof: step 2's command, then again with `NULO_E2E_BROWSER=firefox`. Then apply D7.
5. Run the Docker proof:
   - `git archive` HEAD to `~/.cache/nulo-backlog/w3-ci-1/`.
   - Use lane-named Bun and Aztec volumes, no browser volume, and no `NODE_OPTIONS`.
   - Run the usage header's command twice on that tree, with `connect-dapp.test.ts`.
   - Run 2 must print `(no changes)`, then D1's `chrome@155.0.8059.79 <path>` line, and must pass.
   - Record both runs, with their wall-clock times, in `lessons/phase-2.md`.
   - Remove the volumes and the tree.

**Validation gate:**
- Both new tests fail at step 1 and pass after step 3.
- Step 2 fails at the playground probe.
- Step 4 passes on both browsers at retry 0.
- Both Docker runs pass.
- The Phase 1 commands, `bun run --cwd apps/playground test` and `bun run --cwd apps/playground typecheck` exit 0.
- Layers: lint, typecheck, unit, e2e on the local network.

## Delivery

- One arc on the branch `worktree-w3-ci-1`, as one ready PR to `dev` (`gh pr create`).
- Title: `fix(ci): e2e lane filters name what each lane runs; the docker runner reaches its tests` (87 characters).
- The body gives what changed and why, the validation runs, OA-1's narrowing, KL-1, "no e2e scenario added", and `Closes #1419` and `Closes #1493`.
- All four lane filters trip, so no label is needed.
- No merge before the orchestrator says so.
- Parallelism: none. The phases are short, and both touch `scripts/ci-cd/`.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `b24357921`. Specific to this plan:
- **Step 1** is absent (`code_review: off`).
- **Step 2** runs once, after Phase 2's gate, over `git diff b24357921...HEAD`.
  - Start it with `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, and continue it with `resume-codex.sh`.
  - Keep the prompts under `~/.cache/nulo-backlog/w3-ci-1/`.
  - Stop after three rounds.
  - Log each round in `lessons/phase-2.md` and in the table below.
- **Approval boundary.** Stop on any of these:
  - a change to a lane's jobs, permissions or required checks;
  - a filter entry the derivation does not imply;
  - a change to `setup-puppeteer`;
  - a change to the dApp origin;
  - any persistent volume or cache.
- **Close-out,** as the PR's final commits:
  - The Outcome, with `Known limits: #<KL-1>`. KL-1 is a closed `known-limit` issue that reopens when a change to a file a lane script reads reaches `dev` and turns a nightly red.
  - Lessons promoted within the budget.
  - `STATUS.md` deleted.
  - `git mv` into `archive/`, with the index line moved.
- **Teardown after the merge:** `agent-worktree done w3-ci-1 --merged`, with trunk `dev`. The archived plan is `implementations-plan/archive/w3-ci-1/plan.md`.

Over the light tier's 150-line target. The panel's conditions added a host base run, a fourth copy case and KL-1, and the plain-language rules split long items into lists.

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| Plan 1 | Codex `gpt-6.1-sol`, high | conditional approve | KL-1, with the Outcome and Security narrowed; Docker run 2 with no browser cache; no browser volume (persistent state); eight red lines; copies checked against the live findings; host base run first; proven and expected configurations kept apart | none |
| Plan 1 | Opus 5.5, Plan | conditional approve | Docker proof reaches D1; D4 decides on bound strings only, ignoring case, plus copy (iv); missing `action.yml` or script is an error; regex anchored; threat model guards against drift and no longer says "narrower"; Fact 7; the transpiler-cache run; comment at `:855-859`; `CI.md` says exact | Moving the draft-flag test onto the derived scripts: out of scope (D6) |
| Plan 2, resumed | Codex `gpt-6.1-sol`, high | approve | the fold checked against the code and the CLI's output format; no material finding | none |

## Seeds (not run; orchestrator-owned)

```
/goal Phases 1 and 2 of implementations-plan/w3-ci-1/plan.md marked ✓ with their gates passing in the transcript; the Codex loop (gpt-6.1-sol, high) converged; one ready PR against dev closing #1419 and #1493; bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/w3-ci-1 per its plan.md and the README § Post-implementation standard at b24357921: run the gates, decide open questions with Codex (gpt-6.1-sol, high), open the PR, never merge; stop once its checks are green and report.
```

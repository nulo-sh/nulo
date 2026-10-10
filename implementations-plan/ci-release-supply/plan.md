---
plan: ci-release-supply
tier: mid
status: approved by the orchestrator (D-orch-1 to D-orch-4); arc 1 in progress
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 Explore agents (sonnet); dual audit (Codex gpt-6.1-sol high + one Opus Plan agent); one final fresh Codex pass
base: origin/dev at ac259a7 (#238 merged as 8099368)
trunk: dev
issues: [166, 167, 168, 82, 172, 179, 183, 185, 182, 178]
closed_before_planning: [176, 193]
no_arc: [21, 174, 180]
post_implementation_hardening: not scheduled
---

# ci-release-supply: CI gates, release guards and supply-chain checks

The CI gates and the release chain are what every merge and every published zip rest on. Twelve issues say where they can be skipped, folded or left unchecked. This plan closes them in five arcs. Two of the twelve were already closed by #238 before planning; this plan verifies them and builds nothing for them. Nothing in this lane changes what a person sees in the wallet.

- **Arc 1, workflows (#166, #167, #168).** `quality-status` gains a Storybook build. Each e2e lane reads the pull request's live labels and head instead of its event's snapshot. Each PR workflow queues runs per head commit, and a small workflow cancels the runs of heads that are no longer current, so an old push can no longer cancel the current head's run. A probe on a scratch branch settles whether a single-shard re-run can fold a matrix to `success`; if it can, every gate that reads a sharded suite reads each shard as its own job.
- **Arc 2, scripts and installs (#82, #172, #179, #183).** `presto-banners` moves to 1.2.0 with the onboarding title Nulo shows today kept as it is. The install stops creating the hoist fallback (`hoist = false`). A check on every PR into `main` refuses a stable 1.0.0 or later while a legal document holds «FILL», so the Release PR for 1.0.0 cannot merge, and `auto-unstick` refuses to create such a tag if the PR got past it. A weekly job compares each store's public copy with the release zip it claims to be.
- **Arc 3, docs (#185).** CLAUDE.md's release runbook records wrangler's `routes` rule for the landing and that domain changes are the owner's.
- **Arc 4, plans ignore patterns (#182).** Four more transcript shapes are ignored and asserted by `check:plans`.
- **Arc 5, nightly retention (#178).** Planned only. It waits on decision page 5 (record P5-02) and on the owner's ruleset change.

## Tier and budget

`mid`, as the program fixes. Rubric: novelty low (each mechanism has a precedent in the tree or in GitHub's API), blast radius moderate (the gates guard every merge and the release), irreversibility moderate (a burned release tag cannot be moved, which shapes #183), migration none, external coupling moderate (store download endpoints, GitHub's re-run semantics), security sensitivity moderate (supply chain, release provenance). No dimension is high. The lane splits into five PRs instead of raising the tier. Recon: three Explore agents (sonnet). Code review: off; the Codex fix loop is the review.

## Outcome & Quality Bar

**For whom.** The owner merging PRs and cutting releases; the agents babysitting CI on many PRs at once; a future maintainer reading a red check; a user who installs Nulo from a store and trusts that it is the build this repository published.

**What excellent looks like.**
- No label, re-run or event order can green a required check for a head whose suites did not all pass, and no older event can cancel the current head's run. Each claim is shown by a hosted run on the arc's own PR or on the probe branch, not only by reasoning.
- Every new guard has a test that plants the shape it refuses and fails, beside a control that passes. Every workflow edit lands with its pin tests in the same commit.
- Supply-chain checks fail closed: an unpinned, missing or unverifiable input is a red job with a message that names the file, the version or the store, never a warning that passes.
- No required check is renamed, no advisory job becomes a gate, no gate becomes advisory, and no repository setting changes.

**What good enough looks like.** The store comparison samples each store weekly and on dispatch; it does not watch continuously and does not read a listing's text. The supersede workflow cancels runs of stale heads; it does not police runs on other pull requests. The Storybook job builds; it does not run visual tests.

## Scope

**In:** #166, #167, #168 (arc 1); #82, #172, #179, #183 (arc 2); #185 (arc 3); #182 (arc 4); #178 (arc 5, planned, not built).

**Closed before planning, verified, nothing built:**
- #176. #238 pins Bun 1.4.2 and Node v24.16.0 by SHA-256 in `apps/extension/scripts/e2e/docker-ci-like.pins.sha256`, and `scripts/ci-cd/docker-ci-like-pins.test.ts` ties the Bun pin to `packageManager`.
- #193. #238 added `scripts/ci-cd/workflow-refs.test.ts`. It refuses review, audit-round, reviewer and milestone shapes with planted samples and a clean control. A bare `phase N` passes, so the live runtime vocabulary needs no exemption list.

**No arc:**
- #21 (`blocked:external`): the tag-creation ruleset and immutable releases wait for a green stable release on the draft flow; the owner applies both.
- #174 (`blocked:external`): the `interopDefault` stopgap waits for a vitest release that ships vitest-dev/vitest#10363.
- #180: an owner action in the Security tab (page 5, record P5-03).

**Regrouped:** none. #82 stays in arc 2 because the form that ships now changes nothing a person sees (Ask A1).

**Claims that did not hold, or hold narrower:**
- #82: "no V6 coupling holds the pin" is true, but the bump is not silent. 1.2.0 changes the `permission-blocked` title that the onboarding Presto step shows. The shipped form keeps today's title (A1, `OWNER-ASKS.md` OA-1).
- #168: "Repoint CI.md:45 off follow-ups.md" is already done; CI.md:45 cites #168. The fold itself is unproven in this repository; a GitHub community report (discussion 26822, 2025-02-26) describes it. Phase 1.4 settles it.
- #183: "fails on any «FILL» in legal/*.md for a stable tag" would refuse every 0.x stable release, because `legal/terms.md` carries «FILL» until launch, and `legal/README.md` carries it in prose. A refusal after the tag exists also burns the version. The gate therefore runs on PRs into `main` and refuses a stable ≥ 1.0.0 (D7).
- #185: #238 routed every part but CLAUDE.md's two release-runbook lines.

## Architecture & Implementation

### Arc 1: workflows

**#166, Storybook in `quality-status`.** A `build-storybook` job (`name: Build Storybook`) joins `pr-quick.yml` beside `build-landing`. It needs `changes`, runs when `needs-extension-build` is true (that filter already covers `apps/extension/**` and `packages/design/src/**`, where every story lives), checks out the head commit, runs `./.github/actions/setup-bun`, then `bun run --cwd apps/extension build-storybook` with `STORYBOOK_DISABLE_TELEMETRY: "1"` so CI sends nothing to Storybook's servers. `quality-status` adds it to `needs`, binds `BUILD_STORYBOOK_RESULT`, and expects `$(ran "$EXTENSION_BUILD")`, exactly as `build-chrome`. The check name does not change.

**#167, live labels and live head.** Each e2e lane's `changes` job gains one step, `live`, that runs on every event and always writes `label-hit` as `true` or `false`:
- On `workflow_dispatch` it writes `false` (dispatch force-runs anyway).
- On `pull_request` it reads `gh api "repos/$REPO/pulls/$PR"` once, with `REPO` and `PR` passed through `env:`. If the PR's live head differs from `github.event.pull_request.head.sha`, the run is obsolete: the step fails with `::error::superseded by <sha>`, which reds this run's aggregator on the old head only and spends no suite minutes. Otherwise it sets `label-hit=true` when either of the lane's two labels is present (`e2e:extension-smoke`/`e2e:smoke`, or `e2e:extension-network`/`e2e:network`).
- An API failure is retried once after a short pause (403, 429, 5xx), then fails the step: fail closed.

The step also writes the live `base` (round 1: a retarget or a late run must not decide from the event's base) and `read-attempt`, and each lane's aggregator accepts skipped suites only when `read-attempt` equals its own `github.run_attempt` (round 1: a re-run of `decide` or `status` alone carries the earlier attempt's gate over). The job exports `label-hit: ${{ steps.live.outputs.label-hit }}`, `base` and `read-attempt` with no fallback; `decide` reads `BASE` from the live output and refuses an empty one on a pull request. Every `decide` job binds `LABEL_HIT: ${{ needs.changes.outputs.label-hit }}` and, before its gate, refuses any value other than `true` or `false`. The gate block itself is unchanged, so `decide-gate.test.ts` needs no edit. Nothing reads `github.event.pull_request.labels` any more.

**#167, per-head queues.** The six PR workflows (`pr-quick.yml`, `actionlint.yml`, the four e2e lanes) key their concurrency group on the head commit too: `<prefix>-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}-${{ github.event.pull_request.head.sha || github.sha }}`, with `cancel-in-progress: ${{ github.event_name != 'pull_request' }}`. Runs of two heads never share a group, so an older push that enters late cannot cancel or replace the current head's run, whatever order GitHub admits them in. Runs of one head queue: one runs and at most one waits, and a later event of the same head replaces the waiting one, which posts nothing (CI.md:95). That replacement is harmless now: every run reads the PR's live labels, and the survivor's own event is the newer one, so it decides from state at least as current as the replaced run's. `queue: max` was considered and rejected (D12).

**#167, cancelling obsolete heads.** A new workflow, `pr-supersede.yml`:
- Trigger `pull_request: types: [synchronize]`; workflow `permissions: {}`; one job `cancel-superseded` with `permissions: { actions: write, pull-requests: read }`, `if: github.event.pull_request.head.repo.full_name == github.repository && github.actor != 'dependabot[bot]'` (forks and Dependabot get read-only tokens), no concurrency group (round 2: GitHub may admit an older sweep last, and a shared group with `cancel-in-progress` would let it cancel the newer sweep before stopping on its head check), `timeout-minutes: 3`.
- One `run` step, no checkout and no action. Its inputs come only through `env:` (`REPO`, `PR`, `HEAD_REF`, `EVENT_HEAD`); the script holds no `${{ }}`.
- **Order matters.** First list the branch's unfinished runs: `gh api repos/$REPO/actions/runs -X GET --paginate -f event=pull_request -f branch="$HEAD_REF" -f status=<s> -f per_page=100` for each of `requested`, `pending`, `waiting`, `queued`, `in_progress` (lifecycle order, so a run that moves on between two listings shows up in a later one). Then read the live head. No run of a push that lands after the listing is ever selected.
- **The sweep acts only for its own event's head** (round 1, D2). Every head change, a force-push rewind included, starts its own sweep. So when a head read (the first, or the one before each cancel attempt, retries included) differs from `EVENT_HEAD`, the sweep stops without cancelling more; this also covers a pull request read that is staler than the event.
- Select runs whose `head_sha` is not `EVENT_HEAD`, whose `path` is one of the six workflow files, and whose `pull_requests[].number` includes this PR (never the branch name alone, which another PR could share). Cancel with `gh api -X POST repos/$REPO/actions/runs/$ID/cancel`; a 409 (already finished) counts as done; any other error fails the job after the rest are tried. Retry each call once unless it is a 4xx other than 403 or 429. Print each cancelled run and the number of API calls.
- Residuals: a head change that lands between a head read and its cancel call can cancel a run of the head that becomes current; a pull request endpoint that trails the run list while answering the event's head can let a later push's listed runs be cancelled. A cancelled run still posts FAILURE under its required names; on an obsolete head that is harmless, but on a head that becomes current again the rollup reads that FAILURE beside the new runs' results until the cancelled run is re-run (`archive/ci-gates/plan.md`, "How GitHub judges a required check").
- A run that starts after the sweep on an obsolete head stops itself in `changes` (the live-head check above, after one late read since the endpoint can trail a push). `pr-quick.yml` and `actionlint.yml` have no such check; a late obsolete run there finishes on its old head, wasting minutes but deciding nothing for the current head.

**#168, folded shards: probe first, then the per-shard fix.** The probe (phase 1.4) is a throwaway workflow pair on a scratch branch `ci-release-supply-probe`, triggered by `push` to that branch only, never merged:

- `m`: a three-leg matrix of plain jobs. Leg `a` fails on attempt 1 and passes on later attempts (`[ "$GITHUB_RUN_ATTEMPT" -ge 2 ]`), leg `b` always fails, leg `c` passes.
- `rm`: the same matrix, each leg calling a local reusable workflow, as the lanes do.
- `ja`, `jb`, `jc`: the same three behaviours as separate plain jobs.
- `rja`, `rjb`, `rjc`: the same as separate jobs that each call the reusable workflow, which is the shape unrolling would produce.
- `gate`: a job writing `run=true` and `skip=false`; every job above needs it and runs on `needs.gate.outputs.run == 'true'`, the lanes' `needs: decide` shape (round 1).
- `sk` and `rsk`: a plain matrix and a reusable-call matrix that need `gate` and run on `needs.gate.outputs.skip == 'true'`, so they skip as a lane's matrix does when its gate says not to run.
- `status`: `if: always()`, needs all of them, `permissions: { actions: read }`, `set -euo pipefail`; prints `GITHUB_RUN_ATTEMPT`, every `needs.<job>.result`, and the run's job list from `actions/runs/$RUN/jobs?filter=latest` and `?filter=all` (name, `run_attempt`, conclusion).
- Procedure: push; after attempt 1, re-run only `m (a)` with `gh run rerun <run> --job <id>`; read `status`. Then the same for `rm`'s leg `a`, for `ja`, and for `rja`. Each attempt runs to completion before the next re-run. A reading counts only from the `status` that GitHub re-ran as the re-run job's dependent, whose log shows the re-run's `GITHUB_RUN_ATTEMPT` (GitHub documents that re-running a job re-runs its dependents); its job list (`filter=latest`) must show the re-run leg `success` at that attempt, or the reading is void, and the untouched `b` legs still `failure`. A `status` re-run on its own is diagnostic only and never satisfies rule 1; if the dependent `status` did not run, that reading is inconclusive and the re-run is repeated. A `success` at any reading establishes the fold; a later `failure` never erases it. Record what the job lists show for `sk` and `rsk` (one skipped job, or skipped legs). Delete the branch afterwards.

Pre-registered decision rule:

1. If a fresh `status` (as the procedure defines) reads `needs.m.result` and `needs.rm.result` as `failure` after the single-leg re-runs, the fold does not happen here. No workflow changes. CI.md:45 states the measured behaviour with the run's link, and #168 closes on that evidence.
2. If either reads `success`, the fold holds. Fix every gate that reads a sharded suite: the four PR e2e aggregators, `release.yml`'s `attach-assets` and `status` (`needs.network-e2e.result`, :463 and :804), and `nightly.yml`'s `publish-nightly` and `status` (:511, :631). Take the first mechanism the probe proves:
   - (b) **Unrolled shards, preferred.** If `needs.rjb.result` reads `failure` after `rja` alone was re-run, and `status` re-ran, each sharded matrix becomes named jobs, one per shard or leg, each calling the same reusable workflow with the same inputs and keeping its check-run name; each gate lists them in `needs` and checks each result. Deterministic, no API call, no new permission.
   - (a) **Per-leg check by API, scoped.** Otherwise, if `filter=all` (taking each job name's highest `run_attempt`) lists the carried-over failed leg as `failure`, each gate checks an exact inventory: the legs of the matrix jobs it already needs, by name, exactly the matrix's count, each `completed` with conclusion `success` (or all `skipped` when its gate said not to run). A missing, extra, ambiguous or unfinished leg fails; the check retries briefly while a leg reads unfinished. When the gate decided not to run the suite, the check reads only `needs.<job>.result == 'skipped'` and never the inventory, so no leg's result is invented for a matrix that never expanded (the `sk`/`rsk` listings show what GitHub records). In the PR aggregators the check joins the existing step, with `actions: read` on the status job. A matrix job that reads `skipped` while its gate said to run fails. In `release.yml` and `nightly.yml` the check runs in a separate read-only job (`network-e2e-legs`, `permissions: { actions: read }`, `if: always() && !cancelled()` so a skipped ancestor never skips the check) that the publisher and `status` need, so `attach-assets` and `publish-nightly` keep their exact `SIGNING` permissions. No advisory job (nightly's chaos, Firefox, `dup-trend`, `rp-host-live`) enters any gate.
   - (c) If neither holds, stop: comment the evidence on #168, keep CI.md's "Re-run failed jobs, never one shard" rule, and leave #168 open. Arc 1 ships #166 and #167.

### Arc 2: scripts and installs

**#82, presto-banners 1.2.0.** Bump `apps/extension/package.json` to `"1.2.0"` and run `bun install` (published 2026-09-25, past the 7-day gate, no `minimumReleaseAgeExcludes`). Review it with `bun pm diff @alejoamiras/presto-banners@1.1.0 1.2.0` and record the summary in `lessons/phase-2.md`. The only change Nulo renders is `STRINGS["permission-blocked"].title`, read at `presto-ui-state.ts:92` for the onboarding step. That line takes the literal `"Your browser blocked local access"`, as the settings arm already does, so the screen stays exactly as it is; `presto-ui-state.test.ts:146` keeps its assertion, and its test name, which credits Presto's string, is renamed. The module header, which says the copy is Presto's canonical strings where a state has one, names the exception. `legal/README.md:51` names 1.2.0. Licence (MIT), dependencies (none) and the CSP (`style-src` already allows inline styles) do not change.

**#172, `hoist = false`.** `bunfig.toml` gains `hoist = false` under `[install]`, with a one-line reason. Bun 1.4.2 documents the key: it skips `node_modules/.bun/node_modules`. A store package's import then resolves only through its own declared dependencies or a package linked at the root `node_modules`: a root direct dependency, a workspace package, or a `publicHoistPattern` match. Root devDependencies therefore stay reachable from any store package; that is Bun's documented boundary, and `scripts/phantom-sweep.ts` stays the source-level check. CI caches only `~/.bun/install/cache` (`.github/actions/setup-bun/action.yml:38`), so CI installs the new layout fresh.

The archived isolated-linker plan deferred this key "until it has its own gate after a soak". That soak is defined here as a deterministic battery, because layout changes which modules resolve, not when a test passes: one fresh install, every build, every unit suite on both engines' usual runners, a test-identity compare against the commit before the change, the whole smoke suite locally, one network file locally, and the PR's four e2e lanes on clean runners on both browsers (`bunfig.toml` trips every e2e filter). The 30-run soak matrix measures flakiness, which a resolution change does not introduce (D10, Ask A6). Pre-registered fixes for what the battery surfaces:
- An undeclared import in this repository's code: declare the package in that workspace's `package.json`.
- An undeclared import inside a third-party package: one `publicHoistPattern` entry naming exactly that package, with the importer named in a comment. Such an entry exposes the package to every workspace; each one is listed in the PR body.
- More than three third-party entries, or one that needs a patch: stop, comment the list on #172, revert the key, and leave #172 open. Arc 2 ships its other phases.

CLAUDE.md's "The linker is `isolated`" paragraph drops the hoist-fallback sentence and states the new boundary.

**#183, no launch with a blank in the Terms.** `packages/legal/src/launch.ts` exports `launchBlanks(version: string, documents: ReadonlyArray<{ path: string; markdown: string }>): string[]`: pure; `[]` unless `version` is a stable release at or above 1.0.0 (no `-` suffix, major ≥ 1); otherwise one entry per line holding «FILL», naming file and line. It is not exported from `index.ts`. `launch.test.ts` holds the unit cases and one live assertion that runs only under `NULO_LAUNCH_GATE=1`: the root `package.json` version and the documents the package's manifest names give `[]`.

A new `pr-quick.yml` job, `launch-legal` (`name: Launch legal check`), runs that test with `NULO_LAUNCH_GATE=1` on every PR whose base is `main`: `if: github.event_name == 'pull_request' && github.base_ref == 'main'`. `quality-status` expects it `success` on those PRs and `skipped` otherwise. The effect:
- Promote PRs before launch carry a 0.x version: the check passes whatever the Terms hold.
- The `chore(main): release 1.0.0` Release PR carries 1.0.0 in the root `package.json` (release-please, `release-type: node`): it goes red while a blank remains, and `main` requires `quality-status`, so it cannot merge and no tag is created.
- After launch, every promote and Release PR into `main` is checked; `dev` is never checked, so a draft with «FILL» can still be prepared there (OA-3 asks whether `dev` should be checked too).
- `pr-quick.yml` does not run on `edited` (a retarget), so a head that passed with `launch-legal` skipped against `dev` could be retargeted to `main` and merge on its existing green `quality-status`; an `--admin` merge skips it too. The backstop sits at the irreversible step: `auto-unstick-run.ts` calls `launchBlanks` on the merge commit's `legal/terms.md` and `legal/privacy.md` before it creates a stable tag, and refuses with the recovery in its message. `launch.ts` imports nothing, so `auto-unstick` (which installs nothing) imports it by relative path; a test pins that, and that the two paths equal the documents `@nulo/legal`'s manifest lists. The manual unstick gains the same check as a `git grep` before `git tag`.
- Recovery after a refusal: the merged Release PR stays `autorelease: pending` and no tag exists. Land the filled documents on `main` (a promote, or a PR into `main` from a branch cut from `main`: the owner's call). Before tagging, check that the repair's merge commit still carries the refused version in the root and extension `package.json`, `bun.lock` and `.release-please-manifest.json`, that it holds no «FILL», and that the tag is still absent; then run the manual unstick with that commit as `MERGE_COMMIT`, relabel the original Release PR, and dispatch the publish from the tag. The runbook's troubleshooting table gains this row; the ruleset forbids moving a tag, so a tag that exists is never re-pointed.
- Boundary: a hand-pushed tag still skips both checks until #21's tag-creation ruleset exists.

BEFORE-LAUNCH.md §3's checkbox becomes `git grep -n "«FILL" -- legal/terms.md legal/privacy.md`, because `legal/README.md` mentions the placeholder in prose.

**#179, store copies against the release zip.** Both stores serve Nulo publicly today (measured 2026-10-10, `lessons/phase-0.md`), so a missing copy is a failure, never a pass.

1. **Re-measure first.** Repeat the phase-0 measurement on the then-current versions and confirm the allowlist below still holds. A new difference is investigated before any code accepts it.
2. **`scripts/release/store-copy.ts`** (pure):
   - `crxPayload(bytes)`: little-endian CRX3 header (`Cr24`, version 3, header length at most 1 MiB, inside the file), payload starting with a local-file-header signature; anything else is refused.
   - `compareCopies({ store, release, served })` over `Map<name, bytes>`: refuse duplicate, absolute, `..`-bearing or wildcard-bearing (`*?[`) entry names on either side; report each missing file, each extra file, each differing file, and each `manifest.json` difference after parsing both as JSON.
   - The allowlist is exact, from the measurement. Chrome may add exactly `_metadata/verified_contents.json`, may omit exactly the empty `.gitkeep`, and may add exactly `"update_url": "https://clients2.google.com/service/update2/crx"` to `manifest.json`. AMO may add exactly `META-INF/cose.manifest`, `cose.sig`, `manifest.mf`, `mozilla.sf` and `mozilla.rsa`, and may re-serialize `manifest.json` without changing a value. Nothing else is tolerated, and no prefix is allowed wholesale.
3. **Verification reuses the publish path's checks without changing it.** `runVerifyPublished` (`attach-assets-run.ts:152`) stays as it is: it verifies all three assets, `SHASUMS256.txt` included, by digest and attestation, and its test's download order (`attach-assets-run.test.ts:228`) is untouched. Two edits only, neither changing behaviour: `fetchVerified` is exported, and its parameters narrow to `PublishedReadIO` (the read-only subset of `AttachIO`: `releasesFor`, `tagCommit`, `attested`, `verifyAttestation`, `downloadAsset`, `sha256`, `readText`, `log`, which `AttachIO` extends) and to `{ tag, tagSha }`. The store comparison composes it in `store-copy-run.ts`: it refuses unless the tag names `tagSha` and exactly one published, non-draft release holds the tag; it fetches `SHASUMS256.txt` and the store's zip, each once, through `fetchVerified` (digest and attestation with `--source-digest <tagSha>`); and it checks that `SHASUMS256.txt` lists exactly the version's two zips and that the zip's line matches its bytes. A version on the frozen pre-attestation list (in `store-copy-run.ts`, today `0.30.2`) takes a digest-only fetch of the same two assets instead, with a `::notice::`; a test pins that no other path skips the attestation. The store comparison holds only `PublishedReadIO`, so it cannot write to a release.

4. **`scripts/release/store-copy-run.ts`** (IO). For each store: download the copy once and log its sha256; for AMO, check `file.hash` from the v5 API first. Read `manifest.json`'s `version_name` and refuse unless it is a stable `X.Y.Z`; the release is `vX.Y.Z`, resolved to its commit through `io.tagCommit`. Verify the release zip as step 3 says. Compare and print findings through `command()`. Exit 1 on any finding, any HTTP or parse failure, a missing copy, a served version with no release, a hash mismatch or a failed attestation. The Chrome item id (`jlmiaokmjoicmclelpiiocdhncddkdmc`) and the AMO guid (`wallet@nulo.sh`) are committed constants; a test pins the Chrome id to the one in `apps/landing/src/install.ts`.
5. **Zip reading** uses a small `scripts/release/zip-read.ts` (`unzip -Z1` to list, `unzip -p` to read one entry at a time) tested against a real zip built in the test. A store copy is hostile input, so every step is bounded: the download stops past 128 MiB (the Chrome copy measured 36.7 MB); every subprocess has a 60-second timeout; more than 2,000 entries is refused (today's copies hold 626 to 631); a name holding a control character, which the line-oriented listing cannot represent, is refused with the other name checks; and the bytes actually read are counted, so the total stops at 512 MiB whatever the central directory claims. The two store-publish scripts keep their own readers: theirs return different shapes and their tests inject fakes, so moving them would risk the publish path for no behaviour gain (D9).
6. **`.github/workflows/verify-store-copies.yml`**: weekly `schedule` plus `workflow_dispatch` (`store: chrome | firefox | both`); one job, `permissions: contents: read` (plus `attestations: read` only if `gh attestation verify` needs it on a public repository, as the implementer measures); no environment, no secret; `./.github/actions/setup-bun` with `cache: "false"`.

### Arc 3: docs (#185)

CLAUDE.md § Release runbook, under Prerequisites, after the `nulo-landing` line: `apps/landing/wrangler.jsonc` names no `routes` on purpose. Wrangler reconciles a custom domain only when `routes` lists one, and the Workers Builds token holds no zone permission, so listing `nulo.sh` would fail every build. Attaching or moving the domain is the owner's step in the Cloudflare dashboard; an agent session does not make domain or DNS changes. Evidence: the `wrangler.jsonc:11-15` comment and the retired follow-up entry the issue quotes.

### Arc 4: plans ignore patterns (#182)

Add `draft-*.md`, `outline-*.md`, `leg-*.md` and `eli5-*.html` to `implementations-plan/.gitignore`, above `!**/lessons/**` so the re-include still wins, and to `CANONICAL_PATTERNS` (`scripts/ci-cd/plans/lib.ts:66`). `gitignoreFindings` then requires them and `trackedArtifactFindings` flags a tracked match. Update `CANONICAL_GITIGNORE` (`plans/fixture-repo.ts:69`), the missing-lines count in `structure.test.ts:35`, the negation's line number in `structure.test.ts:44-46` (6 becomes 10), and `lib.test.ts`'s `isCanonical` cases (each new shape, and its `lessons/` exemption). Update `implementations-plan/README.md` (the layout prose and portable rule 1) and CLAUDE.md § Implementation plans. No tracked file matches any new shape today. The blueprint skill's list (aa-skills) is outside this repository; the report flags it.

### Arc 5: nightly retention (#178), waits on page 5 and the owner's ruleset

Planned against record P5-02 as proposed: the owner excludes `refs/tags/v*-nightly.*` from ruleset 24737631; a scheduled job keeps the 14 newest nightly tags and releases and deletes older ones; stable and rc tags stay fully protected; immutable releases come after this, by the owner.

- `scripts/release/prune-nightlies.ts` (pure): union the release list and the tag list by tag name. A name qualifies only if it matches `^v\d+\.\d+\.\d+-nightly\.\d{5}$`. The newest 14 by the five-digit `YYDDD` suffix (then by version) are kept. A draft counts by its tag name. The function refuses to return a plan that names a non-qualifying tag.
- `scripts/release/prune-nightlies-run.ts` (IO): paginate both inventories; dry run by default; with `--apply`, for each selected tag in order, re-read it, delete its release, then its tag (`DELETE /repos/{o}/{r}/git/refs/tags/<tag>`), and read both back; stop at the first failure.
- A final job in `nightly.yml`, `prune-nightlies`, after `publish-nightly`: one nightly run then publishes and prunes in sequence, so no separate serialization is needed. It runs when `publish-nightly` succeeded (`if: always() && !cancelled() && needs.publish-nightly.result == 'success'`), passes `--apply` only when the nightly's `dry_run` input is false, holds `permissions: { contents: write }` only, checks out the run's own revision (no `ref`, as `CLEAN` requires) without persisted credentials, uses `./.github/actions/setup-bun` with `install: "false"` and `cache: "false"` (the scripts need no dependency), and joins `nightly.yml`'s `status` list. `release-integrity.test.ts` adds it to `CLEAN`, and its release-write guard gains this one job's REST deletion as the only allowed exception.
- `nightly.yml`'s group cancels a run in flight, so a prune can stop between deleting a release and deleting its tag. The next run finds a tag with no release, which the union already selects, and finishes it; a test plants that state.
- The tag ruleset protects tags, not release objects: this job's `contents: write`, like `publish-nightly`'s, could edit or delete any release if the job were compromised. The job runs no third-party action besides the pinned checkout and the local `setup-bun`, and its selection refuses non-nightly names. Immutable releases, the owner's later step, protect a release's assets and its tag, not the release object: it can still be deleted, and its title and notes edited. Whole-release deletion by a compromised `contents: write` job stays a residual of this job and of `publish-nightly` alike.
- Under immutable releases, GitHub's docs disagree on whether a tag can be deleted after its release is; deleting the release first is the only order that can work. The first prune after the owner enables immutability is watched (phase 5.4), and a refusal is reported, never retried around (`OWNER-ASKS.md` OA-2).

### File-level change map

| Phase | Production / CI files | Tests and pins |
|---|---|---|
| 1.1 | `.github/workflows/pr-quick.yml`, `CI.md`, `.github/WORKFLOWS.md` | `scripts/ci-cd/aggregators.test.ts` (Storybook worlds at the skipped-build and malformed-output cases, :140, :269) |
| 1.2 | the four `pr-extension-*-e2e*.yml` (`changes`, `decide`) | `aggregators.test.ts` (the `labels()` world key at :342-343, `decided()`), `behavior-gating.test.ts` (Firefox `decide` equality :327-336 still holds; a ban on `github.event.pull_request.labels`; the `live` step's script under a `gh` shim) |
| 1.3 | the six PR workflows (`concurrency`), `.github/workflows/pr-supersede.yml` (new), `CI.md` § Concurrency, `.github/WORKFLOWS.md:55` | `behavior-gating.test.ts` (concurrency pins :158-179 rewritten; supersede pins), `scripts/ci-cd/supersede.test.ts` (new) |
| 1.4 | scratch branch only (two probe workflows, never merged) | evidence in `lessons/phase-1.md` |
| 1.5 | by the rule: the e2e lanes, `release.yml` (`network-e2e`, `attach-assets`, `status`), `nightly.yml` (`network-e2e` and its Firefox mirror, `publish-nightly`, `status`), `scripts/ci-cd/verify-cert-run.sh`, `CI.md:45` | `aggregators.test.ts` (:283-303, :324-328), `behavior-gating.test.ts` (:350-359, :385-395, :444-470, :504-511, :528-534, :593-615), `release-integrity.test.ts` |
| 2.1 | `packages/legal/src/launch.ts` (new), `.github/workflows/pr-quick.yml` (`launch-legal`), `scripts/release/auto-unstick-run.ts` (preflight), `BEFORE-LAUNCH.md` §3, `CLAUDE.md` (manual unstick check, recovery row, boundary) | `packages/legal/src/launch.test.ts` (new), `aggregators.test.ts` (`launch-legal` worlds), `auto-unstick-run.test.ts` |
| 2.2 | `apps/extension/package.json`, `bun.lock`, `apps/extension/src/utils/presto-ui-state.ts`, `legal/README.md` | `presto-ui-state.test.ts` (test renamed, assertion unchanged), `presto-licence.test.ts` |
| 2.3 | `scripts/release/zip-read.ts`, `store-copy.ts`, `store-copy-run.ts` (new), `attach-assets-run.ts` (export `fetchVerified`, narrow its types), `.github/workflows/verify-store-copies.yml` (new), `SECURITY.md`, `CLAUDE.md`, `CI.md` | `zip-read.test.ts`, `store-copy.test.ts`, `store-copy-run.test.ts` (new), `attach-assets-run.test.ts`, workflow pins in `behavior-gating.test.ts` |
| 2.4 | `bunfig.toml`, `CLAUDE.md` (linker paragraph), any `package.json` the battery names | the battery |
| 3.1 | `CLAUDE.md` (release runbook) | — |
| 4.1 | `implementations-plan/.gitignore`, `scripts/ci-cd/plans/lib.ts`, `implementations-plan/README.md`, `CLAUDE.md` | `plans/fixture-repo.ts`, `plans/structure.test.ts`, `plans/lib.test.ts` |
| 5.x | `scripts/release/prune-nightlies.ts`, `prune-nightlies-run.ts`, `.github/workflows/nightly.yml` (`prune-nightlies`), `CLAUDE.md` § Tag rulesets | `prune-nightlies.test.ts`, `prune-nightlies-run.test.ts`, `release-integrity.test.ts` (`CLEAN`, release-write guard), `behavior-gating.test.ts` |

### Trade-offs and alternatives not taken

- **#167 half 2 left as a residual** (the ci-gates plan's choice and the competing outline). Rejected: the issue asks for the fix, and the residual reds the current head until someone re-runs it.
- **Per-head groups with no cancellation.** Rejected: every push mid-run would leave a full stale run (about 30 jobs across the lanes) competing for runners.
- **`actions: write` inside the PR lanes.** Rejected: it would give the write scope to every job of four workflows, including the ones that run third-party actions. One job with no action and no checkout carries it instead.
- **`pull_request_target` for the supersede job.** Rejected: its workflow comes from the base branch, so the arc's own PR could not exercise it before merge, and the trigger draws scanner findings. A same-repository PR author can already declare `actions: write` in any workflow they push, so `pull_request` widens nothing they lack; forks and Dependabot get read-only tokens and are skipped.
- **A Bun script for the supersede selection.** Rejected: it needs a checkout and `setup-bun`, a third-party action, in the one job that holds `actions: write`. The selection is one `jq` filter, tested by running the step under a `gh` shim.
- **#168 fixed without a probe.** Rejected: the mechanism depends on GitHub's undocumented re-run semantics, and the issue asks for a reproduction first. The probe costs one scratch branch and a few minutes of runners.
- **#183 as a `release.yml` step after tagging.** Rejected: once `resolve` runs the tag exists, so a refusal there burns the version. The preflight inside `auto-unstick` runs before the tag is created.
- **#183 as a tree-wide test.** Rejected for now: it would also bind `dev` from the sync after a stable release until the next rc, blocking legal drafts there (OA-3).
- **#82 held at 1.1.0 until the owner answers.** Rejected: the bump with today's title changes nothing a person sees (A1).
- **#179 as a mode of `store-check.yml`.** Rejected: that workflow runs in credentialed environments, and the comparison needs none.
- **One shared zip reader for all three scripts.** Rejected (D9).
- **Arc 5 as a separate scheduled workflow.** Rejected: it would race the nightly's publication; a job inside the nightly run is serialized by construction.

### Competing outline (cheapest first)

Generated for the audit as the alternative to compare against.

- **#166**: same job.
- **#167**: live labels only. Keep per-PR groups and the push-first-attempt cancel; record the cancel race as an accepted residual, as `lessons.md` does today. No `actions: write` anywhere.
- **#168**: no probe and no workflow change. CI.md already says "Re-run failed jobs, never one shard"; close #168 as procedural.
- **#82**: hold until the owner answers OA-1.
- **#172**: `hoist = false` with builds and unit suites only; rely on the PR's CI lanes for e2e.
- **#183**: one step in `release.yml`'s `resolve` job that fails a stable ≥ 1.0.0 tag with «FILL»; accept that the version is burned.
- **#179**: a dispatch-only script, no schedule, no shared reader.
- **#185, #182, #178**: same.

Its strength is a smaller diff and no new permission. Its weakness: #167's second half and #168 stay open in substance, and #183's refusal burns a release tag. Both audits preferred the main plan for #167, #168, #82, #183 and #179; for #172 the plan takes the hybrid the Opus audit proposed (local builds, unit suites and one network file; the PR's lanes for the full e2e on both browsers).

## Phases

Shared commands, from the worktree root unless stated:
- **Fast:** `bun run lint` (it prints Biome's first 20 diagnostics only; rerun on changed files when it fails), `bun run typecheck:all`, `bun run test`.
- **Gating:** `bun run test:ci-gating`.
- **Release:** `bun run test:release`. It needs `zip` on `PATH`; this host lacks it, so put a scratch copy under `~/.cache/nulo-backlog/ci-release-supply/` on `PATH` first, as #238 did.
- **Actions:** `bun run lint:actions`.
- **Plans:** `bun run check:plans` after staging plan files (it reads the index).

Pass criteria for every gate: each command exits 0; each new test is shown red against the base copy of the code it covers before it passes (take the old copy from the base SHA, never `HEAD`); the log is pasted into the phase's lessons file.

### Arc 1: workflows

**Phase 1.1, Storybook gate (#166).** ✓
1. Run `bun run --cwd apps/extension build-storybook` once and record its time.
2. Add the `build-storybook` job to `pr-quick.yml` as § Arc 1 says.
3. Add it to `quality-status`: `needs`, `BUILD_STORYBOOK_RESULT`, and an `expect` line like `build-chrome`'s.
4. Update `aggregators.test.ts`: a failed or cancelled Storybook build reds `quality-status`; a skipped one passes when the filter did not trip; the skipped-build and malformed-output worlds gain the new key.
5. Name the job in CI.md's `quality-status` list and in `.github/WORKFLOWS.md`.

Validation gate: Fast; Gating; Actions; `bun run --cwd apps/extension build-storybook`. Pass: all exit 0, and the new aggregator case fails with the `expect` line removed. Layers: lint, typecheck, unit (pins), build.

**Phase 1.2, live labels and live head (#167).** ✓
1. Add the `live` step and the `label-hit` output to each lane's `changes` job.
2. Bind every `decide` job's `LABEL_HIT` to `needs.changes.outputs.label-hit`, and add the `true`/`false` refusal before the gate.
3. Update the pins in the same commit: the `aggregators.test.ts` world key and `decided()`; the Firefox `decide` equality still holds.
4. Add a pin that no workflow reads `github.event.pull_request.labels`. Plant one read in a copy and show the pin fails.
5. Run the `live` step's script under a `gh` shim. The alias label sets `true`; an unrelated label sets `false`; a dispatch sets `false`; a live head unlike the event's head fails with "superseded"; a failing `gh` fails after one retry.
6. Feed `decide` an empty `LABEL_HIT` and show it fails.

Validation gate: Fast; Gating; Actions. Pass: all exit 0; each new case shown red on the base copy. Layers: lint, unit (pins).

**Phase 1.3, per-head queues and the supersede workflow (#167).** ✓
1. Rewrite the six workflows' `concurrency` blocks as § Arc 1 says.
2. Rewrite the two concurrency pins: the group holds the PR-number and the head-SHA expressions and not `head_ref`; `cancel-in-progress` is exactly `${{ github.event_name != 'pull_request' }}`.
3. Add `pr-supersede.yml`.
4. Pin it: workflow `permissions: {}`; one job with exactly `actions: write` and `pull-requests: read`; no `uses:` step; no `${{` inside `run`; the fork and Dependabot `if`; `on` is `pull_request` `synchronize` only; the step's workflow list equals the six PR workflows the pins already enumerate.
5. Add `scripts/ci-cd/supersede.test.ts`. It runs the step's script under a `gh` shim that records call order.
6. Shim cases: the run list comes before the head read. A newer head's planted run is never cancelled. Only unfinished runs on another head, in one of the six files and on this PR are cancelled; a run on the same branch name for another PR number is not. A rewind (the head read before a cancel returns that run's head) skips the run. A 409 counts as done. Any other error fails after one retry.
7. Rewrite CI.md § Concurrency and `.github/WORKFLOWS.md:55` to the new rule.

Validation gate: Fast; Gating; Actions. Pass: all exit 0; the shim test goes red when the two calls swap order and when the head filter is removed. Hosted proof waits for the PR (§ Delivery). Layers: lint, unit.

**Phase 1.4, the fold probe (#168).**
1. Create the branch `ci-release-supply-probe` from `dev`. Add the two probe workflows as § Arc 1 says. Push it.
2. Run the four single-job re-runs in order. Save each `status` log.
3. Record every `needs.*.result`, whether `status` re-ran, and both job lists per attempt in `lessons/phase-1.md`, with the run URL.
4. Delete the branch.
5. Apply the decision rule. Record which branch of it applies in `STATUS.md` and in the ledger.

Validation gate: the four re-runs completed and a fresh `status` log per re-run is recorded (at the re-run's attempt, or at the status-only attempt that follows it); the `sk`/`rsk` listings are recorded; `git ls-remote origin ci-release-supply-probe` prints nothing. Pass: the lessons file shows, per re-run, the attempt number and each value the rule reads. Layers: hosted CI.

**Phase 1.5, the per-shard fix (#168), by the rule.**
- Rule 1: rewrite CI.md:45 to the measured behaviour with the probe run's link.
- Rule 2(b):
  1. Unroll each sharded matrix the gates read into named jobs; keep each check-run name and each reusable workflow input.
  2. Update each gate's `needs` and checks; `verify-cert-run.sh`'s job list; the pins at `aggregators.test.ts:283-303` and `:324-328` (one release network caller), `behavior-gating.test.ts:350-359`, `:385-395`, `:444-470`, `:504-511` (one shard pool), `:528-534` (pool exclusions) and `:593-615` (release's `matrix.leg` shape). Rewrite each to the unrolled shape and keep what it guards: every shard covered once, identical exclusions on every pool shard, dedicated-file coverage unchanged, input and name parity with the PR lane. No pin is deleted.
  3. For each gate, add a case where one shard job fails and every other succeeds; the gate must fail.
- Rule 2(a):
  1. Add the exact-inventory check to the four lanes' `status` steps, with `actions: read` on those jobs and the Firefox no-permissions pin narrowed to allow it on `status` only.
  2. Add the read-only `network-e2e-legs` job to `release.yml` and `nightly.yml`, needed by the publisher and by `status`.
  3. Extend `aggregators.test.ts` with a `gh` shim: a carried-over failed leg, a missing leg, an extra leg and an unfinished leg each red the gate; all-skipped with `run=false` passes.
  4. Extend `release-integrity.test.ts` with the same carried-over failure for `release.yml` and `nightly.yml`; `SIGNING` stays exact.
- Rule 2(c): no change; comment on #168.

Validation gate: Fast; Gating; Release; Actions. Pass: all exit 0; the planted failed shard reds every gate the rule touched. Layers: lint, unit.

### Arc 2: scripts and installs

**Phase 2.1, the launch gate (#183).**
1. Add `packages/legal/src/launch.ts` and `launch.test.ts`. Read `legal/<doc>.md` for each document the package's manifest lists; do not glob `legal/`.
2. Unit cases: `1.0.0` with «FILL» in Terms is refused and names the file and line; `2.1.0` with «FILL» in Privacy is refused. Controls: `0.30.2` with «FILL», `1.0.0-rc.1` with «FILL», and a clean `1.0.0` all pass.
3. Add the live assertion under `NULO_LAUNCH_GATE=1`.
4. Add the `launch-legal` job to `pr-quick.yml` and wire it into `quality-status` (`expect` success on a PR into `main`, `skipped` otherwise); add the matching `aggregators.test.ts` worlds.
5. Prove the wiring once: set the root version to `1.0.0` in a scratch commit, run `NULO_LAUNCH_GATE=1 bun run --cwd packages/legal test`, see it fail on today's blanks, then drop the commit.
6. Add the preflight to `auto-unstick-run.ts`. Fake-IO cases in `auto-unstick-run.test.ts`: a stable `1.0.0` merge commit holding «FILL» creates no tag and exits red with the recovery text; a clean `1.0.0` and a `0.31.0` with «FILL» are tagged as today; the preflight runs before `createTag` (call order).
7. Fix BEFORE-LAUNCH.md §3's checkbox command. In CLAUDE.md's release runbook: the `git grep` line in the manual unstick, the recovery row, and the hand-pushed-tag boundary.

Validation gate: Fast; `bun run test:all`; Gating; Release; Actions. Pass: all exit 0; the `1.0.0` unit case fails with the version check removed; the auto-unstick refusal case fails with the preflight removed; step 5's run failed as expected. Layers: lint, typecheck, unit.

**Phase 2.2, presto-banners 1.2.0 (#82).**
1. Run `bun pm diff @alejoamiras/presto-banners@1.1.0 1.2.0`; summarise it in `lessons/phase-2.md`.
2. Set the pin to `1.2.0`; run `bun install`; then `bun install --frozen-lockfile`.
3. Give the onboarding `permission-blocked` arm the literal title; adjust the module header; rename the test.
4. Update `legal/README.md:51`.

Validation gate: Fast; `bun run test:all`; `bun run build:chrome` and `bun run build:firefox` (the notices generator runs inside); `cd apps/extension && bun run test:e2e -- tests/e2e/onboarding-tab.test.ts --retry=0`; `bun audit`. Pass: all exit 0; `presto-ui-state.test.ts:146` and `presto-licence.test.ts` pass with no assertion edited. Layers: lint, typecheck, unit, build, smoke e2e (Chrome).

**Phase 2.3, store copies (#179).**
1. Re-measure, as § Arc 2 step 1 says; record it in `lessons/phase-2.md` before writing code.
2. Export `fetchVerified` and narrow its parameter types (step 3); `attach-assets-run.test.ts` stays green with no edit, its call-order assertion included.
3. Add `zip-read.ts` and its real-zip test.
4. Add `store-copy.ts` and `store-copy.test.ts`. Build a CRX3 in the test from a fixture zip.
5. Pure cases: identical copies give no finding. Each of these gives a finding: one changed byte, one extra file, one missing file, one changed manifest value, and an `update_url` with another value. Each store's exact additions pass. A truncated header, an oversized header, a CRX2, too many entries, a control character in a name, a central directory that understates an entry's size past the output bound, and a duplicate, `..` or wildcard entry name are each refused.
6. Add `store-copy-run.ts` and its fake-IO test. Each of these exits 1: a missing copy, an HTTP error, a served version with no release, an AMO hash mismatch, a non-stable `version_name`, and a failed attestation on a version outside the frozen list. A listed pre-attestation version passes on digest and `SHASUMS256.txt`, with a notice.
7. Add a real-data case, `describe.skipIf(!process.env.NULO_STORE_COPY_LIVE)`, that runs the whole comparison against both live stores.
8. Add `verify-store-copies.yml` and its pins: permissions, no environment and no secret, the schedule, `cache: "false"`.
9. Add one line each to SECURITY.md's supply-chain section and to CLAUDE.md's release runbook (dispatch it once a store publish goes live); add the workflow to CI.md.

Validation gate: Release; Gating; Actions; Fast; `NULO_STORE_COPY_LIVE=1 bun test scripts/release/store-copy.test.ts`. Pass: all exit 0, and the live case passes for both stores. Layers: lint, unit, integration (live stores).

**Phase 2.4, `hoist = false` and the battery (#172).**

Warning: run this phase last in the arc. Run its network file only after gate G1 (#169 merged), and never beside another `e2e:agent` run in this worktree.
1. On the commit immediately before this phase (phase 2.3's tip), run `bun run test:all` with vitest's json reporter and `bun test`'s output saved, and record every collected test's identity (file and full name) with its skip state.
2. Add `hoist = false` to `bunfig.toml`.
3. Delete every `node_modules` in the worktree; run `bun install --frozen-lockfile`.
4. Confirm `node_modules/.bun/node_modules` does not exist.
5. Run the battery below. Fix each failure by the pre-registered rule (§ Arc 2). Log every fix.
6. Collect the same identities on the new layout and compare: the two sets must be equal, test for test, skips included, except for tests a recorded dependency fix adds.
7. Update CLAUDE.md's linker paragraph.

Validation gate (the battery): `bun run audit:vue` (typecheck, unit, lint, build); `bun run test:all`; Release; Gating; `bun run build:firefox`; `bun run --cwd apps/landing build`; `bun run --cwd apps/playground build`; `bun run --cwd apps/extension build-storybook`; `bun scripts/phantom-sweep.ts` (no finding); `cd apps/extension && bun run test:e2e -- --retry=0` (the whole smoke suite, Chrome); `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/networks.test.ts` (Chrome). Pass: all exit 0 on the fresh install; the collected test identities and skips equal step 1's; every dependency fix appears in the diff with its reason. Closing #172 also needs the PR's four e2e lanes green on both browsers. Layers: lint, typecheck, unit, build, smoke e2e, network e2e (one file locally; full on CI).

### Arc 3: docs

**Phase 3.1, the landing domain rule (#185).** Add the lines § Arc 3 gives to CLAUDE.md's release runbook.

Validation gate: Fast; Gating; `scripts/check-no-local-paths.sh`. Pass: all exit 0. Layers: lint, unit.

### Arc 4: plans ignore patterns

**Phase 4.1, four more shapes (#182).**
1. Add the four lines to `implementations-plan/.gitignore`, above `!**/lessons/**`, and to `CANONICAL_PATTERNS`.
2. Update the fixture, the count, the negation's line number and the `isCanonical` cases.
3. Update `implementations-plan/README.md` and CLAUDE.md.
4. Plant a tracked `draft-x.md` in a fixture repo and show `check:plans` reports it.

Validation gate: Gating; Plans; Fast. Pass: all exit 0; the planted file is reported; `git ls-files -ci --exclude-standard -- implementations-plan` prints nothing. Layers: lint, unit.

### Arc 5: nightly retention (waits on page 5 and the owner's ruleset)

Warning: every phase below waits until P5-02 is approved and `gh api repos/nulo-sh/nulo/rulesets/24737631 --jq '.conditions.ref_name.exclude'` lists `refs/tags/v*-nightly.*`. Build nothing before that.

**Phase 5.1, the selection.** Add `prune-nightlies.ts` and its test. Cases: 20 nightlies keep the newest 14; a stable tag, an rc tag and a tag one character off the pattern are never selected; a plan that names a non-nightly is refused; a draft counts by tag name; a tag with no release and a release with no tag are both handled; a year boundary (`25365` before `26001`) orders correctly.

Validation gate: Release; Fast. Pass: all exit 0. Layers: lint, unit.

**Phase 5.2, the runner and the job.** Add `prune-nightlies-run.ts` with a fake-IO test: dry run by default; release before tag; re-read before and read back after each deletion; stop at the first failure; a tag left without its release by an interrupted run is deleted next time. Add the `prune-nightlies` job to `nightly.yml` and its pins (`CLEAN`, so no checkout `ref`; the release-write guard's one exception; `contents: write` only; `install: "false"`; `cache: "false"`; the `if`; the `status` list). Update CLAUDE.md § Tag rulesets and immutable releases.

Validation gate: Release; Gating; Actions; Fast. Pass: all exit 0. Layers: lint, unit.

**Phase 5.3, first runs (after the PR merges).** Dispatch `nightly.yml` on `dev` with `force=true` and `dry_run=true` (without `force`, the quiet-day skip can stop the run before the prune); compare the prune plan with `gh release list`. Then let one real nightly run prune; read back the deleted releases and tags.

Validation gate: the dry-run plan equals the expected set; after the real run, `gh api repos/nulo-sh/nulo/git/matching-refs/tags/v` shows at most 14 nightly tags and every stable and rc tag. Layers: hosted.

**Phase 5.4, immutability watch.** After the owner enables immutable releases, read the first prune's log. A refused tag deletion is reported to the owner (OA-2), never retried around.

## Security & Adversarial Considerations

**Threat model.** A malicious or careless PR from a branch in this repository (its author has write access); a compromised third-party action or npm package; a stale re-run or out-of-order event; a store account or store pipeline that serves bytes this repository never released. Forks and Dependabot get read-only tokens.

| Phase | Before | After |
|---|---|---|
| 1.1 | A story change that breaks the Storybook build merges green. | `quality-status` fails. CI's Storybook build sends no telemetry. |
| 1.2 | A late-arriving event's run decides from stale labels, and can skip a lane the labels ask for or run one they no longer ask for. | Every run decides from the labels the PR carries when `changes` runs; an obsolete head's run stops itself; an API failure or an empty output fails closed. |
| 1.3 | An older push's first attempt that enters late cancels the current head's run, which reads red until re-run; a queued newer run can be replaced by an older one. | Runs of different heads never share a queue. Obsolete heads are cancelled by listing first, reading the live head second and re-reading it before each cancel, filtered by PR number; the residual is a force-push rewind inside one cancel call, stated in § Arc 1. The `actions: write` scope sits in one job that runs no action, checks nothing out and interpolates nothing into its script. A same-repository PR could rewrite that job, but its author can already declare the scope in any workflow; forks and Dependabot are skipped. |
| 1.4 | — | The probe runs on a scratch branch with `actions: read`, is never merged, and is deleted. |
| 1.5 | A single-shard re-run may green a required check, or let `attach-assets` publish a release or `publish-nightly` a nightly past a red shard. | (by the rule) each gate reads each shard as its own job, or checks an exact inventory of its legs. No advisory job joins a gate; the release and nightly signers keep their exact permissions. |
| 2.1 | A 1.0.0 release can ship Terms with a blank effective date. | The Release PR for 1.0.0 cannot pass `quality-status`; a retargeted or `--admin`-merged one is stopped by `auto-unstick` before the tag exists, and the manual unstick runs the same check. Residual, stated in the runbook: a hand-pushed tag skips both until #21's ruleset. |
| 2.2 | A held dependency misses upstream fixes. | The bump is reviewed with `bun pm diff`, the audit gate and the notices policy; past the 7-day gate with no exclude. |
| 2.3 | A store copy that differs from the released build goes unnoticed. | A weekly job fails on any difference outside each store's exact additions, on a missing copy, on a served version with no release, and on a failed attestation from the first attested version on. It holds no secret and runs in no environment. It checks a sample, not every install. |
| 2.4 | An undeclared import resolves through the hoist fallback, locally and on CI. | It fails at install-layout level everywhere, except through root dependencies and listed `publicHoistPattern` entries, which Bun keeps reachable by design. |
| 3.1, 4.1 | A domain change can be scheduled for an agent; a transcript saved as `draft-*.md` is tracked with local paths in it. | The runbook states the owner boundary; four more shapes are ignored, and a tracked one fails `check:plans`. |
| 5.x | Nightly tags accumulate; under immutable releases they become permanent. | Only names matching the strict nightly pattern can be selected; the ruleset still protects every stable and rc tag even if the script were wrong. The job runs inside the nightly, after its publication, with `contents: write` only. |

**Least privilege.** New scopes: `actions: write` on `pr-supersede.yml`'s one job; `actions: read` only if rule 2(a) applies (the four e2e `status` jobs and one read-only job each in `release.yml` and `nightly.yml`); `contents: write` on arc 5's one job. Nothing else widens. No secret, environment, repository setting, ruleset or required check changes.

**API budget.** Each PR event adds one PR read per e2e lane; each push adds five run listings and one PR read, plus one call per cancellation. All draw on the repository's `GITHUB_TOKEN` hourly allowance; the scripts retry once on 403, 429 and 5xx, and the hosted proof logs the call counts.

**Supply chain.** No new npm dependency, YAML library or zip library. Every added action reference is SHA-pinned like its neighbours, and no new third-party action is introduced. The 7-day gate and the frozen lockfile stay as they are; #82 passes them unexcluded.

**Cryptography.** None is written. Store-copy verification uses `sha256` from Bun and `gh attestation verify` (Sigstore through the GitHub CLI); CRX signatures are not re-verified, because the comparison checks content against the released zip.

## UI impact

None. No wallet screen, copy, row or format changes. #82's only rendered difference in 1.2.0 is a title that the shipped form keeps as it is today; adopting the package's new title is `OWNER-ASKS.md` OA-1. The Storybook build renders nothing anyone sees.

## Assumptions

### Facts

- F1. Each e2e lane decides from `github.event.pull_request.labels` (`pr-extension-smoke-e2e.yml:107`, `pr-extension-network-e2e.yml:113`, both Firefox twins at :92 and :99); `decide` treats an empty value as false (`pr-extension-smoke-e2e.yml:116`).
- F2. All six PR workflows group by PR number without the head SHA and cancel on a `synchronize` at attempt 1 (`pr-extension-smoke-e2e.yml:16-20`); `behavior-gating.test.ts:158-179` pins both.
- F3. Each e2e aggregator reads one `needs.<matrix job>.result` (`pr-extension-smoke-e2e.yml:171`, `pr-extension-network-e2e.yml:276-284`); so do `release.yml` `attach-assets` (:463) and `status` (:804), and `nightly.yml` `publish-nightly` (:511) and `status` (:631).
- F4. No workflow runs `build-storybook` (`grep -rn -i storybook .github`); `.storybook/main.ts` does not disable telemetry.
- F5. `@alejoamiras/presto-banners` 1.2.0 was published 2026-09-25T21:39Z (registry `time`), MIT, no dependencies. Its only change Nulo renders is `STRINGS["permission-blocked"].title` (diff of the two tarballs, confirmed by both audits), read at `presto-ui-state.ts:92`; the onboarding card is pinned to `offline` (`apps/extension/src/onboarding/pages/presto.vue:92`), whose output is unchanged.
- F6. The extension CSP is `style-src 'self' 'unsafe-inline'` (`apps/extension/manifest/manifest.config.ts:60`), so the banner's stylesheet change moves no hash.
- F7. Bun 1.4.2 documents `install.hoist` for the isolated linker, with root `node_modules` still reachable (bun-types 1.4.2 `docs/runtime/bunfig.mdx:702-706`); CI caches only `~/.bun/install/cache` (`setup-bun/action.yml:38`).
- F8. `legal/terms.md` holds «FILL» at :3 and :578; `legal/README.md` at :16 and :22; `hasPlaceholders` is `packages/legal/src/document.ts:26`.
- F9. Release-please writes the release version into the root `package.json` (`release-type: node`) and `apps/extension/package.json` (`extra-files`); `main` requires `quality-status` (CLAUDE.md § Branching).
- F10. The `release tags` ruleset (24737631) forbids deleting or moving any `v*` tag; tag creation is unrestricted until #21 (CLAUDE.md § Tag rulesets).
- F11. #176 and #193 were closed by #238 (8099368); the pins file, its test and `workflow-refs.test.ts` are in the tree.
- F12. `zip` is not on this host's `PATH`; `test:release` needs it.
- F13. Both stores serve Nulo publicly without credentials, at manifest version `0.30.2.0` with `version_name` `0.30.2`. Their copies differ from the v0.30.2 release zips only as § Arc 2 (#179) lists (measured 2026-10-10, `lessons/phase-0.md`). v0.30.2 has no attestation (`gh attestation verify` answers 404).
- F14. GitHub replaces a waiting run of the same concurrency group by default (`queue: single`); `queue: max` keeps up to 100 waiting runs and cannot be combined with `cancel-in-progress: true` (GitHub's concurrency documentation).
- F15. `runVerifyPublished` hashes rebuilt assets and edits the release (`scripts/release/attach-assets-run.ts:152-174`); `fetchVerified` and `checkShasums` are private (:176, :189).

### Inferences

- I1. GitHub folds a matrix to `success` after a single-leg re-run while another leg's failure stands. Source: one community report; unproven here. Phase 1.4 tests it.
- I2. In a later attempt, `filter=all` lists each job's earlier attempts, so the highest `run_attempt` per name is that job's standing result. Codex observed `filter=all` include old executions on an existing run; phase 1.4 tests the carried-over case.
- I3. A run cancelled through the API may still run its `always()` aggregator; GitHub guarantees that only for jobs already running. Either way the result lands on an obsolete head.
- I4. `hoist = false` surfaces few or no undeclared imports; the battery tests it, and the stop rule bounds the cost. Lazy `require` calls on the Node side that no suite reaches stay untested.
- I5. Deleting a release before its tag works for nightly tags once the ruleset excludes them; under immutable releases the docs disagree (OA-2).

### Asks (each has a working assumption; none blocks arcs 1-4)

- A1. **#82's onboarding title.** Working assumption: ship 1.2.0 with today's title kept (no visible change). Adopting the package's new title is the owner's call (OA-1).
- A2. **#183 and `dev` after launch.** Working assumption: check only PRs into `main`. Checking `dev` too would block legal drafts with «FILL» there between a stable sync and the next rc (OA-3).
- A3. **The probe branch.** Working assumption: pushing a scratch branch with a push-triggered probe workflow to `nulo-sh/nulo`, and deleting it after, is a feature-branch push the lane may make (only `dev`, `main` and `v*` tags carry rulesets, and no other workflow fires on that push). If the orchestrator prefers a throwaway repository, the probe moves there unchanged.
- A4. **#179's schedule.** Working assumption: a weekly scheduled run is acceptable; a red one notifies like any scheduled workflow.
- A5. **Delivery shape.** Working assumption: one PR per arc, in order, each against `dev` (the orchestrator's D-orch-1); the `gh stack` mechanics below apply if the orchestrator asks for a stack.
- A6. **#172's soak.** Working assumption: the deterministic battery with a test-inventory compare meets the archived plan's "own gate after a soak", because a layout change alters which modules resolve, not timing. The orchestrator may require the 30-run soak matrix instead; it would add hours and no new signal for this change.

## Decision ledger

Panel: Codex (gpt-6.1-sol, high) and an Opus 5.5 Plan agent, round 1 on 2026-10-10. Each row gives the decision, both views where they differed, and why it stands.

| ID | Decision | Why | Panel and alternatives |
|---|---|---|---|
| D1 | Per-head concurrency groups in all six PR workflows, cancel only on dispatch | Only distinct groups make an out-of-order old push harmless; one rule for all six keeps the pin uniform | Both legs accept per-head groups; both corrected the claim that no same-head run is ever cancelled (a waiting run is replaced, harmlessly once labels are live). Rejected: per-PR groups with live labels only (competing outline) |
| D2 | Cancel obsolete heads from `pr-supersede.yml`: list runs first, read the live head second, inline `gh`/`jq`, no checkout, no `${{` in `run` | Throughput needs obsolete runs cancelled; the read order makes the current head unselectable | Both legs flagged the original head-first order as cancelling the current head (High, accepted). Codex round 1 proposed revalidating before each cancel; the draft called it unnecessary, and the final pass showed a force-push rewind defeats list-first alone (accepted: revalidation, rewind shim case, residual stated) Rejected: `actions: write` in the lanes; `pull_request_target`; a Bun script |
| D3 | Live labels and live head read in `changes`; always `true`/`false`; `decide` refuses anything else | `changes` already holds `pull-requests: read`; no fallback can fail open | Opus found the snapshot-comparing notice contradicted the ban and the `|| 'false'` default failed open (accepted: notice dropped, default removed). Codex asked to clean up late obsolete runs; the live-head check does that for the e2e lanes (accepted) |
| D4 | Probe before fixing #168, with a pre-registered rule and both reusable-workflow shapes | The behaviour is undocumented; unrolling yields separate reusable-workflow calls, which the probe must cover | Opus added `rja`/`rjb` (accepted). Both legs prefer the probe over procedural closure |
| D5 | If the fold holds, prefer unrolled jobs (b); fall back to an exact-inventory API check (a) | (b) is deterministic and needs no permission; (a) as first drafted would have gated on advisory nightly jobs and broken the signers' exact permissions | Both legs rejected the original (a) scope (High, accepted). Codex preferred an exact-inventory (a); Opus preferred (b). (b) wins on determinism and least privilege; (a) stays the fallback, scoped to the gate's own legs, in a separate read-only job for release and nightly. Final pass: rule 1 needs a fresh `status` at the re-run's attempt, the probe adds skipped matrices, and (b) names four more pins (accepted) |
| D6 | #82 ships with today's title kept | Nothing a person sees changes, so it need not wait | Both legs confirmed the card is pinned to `offline` and only the title changes. Opus: the screenshot proves the card, not the title (accepted: screenshot step dropped, test renamed) |
| D7 | #183 as a `packages/legal` test run by a `launch-legal` job on PRs into `main`, refusing a stable ≥ 1.0.0, with the same check in `auto-unstick` before it creates a stable tag | Both run before any tag exists; neither binds `dev` | Codex: placement sound, "no tag is burned" overclaims (accepted: boundary stated). Codex round 1 also proposed a preflight before `auto-unstick` tags; the draft rejected it as redundant with the required check. The final pass showed a retarget (`edited` is not a `pr-quick.yml` trigger) can merge on a green `quality-status` from a `dev`-based run, so the preflight is accepted as the backstop at the irreversible step, with a documented recovery. Opus: a tree-wide test binds `dev` after launch (accepted: scope moved to PRs into `main`, OA-3) |
| D8 | #179's allowlist is exact paths and exact values, measured, and a missing copy fails | A prefix or key-only allowlist is a hole; an absence pass hides a takedown | Both legs (Medium, accepted). The measurement was done at planning (F13) |
| D9 | #179 gets its own small zip reader; the two publish scripts keep theirs | Their readers differ in shape and are faked in tests, so a move is unproven and touches the publish path | Codex was fine with sharing; Opus showed the move would be untested (accepted). Codex: the verifier cannot be reused as-is (High, accepted: `fetchVerified` exported with read-only types and composed by the store script; the publish path is unchanged) |
| D10 | #172 proven by a deterministic battery plus a test-inventory compare; the full e2e on both browsers comes from the PR's lanes | Layout changes resolution, not timing | Opus: the plan silently overrode the archived soak decision (accepted: stated as A6 for the orchestrator) and proposed the hybrid (accepted). Codex: root dependencies stay reachable (accepted: boundary corrected). Final pass: the archived plan prescribes no 30-run matrix (`archive/isolated-linker-store/plan.md:41`); compare test identities against the commit just before, not totals against the arc base (accepted) |
| D11 | Arc 5 is a job inside `nightly.yml`, after `publish-nightly` | Publication and deletion are serialized by construction; no `actions: read` needed to see a running nightly | Codex: a separate workflow races the nightly (accepted). Opus: refusing while a nightly runs needs `actions: read`, contradicting "contents: write only" (resolved by the move). Rejected: a separate workflow sharing the `nightly` group. Final pass: the job's checkout takes no `ref` (`CLEAN`), the first dry run needs `force=true`, and an interrupted prune is finished by the next one (accepted) |
| D12 | Keep `queue: single` (the default) | With live labels a replaced waiting run would have decided the same way; `queue: max` would run every queued duplicate and cannot pair with dispatch's cancel | Codex proposed `queue: max` (rejected with this reason). Opus agreed the per-head key needs no queue change |
| D-orch-1 | No stack: arc 1 opens its own PR against `dev` (`gh pr create --base dev`), titled per the Delivery table; later arcs branch from arc 1's branch and rebase onto `dev` once it lands | The orchestrator's delivery call | Supersedes the `gh stack` mechanics in § Delivery for this lane (A5) |
| D-orch-2 | Arc 1 only for this run; nothing of arcs 2 to 5 is built. OA-1, OA-2 and OA-3 sit on the owner's decision page 5; none touches arc 1 | The orchestrator's scope call | — |
| D-orch-3 | A3 approved: the probe pushes the scratch branch `ci-release-supply-probe` to `nulo-sh/nulo` and deletes it once the readings are recorded (`git ls-remote origin ci-release-supply-probe` prints nothing before the arc ends); nothing is pushed to `dev`, `main` or a `v*` tag. A6 accepted: the deterministic battery stands in for the soak in arc 2 | The orchestrator's answers to A3 and A6 | — |
| D-orch-4 | The final pass's unreviewed arc-1 fixes come first: the first Codex round and the Opus review are asked, explicitly and before anything else, about D2 (list, read, revalidate; the force-push rewind), D3 (no fallback on the live label read; the `true`/`false` refusal) and D5 (rule 1's fresh `status` at the re-run's attempt; the skipped-matrix probe cases). Phase 1.3's gate counts as passed only once their answers are recorded under Audit verdicts | The final Codex pass rejected twice and its last fixes were never re-reviewed | — |
| D13 | The `live` step runs `scripts/ci-cd/live-labels.sh <label> <alias>` after the checkout, instead of four inline copies before it; its tests live in `behavior-gating.test.ts` (`live labels`) and the `decide` refusal's in `aggregators.test.ts` | One source that shellcheck lints and the shim test runs directly, pinned identical in all four lanes; an obsolete run now pays one checkout before it stops, seconds against a suite's minutes | Implementation deviation from § Arc 1's inline step (arc 1 build). `pr-supersede.yml` stays inline: its job holds `actions: write` and checks nothing out |
| D14 | `implementations-plan/lessons.md`'s concurrency line is rewritten in arc 1, not at close-out | It states the push-first-attempt rule arc 1 replaces; every task reads that file first, so it must not outlive the merge | Implementation deviation from § Post-implementation step 5 |
| D15 | The live step also writes the pull request's live `base`; `decide` reads it and refuses an empty one on a pull request | A run admitted late, or re-run, after a retarget would otherwise decide from the event's base | Codex round 1 finding 2 (accepted in part). Rejected: subscribing the lanes to `edited`, because every title or body edit would re-run the suites and an `edited` run that re-decided to skip would post a success copy; a retarget still starts no run, the recovery (close and reopen, or push) is in CI.md. Codex round 2 holds that the retarget gap stays a bypass; it is pre-existing (`pr-quick.yml` documents it for `quality-status`) and is recorded as an accepted residual of arc 1, filed as #251 (`owner-decision`: CI cost against coverage, with a cheaper base-change re-run job as the possible fix) |
| D16 | Each lane's aggregator accepts skipped suites only when `changes` read the labels in its own attempt (`read-attempt` == `github.run_attempt`); otherwise it fails with "re-run all jobs" | A re-run of `status` or `decide` alone carries the earlier attempt's `run=false` over, so a skip decided before a label was added could post green | Codex round 1 finding 1 (High, accepted; Codex evaluated all four scripts green on the carried inputs). A re-run of failed suites keeps its ran gate and passes |
| D17 | `pr-supersede.yml` acts only for its event's head: it never selects `EVENT_HEAD`'s runs and stops, cancelling nothing more, when any head read differs from it; runs are listed in lifecycle order; `live-labels.sh` reads once more after a pause before calling a run superseded | Every head change, a rewind included, starts its own sweep, so stopping never cancels what another sweep needs, and it also covers a pull request read staler than the event; sweeps share no concurrency group, so a late-admitted older sweep cannot cancel a newer one | Opus round 1 finding 1 (Medium, accepted) supersedes the skip-if-current re-read of D2; findings 2 and 3 (Low, accepted). Codex round 1 finding 3: the claims are best effort, residuals restated in CI.md and § Arc 1. Codex round 2 finding 2: the per-PR group with `cancel-in-progress` let an older sweep cancel the newer one (accepted: group removed, pinned absent) |

## Audit verdicts

### Round 1, Codex (gpt-6.1-sol, high, read-only), 2026-10-10

Verdict: **reject** (with blocking findings: cancellation races, incorrect shard-gate scope, and incompatible verifier reuse). Ten findings, all triaged:

| # | Finding | Disposition |
|---|---|---|
| 1 | High. Per-head groups still replace a waiting same-head run; use `queue: max` | Fact accepted, claim corrected (§ Arc 1); `queue: max` rejected (D12) |
| 2 | High. Supersede reads the live head before listing, so a push in between gets cancelled | Accepted: list first, head second, shim test pins the order (D2) |
| 3 | High. The per-job API rule would gate on nightly's advisory jobs and accept incomplete inventories | Accepted: (a) rescoped to an exact inventory of the gate's own legs; (b) preferred (D5) |
| 4 | High. The store comparison cannot reuse `runVerifyPublished` (rebuilt assets, release edit) | Accepted: the store script composes an exported, read-only-typed `fetchVerified`; the publish path is unchanged (D9) |
| 5 | High. Store absence must not pass; derive the tag from `version_name` | Accepted: a missing copy fails; `version_name` validated (D8) |
| 6 | Medium. Allowlist semantics, CRX bounds, duplicate names, decompression bounds, one download | Accepted: exact paths and values, header bounds, name refusals, one hashed download; the bounds were completed after the final pass (finding 7) |
| 7 | Medium. "No tag is burned" overclaims; add a preflight before `auto-unstick` | Boundary accepted and stated; preflight rejected (D7) |
| 8 | Medium. `hoist = false` leaves root dependencies reachable; add Firefox runtime coverage | Accepted (D10) |
| 9 | Medium. Pin updates the plan did not list | Accepted: listed per phase in the change map |
| 10 | Medium. Arc 5 races the nightly; paginate, union, revalidate, stop on failure; no install or cache | Accepted (D11) |

### Round 1, Opus Plan agent (same family, read-only), 2026-10-10

Verdict: **conditional approve** (with conditions: fix the order of the supersede job's two API reads; rewrite or replace rule 2(a) and add the missing probe shape; resolve the contradiction in the live-label step and its fail-open default; surface #183's effect after launch as an owner ask; make #179 fail closed once a store has published and pin the values on its allowlist). Eleven findings, all triaged:

| # | Finding | Disposition |
|---|---|---|
| 1 | High. Supersede read order (same as Codex 2) | Accepted (D2); `-f branch=` from `env:` and the no-`${{` pin added |
| 2 | High. Rule 2(a) scope, signer permissions, Firefox no-permissions pin, eventual consistency; prefer (b); add `rja`/`rjb`; unlisted pins | Accepted (D4, D5); pins listed |
| 3 | Medium. Notice contradicts the ban; `|| 'false'` fails open; `decide` jobs not identical | Accepted (D3); claim corrected |
| 4 | Medium. #183 binds `dev` after launch | Accepted: scope moved to PRs into `main`; OA-3 made a real ask (D7) |
| 5 | Medium. #179 absence, key-only allowlist, entry names, pre-attestation version | Accepted (D8); the frozen pre-attestation list covers v0.30.2 |
| 6 | Medium. #172 overrides the soak decision silently; root dependencies | Accepted: A6, boundary corrected (D10) |
| 7 | Low-Medium. API budget | Accepted: status-filtered listing, one retry, logged counts |
| 8 | Low. The shared reader move is unproven | Accepted (D9) |
| 9 | Low. Arc 4 line index and pattern order | Accepted |
| 10 | Low. Arc 5 permission contradiction, `CLEAN`, release-write guard | Accepted (D11) |
| 11 | Low. The #82 screenshot proves the card only | Accepted: step dropped, test renamed |

Both legs, per issue: main plan over the competing outline for #167, #168, #82, #183 and #179; the hybrid for #172; ties for #166, #185, #182, #178.

### Final pass, Codex (gpt-6.1-sol, high, fresh session), 2026-10-10

Verdict: **reject** (with blocking findings: launch-gate bypass and incomplete shard-probe acceptance rules). It found the round-1 fixes held in text for the read order, rule 2(a)'s scope and 2(b)'s preference, the probe's reusable shapes, the label booleans and self-stop, #183's placement, the verifier's direction, the store allowlist, the hoist boundary and arc 5's move; and not fully for cancellation safety, the probe's acceptance, the pin inventory and the verifier's contract. Eight findings, all verified against the tree and accepted:

| # | Finding | Disposition |
|---|---|---|
| 1 | High. A PR that passed against `dev` with `launch-legal` skipped can be retargeted to `main` (`pr-quick.yml:22-28` excludes `edited`) and merge on its existing green check | Accepted: preflight in `auto-unstick` before a stable tag is created, the same check in the manual unstick, recovery documented (D7) |
| 2 | High. Rule 1 could close #168 on a stale `status` log; rule 2(a) assumes a skipped reusable matrix lists its legs | Accepted: readings only from a `status` at the re-run's attempt; `sk`/`rsk` probe shapes; a skipped gate reads only `skipped` (D5) |
| 3 | Medium. A force-push rewind between the head read and a cancel defeats list-first | Accepted: revalidate before each cancel, rewind shim case, residual stated, PR-number filter kept (D2) |
| 4 | Medium. Unrolling breaks `aggregators.test.ts:324-328` and `behavior-gating.test.ts:504-511`, `:528-534`, `:593-615`, unnamed | Accepted: listed in phase 1.5 with what each must keep guarding |
| 5 | Medium. The hoist battery compares totals against the arc base, after phase 2.1 added tests | Accepted: identity compare against the commit just before (D10) |
| 6 | Medium. The read-only verifier's contract is underspecified | Accepted: `PublishedReadIO`, the frozen list confined to the store-copy caller. The first fix dropped `SHASUMS256.txt`'s own digest and attestation check from the publish path; the resume caught it, and the final form leaves `runVerifyPublished` unchanged and composes the exported `fetchVerified` instead |
| 7 | Medium. `unzip -Zt` trusts the archive's own size claims; no download, entry or time bounds | Accepted: download, entry, output and time bounds; control-character names refused; a lying central directory tested |
| 8 | Medium. Arc 5's checkout `ref` conflicts with `CLEAN`; the dry run needs `force`; a cancel can split a deletion; release objects are unprotected | Accepted (D11, § Arc 5) |

**Resume of the same session** (checking the fixes): **reject** (with blocking findings: verifier refactor weakens existing published-asset verification). Findings 4, 5 and 7 held; 2 and 3 held with tightenings; 1 held with a tighter recovery; 8's mechanics held with one overstated claim; 6 did not hold. All accepted and applied:

| # | Finding | Disposition |
|---|---|---|
| 6 | High. The extracted verifier checked `SHASUMS256.txt` by content only and changed the publish path's download order | Accepted: `runVerifyPublished` unchanged; `fetchVerified` exported with read-only types and composed by the store script, which fetches both assets once with digest and attestation |
| 1 | Medium. The recovery assumed the repair keeps the release version | Accepted: version, lockfile and manifest checked before tagging; tag only if absent |
| 2 | Medium. Checker jobs need `always() && !cancelled()`; a skipped matrix with run=true must fail; reconcile the attempt wording | Accepted |
| 3 | Medium. Revalidate inside the retry loop; the "live base" claim is unsupported | Accepted: revalidation per attempt; claim narrowed to live labels and the newer event |
| 8 | Medium. Immutable releases do not stop a release's deletion or note edits | Accepted: claim corrected, residual stated |
| — | Phase 2.1's gate omitted `test:release`, which runs the new auto-unstick cases | Accepted |

No finding disputes the plan's structure or reopens an owner or orchestrator decision. The panel did not reach `approve`; the orchestrator decides whether a further pass is wanted before approval.

### Arc 1, Codex round 1 (gpt-6.1-sol, high, read-only), 2026-10-10

Session 01a1235e-8b86-7611-87c3-e1a83f2a979b, on the arc diff through phase 1.3 and the draft probe. Run on the `alejo-icloud` roster account, where the environment's `CODEX_ACCOUNT=best` routed it. Verdict: **reject** (a stale gate can still produce a green e2e aggregator). The three unreviewed fixes first (D-orch-4):

| Fix | Answer | Disposition |
|---|---|---|
| D2, list, read, revalidate; the rewind | Does not hold as an absolute claim: a rewind after a cancel, asynchronous cancellation and unguaranteed API consistency sit outside the stated window | Accepted: claims restated as best effort, residuals widened (CI.md § Concurrency, § Arc 1); the mechanism itself changed per Opus (D17) |
| D3, no fallback, `true`/`false` refusal | Holds whenever `changes` runs; does not hold for partial re-runs, which reuse an earlier attempt's gate | Accepted: D16 |
| D5, fresh `status`, skipped matrices | Holds for attempt identification and `sk`/`rsk`; a status-only re-run is diagnostic, not evidence; a later failure must not erase an earlier fold | Accepted: procedure tightened (§ Arc 1, #168); `set -euo pipefail` in the probe's `status` |

| # | Finding | Disposition |
|---|---|---|
| 1 | High. Re-running `status` alone in an older run of the same head reuses its `run=false` and skipped suites and posts green | Accepted, verified on the scripts: D16, four regression cases with a success control |
| 2 | High. `BASE` comes from the event; a retarget starts no run | Accepted in part: D15 (live base); `edited` rejected with its reason |
| 3 | Medium. Cancellation docs overstate the invariant | Accepted: CI.md and § Arc 1 rewritten |
| 4 | Medium. Rule 1 needs direct dependent observations | Accepted: § Arc 1 procedure |
| — | Comments: `supersede.test.ts` header overclaims; the Storybook telemetry comment restates its env line | Accepted: both rewritten or removed |

### Arc 1, Codex round 2 (resume of the same session), 2026-10-10

Verdict: **reject**, on the retarget gap alone; the attempt guard, the live base, the event-head rule and the probe changes hold (127 targeted tests passed in its run). Its answers: (a) the event-head stop is sound, though out-of-order admission can leave obsolete runs to finish; (b) the attempt guard keeps a dispatch, a first attempt, "Re-run all jobs" and "Re-run failed jobs" with `run=true` working; (c) no other path posts green for a head whose suites the live labels or base ask for.

| # | Finding | Disposition |
|---|---|---|
| 1 | High. A retarget starts no run, so a skipped-suite green from `dev` stands on `main` | Rejected as an arc 1 change, recorded as an accepted pre-existing residual and filed as #251 (D15): an `edited` subscription re-runs every suite on each title or body edit |
| 2 | Low. "Its own sweep takes over" promises an admission order GitHub does not give: an older sweep admitted last cancels the newer one through the job's group | Accepted: the group is removed and pinned absent; wording now says cancellation is best effort |

### Arc 1, Opus review (same family, read-only), 2026-10-10

Verdict: **approve with fixes**. The three answers: D2 holds for ordering but not under a stale pull request read; D3 holds for labels, with the retarget and partial re-run gaps Codex also found; D5 holds, with a void-reading precondition and a fidelity gap. (Its red test counts came from the worktree mid-edit; the committed tree passes.)

| # | Finding | Disposition |
|---|---|---|
| 1 | Medium. A pulls read staler than the run list cancels the current head's runs | Accepted: D17, with shim cases for a newer push, a rewind and a stale read |
| 2 | Low. The same staleness fails the current head's `changes` as superseded | Accepted: one late read (D17), shim case |
| 3 | Low. Listing order misses a run that moves on between listings | Accepted: lifecycle order, pinned |
| 4 | Low. CI.md: a cancelled run's FAILURE stays on a head that becomes current; "listing first keeps the head safe" is wrong | Accepted: rewritten |
| 5 | Low. Tests: a wrong comment, a misnamed case, an unbound env value passing as a literal | Accepted: comment replaced, a failing-read case added, unbound `${{ }}` throws |
| D5 | A reading whose re-run leg did not pass is void; the probe lacks the lanes' `needs: decide` shape | Accepted: precondition and `gate` job |
| 6 | Low, out of scope. `complexity-baseline.test.ts` reads `baseline:move-approved` from the event payload | Filed as #250; not arc 1's surface |

## Post-implementation

Run per arc, at each arc boundary, before the next arc's branch starts; then one final cross-arc pass. `code_review` is `off`, so no `/code-review` step runs.

1. **Codex audit** (`~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`): the arc's diff (`git diff <arc base>...HEAD`), this plan with its decision ledger, the arc map ("this is arc N of 4 built arcs; arc 5 waits on the owner; later arcs build X"), the adversarial ask ("What could go wrong? What would an attacker, a stale re-run or a compromised dependency target? What are we trusting that we shouldn't?"), and these two rules verbatim:
   - *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."*
   - *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*
2. **Fix loop.** Verify each finding against the tree, apply the accepted ones, commit, log the round in `lessons/phase-N.md`, then resume the same session (`resume-codex.sh`) with the fix diff. Stop when a round has no new material finding. After three rounds with material findings, stop and surface it in the report.
3. **Final cross-arc pass.** A fresh Codex session over `git diff ac259a7...<top arc>`, asking for seams between arcs, duplication across arcs and drift from this plan, with the same two rules. Same loop.
4. **Delivery** per § Delivery: the first time any PR opens.
5. **Close-out**, as its own docs-only PR after the last built arc merges (arc 4, or arc 5 if it is unblocked by then):
   - An `## Outcome` block directly after the front matter: date, status, what shipped with PR numbers, each dropped or refuted item with its disposition (#176 and #193 closed by #238; #21, #174, #180 no arc), an `Open items:` line naming issue numbers (#178 if arc 5 did not ship) or `none`, and a line retiring the `/goal` and `/loop` seeds below.
   - Promote generalizable gotchas to `implementations-plan/lessons.md` (8 KiB budget; dedupe, retire, date tool versions). The line "Never skip required aggregators; cancel only a push's first run …" is superseded by arc 1: rewrite it to the per-head rule.
   - File open items where CLAUDE.md § Where open work lives says (copied here):

     | Situation | Home |
     |---|---|
     | Work inside the implementation you are on | the active `plan.md` and the PR |
     | Actionable work that outlives the plan | a GitHub issue, with a domain label and a `Record` link to the archived plan |
     | Needs a product call, or waits on something outside the repo | an issue labelled `owner-decision` or `blocked:external` |
     | A suspected exploitable weakness | a private draft security advisory |
     | Rejected, superseded or already done | a disposition line in the Outcome block |
     | Knowledge that prevents a repeat | `implementations-plan/lessons.md` |
     | A legal or store blank with a release deadline | `BEFORE-LAUNCH.md` |
     | Accepted code work that blocks launch | the `v1.0.0` milestone |

     Dedupe first (`gh issue list --state all --search "<words>"`); an issue body has `## What happens`, `## Where`, `## Impact`, `## Possible fix`, `## Record`. Comment on every lane issue left open with the reason. No `follow-ups.md` exists; open work goes to issues only.
   - Merge `origin/dev` into the close-out branch first and read what changed in `index.md` and `lessons.md` (never a union merge).
   - `git mv implementations-plan/ci-release-supply implementations-plan/archive/ci-release-supply` in its own commit; repair links the extra level breaks (`git grep -n ci-release-supply`); move the index line to `archive/index.md`; delete `STATUS.md` in the close-out.
   - Report and wait. Merging is the orchestrator's call.
6. **Teardown after the merge.** Once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/ci-release-supply/plan.md` succeeds, leave the worktree (`ExitWorktree` with `keep` if the session entered through `EnterWorktree`) and run `agent-worktree done ci-release-supply --merged --trunk dev`. Relay a refusal and stop; never force. A `/loop` session checks on every firing; a `/goal` session arms one background wait after its report: `until git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/ci-release-supply/plan.md; do sleep 300; done`.

## Delivery

One PR per arc, in order, each against `dev` (A5). Open each after its gates pass and its Codex loop converges, without labels; add `e2e:extension-network` or `e2e:extension-smoke` afterwards only when the path filter would skip a suite the arc needs. Each body: what changed and why, the validation runs with outcomes, the `Closes` lines. PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

| Arc | Branch | Phases | Base | Code review | PR title (≤ 93 chars) | Closes |
|---|---|---|---|---|---|---|
| 1 | `worktree-ci-release-supply` | 1.1-1.5 | `dev` | off | `ci: build storybook, read live e2e labels, cancel superseded heads, check every shard` | #166, #167; #168 per the rule (rule 2(c): `Refs #168`) |
| 2 | `ci-release-supply-scripts` | 2.1-2.4 | arc 1, then `dev` once it lands | off | `build: hoist nothing, gate launch on blank terms, verify store copies, bump presto-banners` | #82, #179, #183; #172 unless its stop rule fired (`Refs #172`) |
| 3 | `ci-release-supply-docs` | 3.1 | arc 2, then `dev` | off | `docs(claude): record the landing domain rule in the release runbook` | #185 |
| 4 | `ci-release-supply-plans-ignore` | 4.1 | arc 3, then `dev` | off | `chore(plans): ignore draft, outline, leg and eli5 transcript shapes and assert them` | #182 |
| 5 | `ci-release-supply-nightly-prune` | 5.1-5.4 | the top merged arc | off | `ci(release): prune nightly tags and releases to the newest fourteen` | #178 |
| close-out | `ci-release-supply-close-out` | — | the last merged arc | off | `docs(plans): close ci-release-supply` | — |

- Arc 1's PR carries this plan's commit. Hosted proof on it, recorded in `lessons/phase-1.md`: add and then remove `e2e:extension-smoke`, and show `decide` read the live list; push a second commit while the network lane runs, and show `cancel-superseded` cancelled the old head's runs while the new head's runs completed; log the supersede job's API call count.
- Arc 1 touches no file #169 touches, so it does not wait for gate G1. Phase 2.4's network file does. e2e-harness-gaps arc 3 may later edit the network lanes' job lists; whichever PR lands second rebases.
- Arc 5's PR opens only after page 5 and the ruleset readback (§ Arc 5).
- If the orchestrator asks for a stack: `gh stack init --adopt worktree-ci-release-supply`, `gh stack add <branch>` at each boundary, `gh stack submit --auto` then `gh pr edit` bodies, `gh stack sync` after `dev` moves. Merging is the orchestrator's.
- Commits: conventional, lower-case subjects, signed; afterwards `git log --format='%h %G?' -3` shows no `N`. If a commit or push hangs, rerun it as `env -u SSH_AUTH_SOCK git <cmd>`.
- Before every push: `bun run test` and `bun run lint:actions`.

## Issue → arc

| Issue | Arc | Closes when |
|---|---|---|
| #166 | 1 | `quality-status` needs the Storybook build |
| #167 | 1 | live labels, per-head queues and the supersede job are in, and the hosted proof is recorded |
| #168 | 1 | rule 1 (evidence) or rule 2(b)/(a) (fix) ships; rule 2(c) leaves it open with the evidence |
| #82 | 2 | 1.2.0 is pinned with no visible change |
| #172 | 2 | `hoist = false` passes the battery and the PR's four e2e lanes, or stays open per its stop rule |
| #179 | 2 | the comparison and its workflow are in, and the live case passes for both stores |
| #183 | 2 | `launch-legal` is in `quality-status` |
| #185 | 3 | the runbook lines land |
| #182 | 4 | the four shapes are ignored and asserted |
| #178 | 5 | after page 5 and the ruleset change, the prune runs |
| #176, #193 | none | already closed by #238 (verified) |
| #21 | none | `blocked:external`: a green stable release on the draft flow, then the owner's settings |
| #174 | none | `blocked:external`: the vitest release that ships vitest-dev/vitest#10363 |
| #180 | none | owner action in the Security tab (page 5, P5-03) |

## Seeds

Draft until the orchestrator approves; no ELI5 is produced for this plan (orchestrator-owned).

Recommended: `/goal`.

```
/goal All phases of arcs 1-4 marked ✓ in implementations-plan/ci-release-supply/plan.md, each ✓ backed by its phase's validation gate reported passing in the transcript; for each phase the agent has printed LESSONS_FILE=implementations-plan/ci-release-supply/lessons/phase-N.md; /code-review was NOT run (code_review: off); the Codex fix loop converged for each arc and for the final cross-arc pass, each convergence evidenced by a resumed Codex pass reporting no new material findings, quoted in the transcript; the Delivery section's PRs exist on GitHub, opened only after their loops converged (gh pr view output in the transcript), including the close-out PR that archived the plan (git show --stat of the archive-move commit in the transcript); arc 5 untouched unless page 5 and the ruleset readback are in the transcript; bun run test and bun run lint:actions both report exit 0 in the transcript.
```

Alternative: `/loop`.

```
/loop 15m Drive implementations-plan/ci-release-supply forward. Never idle waiting for my input. Each firing:
1. Reality check: read implementations-plan/ci-release-supply/plan.md and lessons/ (authoritative state), including the Outcome & Quality Bar. If the plan path is gone, run `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/ci-release-supply/plan.md`: success means it merged; run the teardown (`agent-worktree done ci-release-supply --merged --trunk dev`), report, clear this loop and stop. Failure means delivered and awaiting merge: babysit CI only. A live plan.md with an `## Outcome` block means an interrupted close-out: finish it. Otherwise rebuild the task list from plan.md, run `git status` and `git log --oneline -5`, and read any PR's `gh pr view --json statusCheckRollup`.
2. Waiting on CI is fine; confirm it progresses (`gh run watch <id>` up to 10 minutes), otherwise log it as blocked.
3. No task in hand? Take the next pending step from plan.md. After each meaningful edit run `bun run lint` and the touched tests. Commit, push the arc branch.
4. Stuck, or facing a decision? Call Codex (`run-codex.sh … high read-only gpt-6.1-sol`) and decide on the stronger argument; log it in lessons/phase-N.md. Hard limits stay hard: never merge, never touch main, a ruleset, a repository setting, a secret or a release; never build arc 5 before page 5 and the ruleset readback; anything a person would see goes to OWNER-ASKS.md.
5. Same step failed 5 times? Stop retrying and reassess with Codex.
6. Phase green means its validation gate, as written, passes: paste the result, mark ✓, write the lessons entry, print LESSONS_FILE=implementations-plan/ci-release-supply/lessons/phase-N.md. At an arc boundary run the Codex fix loop on the arc diff until a round yields nothing material, then start the next arc's branch.
7. Arcs 1-4 ✓? Run the final cross-arc Codex pass, open the PRs per § Delivery, then the close-out PR, then `gh pr checks --watch`. Report what shipped, every debated decision, and open items by issue number. Stop; merging is the orchestrator's call.
```

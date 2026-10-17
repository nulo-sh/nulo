---
plan: ci-dedupe-1
tier: mid
status: plan approved by the final Codex pass; arc 1 implementing (auto-continue)
issues: "#537 #527 (arc 1 closes both)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex (gpt-6.1-sol, high) audit + resume + final fresh pass; one Opus Plan leg
base: origin/dev at 093fa10d
trunk: dev
standard: implementations-plan/README.md § Post-implementation standard, read at 093fa10d
post_implementation_hardening: not scheduled
---

# ci-dedupe-1: one network partition, and a store dispatch that smokes what it ships

One arc, one PR against `dev`, `Closes #537 #527`. Owner's picks (decision page 37): #537 = A, #527 = A. Nothing a user sees changes. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none).

## Issue claims that did not hold

- **#537** holds (9 pool-exclusion copies; #410's fix `2a518c37` touched 10 files; 18 commits to the pin file in ten days), with one correction: `verify-cert-run.sh` is the certification verifier, a manual tool no workflow calls, and it checks the Chrome PR lane only.
- **#527**: the path holds (a rebuilt-vs-published digest difference is only a warning), but in run 38815080815 the rebuild was byte-identical (no warning logged) and the builds took 35 s and 30 s. The CI cost is the two smokes (24 and 31 min), which option A keeps; the gain is that they load the shipped bytes.
- **#527 step 5** (the issue's sketch, not the owner's words) keeps dry runs on the build. This plan does not (D6), and a dry run of a published but unattested tag now fails at `select` where today it passes.

## Outcome & Quality Bar

For the maintainer who moves a slow network file or rotates a chaos seed while CI is red, and for the operator who submits a published release to the stores. Excellent:
1. A partition change is one edit in one file, the lane workflow, plus the certification list when a job name changes; a pin names the line that disagrees.
2. Every network check-run name and every suite call's inputs, on every caller, are what they are today, proven by an exact pin before any caller moves.
3. A store dispatch smokes the unzipped bytes it uploads; if the release's digests or attestations stop matching those bytes, the run stops before the store jobs.
4. A push to `main` runs the same jobs with the same results as today.

Good enough: nightly's in-browser canary leg keeps one pinned copy of the canary list; the suite file counts in the docs stay hand-written.

## Assumptions

**Facts** (verified at `093fa10d`; detail in recon.md):
- F1. A reusable call's jobs are named `<caller job name> / <called job name>` (PR run 39053876135, two levels). "Re-run failed jobs" on that lane re-ran only the red `Run / shard 5/5` (run 38962062741, attempts 1 and 2).
- F2. In a called workflow, `jobs.<id>.with` may use `github`, `needs`, `strategy`, `matrix`, `inputs`, `vars`; `strategy` may use `github`, `needs`, `vars`, `inputs`; `github` is the caller's context.
- F3. `_extension-network-e2e.yml` ignores `disable_presto` whenever `proverless` is true (all six sites: `:136`, `:188`, `:200`, `:232`, `:354`, `:401`).
- F4. A push rerun of a published release reaches `attach-assets` today: auto-unstick returns `skip` for a tag at the merge SHA (`auto-unstick.ts:70-75`), the chain continues, and `plan` answers `use-published`.
- F5. Nightly refuses any ref but `refs/heads/dev`. Release can be dispatched from any ref; with `dry_run=true` every write step is skipped and the store jobs need a `publish_*` input.
- F6. `production` has no protection rule; both store environments keep a branch policy (`main`) and required reviewers.
- F7. `fetchVerified` checks digest presence, an attestation for the digest, the bytes against the digest, and `gh attestation verify --signer-workflow …/release.yml --source-digest <tag sha> --deny-self-hosted-runners`.
- F8. Every tag `v*` has a GitHub Release today, so no dry run can reach `source=build` under D6.

**Inferences**:
- I1. Three levels (caller → lane → suite) stay within GitHub's ten-level limit and keep F1's naming per level, giving today's names. Proven by the PR's own run (phase 4).
- I2. An unzipped release zip loads in the smoke as the build tree does: same files, dotfiles included (`zip-reproducible.ts`), `manifest.json` at the root.
- I3. "Re-run failed jobs" re-runs only the red inner job of a lane, as F1 shows for two levels (community report #52505 agrees for matrixed calls). Plausible but unverified: the first natural failed-job re-run of a lane after the merge establishes it; if a whole lane re-runs, D1 costs eleven jobs per flake re-run and the panel reopens D1. No job is broken or re-run on purpose to test it.

**Asks** (working assumptions for the orchestrator):
- A1. Proof dispatch of `release.yml` from the arc branch: `-f tag=v0.31.0 -f dry_run=true -f run_network_e2e=true`, no store input. It writes nothing (F5) and holds the `release` concurrency group for about 45 minutes; a merge to `main` in that window waits behind it. Assumed allowed by the lane brief's one-dispatch rule; run with no release run queued or in progress, and ask no merge to `main` meanwhile. Being a dry run, it skips `verify-published`: the strict dispatch recheck is proven by the unit tests only.
- A2. Nightly has no branch proof (F5): its first scheduled run after the merge is the proof; a red one is fixed forward that day.
- A3. The dispatch build path (`--ref <tag>` on a tag with no release) has no live proof before the next rc publish (F8); its wiring is pinned statically, and a red rc costs an rc number, not a stable version.
- A4. D6 changes one dispatch behaviour (below); the orchestrator accepts or rejects it at the gate.

## Architecture & Implementation

### #537: the lane workflow is the partition manifest

The owner's "one partition manifest … that a reusable workflow reads; the pin test checks the generated output" maps to: the manifest is the new reusable workflow `.github/workflows/_extension-network-e2e-lane.yml`; the callers invoke it; the pins check its expansion, the suite calls each caller produces.

```yaml
on:
  workflow_call:
    inputs:
      ref: { type: string, required: true }
      browser: { type: string, default: chrome }
      retry: { type: string, default: "" }
      disable_presto: { type: boolean, default: false }   # the canary job only (F3)
      chaos_seed: { type: string, default: "" }           # empty: replay the fixed pair; else that one seed
jobs:
  network-e2e:                  # shard ${{ matrix.shard.id }}; matrix 1/5..5/5, fail-fast false; the 12-file exclusion
  network-e2e-heavy:            # heavy / fee-methods + selfpay-phase
  network-e2e-heavy-concurrent: # heavy / concurrent-confirm
  network-e2e-heavy-long:       # heavy / snack-placement + failed-send-check
  network-e2e-canary:           # canary / real-proving; disable_presto: ${{ inputs.disable_presto }}
  network-e2e-chaos:            # if: inputs.chaos_seed == ''; chaos / seed ${{ matrix.seed }}; matrix: the two literal seeds, fail-fast false
  network-e2e-chaos-seeded:     # if: inputs.chaos_seed != ''; chaos / sends; shard_label chaos; chaos_seed: ${{ inputs.chaos_seed }}
```

Every job passes `ref`, `browser`, `retry` from the inputs and today's `shard_label`, `test_files`, `exclude_files`, `proverless`, `chaos`, `chaos_seed` byte for byte (exclusion order kept). No job but the chaos pair has an `if` or `needs`. The rationale comments in `pr-extension-network-e2e.yml` (why each group is dedicated, the canary list, each seed's source run) move here once.

| Caller | Job id | `name` | `with` |
|---|---|---|---|
| `pr-extension-network-e2e.yml` | `network-e2e` | `Run` | `ref: ${{ github.event.pull_request.head.sha \|\| github.ref }}`, `retry: "0"`, `disable_presto: ${{ github.event.inputs.disable_presto == 'true' \|\| vars.NULO_E2E_DISABLE_PRESTO == '1' }}` |
| `pr-extension-network-e2e-firefox.yml` | `network-e2e` | `Run` | same + `browser: firefox` |
| `nightly.yml` | `network-e2e` | `Run` | `ref: ${{ needs.resolve.outputs.sha }}`, `disable_presto: ${{ vars.NULO_E2E_DISABLE_PRESTO == '1' }}`, `chaos_seed: ${{ github.event.inputs.chaos_seed \|\| github.run_id }}` |
| `nightly.yml` | `network-e2e-firefox` | `Firefox / Run` | same + `browser: firefox` |
| `release.yml` | `network-e2e` | `Run` | `ref: ${{ needs.resolve.outputs.sha }}`, `retry: "0"`, `disable_presto: ${{ vars.NULO_E2E_DISABLE_PRESTO == '1' }}`; `if` unchanged (opt-in) |

Each caller keeps its `needs` and `if`. The PR `status` jobs need `[changes, network-e2e]`; nightly's `publish-nightly` (`needs` and `if`) and `status` (`needs` and loop) list two suite ids instead of twelve. `network-e2e-canary-wasm` stays a direct call in nightly: it is advisory, and a lane's one result gates the publish. Both PR filters gain the lane file. Every check-run name stays as today (F1, I1); `verify-cert-run.sh` does not change.

A lane call reports one result, so `e2e-aggregate.sh` and nightly's gates no longer see an inner job skipped. The lane-shape pin closes that: each lane job's keys are a subset of `{name, strategy, uses, with}` (the chaos pair adds exactly its complementary `if`), every matrix sets `fail-fast: false`, and no caller passes `chaos_seed` but nightly.

**Pins** (`behavior-gating.test.ts`). One local `suiteCalls(file)` expands every `_extension-network-e2e.yml` call a workflow reaches, through a lane call, into `{ name, inputs }`. It substitutes `${{ inputs.<k> }}` (caller's `with`, else the lane default) and `${{ matrix.<k>[.<f>] }}` (literal one-key matrices), evaluates only the chaos pair's `if` from the caller's `chaos_seed`, and leaves every other `${{ … }}` as opaque text. It replaces the three ad-hoc expanders.
- **Migration pin (phase 1 only)**: for each caller and browser, `suiteCalls` of today's file equals `suiteCalls` of the lane bound with that caller's row above, as raw strings and typed values. Two normalizations, no exceptions: an input absent equals the same input set to the suite's declared default (same type), which is GitHub's own rule; release's `!matrix.leg.proverless && X` becomes `X` on the canary leg and `false` (the default) on proverless legs, an identity once the leg's literal boolean is bound (F3).
- **Permanent**: the Callers table exactly (name, `with`, `needs`, `if`); nothing calls `_extension-network-e2e.yml` but the lane, the soak and nightly's wasm leg; the lane shape above; the partition invariants on the lane (pool excludes exactly the union of the dedicated files; each canary prover-ON in one `canary*` job and out of the pool; the same-token file proverless in one dedicated job; the chaos file only in the chaos pair; two distinct quoted decimal seeds; every file list one line); `verify-cert-run.sh` lists exactly `suiteCalls("pr-extension-network-e2e.yml")` names; the PR `status` needs are `[changes, network-e2e]`.
- Repointed: the Firefox twin test, the wasm-leg test, the self-pay gate, `aggregators.test.ts` (nightly needs; release's one caller is the lane call), `assert-canary-results.test.ts` `canaryJobFiles` (the lane and the wasm leg).
- Retired as structural: nightly mirrors the PR lane, release legs equal PR jobs, nightly Firefox mirrors Chrome, both PR lanes replay the same seeds.

### #527: a dispatch smokes a published release's own bytes

`attach-assets-run.ts`:
- `fetchVerified` splits into the download and `checkAsset(io, input, assets, name, path)` (digest present, attested, bytes match the digest, `verifyAttestation`). `store-copy-run.ts` keeps calling `fetchVerified`.
- New command `select`, dispatched in `main()` before `NOTES` is read, read-only. Reads `readState`: ambiguous refuses; absent or a visible draft writes `source=build`; published refuses with `planPublished`'s reason when an asset is missing, else `fetchVerified` each asset into `dist/release/`, `checkShasums`, and writes `source=published`. Any API or check failure exits 1.
- `RunInput` gains `source` from `SOURCE`: `build` or `published`; unset reads `build` (nightly sets none); anything else, the empty string included, refuses. `decide()` refuses a `publish` plan when `source` is `published` (the release vanished after `select`).
- `verify-published` takes two paths by `GITHUB_EVENT_NAME`. On `push` it is today's code, unchanged: download and `checkAsset` each asset into `dist/release/published`, `checkShasums`, warn on a rebuild that differs, ship the published bytes (`dir` output). On a dispatch it never downloads: `checkAsset` on each local file in `dist/release` against the release's assets (digest equality, attestation, `verifyAttestation` with the tag SHA), `checkShasums` on the local files, no `dir` output. Both then rewrite the notes. See D7.

`release.yml` (push: `select-assets` is skipped and every other job runs as today):

```
dispatch: resolve → select-assets ─┬ build:     build-chrome, build-firefox → smokes on extension-{chrome,firefox}
                                   └ published: (no build)                  → smokes on published-{chrome,firefox}
lint, unit, notes, smokes → attach-assets (zips from the build, or select's zips) → store jobs (unchanged)
```

- New job `select-assets`: `needs: resolve`, `if: always() && needs.resolve.result == 'success' && github.event_name == 'workflow_dispatch'`, `permissions: {contents: read, attestations: read}`, no environment, checkout without persisted credentials or `ref`, `setup-bun` with `cache: "false"`, `install: "false"`; job env `VERSION`, `TAG`, `SHA` from `needs.resolve.outputs` (as `attach-assets` binds them; `GITHUB_SHA` is automatic). Steps: `bun scripts/release/attach-assets-run.ts select` (`GH_TOKEN` on that step); on `published`, `unzip -q` each zip into `dist/published/<browser>` and upload `published-chrome`, `published-firefox` (trees, hidden files included) and `published-assets` (the three files). Output `source`. It runs beside lint and unit.
- Every consumer below takes two clauses: S1 = `needs.select-assets.result == (github.event_name == 'workflow_dispatch' && 'success' || 'skipped')`, and S2 = `(github.event_name == 'push' || needs.select-assets.outputs.source == 'build' || needs.select-assets.outputs.source == 'published')`. A dispatch whose `select-assets` failed, was cancelled, or wrote no or an unknown source therefore runs no build, smoke or `attach-assets`.
- Builds: `needs` add `select-assets`; `if` becomes today's clauses, then S1, then `(github.event_name == 'push' || needs.select-assets.outputs.source == 'build')`. No S2: the narrower clause already requires a valid source on a dispatch.
- Smokes: `needs` add `select-assets`; in `if`, `needs.build-<b>.result == 'success'` is replaced by `needs.build-<b>.result == (needs.select-assets.outputs.source == 'published' && 'skipped' || 'success')`, and S1 and S2 are added, giving `always() && needs.resolve.result == 'success' && S1 && S2 && <that build clause>`; `artifact_name: ${{ needs.select-assets.outputs.source == 'published' && 'published-<b>' || 'extension-<b>' }}`.
- `attach-assets`: `needs` adds `select-assets`; in `if`, the two `needs.build-<b>.result == 'success'` clauses are replaced by their source-bound forms (as in the smokes), and S1 and S2 are added; every other clause stays; env `SOURCE: ${{ github.event_name == 'push' && 'build' || needs.select-assets.outputs.source }}`, so an empty dispatch source also refuses at `plan`, before any attest or apply. The tree downloads and the zip step run on `SOURCE == 'build'`; a download of `published-assets` into `dist/release` runs on `SOURCE == 'published'`. Plan, attest, apply and verify guards and the store artifact's paths (`${{ steps.published.outputs.dir || 'dist/release' }}/…`) are unchanged.
- `status`: `select-assets` must be `ran(chain && dispatch)`; on a dispatch chain `source` must be `build` or `published`; the builds must be `ran(chain && source != published)`.
- Dry runs choose by the release's state too (D6). The `dry_run` description becomes "Skip the publish (tag check, draft, uploads, notes) and the store uploads. The gates still run, on a published release's own bytes when it has one."

### File-level change map

| File | Change |
|---|---|
| `.github/workflows/_extension-network-e2e-lane.yml` | new (phase 1) |
| `.github/workflows/pr-extension-network-e2e{,-firefox}.yml` | suite jobs → one lane call; status needs; filter + lane file (phase 2) |
| `.github/workflows/nightly.yml` | suite jobs → two lane calls; publish/status lists (phase 2) |
| `.github/workflows/release.yml` | `network-e2e` → lane call (phase 2); `select-assets`, builds, smokes, attach-assets, status, header, `dry_run` text (phase 3) |
| `scripts/release/attach-assets-run.ts` (+ test) | `checkAsset`, `select`, `source`, `verify-published` (phase 3) |
| `scripts/ci-cd/behavior-gating.test.ts` | `suiteCalls`, migration pin (phase 1); permanent pins (phase 2) |
| `scripts/ci-cd/aggregators.test.ts` | nightly needs, release caller (phase 2); release worlds and clauses (phase 3) |
| `scripts/ci-cd/assert-canary-results.test.ts` | `canaryJobFiles` reads the lane and the wasm leg (phase 2) |
| `scripts/ci-cd/release-integrity.test.ts` | `select-assets` pins; store-bytes pins (phase 3) |
| `CI.md`, `.github/WORKFLOWS.md`, `apps/extension/tests/e2e/README.md`, `.claude/skills/e2e-testing/SKILL.md` | where the partition and seeds live (phase 2) |
| `.claude/skills/release/SKILL.md`, `CI.md`, `.github/WORKFLOWS.md` | the store dispatch smokes the published bytes (phase 3) |

## Decision ledger

- **D1 (#537 mechanism).** Chosen: a static reusable lane. Competing outline G: a TS manifest plus a generator that rewrites marked job regions in four workflows and the certification list, with a `--check` pin. G keeps every workflow flat, but it adds the repo's first YAML emitter, per-caller templates, and markers that cannot sit inside nightly's `if: |` block scalar, so nightly's publish condition stays a hand copy. A `fromJSON` matrix read from a manifest was rejected (hides the partition; the issue's own warning). Codex and Opus both agree with the lane. Reopens only if I3 fails.
- **D2 (byte-equal proof).** The migration pin above, exact, run in phase 1 while every caller is untouched; phase 2 deletes it with the hand-written jobs, and the Callers pin keeps the inputs it assumed. Round 1 rejected a version with exceptions for nightly's chaos naming and a rewritten kill switch (Codex 3).
- **D3 (nightly chaos).** Chosen: a complementary pair of chaos jobs in the lane, so nightly keeps `chaos / sends`, its label and its seed expression byte for byte, and the seeds stay a literal matrix. Rejected: naming nightly's job by its seed (the proof would need an expression evaluator, and the seed JSON could be bent: `1","2`, Codex 5 and Opus 9); nightly keeping its own chaos jobs (two more copies of the chaos group). Cost: one skipped chaos check per lane run.
- **D4 (#527 mode).** The owner's A allows "skip the rebuild and smoke the published zips, or fail on a digest difference". Chosen: published source on a dispatch that finds the release published, with the exact digest and attestation check as the backstop. Rejected (outline R): keep the rebuild and turn the warning into a failure; it smokes a rebuild that only zips to the same bytes, and a runner-image or toolchain drift then makes a published release unsubmittable until a new one is cut.
- **D5 (where the source is decided).** A read-only job beside lint and unit, on dispatch only (push path untouched, Codex 1). Not `resolve` (keeps its shell and token) and not `attach-assets` (it holds `contents: write` and runs after the smokes).
- **D6 (dry runs).** By the release's state, so a dry run rehearses a store submission and A1 can prove the published path. The issue's sketch kept dry runs on the build (see claims).
- **D7 (a rebuild that meets a published release).** By event, not by source. Every dispatch re-blesses a published release only for local bytes that equal its digests and verify their attestation: on `source=published` those are the smoked bytes; on `source=build` (a release published by hand during the run) the run fails unless the rebuild is byte-identical, the owner's "fails on a digest difference". A push keeps today's download-and-warn path, because a rerun of an already-published push run (F4) would otherwise fail `attach-assets`, red `status` and skip `sync-main-to-dev` (Codex round 2); the owner's "the push path is unchanged" rules that out. Rejected in round 1: one strict rule for every event; rejected in round 2: branching on `source`, since `build` includes the dispatch race. The two paths share `checkAsset`.
- **D8 (build guards).** The bundle checks of `_build-extension.yml:134-188` do not run in a published-source dispatch. Today they run there on a rebuild that ships nowhere; the shipped bytes passed them when they were built. Disposition: a closed `known-limit` issue at close-out (reopens if a store copy is found holding what a current guard refuses).

## Security & Adversarial Considerations

- **Threat model**: (1) a holder of `contents: write`, or a compromised step, replaces a published asset between the check and the upload (releases are mutable, #21) or publishes a draft during a run; (2) a tag off `main` supplies the scripts that run near a store credential; (3) a widened token in the new job; (4) a crafted archive; (5) an inner lane job silently skipped.
- (1): `select` checks digest, attestation and SHASUMS before the smokes; on a dispatch, `attach-assets` re-reads the release and refuses unless every digest equals the checked bytes and their attestation verifies for the tag SHA (D7); a `publish` plan on `source=published`, or a dispatch with no valid source, refuses; the store jobs ship the artifact `attach-assets` cut and re-check SHASUMS; nothing re-downloads after the smoke. A replacement after the last check cannot change the retained store artifact; #21 stays open.
- (2): unchanged: `on_main`, the store environments' branch policies and reviewers, `--signer-workflow …/release.yml`.
- (3): `select-assets` holds `contents: read`, `attestations: read`, no environment, no custom secret; checkout keeps no credential and takes no `ref`; Bun runs with `install: "false"`, `cache: "false"`, built-ins only (pinned with the `NO_INSTALL` and `CLEAN` rules). The lane adds no permission, secret or third-party action.
- (4): the zips are this workflow's own attested bytes; Info-ZIP `unzip` refuses absolute paths and `..` members.
- (5): the lane-shape pin (no `if` or `needs` but the chaos pair; `fail-fast: false`).
- Supply chain: no new dependency; every action is an existing SHA pin (`action-pins.test.ts`). Crypto: SHA-256 (`Bun.CryptoHasher`), Sigstore via `gh attestation verify`, both existing.

**UI impact**: none. No popup, page, window or user-facing copy changes.

## Phases

### Phase 1 — the lane, uncalled, and the proof it reproduces today's calls (#537)
1. Add `_extension-network-e2e-lane.yml` as specified; copy every literal from today's callers byte for byte.
2. Add `suiteCalls()`, the Callers constant and the migration pin to `behavior-gating.test.ts`.

**Validation gate**: `bun run lint:actions && bun run lint && bun run typecheck:all && bun run test:ci-gating`. Pass: all exit 0; the migration pin passes for all five callers; `git diff --stat 093fa10d -- .github` lists only the new file. Record the commit SHA and the pin's output in `lessons/phase-1.md`.

### Phase 2 — callers call the lane; pins and docs follow (#537)
1. Replace the suite jobs in the four caller files with the lane calls; shrink the PR `status` needs and nightly's lists; add the lane file to both PR filters.
2. Rewrite the pins as listed; delete the migration pin and the four retired tests. Add two mutation cases to the lane-shape pin: a canary job given an `if`, a matrix without `fail-fast: false`.
3. Docs: CI.md (the lane; seed rotation edits the lane's chaos matrix), WORKFLOWS.md (a lane row; callers), e2e README § CI sharding and the e2e-testing skill.

**Validation gate**: phase 1's commands plus `bun run test:release && bun run test && bun run test:all`. Pass: all exit 0; `git grep -n 'send-chaos.test.ts' -- .github/workflows` lists only the lane; `git grep -n 1095865833 -- .github scripts/ci-cd/verify-cert-run.sh` lists only the lane and the certification list.

### Phase 3 — the store dispatch smokes the published bytes (#527)
1. `attach-assets-run.ts`: `checkAsset`, `select`, `source`, `verify-published`, usage line and header.
2. `release.yml`: `select-assets`; builds, smokes, `attach-assets`, `status`, header, `dry_run` text.
3. Tests. `attach-assets-run.test.ts`: `select` writes `build` with no download for an absent and for a draft release; writes `published` after three downloads with no release edit; refuses, one case each, an ambiguous release, a published release missing an asset, an unattested digest, a download off its digest, a failed attestation, a SHASUMS mismatch. `verify-published` on a dispatch edits the notes when every local digest and attestation checks out, and refuses with no edit and no download, one case each, a digest that differs and an attestation that fails; on a push its existing tests stay as they are (the warning test included). `plan` refuses `publish` on `source=published`, and refuses `SOURCE` set to the empty string or an unknown value. `aggregators.test.ts`: a published-source store dispatch (builds skipped) passes; a push world with `select-assets` skipped passes; `source` empty or unknown on a dispatch chain reds; a build skipped on `source=build` reds; the exact clause sets: builds = today's + S1 + the build-source clause; smokes and `attach-assets` = today's with each build clause replaced by its source-bound form, + S1 + S2 (so an empty dispatch source blocks `attach-assets`, not only `status`). `release-integrity.test.ts`: `select-assets` permissions exactly `{contents: read, attestations: read}`, its `VERSION`/`TAG`/`SHA` bound from `needs.resolve.outputs`, in `NO_INSTALL`, no checkout `ref`, no third-party action, `cache: "false"`; the zip step guarded `build`, the `published-assets` download guarded `published`; `SOURCE` never defaults on a dispatch; each smoke's `artifact_name`; mutation cases for a smoke fixed to the rebuild and an unguarded zip step.
4. Docs: release skill (store submission, the chain, a troubleshooting row for `select`), CI.md (`workflow_dispatch`, store uploads), WORKFLOWS.md.

**Validation gate**: `bun run lint:actions && bun run lint && bun run typecheck:all && bun run test:release && bun run test:ci-gating && bun run test && bun run test:all`. Pass: all exit 0.

### Phase 4 — proof runs (after the Codex loop converges, before the PR)
1. Push the branch. With no release run queued or in progress, run A1. Pass: `select-assets` writes `published`; both builds skipped; both smokes green on `published-*`; `attach-assets` green with plan `use-published`; the 11 executed network jobs green with exactly the names `verify-cert-run.sh` lists; the only skipped lane job is the seeded chaos branch (record its exact spelling); `status` green.
2. Open the PR (Delivery). Pass: both network lanes green at retry 0; per lane, the executed (non-skipped) network job names from `gh api …/runs/<id>/jobs` equal `verify-cert-run.sh`'s eleven exactly, and the only skipped lane job is the seeded chaos branch; `scripts/ci-cd/verify-cert-run.sh --pr <n>` is run and its result reported as is: a violation is never waived, and a rerun is never first-attempt evidence.
3. Record run ids, job names and wall-clocks in `lessons/phase-4.md` and the PR body.

## Delivery

Single arc on `worktree-ci-dedupe-1`, one PR to `dev`, no stack (D-orch-1). Title: `ci: one network lane workflow; a store dispatch smokes the published zips` (71 characters). Body: what changed and why per workflow (the orchestrator reviews every workflow line), the validation runs with outcomes, the proof runs, network job wall-clocks before and after (no e2e scenario changes), D6 and D7 called out (the guarantee is unchanged executed workloads and required-check names, plus one skipped chaos branch per lane), `Closes #537`, `Closes #527`. Open without labels; the path filters trip both network lanes. Parallelism: the phases share `release.yml` and the pin files; serial.

## Post-implementation

Per `implementations-plan/README.md` § Post-implementation standard at `093fa10d`, single-arc placement: step 1 absent (`code_review: off`); step 2, the Codex loop, once over `git diff 093fa10d...HEAD` after phase 3 is green: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with each fix diff, hard stop at three rounds; one Opus review (`general-purpose`) beside round 1. Phase 4's proofs run after the loop; a fix they force goes through one resumed round. Step 3 Delivery as above, then `gh pr checks <n> --watch`. Step 4 close-out as the PR's final commits (Outcome with the D8 known limit, lessons promotion, `git mv` to `archive/`, index line). Step 5 teardown: `agent-worktree done ci-dedupe-1 --merged` once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/ci-dedupe-1/plan.md` succeeds; this session arms that wait after its report. Merging is the orchestrator's call.

## Seeds (draft; no ELI5 by the orchestrator's rule)

```
/goal Phases 1-4 of implementations-plan/ci-dedupe-1/plan.md marked ✓, each gate reported passing in the transcript with LESSONS_FILE=implementations-plan/ci-dedupe-1/lessons/phase-N.md printed; the Codex loop converged (a resumed pass with no new material finding quoted); the A1 release proof run green; one PR to dev with Closes #537 and #527 and green checks; close-out committed (git show --stat of the archive move); bun run lint and bun run test:ci-gating exit 0.
```

```
/loop 15m Drive implementations-plan/ci-dedupe-1 forward per its plan.md: reality check (plan, lessons, git status, PR checks); next pending step; fast gates after each edit; Codex for any decision; never merge; stop and report when the PR is green and the close-out is committed.
```

Recommended: `/goal` (completion is visible in the transcript).

## Audit verdicts

**Round 1, Codex** (gpt-6.1-sol, high; session `01a14b0e`): **reject**, six findings. Accepted: (1, High) a push rerun of a published release would skip the builds → `select` runs on dispatch only (D5, F4); (2, High) a build→published transition lost the attestation check → `checkAsset` on local bytes in `verify-published` (D7); (3, High) D2's exceptions → exact migration pin, nightly chaos kept byte for byte (D2, D3); (4, Medium) one lane result hides inner skips → lane-shape pin with mutation cases; (5, Medium) the expander could not bind nightly's seed JSON, which `1","2` could bend → no seed JSON (D3); (6, Medium) "a rerun clears" contradicts `verify-cert-run.sh` → never waived, names compared separately. Facts: F1's three-level claim moved to I1; draft visibility no longer relied on (`select` maps a visible draft to `build`). Asks recorded: D6, A2, A1's window (A4).

**Round 1, Opus** (Plan leg): **conditional approve**, ten findings. Accepted: (1) no live build-path proof → push path untouched by construction (D5), the source clauses pinned, A3, A1's merge window; (2) = Codex 2; (3) = Codex 4, with `fail-fast: false` pinned; (5) a `publish` plan on `source=published` refuses; (6) explicit draft mapping, `select` before `NOTES`, `cache: "false"`, CLEAN-style pin; (7) re-run granularity → I3, observed in phase 4; (8) D6 listed under claims; (9) = Codex 5; (10) the owner's wording mapped explicitly. (4) build guards: accepted as D8, a known limit, since the shipped bytes passed the guards when built.

**Round 2, Codex** (resume of `01a14b0e`): **reject**, narrowed to two blocking findings, both accepted. (1, High) one strict verify rule for every event fails a rerun of an already-published push run, reds `status` and skips `sync-main-to-dev` (verified at `release.yml:625-640`), against "the push path is unchanged" → D7 by event: push keeps today's download-and-warn path, every dispatch is strict. (2, High) an empty dispatch `source` reached the builds and, through `source || 'build'`, `attach-assets` before `status` could refuse → clauses S1 and S2 in every consumer, `SOURCE` never defaults on a dispatch, `plan` refuses an empty value. (3, Medium) the chaos pair leaves a skipped job, so the name proof compares executed workload names and pins the one skipped branch. (4, Medium) a targeted re-run proves nothing about failed-job re-runs → dropped; I3 stays plausible but unverified. Confirmed sound: the dispatch-only selector, local `checkAsset`, the `publish` refusal on `source=published`, both migration normalizations, the chaos pair, the lane-shape pin, D6 and D8.

**Final pass, Codex** (fresh session `01a14b23`): **conditional approve**, conditions: (1) `select-assets` never bound `TAG`, `VERSION`, `SHA` (`inputFromEnv` would refuse; reproduced by Codex) → bound from `needs.resolve.outputs` and pinned; (2) the condition recipe and its pins disagreed, and "adds" to the smokes would have produced `build == 'success' && build == 'skipped'` → complete predicates written out, build clauses replaced, pins aligned (builds carry no S2). Both accepted. Noted: A1 does not exercise the strict dispatch recheck (unit tests do); F8 is an observation, not a guarantee. Nothing reopens D1-D8.

**Final pass confirmation** (resume of `01a14b23`): **approve**, no remaining finding; Codex checked 200 source/result combinations of the revised predicates.

---
plan: ci-followups-2
tier: light
status: planned, awaiting orchestrator approval
issues: "#220 (arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 Explore agent (sonnet); one Codex audit (gpt-6.1-sol, high) with one Opus 5.5 Plan lens beside it (the panel); two resumed Codex re-reviews of the revised plan
post_implementation_hardening: not scheduled
base: origin/dev at 27af8d7
trunk: dev
---

# ci-followups-2: nightly's Firefox jobs and send-chaos gate the nightly release

The owner made two CI calls on 2026-10-11 (decision page 0, the C6 note). Nightly's Firefox jobs become required, and the seeded send-chaos run gates the nightly like the rest of the network suite. Today `nightly.yml` publishes a nightly prerelease, Firefox zip included, even when every Firefox suite and both chaos runs are red. This plan puts the seven jobs in `publish-nightly`'s and `status`'s needs, replaces the two pins that hold the advisory shape with pins that run the gates' own logic, and rewrites every doc that says these jobs gate nothing. It closes #220. It also measures what chaos would cost on every PR and asks the owner (OWNER-ASKS OA-1), and it prepares the `main` Firefox-network flip without running it (OA-2).

One arc, one PR against `dev` (the orchestrator's D-orch-1: no stack). Nothing a person sees in the wallet changes. Recon: [recon.md](recon.md). Owner questions: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Claims that did not hold, or hold narrower

- **"lose `continue-on-error`" (lane brief, both bullets).** None of the seven jobs carries `continue-on-error`. They are reusable-workflow callers (`uses:`), and only `dup-trend` (`nightly.yml:269`) and `rp-host-live` (`:287`) carry the key; both stay advisory. The advisory shape is the jobs' absence from `publish-nightly`'s `needs` and `if:` (`:486-518`) and from `status`'s `needs` and loop (`:604-645`). The change is to add them there.
- **"the pins in `behavior-gating.test.ts` / `aggregators.test.ts`".** Only `behavior-gating.test.ts` pins the advisory shape (`:621-624`, `:867-874`). `aggregators.test.ts` never reads `nightly.yml`; this plan adds nightly there (D2).
- **"record it in CLAUDE.md § nightly.yml".** CLAUDE.md has no such section. Its place is the `nightly.yml` bullet of § Quality gates → In CI (`CLAUDE.md:539`); `CI.md` § `nightly.yml` (`:121-133`) carries the longer statement.
- **Option A "deterministic, so retry-0 honest".** Retry-0 honest holds: the chaos test pins `retry: 0` itself (`send-chaos.test.ts:134`). Deterministic holds only for the actions: a seed fixes the actions, not their timing (`send-chaos.test.ts:8-10`, `nightly.yml:245-247`), so one seed can interleave differently on two runs. OA-1 says so.
- **#220 "Where" (`nightly.yml:256-267, :381-393`).** The lines drifted. The chaos jobs are at `:248-259` and `:369-381`. The finding holds.
- **#220 Pickup (lane `send-queue-activity`, arc 4).** The owner's call supersedes C6's "stay advisory" and moves #220 here. `send-queue-activity/plan.md` Phase 4.2 (`:647-649`) still plans a "30 green nightlies" row for the chaos jobs; the orchestrator removes #220 from that plan and relabels the issue. This lane edits no other lane's plan.

## Outcome & Quality Bar

**For whom.** The owner, who reads the nightly run; people who install a nightly, Firefox users included, who today can get a Firefox zip no Firefox gate passed; a maintainer who later adds a job to `nightly.yml`.

**What excellent looks like.**
- A red or cancelled Firefox suite, Firefox smoke of the shipped zip, or chaos run on either browser publishes no nightly, and `status` is red. Tests run `status`'s own script and read `publish-nightly`'s whole condition, so an edit that silences either fails CI. A new job added to `nightly.yml` gates the publish unless it is named advisory beside `dup-trend` and `rp-host-live`.
- "Re-run failed jobs" on a red chaos night replays the same action sequence, so a re-run cannot clear a red night by drawing a different scenario.
- Every doc that describes nightly gating names the same gates, and only `dup-trend` and `rp-host-live` are called advisory there.

**Good enough.** The proof is the pins and actionlint. No agent dispatches `nightly.yml` (a dispatch publishes); the orchestrator watches the first real night after the merge. The nightly's retry policy does not change; chaos keeps its own retry 0. A seed fixes actions, not timing, so a timing-dependent chaos failure can still pass on a re-run; the rule for that is written down (a red seed is a bug, filed with its seed), not enforced by code.

## Scope

- **In (arc 1):** the seven jobs into the nightly gates; #220 (the chaos criterion, recorded and enforced); the pins; the docs.
- **Asks, not built:** chaos on every PR (OA-1; ships option B, nightly only); the `main` Firefox-network flip (OA-2; an owner runbook, nothing runs).
- **Out, by the brief:** #251 and #195 (`owner-decision`, page 5); anything in `release.yml`, `publish-*.yml`, branch protection or a ruleset.
- **Out, noted:** a non-numeric `chaos_seed` dispatch input becomes `NaN`, which the PRNG turns into seed 0 while the log prints `seed=NaN` (`send-chaos.test.ts:37, :135-137`). Pre-existing, maintainer-only input; the close-out files it as an issue.
- **UI impact:** none. No wallet surface, copy or layout changes; only `.github/workflows/nightly.yml`, two test files and docs. The orchestrator's no-ask budget for this lane is the brief's "Nothing a person sees in the wallet changes. The nightly release's gating changes exactly as the owner asked"; this plan spends nothing beyond it.

## Architecture & Implementation

**Shape.** A graph edit inside `nightly.yml`, plus two caller expressions. No new job, input, permission, secret or action. The seven jobs are `network-e2e-firefox` (the 5-shard matrix; one `needs.<job>.result` covers its legs, as for the Chrome matrix), `network-e2e-heavy-firefox`, `network-e2e-heavy-concurrent-firefox`, `network-e2e-canary-firefox`, `smoke-firefox-against-artifact`, `network-e2e-chaos` and `network-e2e-chaos-firefox`.

**Control flow after the change.** The Firefox network jobs and both chaos jobs start beside their Chrome twins once `resolve` passes; `smoke-firefox-against-artifact` starts after `build-firefox`. `publish-nightly` waits for all of them and runs only if each is exactly `success`. The Firefox smoke is the long pole (24.8-28.7 min against Chrome smoke's 16.0-21.0 min on the four nights both ran), so a green night publishes about 5-9 minutes later than today. `status` fails on any `failure` or `cancelled` among its needs; it still passes `skipped` on purpose (quiet days, and stages behind a red job it already reads).

**File-level change map.**

| File | Change |
|---|---|
| `.github/workflows/nightly.yml` | `publish-nightly`: the seven jobs join `needs`, and each gets a `needs.<job>.result == 'success'` clause in `if:`. `status`: the seven join `needs` and the result loop. Both chaos jobs: `chaos_seed: ${{ github.event.inputs.chaos_seed \|\| github.run_id }}` (D3). The `chaos_seed` input description says an empty seed takes the run's id, so a re-run replays it. Comments: the Flow header (`:13-23`) names the Firefox suites, the Firefox smoke and the chaos run among the gates; the chaos comment (`:245-247`) and the Firefox comment (`:341-345`) each state the new invariant in one sentence, without "ADVISORY" |
| `scripts/ci-cd/aggregators.test.ts` | New `nightly.yml` block, reusing `aggregator()`, `exitCode()` and `results()` (D2): (1) `status` always runs, nothing suppresses it, and its needs are exactly every job but `dup-trend` and `rp-host-live`; (2) it passes a green night and a quiet day (`resolve` green, every other need `skipped`); (3) it fails once any one need ends `failure` or `cancelled`; (4) `publish-nightly`'s `if:` is exactly `always()`, `!cancelled()`, `needs.resolve.outputs.skip != 'true'` and one `needs.<n>.result == 'success'` per need, and its needs are `status`'s minus `publish-nightly` and the jobs that need it. The file header names nightly's aggregator |
| `scripts/ci-cd/behavior-gating.test.ts` | Delete the nightly half of `:611-637` (the `release.yml` half stays), the gate half of `:849-875` (the "chaos runs only in nightly" half stays), the `nightly.yml` row of `:903-911` and the publish block `:913-917`: the new aggregators block proves each of them by running the gate. Add one pin to the kept chaos test: both chaos jobs pass `chaos_seed` as `${{ github.event.inputs.chaos_seed \|\| github.run_id }}`. Reword the block comment (`:519-523`), the two titles and the `:849-850` comment |
| `CLAUDE.md` | `:538`: the nightly Firefox jobs gate the nightly's publish; the pin sentence names `nightly.yml`'s `publish-nightly` and `status` beside `release.yml`'s waiters. `:539`: the chaos run gates the nightly; one sentence records #220's rule: a red chaos night on either browser publishes nothing, its logged seed replays it through `chaos_seed`, and a red seed is a bug filed with that seed, which a later green night does not clear; chaos runs at its own retry 0. § Staged-rollout switches: one row, "`nightly.yml`'s Firefox and chaos jobs ∈ `publish-nightly.needs`", gating, flipped, with the way back (remove them from `publish-nightly`'s `needs` and `if:` and from `status`'s `needs` and loop, and update `aggregators.test.ts` in the same commit). The `main` flip row stays as it is |
| `CI.md` | `:89`: nightly's Firefox jobs are in `publish-nightly`'s and `status`'s needs; the pin sentence updated; the "A red advisory job still turns the *run* red" sentence removed. `:126`: the gate list names the Firefox suites, the Firefox smoke and both chaos runs; only `dup-trend` and `rp-host-live` gate nothing. `:127`: the chaos file pins retry 0, so the nightly never retries it, and a re-run replays its seed |
| `.github/WORKFLOWS.md` | `:23`: the nightly row's gate column names the network suite and send-chaos on both browsers |
| `apps/extension/tests/e2e/FIREFOX.md` | `:84`: the nightly Firefox jobs gate the nightly's publish; the "no Firefox job is in the needs …" sentence names both exceptions |
| `.claude/skills/e2e-testing/SKILL.md` | `:200-201`: nightly's retry policy excepts the chaos file, which pins retry 0. `:228-230`: nightly mirrors the lanes on both browsers plus the seeded chaos run, and publishes only when all are green |

**Trade-offs and alternatives not taken.**
- *Join `publish-nightly` only, not `status`.* Rejected: `status` would then read `publish-nightly`'s `skipped` as a quiet day and pass a red Firefox night.
- *A repository variable that switches the jobs between gating and advisory* (the `AUTO_UNSTICK_ENABLED` pattern). Rejected: configuration for one caller. The owner asked for required; the way back is a reverted commit, which the staged-rollout row spells out.
- *Keep chaos advisory with a promotion rule* (send-queue-activity's Phase 4.2). Superseded by the owner's call.
- *The nightly's retry 2 for the chaos run.* Rejected: a retry re-runs the burst against balances the first attempt moved, and it would hide the orderings chaos exists to find. The file's `retry: 0` stays.
- *Pass `retry: "0"` on the chaos callers and pin it* (Opus). Rejected: vitest's per-test `retry: 0` (`send-chaos.test.ts:134`) overrides any caller value, so a caller input would be a second statement of the same fact, and the e2e-testing skill already forbids raising a per-test retry.
- *Pins:* see D2 for the three shapes considered.
- *Seed from `github.run_id` inside the test; seed from the commit SHA* (needs a new `resolve` output). Rejected for the caller expression: the run id is CI policy, a local run must stay random unless a seed is given, and a SHA-derived seed adds an output for no extra guarantee (each new commit draws a new seed either way).

## Decision ledger

| ID | Decision | Why | Panel |
|---|---|---|---|
| D1 | The seven jobs join both `publish-nightly` (`needs` and `if:`) and `status` (`needs` and loop) | The owner's two calls; `status` must be red whenever the publish is withheld for a red gate | Codex: approve, no route from a red job to a published nightly or a green `status`. Opus: complete; a matrix result aggregates its legs as Chrome's does; a dry run still needs every gate green. Both note: `status` passes `skipped`, so a future edit that skips a gate on normal nights still blocks the publish but leaves `status` green. Pre-existing and by design (quiet days); recorded, not changed |
| D2 | Pins live in `aggregators.test.ts` and run the gates: `status` waits on every job but the two named advisory reports, passes a green night and a quiet day, fails on any one `failure` or `cancelled`; `publish-nightly`'s `if:` is exactly the success conjunction of its needs, and its needs are `status`'s minus itself and its dependents. The nightly halves of the old textual pins in `behavior-gating.test.ts` move out | Draft: one superset pin over e2e-suite callers, rejecting the exact set because ci-release-supply's later `prune-nightlies` would break it. Both legs showed that reason wrong: an exact set on `status` includes `prune-nightlies` by itself, and `publish-nightly`'s set excludes it by structure. Codex showed the textual pins pass `exit 1` → `exit 0` in the loop and `\|\| true` in the `if:`; `aggregators.test.ts:70-80` already substitutes inline `${{ }}`, so running the script needs no new machinery (the recon verdict "needs new machinery" was wrong: only the `env:`-binding assertion of `CASES` does not apply). Opus preferred the exact set; Codex the superset plus semantics. The chosen shape is both legs' strongest point at the size of either: the exact set catches any new ungated job, not only suite callers, and execution catches a silenced script. Moving the nightly textual pins avoids two pins of one fact | accepted from both legs (Medium each) |
| D3 | Both chaos jobs fall back to `github.run_id` when no `chaos_seed` is given | GitHub keeps `run_id` across "Re-run failed jobs" (GitHub Docs, Contexts reference). Today a re-run of a scheduled night draws a new random seed, so re-running a red chaos night could publish on a different scenario. Narrowed claim (both legs): the re-run replays the action sequence, not the timing, and the next night or a seedless dispatch still draws a new seed; the rule that a red seed is a bug filed with its seed covers those. Both browsers share one sequence per night (one sequence explored instead of two), which also separates a browser difference from a sequence one | Codex: keep `run_id`; an 11-digit id converts exactly and `seed >>> 0` reduces it modulo 2³² on purpose. Opus: real cause, right-sized, belongs in this arc; a SHA seed is not worth a new output |
| D4 | No retry, timeout or watchdog change anywhere | Owner's standing instruction. The job's 30 minutes include 1.5-2.5 minutes of setup, so the test's own 30-minute timeout cannot fire first; a hang ends as a job timeout, which is not `success`, and the seed is logged before the actions (`send-chaos.test.ts:137`) | Both: retain; a note, not an issue |
| D5 | OA-1 measured from the five nightly runs, no local run | The nightly logs are the CI runner class the PR lane would use; a local run on a host shared with four leads times the host | Codex: cost model plausible, but "a PR waits no longer" holds only with free runners (CI.md:89 documents queueing); accepted |
| D6 | No arc for chaos-on-PR or the `main` flip; OA-1 recommends B now and A after 30 consecutive green chaos nights on both browsers | Ten green runs are little evidence: under a simple model (independent runs, one failure rate) they bound the per-run failure rate only below about 26 % (95 %), and runs across changing commits do not even fit that model. The repository's own promotion bar is "ship advisory, observe, promote" and 30 green nightlies (CLAUDE.md § Staged-rollout switches), a policy bar, not a proven reliability threshold. The count is read from the chaos jobs' own run records, not from published nightlies (a missing nightly can be any red gate or a quiet day) | Opus: B now (accepted). Codex: A with N = 2 "a reasonable conditional recommendation". The stronger argument is the repository's own bar; A stays the owner's choice at any time |

## Audit verdicts

### Round 1 (2026-10-11): Codex gpt-6.1-sol high and Opus 5.5 Plan, in parallel

- **Codex: conditional approve** (narrow the seed guarantee, strengthen gate-semantic validation, correct measurements, complete OA-2's doc list).
- **Opus: conditional approve** (exact-set pin or drop the wrong reason against it, narrow D3, isolate the publish half by a mutation, OA-1 recommends B).

| # | Leg | Severity | Finding | Disposition |
|---|---|---|---|---|
| C1 | Codex | Medium | D3 claimed a re-run cannot pass a real chaos failure; a seed fixes actions, not timing | Accepted: D3 and the quality bar say "replays the action sequence"; the residual is named |
| C2 | Codex | Medium | The existing pins are textual: `exit 0` in the loop or `\|\| true` in the `if:` passes them; `aggregators.test.ts` can run inline scripts | Accepted: D2 runs `status`'s script and pins the whole publish condition; two mutations prove it |
| C3 | Codex | Medium | Measurements wrong: Firefox smoke skipped on 10-10; Chrome smoke 16.0 min on 10-07 | Accepted, verified with `gh run view`: F8, recon.md and the delay estimate (5-9 min) corrected |
| C4 | Codex | Medium | OA-1 promised PRs "wait no longer"; extra jobs queue against the lanes | Accepted: OA-1 says "with free runners", and calls the runner cost an estimate |
| C5 | Codex | Low | OA-2 misses `.github/WORKFLOWS.md:15`; the snapshot check is not a compare-and-swap | Accepted, both |
| C6 | Codex | Low | Mutation criteria too exact ("exactly the test it targets") | Accepted: "fails the test named for that guard; others may fail too" |
| O1 | Opus | Medium | D2 rejected the exact set for a wrong reason (`prune-nightlies` joins `status`, so an exact set holds) | Accepted: D2 is the exact set, in `aggregators.test.ts` with C2's execution |
| O2 | Opus | Medium | D3 overclaims: the next night or a seedless dispatch draws a new seed; a replay can pass on timing | Accepted (with C1): CLAUDE.md's rule says a red seed is a bug filed with its seed, not cleared by a later green night |
| O3 | Opus | Medium | No mutation isolates the publish half of the pin | Accepted: mutation 2 removes a job from `publish-nightly`'s `needs` and `if:` together |
| O4 | Opus | Medium | OA-1's recommendation premature: ten runs bound the failure rate only below ~26 %; the repo's bar is 30 green nightlies | Accepted: OA-1 recommends B now, A after 30 green chaos nights on both browsers (D6) |
| O5 | Opus | Low | Nothing in `scripts/ci-cd/` pins chaos's retry 0; pass `retry: "0"` on the callers | Rejected: vitest's per-test `retry: 0` overrides any caller value, so a caller input restates the same fact in a second place; the e2e-testing skill forbids raising a per-test retry |
| O6 | Opus | Low | Doc sites missed (`CI.md:89` "red advisory job", `SKILL.md:200-201`, `WORKFLOWS.md:15`); OA-1 silent on the shared seed; the Phase 2 grep cannot tell an `advisory` about `main` from a stale one | Accepted: change map, OA-1 and a Phase 2 search for the exact replaced sentences |
| O7 | Opus | Low | The plan hard-coded a co-author line; it said only `quality-status` runs on the PR | Accepted: the plan points at the common brief's trailer; `actionlint.yml` named |
| O8 | Opus | Low | A non-numeric dispatched seed becomes `NaN`, then seed 0, while the log prints `NaN` (pre-existing) | Accepted as out of scope: an issue at close-out (§ Scope) |

Both legs approved D1 as complete, D3's `run_id` source and D4 unchanged, and the OA-2 runbook against `required-checks.ts`.

### Round 2 (2026-10-11): Codex, resumed session

- **Codex: conditional approve** (scope the documentation search; correct OA-1's record-counting and statistical claims). Checks 1-5 confirmed by in-memory runs: `exitCode()` runs nightly's `status` as written, a quiet day passes; the behavioural test strictly covers the deleted textual pins; the `publish-nightly` formula holds today and with `prune-nightlies` (a direct dependent; not a general descendant calculation); each of the six mutations and the red-on-base run fail as planned; the rejection of O5 is sound.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| C7 | Medium | Phase 2's `git grep` searches every tracked file, so it matches this plan and recon.md quoting the old sentences, and cannot pass | Accepted: pathspecs limit it to the edited docs, workflows, skills and tests |
| C8 | Medium | Published nightlies cannot show 30 green chaos nights (a missing nightly can be any red gate or a quiet day); the ~26 % bound assumes independent runs with one rate | Accepted: OA-1 and D6 count from the chaos jobs' run records and state that a skipped or cancelled chaos job neither counts nor resets; the bound is qualified; 30 is the repository's policy bar |
| C9 | Low | recon.md kept superseded verdicts ("the pin scales", "invert", "supersets") | Accepted: recon.md now points at D2 |

### Round 3 (2026-10-11): Codex, resumed session

- **Codex: approve.** All three round-2 conditions met; no new material finding. The scoped Phase 2 search returns exactly the eight edit sites on the base tree and no plan file.

## Assumptions

**Facts (verified at 27af8d7).**
- F1. Only `dup-trend` (`nightly.yml:269`) and `rp-host-live` (`:287`) carry `continue-on-error`; the seven jobs are `uses:` callers without it.
- F2. `publish-nightly` needs 11 jobs (`:487-500`) and enumerates `== 'success'` for each (`:505-518`); `status` needs those plus `publish-nightly` (`:607-621`), inlines each result in its loop and fails on `failure` or `cancelled` (`:627-645`). No Firefox or chaos job is in either.
- F3. `behavior-gating.test.ts:623` and `:867-874` assert the advisory shape; `:903-911` asserts `status`'s loop references exactly its needs; `:913-917` asserts the publish `if:` contains `success` for each need. Both are textual: `exit 0` in the loop or `|| true` in the `if:` passes them.
- F4. `aggregators.test.ts` has no `nightly` reference; its `exitCode()` (`:70-80`) substitutes inline `${{ }}` expressions from a world before running the script, and `aggregator()` (`:43-57`) accepts a one-step `status` job.
- F5. `send-chaos.test.ts:134` pins `retry: 0` and a 30-minute timeout; `:135` takes `NULO_E2E_CHAOS_SEED` or else `Math.random()`; `:137` logs the seed.
- F6. Both chaos jobs pass `chaos_seed: ${{ github.event.inputs.chaos_seed || '' }}` (`:259`, `:381`), which `_extension-network-e2e.yml:141` exports as `NULO_E2E_CHAOS_SEED`; a scheduled run has no inputs, so every attempt draws a new seed.
- F7. GitHub's `github.run_id` "does not change if you re-run the workflow run"; `github.run_attempt` "increments with each re-run" (GitHub Docs, Contexts reference, fetched 2026-10-11).
- F8. In the five nightly runs since the chaos job landed (2026-10-07 to 10-11), all ten chaos runs were green, and every Firefox job that ran was green; on 10-10 both smokes were skipped behind the red `unit-tests`. The three red nights were red on gates that already block (recon.md § Measurements).
- F9. `nightly.yml` builds `dev` only (`:103-106`) and a dispatch publishes; the plan runs no dispatch.
- F10. `main` requires four checks today, all GitHub Actions (app 15368), with `strict` on (`gh api repos/nulo-sh/nulo/branches/main/protection/required_status_checks`, read 2026-10-11).

**Inferences.**
- I1. Gating adds failure surface: Firefox suites (at the nightly's retry 2) and chaos (at retry 0) can now withhold a nightly. Ten green chaos runs say little about chaos's failure rate (D6).
- I2. GitHub does not accept `continue-on-error` on a job that calls a reusable workflow. Not load-bearing: the jobs carry none either way.
- I3. ci-release-supply's arc 5 `prune-nightlies` (needs `publish-nightly`, joins `status`) passes the D2 pins unchanged: it is a non-advisory job in `status`'s needs and a dependent of `publish-nightly`.

**Asks.**
- A1. Chaos on every PR: OWNER-ASKS OA-1. Working assumption: option B (nightly only) ships.
- A2. The `main` Firefox-network flip: OWNER-ASKS OA-2, a prepared runbook. Working assumption: `main` stays as it is.

## Security & Adversarial Considerations

- **Threat model.** The nightly is a public install channel: a GitHub prerelease with a Chrome zip and a Firefox zip, attested. Today the Firefox zip publishes without any Firefox suite passing, so a Firefox-only regression reaches nightly users. After the change it cannot. No trigger, input, permission or token changes, so an attacker gains nothing new.
- **Gate integrity.** The risk this plan adds is a gate that is defeated without anyone noticing. Each path and its guard: a red job left out of `status` or the publish (D1; the exact set in D2); a future job added ungated (D2's exact set: it must be a need or be named advisory); an edit that silences the loop or loosens the publish condition (D2 runs the script and reads the whole condition); a re-run that draws a different chaos scenario (D3, pinned). Residual: a timing-dependent chaos failure can pass on a re-run of the same seed; a dispatch with a chosen seed publishes on that seed's result (a maintainer action); `status` passes `skipped` by design.
- **Least privilege.** `publish-nightly` keeps its exact `contents: write`, `id-token: write`, `attestations: write` (`release-integrity.test.ts` pins them); the gating jobs stay `contents: read` (workflow default). No secret reaches a new job.
- **Supply chain.** No new action or dependency; geckodriver and Puppeteer stay pinned as today.
- **Availability.** More gates mean more nights may publish nothing. That is the owner's call and the intended trade. The response to a red night is a fixed cause or a replayed seed, never a retry or a skip.
- **Input validation.** `chaos_seed` stays a free string from a `workflow_dispatch` that only maintainers can start; `github.run_id` is a GitHub-set integer. The `NaN` case is out of scope (§ Scope).

## Implementation phases

Every phase lists its assumptions; every command runs from the worktree root.

### Phase 1: gate the nightly on the seven jobs, with the pins (#220, owner call 1)

Assumptions: F1-F7, D1-D4.

1. Edit `.github/workflows/nightly.yml` as the change map says: `needs`, `if:`, the `status` loop, the two `chaos_seed` expressions, the input description and the three comments.
2. Add the `nightly.yml` block to `scripts/ci-cd/aggregators.test.ts` (D2). Reuse `aggregator()`, `exitCode()` and `results()`; add no new helper.
3. Edit `scripts/ci-cd/behavior-gating.test.ts`: delete the four nightly parts the change map names, add the seed pin to the kept chaos test, and reword the comments and titles.
4. Run the gate below. Then commit workflow and pins together: `ci(nightly): gate the nightly release on its firefox and send-chaos jobs`.
5. Prove the pins red on the old workflow. Take the old file from the base SHA, never from `HEAD`: `git show 27af8d7:.github/workflows/nightly.yml > .github/workflows/nightly.yml`. Run `bun test scripts/ci-cd/aggregators.test.ts scripts/ci-cd/behavior-gating.test.ts`. Expect the exact-set test to fail with the seven jobs among the missing needs, and the seed pin to fail. Restore with `git checkout -- .github/workflows/nightly.yml`.
6. Prove each guard with one mutation at a time. Restore with `git checkout -- .github/workflows/nightly.yml` after each.
   - Remove `smoke-firefox-against-artifact` from `status`'s `needs` only.
   - Remove `network-e2e-firefox` from `publish-nightly`'s `needs` and its `if:` clause together.
   - Remove the `success` clause of `network-e2e-chaos-firefox` from the publish `if:` only.
   - Append `|| true` to the publish `if:`.
   - Change the loop's `exit 1` to `exit 0`.
   - Set one `chaos_seed` back to `|| ''`.
7. Log the red-on-base output and the six mutation outputs in `lessons/phase-1.md`.

**Validation gate.**
- Commands: `bun run lint:actions`; `bun test scripts/ci-cd/aggregators.test.ts scripts/ci-cd/behavior-gating.test.ts`; `bun run test:ci-gating`; `bun run test:release`; `bun run lint`; `bun run typecheck:all`.
- Pass criteria: every command exits 0 on the committed tree. Step 5 fails on the base workflow and the output lists the seven jobs. Each step-6 mutation fails the test named for that guard; other tests may fail too. The restored tree passes again.
- Layers: lint, typecheck, unit (the CI-gating pins, which run the gate scripts), workflow lint.

### Phase 2: rewrite the docs to the new truth

Assumptions: Phase 1 green; recon.md § Docs.

1. Edit `CLAUDE.md` (`:538`, `:539`, § Staged-rollout switches), `CI.md` (`:89`, `:126`, `:127`), `.github/WORKFLOWS.md:23`, `apps/extension/tests/e2e/FIREFOX.md:84` and `.claude/skills/e2e-testing/SKILL.md` (`:200-201`, `:228-230`) as the change map says. A code comment names no plan, phase, review or issue.
2. Check each replaced sentence is gone: `git grep -n -F -e "carries advisory Firefox jobs" -e "its seeded chaos run advisory" -e "and the Firefox jobs gate nothing" -e "outside every aggregator's and publish step's" -e "A red advisory job still turns" -e "the nightly Firefox jobs stay advisory" -e "a lead, not a gate" -e "ADVISORY Firefox lanes" -e "nothing waits on a Firefox job" -- CLAUDE.md CI.md .github apps/extension/tests/e2e/FIREFOX.md .claude/skills scripts/ci-cd`. The pathspecs keep plan files, which quote the old sentences, out of the search.
3. Commit: `docs(ci): nightly's firefox and send-chaos jobs gate its release`.

**Validation gate.**
- Commands: the search in step 2; `bun run lint`; `bun run test:ci-gating` (it runs `check:plans` and the home-path guard); `bun run test:all`.
- Pass criteria: the search prints nothing; every other command exits 0.
- Layers: lint, unit, docs gate.

No e2e run: nothing under `apps/` or `packages/` changes code, and no fixture changes. `nightly.yml` is in neither PR e2e path filter, so the PR runs `quality-status` and `actionlint.yml`; no label is added.

## Post-implementation

Single-arc plan: steps 1-3 run once over the whole diff after Phase 2 is green. `code_review` is `off`, so there is no `/code-review` step.

1. **Codex audit.** Write the prompt to `implementations-plan/ci-followups-2/_codex-impl.md` and run `~/.claude/skills/codex/scripts/run-codex.sh implementations-plan/ci-followups-2/_codex-impl.md <worktree> high read-only gpt-6.1-sol`. Send: the net diff from 27af8d7, this plan with its ledger, and an adversarial ask (can any red job of `nightly.yml` other than the two advisory reports still publish, or leave `status` green; can a re-run or a dispatch change what was tested; does any permission widen). Include these two rules verbatim:
   - *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."*
   - *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*
2. **Fix loop.** Verify each finding against the tree first. Apply the accepted fixes, commit them, and log the round (consult, verdict, accepted and rejected findings with reasons) in `lessons/phase-1.md`. Resume the same session with `resume-codex.sh` and the fix diff, with the same two rules. Stop when a round has no new material finding. Still finding material issues after 3 rounds: stop and report it; that is a scope problem.
3. **Gates again.** Re-run both phase gates on the final tree.
4. **Delivery** (below). The PR opens only now.
5. **Close-out**, as the PR's final commits:
   - Merge `origin/dev` into the branch first and read what changed in `implementations-plan/index.md` and `lessons.md` (another lane may have landed; never a union merge).
   - Write the `## Outcome` block directly after the front matter: date, status, what shipped with the PR number, what was dropped or superseded and why, an `Open items:` line, and a line retiring the seeds.
   - Promote a generalizable gotcha to `implementations-plan/lessons.md` only if one surfaced: one line, linked, within 8 KiB (deduplicate, retire what it supersedes, date what is tied to a tool version). Candidate: "a scheduled job's random seed re-draws on 'Re-run failed jobs'; take it from `github.run_id`".
   - File each open item in its home:

     | Situation | Home |
     |---|---|
     | Work inside the implementation you are on | the active `plan.md` and the PR |
     | Actionable work that outlives the plan: a bug, a gap, a missing test, a deferred refactor | a GitHub issue, with a domain label and a `Record` link to the archived plan |
     | Needs a product call, or waits on something outside the repo | an issue labelled `owner-decision` or `blocked:external` (the body names the trigger) |
     | A suspected exploitable weakness | a private draft security advisory; `plan.md` records only "tracked privately: GHSA-…" until it is published |
     | Rejected, superseded or already done | a disposition line in the plan's Outcome block; no open item anywhere |
     | Knowledge that prevents a repeat | `implementations-plan/lessons.md` (8 KiB budget) |
     | A legal or store blank with a release deadline | `BEFORE-LAUNCH.md` |
     | Accepted code work that blocks launch | the `v1.0.0` milestone, pointed at once from `BEFORE-LAUNCH.md` |

     Open one issue for the `NaN` seed (§ Scope), label `ci`; dedupe first with `gh issue list --state all --search "chaos_seed"`. The body has five sections: What happens, Where, Impact, Possible fix, Record. OA-1 and OA-2 live on the orchestrator's owner page; if the owner has chosen OA-1 option A by close-out and no arc builds it, open an issue for it too (dedupe: `gh issue list --state all --search "chaos PR lane"`).
   - Delete `STATUS.md`. Then, in its own commit, `git mv implementations-plan/ci-followups-2 implementations-plan/archive/ci-followups-2`, repair the links the extra directory level breaks (`git grep -n 'ci-followups-2'`), and move the index line to `implementations-plan/archive/index.md`.
   - Run `bun run check:plans` on the staged files, push, and report. Merging is the orchestrator's call.
6. **Teardown after the merge.** Once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/ci-followups-2/plan.md` succeeds, run `agent-worktree done ci-followups-2 --merged` (this session adopted the worktree and never entered it through `EnterWorktree`, so there is nothing to exit). It refuses rather than forces: relay a refusal and stop. A `/loop` session checks this on every firing; a `/goal` session arms one background wait after its wrap-up report (`until <the check>; do sleep 300; done`, at the maximum timeout) and otherwise runs it at the start of its next turn. This step is standing authorization.

## Delivery

| Arc | Phases | Stacks on | `/code-review` | PR title (characters) | Closes |
|---|---|---|---|---|---|
| arc-1 | 1, 2, close-out | `dev` | off | `ci(nightly): gate the nightly release on its firefox and send-chaos jobs` (72) | #220 |

- Single arc, one branch (`worktree-ci-followups-2`), plain `gh pr create --base dev`; no `gh stack`. The close-out lands as the PR's final commits.
- Open the PR without labels. No e2e label is needed: no suite's code or fixtures change.
- PR body: what changed and why (the owner's two calls of 2026-10-11 on page 0's C6 note; the decision on #220 supersedes C6's "stay advisory"), the validation run with outcomes, the red-on-base and mutation proofs, `Closes #220`, and a pointer to OWNER-ASKS OA-1 and OA-2. End it with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Commits are signed and end with the co-author trailer the program's common brief names. If a commit hangs, rerun it as `env -u SSH_AUTH_SOCK git …` and check that `git log --format='%h %G?' -3` shows no `N`.
- After the merge the orchestrator watches the first real night: every Firefox and chaos job appears in `publish-nightly`'s needs on the run graph, and a green night publishes.

## Seeds

Recommended: `/goal` (completion is visible in the transcript).

```
/goal All phases of implementations-plan/ci-followups-2/plan.md marked ✓ in plan.md, each backed by its validation gate reported passing in the transcript (including the red-on-base proof and the six mutation proofs of Phase 1); for each phase the transcript prints LESSONS_FILE=implementations-plan/ci-followups-2/lessons/phase-N.md; /code-review was NOT run (code_review is off); the Codex fix loop on gpt-6.1-sol converged on the whole diff, evidenced by a resumed Codex pass reporting no new material findings, quoted in the transcript; one PR against dev exists, opened only after the loop converged (gh pr view output in the transcript), its body says Closes #220, and its final commits are the close-out that archived the plan (git show --stat of the archive-move commit in the transcript); bun run test:ci-gating and bun run lint both report exit 0 in the transcript.
```

Alternative: `/loop`.

```
/loop 15m Drive implementations-plan/ci-followups-2 forward. Never idle. Each firing: 1. Reality check: read plan.md and lessons/ (authoritative, not the chat). If plan.md is gone, check `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/ci-followups-2/plan.md`: it succeeds → run `agent-worktree done ci-followups-2 --merged`, report its output (or its refusal, verbatim), clear this loop and stop; it fails → the PR awaits merge: babysit its checks only. A live plan.md with an `## Outcome` block means an interrupted close-out: finish it. Otherwise `git status`, `git log --oneline -5`, and `gh pr view --json statusCheckRollup` if a PR exists. 2. Waiting on CI is fine; confirm it progresses. 3. No task in hand: take the next step from plan.md; after each edit run `bun run lint` and `bun test scripts/ci-cd/aggregators.test.ts scripts/ci-cd/behavior-gating.test.ts`. 4. A decision you would bring to the owner: argue it with Codex (`run-codex.sh … high read-only gpt-6.1-sol`) and log it in lessons/; a question about what a person sees goes to OWNER-ASKS.md and is left out. Hard limits: never dispatch nightly.yml, never touch branch protection or a ruleset, never merge, never push to main, no retry, timeout or skipIf added. 5. Same step failed 5 times: stop and reassess with Codex. 6. Phase green means its validation gate as written passes: paste the result, mark ✓, print LESSONS_FILE=…, move on. 7. All phases ✓: run the Post-implementation section (Codex fix loop, at most 3 rounds), then Delivery (`gh pr create --base dev`), then the close-out commits, then `gh pr checks --watch`, then a wrap-up report, and stop.
```

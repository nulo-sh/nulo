---
plan: test-issues-1
tier: light (one Codex audit round-trip plus the Opus Plan leg)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev at 4c931737acdeb7c6f60d41361ca4b0275c8756eb
---

# test-issues-1: four open test issues

Two flaky specs, one clock-bound unit assertion filed twice, and two stale comments. Each phase fixes its cause with the smallest change; no production behaviour changes. Evidence for every claim is in [`recon.md`](recon.md).

## Outcome & Quality Bar

- **For whom**: whoever reads a red `quality-status` or smoke check on a PR that did not touch the code under test. A red must mean a defect, and a red that stays unexplained must carry what the next reader needs.
- **Excellent**: (1) the Senders sweep and the three probe-budget tests cannot go red on timing, and the before/after evidence shows the old shape failing and the new one not; (2) the next held-count red on smoke says on its own whether the attempt was recorded before or after the spec's restart baseline, and on Chrome carries the intercept log with the moment the guard counted, so #846's reopening test can be applied to it.
- **Good enough**: #1743 did not reproduce here (Phase 2), so it stays open with the diagnostic landed and the runs recorded on it.

## Assumptions

Facts (verified at the base; `recon.md`):
- F1. `senders-add-btn` renders beside `loading-state` while `useEntityCrud.isLoading` holds, and `isLoading` starts `true`, so the two render in one pass. Only Senders has that shape among the `goAndSweep` targets.
- F2. `probeNodeStatus` reads `Date.now()` once for the deadline and once per endpoint (`service.ts:1059,1064`) and hands each probe `Math.floor(left / remaining)`; three tests assert that budget exactly against the real clock (`service.test.ts:2529,2616,2627`).
- F3. `vi.useFakeTimers({ toFake: ["Date"] })` freezes `Date` until advanced and leaves every timer real. The budget calculation reads no timer. `getNodeStatus` runs the real router, built with `now: Date.now` and real `setTimeout` sleeps, `ROUTE_TIMING`'s clock-read health thresholds are 5 s or more, so a frozen clock takes the same branches; its backoff sleeps (1, 2, 3 s) run on real timers; no loop polls the clock without a real-timer limit.
- F4. `NULO_E2E_INTERCEPT_LOG=1` only adds stdout lines on Chrome (`chrome-rpc-intercept.ts:49`); no workflow sets it. One local run of the arrival spec printed 129 lines for three tests. `_extension-smoke-e2e.yml` also serves the nightly and release smoke jobs.
- F5. The failing CI job's held request is in the whole launch's record, and the hold is on before registration (`egress-guard.ts:463-469`, `fixtures/extension.ts:732-736`), so it may come from registration on Mainnet, the seed, the PXE host's close, the re-arm's edge or after the restart. The spec's baseline (`mainnetBefore`) covers only stand-in hits after the restart.
- F7. The arrival spec ran ten times on Chrome and five on Firefox at retry 0 with the log on, at load 154 to 330 on 188 cores: all green (`lessons/phase-0.md`).
- F6. The two stale comments are the only live ones (`view-executor.ts:335-338`, `helpers/batched-view-simulation.ts:364-365`).

Inferences:
- I1. The wait proves the list settled, not that it loaded: a rejected fetch also clears `loading-state` and shows the retry banner, which the sweep then reads. A `loading-state` that renders after the settle wait would escape it; no swept page does that today, since a list's first fetch shows its loading state from the first render (F1) and no refetch trigger fires during a sweep.
- I2. The held Mainnet request comes either from a target the interception misses or from a request issued just before an arm took effect (README § Egress guard; #846). Nothing here can tell them apart without a reproduction.

Asks: none open. Nothing in this plan changes what a person sees.

## Architecture & Implementation

Test and CI only. No new helper, layer or option.

- **#1763**: `goAndSweep` waits, after its ready element, until no `loading-state` is on the page: `page.waitForFunction((s) => !document.querySelector(s), { timeout: DEFAULT_RPC_TIMEOUT_MS, polling: 100 }, sel("loading-state"))` inside `withTimeoutMessage` (`fixtures/dom.ts`), whose message names the sweep's label. `DEFAULT_RPC_TIMEOUT_MS` comes from `@nulo/extension-messaging/background`: every swept list fetches through a popup RPC bounded by it, which started before the wait, so a healthy page settles (loaded or failed) inside the bound. One comment: a list renders its page's controls while it still fetches, and a sweep reads the page at rest. Every `goAndSweep` target thus gets the settled ready condition; only Senders changes behaviour today (recon table). `openAndSweep` opens popups, none of which load a list.
- **#1743** (not reproduced, F7): a diagnostic of a few lines. (a) `network-arrival.test.ts` asserts, right after `mainnetBefore`, that the guard holds no Mainnet attempt yet: an earlier read of the record the spec and the close already fail on, so it adds no red, and every failure then says whether the attempt was already recorded at the restart baseline or recorded afterward, flag or not (not when the browser issued it). (b) The smoke test step in `.github/workflows/_extension-smoke-e2e.yml` sets `NULO_E2E_INTERCEPT_LOG: "1"`. (c) Under that flag, the guard's `note` logs one line per request for a watched node host, `[egress-guard] <host>:<port> held` or `released`, so the log places each count among the arms' attach and redirect lines. README § Egress guard and `CI.md`'s smoke line say smoke runs with the log on.
- **#1742, #1735**: the describe "NetworkService node status: getNodeStatus and probeNodeStatus" gets `beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }))` and `afterEach(() => vi.useRealTimers())`, with one comment: the probe gets what is left of its budget by the clock, so a frozen `Date` keeps it exact. That covers `bothStatuses` and the direct call at `:2627`. Assertions stay exact.
- **#1683**: rewrite the two comments to what `completeFeeOptions` does: the node's predicted minimum fees (current fees when it predicts none), each fee's worst slot taken on its own, padded by half; upstream `BaseWallet` takes the one slot with the worst L2 fee, which is never higher.
- **Alternatives not taken**: D1 to D4.

## Security & Adversarial Considerations

- **Threat model**: repository gates. The risk is a gate that stops guarding: a settle wait that passes vacuously (I1), a frozen clock that hides a real budget bug, or a log that leaks. The fake-clock describe below (`:2672`) still proves the budget split as time passes. The intercept log's redirect lines name the node's origin, never a request path (`chrome-rpc-intercept.ts:73`); its attach lines name a target's last two URL segments, which are extension pages and workers (`:95`; seen: `service_worker:<id>/background.js`, `background_page:offscreen/index.html`). The guard line prints host and port only, as the guard records.
- **Least privilege, supply chain**: the workflow edit adds one env value to an existing step; no permission, secret, action or dependency changes. Input validation, crypto: N/A.

## UI impact

None. No screen, copy or layout changes.

## Phases

### Phase 1: the Senders sweep reads a settled list (#1763)
- File: `apps/extension/tests/e2e/type-roles.test.ts` (`goAndSweep` and its imports). Nothing else in the file.
- Before/after evidence (scratch, not committed): log whether `loading-state` is on the page when the Senders `expectPageClean` starts, and how long the settle wait took, five runs on the base and five on the change.
- **Validation gate**: `bun run lint`; `bun run typecheck:all`. From `apps/extension`, `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_EXECUTE_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/type-roles.test.ts --retry=0` five times on Chrome and five with `NULO_E2E_BROWSER=firefox` on the armed Firefox build: every run green. The scratch log shows `loading-state` at the Senders sweep in at least one base run and in no run after; it shows the sweep entered with the list settled, not that it loaded (I1). Record each run's wall-clock and settle time. Layers: lint, typecheck, smoke e2e on both browsers.

### Phase 2: the held Mainnet request (#1743)
- Reproduction: done while planning (F7); it did not reproduce.
- Files: `apps/extension/tests/e2e/network-arrival.test.ts` (the baseline assertion), `apps/extension/tests/e2e/fixtures/egress-guard.ts` (`note`), `.github/workflows/_extension-smoke-e2e.yml` (the test step's `env`), `apps/extension/tests/e2e/README.md` § Egress guard, `CI.md` (the smoke line). Comment the runs and what a reader will now see on #1743, which stays open.
- **Validation gate**: `bun run lint`; `bun run typecheck:all`; `bun run lint:actions`; `bun run test:ci-gating`; `bun run test:release`; from `apps/extension`, `bun --bun vitest run scripts/e2e/egress-guard.test.ts`. Then `tests/e2e/egress-guard.test.ts` and `tests/e2e/network-arrival.test.ts` once each on Chrome and on Firefox at retry 0 with the flag on, all green. On Chrome, the guard spec's page-request control prints its intentional `held` line and the arrival spec prints none. Layers: lint, typecheck, CI gating, unit, smoke e2e on both browsers.

### Phase 3: the probe budget on a frozen clock (#1742, #1735)
- File: `apps/extension/src/wallet/services/network/service.test.ts` (that describe only).
- Before/after evidence (scratch): a 2 ms busy-wait on `performance.now()` (which `["Date"]` does not fake) in the service's route lookup, between the deadline and the first probe. Record the budgets the three tests see on the base (expected below 5_000 and 2_500) and that they stay exact after.
- **Validation gate**: `bun run lint`; `bun run typecheck:all`; from `apps/extension`, `bun --bun vitest run src/wallet/services/network/service.test.ts --retry=0` twenty times, every run green. Layers: lint, typecheck, unit.

### Phase 4: the fee comments (#1683)
- Files: `apps/extension/src/wallet/services/execution/view-executor.ts`, `apps/extension/src/wallet/services/execution/helpers/batched-view-simulation.ts`. Comments only.
- **Validation gate**: `bun run lint`; `bun run typecheck:all`; `git diff` shows comment lines only. Layers: lint, typecheck.

### Final gate (before the review loop, and again on the final head)
`bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run --cwd apps/extension test:components`, `bun run test:all`, `bun run audit:vue`, each exit 0; `bun run test:ci-gating`; `bun run test:release`; `bun run lint:actions`; `bun run check:plans` after staging; `type-roles.test.ts`, `egress-guard.test.ts` and `network-arrival.test.ts` once more on both browsers. Gates run one at a time.

## Decision ledger

- **D1 (where the Senders settle wait lives, and its bound)**: in `goAndSweep`, for every target. It fixes the shape by construction and costs one immediate check on the pages without a loading state. Rejected: Senders only (the next list page repeats the defect); `expectFitsNarrow`'s unsettled set (thirteen other spec files call it, and the role sweep before it would still read the loading state); a new exported helper. The form is absence (`!document.querySelector`), as the sweep's own unsettled wait and the five network specs use: Puppeteer's `{ hidden: true }` reads only the first match and counts a zero-size one as gone. The bound is the popup RPC's contract, `DEFAULT_RPC_TIMEOUT_MS` (60 s), not `VISIBLE`'s 15 s: a button's render deadline says nothing about a PXE-backed fetch, and a 20 s fetch is healthy. Both panel legs argued this; the first draft's 15 s is withdrawn.
- **D2 (#1743 without a reproduction)**: the baseline assertion, the flag on the smoke test step, and one guard line per watched-host request. The assertion places the count against the restart on every run, flag or not (the Opus leg). The flag and guard line reuse the instrumentation README and #846 name; the line marks where the guard counted among the arms, though it cannot name the caller or order a request against an arm (Codex), so #1743 stays open until a red is attributed. Cost: about 43 stdout lines per Chrome launch on PR, nightly and release smoke, more on specs that sit on Home. Rejected: an always-on in-memory history printed only in the failure (more harness for an unreproduced red); a log file under `.e2e-state` (per-launch naming and cleanup for the same text); a new workflow input to scope the flag to PR lanes (configuration for one caller).
- **D3 (the clock pin)**: `toFake: ["Date"]` for the whole describe, the repo's convention. The fake-clock describe at `:2672` still proves the budget split as time passes. Rejected: a range (the brief and the test's point forbid it); a `Date.now` spy (the setup restores no spy); pinning inside `bothStatuses` (misses `:2627`); a committed stall test (it would test the test; both legs agreed the scratch proofs suffice).
- **D4 (scope)**: Contacts, Reset and Send also show content after their ready element, but no loading text that a sweep could read as gone; Send belongs to `send-build-1`. Left as they are.
- **D5 (delivery)**: one PR against `dev`, four phases, no stack (the orchestrator's D-orch-1).

## Audit verdicts

- **Codex round 1** (gpt-6.1-sol, high): conditional approve. All accepted.
  1. Plausible: the 15 s settle bound can fail a healthy fetch inside the RPC's 60 s contract. Now `DEFAULT_RPC_TIMEOUT_MS` with a labelled message (D1).
  2. Demonstrated by source: Phase 2's gate wanted no `held` line, but the guard spec's Chrome control makes one on purpose. The gate now expects it there and none in the arrival spec.
  3. Demonstrated overstatement: attach labels carry a target's last two URL segments. The Security claim is narrowed; the runs showed only extension targets.
  Also: F2's wording, I1 ("settled", not "loaded"), thirteen callers, the network spec paths in recon.
- **Opus Plan leg**: conditional approve. All accepted.
  1. The 15 s bound (as Codex 1); use the absence form (D1).
  2. Demonstrated: the hold is on through registration, so the log alone cannot place the count against the restart. Now the baseline assertion (D2); the guard line also logs released arrivals.
  3. Demonstrated by the API: a `Date.now` busy-wait hangs under a frozen `Date`. Phase 3 uses `performance.now()`.
  4. F3 restated (the router does use real timers; its clock-read thresholds are 5 s or more).
  5. The guard's unit test joins Phase 2's gate; nightly and release smoke carry the log too (D2).
- **Codex round 2** (resumed, with both legs' dispositions): **approve**. It ran the import of `DEFAULT_RPC_TIMEOUT_MS` in Node with a throwing `chrome` getter (39 modules, no `chrome` read) and confirmed the baseline assertion adds no red. Three wording fixes, applied: F3's backoffs, the baseline's "recorded at the baseline or afterward", recon's reuse verdict.

## Delivery

Single arc: branch `test-issues-1-a1` off `origin/dev` carrying the plan commit, one PR into `dev`, opened ready only after the review loop converges. Title (80 chars): `test: senders sweep waits for its list, probe budget on a frozen clock, and more`. The body: what changed and why, every gate run with outcomes and wall-clock, `Closes #1763`, `Closes #1742`, `Closes #1735` (one defect, filed twice), `Closes #1683`. #1743 stays open (not reproduced): the body says what the next red will show. Add `e2e:extension-smoke` after creation only if the path filter skips smoke. No parallel lanes.

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at `4c931737acdeb7c6f60d41361ca4b0275c8756eb`. Plan-specific parts:

1. Diff review: absent (`code_review: off`).
2. Review loop, once over the whole diff from the base after the final gate: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, with the standard's two verbatim rules and the adversarial ask. One Opus review (`Agent`, `model: "opus"`, `general-purpose`) alongside round 1. Hard stop at three rounds. Log each round in `lessons/phase-4.md` and under Audit verdicts.
3. Delivery as above, then `gh pr checks <n> --watch` once; a known flake gets one rerun.
4. Close-out as the PR's final commits: merge `origin/dev` first and read `index.md` and `lessons.md`; write the Outcome; promote lessons (dedupe, prune, 8 KiB); comment on #1743 with the runs; delete `STATUS.md`; `git mv` into `archive/` in its own commit with the index line moved; `bun run check:plans` green.
5. Teardown after the merge: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/test-issues-1/plan.md`, then `agent-worktree done test-issues-1 --merged`. The orchestrator notices the merge.

## Seeds

```
/goal Phases 1-4 of implementations-plan/test-issues-1/plan.md marked ✓, each backed by its gate reported passing in the transcript; LESSONS_FILE=implementations-plan/test-issues-1/lessons/phase-N.md printed per phase; /code-review NOT run (code_review: off); the Codex loop converged over the whole diff (a resumed pass reporting no new material findings, quoted); one PR into dev opened ready only after that (`gh pr view` output), carrying the close-out archive commit (`git show --stat`); bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/test-issues-1 forward per its plan.md (Outcome & Quality Bar first). Each firing: reality check (plan.md, lessons/, git status, gh pr view); if the plan sits under archive/ on dev, run Post-implementation step 5 and stop; else run the next phase's gate exactly, tick it, log lessons; then the review loop, Delivery and close-out; decide with /codex high on gpt-6.1-sol, never merge, never widen scope; 5 failures on one step → reassess with codex.
```

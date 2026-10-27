---
plan: unit-flakes-4
tier: light (one Codex audit round-trip plus the Opus Plan leg)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev at 78f5f9171e6a670279a013ddc8d32566a35478f5
---

# unit-flakes-4: three unit tests that read the host's speed or git's version

Three tests fail for reasons outside what they check: two whole-tree source scans run past vitest's 5 s default on a saturated host (#1112), a restore-deadline test spends its 10 ms budget before the first launch on a slow host (#1226), and the plans gate's depth-1 case failed in git 2.56's index-pack (#1241). Each fix measures the behaviour instead of the host. No timeout is raised. Evidence: [`recon.md`](recon.md).

## Outcome & Quality Bar

- **For whom**: whoever runs `bun run test`, `audit:vue` or `test:ci-gating`, on a shared host at load 300 or on a runner with a new git. A red run must mean a defect.
- **Excellent**: (1) each test gives the same verdict at any host speed and on git 2.43 and 2.56: 30 runs at retry 0 plus a red/green reproduction per fix; (2) each guard still fails on what it guards: no assertion loosened, no budget raised, a mutation proof per fix.
- **Good enough**: the three named tests. The same-cost scans that #1112 does not name stay as they are (D2).

## Assumptions

Facts (verified at the base):
- F1. `restore` starts its deadline with `Date.now()` after its restore hold point and before initialization, and checks it before each launch (`apps/extension/src/wallet/services/account-state/service.ts:327-334`). The test passes 10 ms with a real 30 ms first registration (`service.test.ts:514-525`). A 20 ms delay injected before the first launch reproduces #1226's error (`got 0 times`); with only `Date` faked, the same delay passes.
- F2. `amount.callers.test.ts:43-51` parses 824 files, 15 of which spell `balanceFormatted`; `css-v-bind-ban.test.ts:43-54,66` parses 834, 11 of which spell `useCssVars` or `v-bind`. A substring pre-check gives 1180 → 115 ms and 909 → 34 ms with identical findings.
- F3. Vue's `descriptor.cssVars` comes only from `/v-bind\s*\(/g` over style content (`@vue/compiler-sfc` `parseCssVars`). A `callsTo` callee is its source text (`source-code.ts:164-166`), except in a template, whose code the compiler entity-decodes: `<span :title="&#98;alanceFormatted(…)" />` is found today. Of all HTML5 named references only `&fjlig;` decodes to ASCII letters (`fj`), which neither name contains, so hiding a letter of either needs `&#`. Only 2 scanned `.vue` files and no `.ts`/`.js` file contain `&#`.
- F4. Under git 2.56.0 (container), the pre-#1247 gate fails the depth-1 case 30/30 with `index-pack failed`; HEAD passes 30/30. Both recorded #1241 hits predate #1247's merge, and none of the 19 green or 1 red Quality runs since shows it.
- F5. A filtered unshallowing fetch sets `remote.origin.promisor=true` in the clone's own config on git 2.43 and 2.56 (the versions checked), with or without server filter support; an unfiltered fetch leaves it unset.
- F6. vitest 4.1.12 fails a synchronous test that ends past its timeout (`@vitest/runner` re-checks the elapsed time once the test returns). The restore describe (`service.test.ts:454`) has no `afterEach`; `toFake: [... "Date"]` has precedent (`src/composables/useArrivals.test.ts:187`).

Inferences:
- I1. With `&#` as a second trigger, the pre-check skips only files that can hold no finding, so every verdict equals today's (F3).
- I2. Faking only `Date` leaves the path's promises and timers real, so nothing waits on an unadvanced fake timer.

Asks (working assumption in force):
- A1. Widen #1112 to the same-cost scans (`recon.md` § Measurements)? Resolved by the panel: no, because that is scope expansion and each guard needs its own argument. File one open `flake` issue at close-out that lists them with their times (D2). This lane does not claim the whole suite is independent of host speed.

## Architecture & Implementation

Test-only. No production file, dependency or config changes.

- **#1226**: in `service.test.ts`, the PER-LAUNCH case fakes only `Date`. The first registration advances it 30 ms with `vi.advanceTimersByTime(30)`. The budget then moves only when a registration spends it. Add `afterEach(() => vi.useRealTimers())` to the restore describe. Add one success control: a first registration that spends 5 ms of the same 10 ms budget lets all three launch.
- **#1112**: the per-file reader starts with a substring pre-check, so only a file that can hold a finding is parsed. In `css-v-bind-ban.test.ts` the check goes in `scan`: return `[]` unless the source includes `useCssVars`, `v-bind` or `&#`. In `amount.callers.test.ts` it goes in `kinds`: return `[0, 0]` unless the text includes `balanceFormatted` or `&#`. The inline cases then run through the pre-check too. Each guard gains one inline case that only the `&#` disjunct admits: `x.vue` with `<template><span :title="&#117;seCssVars(f)" /></template>` gives `["useCssVars(…)"]`, and `kinds('<template><span :title="&#98;alanceFormatted(a, d, 8, { compact: true })" /></template>', "x.vue")` gives `[1, 0]`. Neither snippet spells the name or `v-bind`. The parse cost becomes bounded by the candidates; listing and reading every file stays (24 ms here).
- **#1241**: #1247 already fixed it (F4). `permalinks.test.ts`'s depth-1 case gains one assertion: after the gate runs, `git config --local --default "" --get remote.origin.promisor` is empty (`--local`, so a runner's inherited config cannot fail correct code). A re-added `--filter` then fails on git 2.43 and 2.56 every time, not only some of the time on 2.56. `uploadpack.allowFilter` stays on the fixture origin with a reason: it serves filters as GitHub does.
- **Comment drafts**: `scan` and `kinds`: "A file holds a finding only if it spells the name, or a template hides a letter behind a `&#` reference the compiler decodes." Fake clock: "Only `Date` is faked, so the budget moves when a registration spends it, never with the host's speed." Pin: "A filtered fetch marks origin a promisor remote, and under git 2.56 its index-pack then aborts on a shallow checkout."
- **Alternatives not taken**: D1, D3 and D5.

## Security & Adversarial Considerations

- **Threat model**: these are repository gates, not wallet code. The risk is a guard that silently stops guarding. An over-strict pre-check could hide a future `useCssVars` or a mis-optioned `balanceFormatted`. The pre-check keeps today's verdict on every file (I1), including a deliberately entity-encoded template call. The inline finding cases pass through the pre-check, and P2's mutation proof drops each of its five disjuncts in turn and names the case that goes red. In `css-v-bind-ban` that is an inline case, since `REVIEWED` is empty and the tree cases stay green whatever is skipped. In `amount.callers` the exact `CALLS` map also goes red when `balanceFormatted` is dropped. Deliberate evasion by aliasing (`const f = balanceFormatted`) is outside these name-based guards today and stays so. The pin hardens the plans gate's fail-closed fetch, and the gate is not loosened.
- **Input validation, crypto, least privilege**: N/A. No trust boundary, key or token changes.
- **Supply chain**: no dependency changes. The git 2.56 reproduction uses public images (`oven/bun:1.4.2-alpine` with Alpine edge's `git`) on the dev host only. It is not committed, and CI does not use it. The worktree is mounted read-only.

## UI impact

None. Only test files change.

## Phases

### Phase 1 — #1226: the deadline runs on a fake clock ✓
- Files: `apps/extension/src/wallet/services/account-state/service.test.ts`.
- Steps: do the change in § Architecture. Run the red/green proof as scratch, and do not commit the injection: inject a 20 ms real delay into `ensureInitialized` at the base (red) and on the fix (green), then remove it. Also mutate `expired` to report true after the first launch whenever a deadline is set, and confirm the 5 ms control goes red. Record both in `lessons/phase-1.md`.
- **Validation gate**: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && pass=0; for i in $(seq 30); do bun --bun vitest run src/wallet/services/account-state/service.test.ts --retry=0 >/dev/null 2>&1 && pass=$((pass+1)); done; echo "$pass/30"` prints `30/30`; red at the base and green on the fix. Layers: lint, typecheck, unit.

### Phase 2 — #1112: the two scans parse only what can hold a finding ✓
- Files: `apps/extension/src/utils/css-v-bind-ban.test.ts`, `apps/extension/src/utils/amount.callers.test.ts`.
- Steps: do the change in § Architecture. Run the mutation proof as scratch: drop each disjunct in turn (`useCssVars`, `v-bind`, `&#` in `scan`; `balanceFormatted`, `&#` in `kinds`). Record which case goes red for each, then revert.
- **Validation gate**: lint and typecheck as P1. Run 30 times at retry 0 with `--reporter=verbose`: `bun --bun vitest run src/utils/css-v-bind-ban.test.ts src/utils/amount.callers.test.ts --retry=0`. Pass: `30/30`, the two encoded cases green, the mutation proof red. Report each whole-tree case's maximum duration as a measurement, not a pass criterion. Layers: lint, typecheck, unit.

### Phase 3 — #1241: pin the unfiltered fetch ✓
- Files: `scripts/ci-cd/plans/permalinks.test.ts`.
- Steps: do the change in § Architecture. Run the mutation proof as scratch: put `--filter=tree:0` back into `prepareDev`'s fetch, confirm the pin fails on host git 2.43, then revert.
- **Validation gate**: `bun test scripts/ci-cd/plans/permalinks.test.ts` 30 times at retry 0 on the host, `30/30`. Run the same 30 times in the git 2.56 container, `30/30`. Run `bun run test:ci-gating` and `bun run test:release` once each, exit 0. Layers: unit (gate).

### Final gate (before the review loop and again before the PR)
`bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`, `bun run test:ci-gating`, `bun run test:release`, each exit 0; `bun run check:plans` after staging plan files. No e2e: no e2e file or fixture changes.

## Decision ledger

- **D1 (#1112 shape)**: chosen, a substring pre-check per guard. It is a necessary condition for a finding (F3, I1), it bounds the parse by the candidates, and it keeps the guards' exact assertions. It stays in `scan`/`kinds`, not in `callsTo`: `callsTo` takes any callee regex, and a necessary substring cannot be read off a regex (Codex agrees). Codex round 1 showed that a name-only check hides an entity-encoded template call. The `&#` trigger closes that and costs 2 extra parses. Rejected: `beforeAll(…, 120_000)` (the `inventory.test.ts` precedent). That moves the cost into a hook with a larger budget, which is a raise. Rejected: a shared corpus across files (`globalSetup` plus provide/inject, or a disk cache). That adds a lifecycle and staleness for two callers. Rejected: a known limit. A cheap fix of the cause exists.
- **D2 (same-cost scans)**: left out (A1). Each guard needs its own necessary-condition argument, and some have none (`type-role-ban` and `log-payload-ban` read every file). File one issue listing them (dedupe first). It states the exposure: at #1112's 4.5× load factor, the 1.5 to 1.7 s scans project to 6.7 to 7.6 s. Both legs agree.
- **D3 (#1226 clock)**: chosen, fake only `Date` and advance it inside the registration. This keeps timer ordering out of the proof. Rejected: full fake timers with `advanceTimersByTimeAsync(30)`. That depends on how the clock flushes microtasks before the mock's timer is set. Rejected: an injectable `now` in `AccountStateService`. That is a production parameter for one test.
- **D4 (#1226 control)**: add the 5 ms success control. Without it, an implementation that stops after one launch whenever a deadline is set would pass.
- **D5 (#1241)**: chosen, the pin plus F4 as evidence. Rejected: no change, because nothing deterministic would then catch a re-added filter. Rejected: dropping `uploadpack.allowFilter`, because the pin does not need it (F5) and the fixture would then stop reproducing the 2.56 abort.
- **D6**: one PR with three phases. Each phase is independent. The lane asks for one PR.

## Audit verdicts

- **Codex round 1** (gpt-6.1-sol, high): conditional approve. All five findings accepted.
  1. A name-only pre-check hides an entity-encoded template call that today's guard finds. Demonstrated: added `&#` (F3, I1).
  2. Query the promisor mark with `--local`: inherited config was shown to fail correct code.
  3. F1 deadline wording.
  4. The 500 ms pass criterion is host speed: now a measurement.
  5. Resolve A1 explicitly.
- **Opus Plan leg**: conditional approve. All four findings accepted.
  1. The mutation proof covered one disjunct of five, and css-v-bind's tree cases cannot see a skip. Demonstrated: each disjunct is now mutated.
  2. The encoded cases must pass only through `&#`, so use `:title` and `"x.vue"`.
  3. `&fjlig;` decodes to `fj`. Demonstrated: F3 now rests on the full HTML5 list.
  4. Prove the 5 ms control by mutation.
  It also confirmed that the pin cannot pass vacuously: without the fetch the verdict reads "not available locally".
- **Codex final pass** (resumed session): conditional approve on one condition. A bare `<span>` is no template to the SFC parser, so wrap the CSS fixture in `<template>`. Applied, then **approve**.

## Delivery

Single arc: branch `worktree-unit-flakes-4` → one PR into `dev`, opened only after the review loop converges. Title (73 chars): `test: three unit tests stop depending on host speed and the runner's git`. The body gives each phase's 30-run counts, the red/green and mutation proofs, the git 2.56 container counts, and `Closes #1112`, `Closes #1226`, `Closes #1241`. No label: no e2e lane is needed. Parallel lanes: none (the critical path is about an hour serial).

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at `78f5f9171e6a670279a013ddc8d32566a35478f5`. Plan-specific parts:

1. Diff review: absent (`code_review: off`).
2. Review loop, once over the whole diff from the base after the final gate: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`. Resume with `resume-codex.sh <session> <followup> <codex-dir> high`. Send the two verbatim rules from the standard and the adversarial ask. One Opus review (`Agent`, `model: "opus"`, `general-purpose`) runs alongside round 1. Hard stop at three rounds. Log each round in `lessons/phase-3.md` and under Audit verdicts.
3. Delivery as above, then `gh pr checks <n> --watch` once. A known flake gets one rerun.
4. Close-out as the PR's final commits:
   - Merge `origin/dev` first.
   - Write the Outcome. Its `Known limits:` line reads `none` unless the loop files one.
   - Promote lessons. Candidate: git 2.56's filtered-fetch abort on a shallow checkout, dated.
   - File the D2 issue.
   - Delete `STATUS.md`.
   - `git mv` the plan into `archive/` in its own commit, and move the index line.
   - Run `check:plans`. Nothing merges before the orchestrator's word.
5. Teardown after the merge: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/unit-flakes-4/plan.md`, then `agent-worktree done unit-flakes-4 --merged`. The orchestrator merges, so it notices the merge and runs this step or spawns a session for it. A `/loop` session checks on each firing.

## Seeds

```
/goal Phases 1-3 of implementations-plan/unit-flakes-4/plan.md marked ✓, each backed by its validation gate reported passing in the transcript (30/30 counts, red/green and mutation proofs); LESSONS_FILE=implementations-plan/unit-flakes-4/lessons/phase-N.md printed per phase; /code-review NOT run (code_review: off); the Codex loop converged over the whole diff (a resumed pass reporting no new material findings, quoted); one PR into dev opened only after that (`gh pr view` output), carrying the close-out archive commit (`git show --stat`); bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/unit-flakes-4 forward per its plan.md (Outcome & Quality Bar first). Each firing: reality check (plan.md, lessons/, git status, gh pr view); if the plan sits under archive/ on dev, run the teardown in Post-implementation step 5 and stop; else take the next unticked phase, run its gate exactly, tick it, log lessons; after phase 3, the review loop, then Delivery and close-out; decide with /codex high on gpt-6.1-sol, never merge, never widen scope; 5 failures on one step → reassess with codex.
```

---
plan: e2e-ci-followups-2
tier: light
base: d59459ab
trunk: dev
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
---

# e2e-ci-followups-2

Three CI bugs, one arc, one PR against `dev`: unit tests that time out on a module's first load (#500), the e2e build's inverted speed ladder (#405), and a Firefox chaos seed that once missed the capabilities window (#322). Evidence: [`recon.md`](recon.md) and [`lessons/phase-0.md`](lessons/phase-0.md).

## Outcome & Quality Bar

- **For whom**: the owner and every lane reading `quality-status`, the soak matrix and the Firefox network lane, who must trust that a red is a real defect.
- **Excellent**: (1) no touched test pays a module's first load inside a test or hook budget, shown red at base and green at head by a reproducer that delays that load, with no timeout raised and one removed; (2) every e2e build prices Normal < Fast < Urgent, proven by a unit test that runs the real parse at the CI value; (3) the next Firefox recursion names an add-on file and line.
- **Good enough**: in-body imports of modules the file already loads stay as they are.

## Findings (verified at `d59459ab`)

**#500: demonstrated, cause found.** Conditions: a full extension run (798 files, `forks`, default workers) on a loaded host. Events: a worker's first import of a module is an RPC to the one main vitest process, then (for zod) its first native load; a re-import after `vi.resetModules()` keeps the fetched code and makes no RPC. Order: `zod-jitless` makes both first loads in its test body (5 s); the relay makes its first in its first `beforeEach` (10 s). Invariant: every soak run green. Consequence: a failed compare and a two-hour re-run. Proof: the reproducer reds both at base on Bun and Node; the fixed shape stays green under the same delay. Claim that did not hold: the cost is not zod's alone; the same shape hits `presto/client.test.ts` (hook), `e2e/config.test.ts` (its 30 s timeout hides it) and `packages/wallet-bridge/src/dispatcher.test.ts:1366,1896,1944,3090` (`register`, which nothing in that file loads first). The other in-body imports reach modules their file already loaded (Opus trace).

**#405: demonstrated.** `feeMultiplierFor` gives a named speed `PRIORITY_MULTIPLIERS` and no speed `DEFAULT_FEE_MULTIPLIER`; Normal sends no speed. With `VITE_NULO_FEE_MULTIPLIER=10` a unit run at base gives none 10, Fast 3, Urgent 5. Every claim held.

**#322: plausible but unverified; its diagnostic is demonstrated blind.** Conditions: the Firefox chaos leg, seed 1960252198, 2026-10-12, before #328. Events: three `too much recursion` at `creator-DQZXbG1H.js:5` about 0.3 s after the 60 s wait armed; the window never matched. Since #328: 192 Firefox network runs, every one replaying this seed in its chaos matrix (`pr-extension-network-e2e-firefox.yml:215`), 297 green chaos jobs, 7 nightlies, no recurrence; the run kept no artifact, so line 5 cannot be mapped. One other recursion (run 38487656060, a passing test): Firefox reported `client-CKLqdVDW.js, line 1`, but the relay printed `no context: … at self-hosted:3602:21`, because it keeps only the stack's top frame. Claim that did not hold: every `#/windows/*` window evaluates the chunk at boot (one of the popup HTML's 134 module scripts), not only the JSON viewer and logger; none builds an editor at boot.

## Architecture & Implementation

- **#500**: a top-level side-effect import of the module under test, so the worker loads it during collection (`importFile(…, "collect")`, under no timeout). Per-case fresh modules stay: after it, reset and re-import only re-evaluate (17-50 ms measured for the fee graph).
- **#405**: in `fee-strategy.ts`, keep the parse line (`agent.sh` greps the bundle for ``parseFloat(`10`)``) and derive the ladder from Normal's value: scale `PRIORITY_MULTIPLIERS` by `parsed / PRIORITY_MULTIPLIERS.normal` when `parsed` is finite and at least 1 (today's domain), else by 1. Export `FEE_MULTIPLIERS` (a plain object) and `DEFAULT_FEE_MULTIPLIER = FEE_MULTIPLIERS.normal`. `feeMultiplierFor` stays `priority ? FEE_MULTIPLIERS[priority] : DEFAULT_FEE_MULTIPLIER`: unchecked, so `"bogus"` → undefined and `"constructor"` → `Object` as today, and the pins that mock `DEFAULT_FEE_MULTIPLIER: 7` hold unchanged. Production 2, 3, 5; CI 10, 15, 25.
- **#322**: the child script adds the error's reported location to each record; an exported `recentFrame(callFrames, reported)` picks the first `moz-extension:` frame of the full stack, else the reported location when it is an add-on URL, else the first frame. The parent keeps that one frame in `state.recent`, so its shape is unchanged.
- **Not taken**: loads in `beforeAll` (a 10 s hook budget; the relay fails there); a test-only reset export (production change for one caller); a mocked ladder in the fee test (never runs the real parse, both reviewers); an exported `feeMultipliers` helper (the env test makes it unneeded); a scale-factor env var (touches `agent.sh`, held by PR #477); lazy-loading `JsonViewer` (changes every window's load on an unshown cause); five local replays (CI replays the seed in every Firefox run).

## Phases

### Phase 1: first loads off the timed budgets (#500)

Change map:
- `apps/extension/src/utils/zod-jitless.test.ts`: `import "./zod-jitless"`, then `import { z } from "zod"`, in that order; the body only asserts.
- `apps/extension/src/wallet/services/wallet-sdk/content-message-relay.test.ts`, `apps/extension/src/presto/client.test.ts`: `import "./content-message-relay"` (`"./client"`); replace the hook comment with one line: loaded during collection, so each case's re-import only re-evaluates it.
- `apps/extension/src/e2e/config.test.ts`: the same for `./config`; delete `FRESH_IMPORT` and its comment.
- `packages/wallet-bridge/src/dispatcher.test.ts`: `import "@nulo/wallet-sdk-schema-patch/register"` at the top, as `method-descriptors.test.ts:1` does; delete the four in-body `register` imports.

Steps:
1. Build the reproducer under `~/.cache/nulo-backlog/e2e-ci-followups-2/slow-fetch/`: a config that spreads `apps/extension/vitest.config.ts` and adds a `load` hook that waits 12 s for the five modules (`register.ts` included).
2. Run it on the base files on Bun and Node: `zod-jitless`, relay, presto and the `register` cases red; `config` green only through its 30 s.
3. Make the edits. Run it again: all five files green on both engines, default timeouts.

Gate: the five files through `bun --bun vitest run …` and `bun run vitest run …` (Node) from `apps/extension`, and `bun run --cwd packages/wallet-bridge test`, exit 0; the reproducer red at base and green at head on both engines, in `lessons/phase-1.md`; the full extension suite once per engine (`bun run test` and, from `apps/extension`, `bun run vitest run`), exit 0; `bun run lint`, `bun run typecheck:all` exit 0.

### Phase 2: one ladder for every speed (#405)

Change map:
- `apps/extension/src/wallet/services/execution/fee/fee-strategy.ts`: `FEE_MULTIPLIERS`, `DEFAULT_FEE_MULTIPLIER`; the doc comment states the scaled ladder.
- `apps/extension/src/wallet/services/execution/estimate-reuse-shared.ts`: `feeMultiplierFor` reads `FEE_MULTIPLIERS`; drop the unused `PRIORITY_MULTIPLIERS` import.
- `apps/extension/src/wallet/services/execution/estimate-reuse-shared.test.ts`: a `describe` for `feeMultiplierFor`, with `afterEach` `vi.unstubAllEnvs()` and `vi.resetModules()`. Control: the file's static import (env unset) gives none 2, `normal` 2, `fast` 3, `urgent` 5. CI value: `vi.stubEnv("VITE_NULO_FEE_MULTIPLIER", "10")`, reset, re-import; none 10, `normal` 10, `fast` 15, `urgent` 25.
- `apps/extension/tests/e2e/network/same-token-concurrent-sends.test.ts:669-670`: delete the sentence that states the inversion; the case stays.
- `.claude/skills/e2e-testing/SKILL.md:200`: CI's `10` is Normal's multiplier and scales Fast and Urgent with it.

Gate:
- `bun --bun vitest run src/wallet/services/execution` from `apps/extension`: exit 0, both pin files unchanged; the test file on Node too. At base the CI-value case fails (`[10, 3, 5]`); record it in `lessons/phase-2.md`.
- Chrome, the CI env, from the root: `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 VITE_NULO_FEE_MULTIPLIER=10 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/same-token-concurrent-sends.test.ts tests/e2e/network/popup-escape-layered.test.ts`. Pass: ``bundle contains parseFloat(`10`) ✓``, all cases green, no Fee Juice shortfall at the 25× Urgent cap.
- `bun run lint`, `bun run typecheck:all`, `bun run test:all` exit 0.

### Phase 3: a readable Firefox exception, one seed replay (#322)

Change map:
- `apps/extension/tests/e2e/fixtures/browser/firefox-page-errors.ts`: `recentFrame`, serialized into the relay as `errorFrames` is; the child's record carries the reported location; `state.recent` keeps `recentFrame`'s result.
- `apps/extension/scripts/e2e/firefox-driver.test.ts`: one `test.each` on `recentFrame` (a self-hosted top above an add-on frame → the add-on frame; only built-in frames and an add-on reported location → that location; neither → the first frame) and one run of its serialized form, as `kindOf`'s test does.

Warning: run steps 2-3 only after 23:00Z or with load1 under 60, never beside another `e2e:agent` run in this worktree.
1. Make the change; run the unit test.
2. Run `NULO_E2E_BROWSER=firefox bun run test:e2e -- --retry=0` from `apps/extension` (the fixture runs in every Firefox launch).
3. Run once from the root: `NULO_E2E_BROWSER=firefox NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NULO_E2E_CHAOS=1 NULO_E2E_CHAOS_SEED=1960252198 VITE_NULO_FEE_MULTIPLIER=10 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/send-chaos.test.ts`. Log the `[send-chaos] seed=` line, the result and the exception line in `lessons/phase-3.md`.
4. A red run: read it in the order #322's comment gives; fix only a cause a log names and only inside this plan, else stop and report.
5. A green run: #322 closes at close-out as `known-limit`, citing the CI record.

Gate: the unit test exit 0 on Bun and Node; the Firefox smoke suite green at retry 0; the replay at retry 0 through `agent.sh`, logged; no row for this worktree left in `~/.agents/ports.md`; `bun run lint`, `bun run typecheck:all` exit 0.

## Security & Adversarial Considerations

- **Threat model**: test, harness and CI code, plus one build-time constant that CI sets, never a user or a dApp. A production build leaves it unset and prices 2, 3, 5 as today. Were a release build ever to carry it, three speeds would widen instead of one: larger caps and false Fee Juice shortfalls, today's effect on Normal (exploitability unknown; no new boundary).
- **Targets**: the fee cap stays an upper bound the wallet computes; the unknown-priority throw behind the popup RPC boundary is unchanged, its pins byte-identical. The relay reads Firefox's own frames in a test browser.
- **Least privilege, supply chain, cryptography**: no workflow, permission, dependency or crypto change.

## Assumptions

Facts:
1. vitest 4.1.10 collects a file with no timeout and runs tests and hooks under `withTimeout` (`@vitest/runner/dist/chunk-artifact.js:2457,1787,724`); setup files run before collection (`:2449-2457`).
2. A re-import after `vi.resetModules()` makes no RPC (`startVitestModuleRunner.DB-7oCpn.js:709`; `utils.BX5Fg8C4.js:29-43`); the prototype in `lessons/phase-0.md` shows it.
3. The soak failures are `zod-jitless.test.ts:3` (test body) and `content-message-relay.test.ts:17` (first `beforeEach`).
4. `feeMultiplierFor` is `priority ? PRIORITY_MULTIPLIERS[priority] : DEFAULT_FEE_MULTIPLIER` (`estimate-reuse-shared.ts:125-127`); Normal sends no `priorityLevel` (`fee-helpers.ts:103`); nothing else prices a speed.
5. `agent.sh:208-214` fails a run whose bundle lacks ``parseFloat(`<value>`)``.
6. Two e2e files press Fast or Urgent: `same-token-concurrent-sends.test.ts` and `popup-escape-layered.test.ts:176-195`; `send-chaos.test.ts` draws no speed.
7. `vi.stubEnv` reaches `import.meta.env?.VITE_NULO_FEE_MULTIPLIER` after a reset and re-import (measured on both engines).

Inferences: (1) the sandbox accounts hold enough Fee Juice for a 25× Urgent cap (Phase 2's e2e proves it); (2) Firefox reports an add-on location for an add-on recursion, as both CI logs show; a recursion entirely in built-in code still prints today's line.

Asks: none open.

## UI impact

None. No screen, copy or behaviour a person sees changes; production pricing is unchanged.

## Audit verdicts and decision ledger

- **Codex (gpt-6.1-sol, high), round 1**: `conditional approve`. (1) Medium: the mocked fee test bypasses the real parse: **adopted**, as the env-stub re-import test (Codex proposed two env runs of a static test; rejected because CI's unit run would only cover the unset case). (2) Medium: `dispatcher.test.ts`'s `register` import has the same shape: **adopted**. (3) Low: eight kept frames may lose the add-on frame: **adopted**, the selection runs on the full stack and keeps one frame. Also: Fact 6 too broad: **adopted**.
- **Opus (Plan), round 1**: `conditional approve`. F1 = Codex (1), same fix: **adopted**. F2 Fact 6 false; add `popup-escape-layered.test.ts` to the gate: **adopted**. F3 = Codex (2): **adopted**. F4 fall back to the reported location, not the first frame: **adopted**. F5 stale hook comments: **adopted**. F6 one replay, not five (CI replays the seed in every Firefox run): **adopted**. F7 zod wording: **adopted**.
- **Disposition of #322**: both legs: a `known-limit` close after a green replay, citing the CI record; lazy-loading `JsonViewer` rejected (unshown cause, changes what windows load).
- **Codex round 2** (resumed, verification): `approve`; no remaining material finding, no disposition disputed. Open inferences (Fee Juice at 25×, a reported add-on location) close at their gates.

## Delivery

One arc, branch `worktree-e2e-ci-followups-2`, one PR against `dev` after every gate passes and the Codex loop converges; `code_review: off`. Title: `fix(ci): keep cold imports off test timeouts and scale the e2e fee ladder` (75 characters). Body: what and why, the validation runs, `Closes #500`, `Closes #405`; `Refs #322` with its disposition (`Closes #322` only if Phase 3 fixed a cause). No labels at creation: the path filters on `apps/extension/src/**` and `tests/e2e/fixtures/**` run every e2e lane on both browsers. No e2e scenario is added.

Issue → arc: #500, #405, #322 → this arc. Parallelism: disjoint files, short phases; no lanes.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at `d59459ab`, with:

1. Diff review: absent (`code_review: off`).
2. Review loop, once, after Phase 3: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol` over `git diff d59459ab...HEAD`, the plan and both rules verbatim; resume with `resume-codex.sh`; stop at three rounds.
3. Delivery as above, then `gh pr checks <n> --watch`.
4. Close-out as the PR's final commits, after merging `origin/dev`. If Phase 3 stayed green: label #322 `known-limit` and close it as not planned, with a comment giving the hypothesis (a recursion in the boot-evaluated `creator` chunk broke the capabilities window), the consequence (one red on a required Firefox check, cleared by replay), the unverified step (no run of about 150 seed replays since recorded it; the 10-14 recursion in `client-*.js` was non-fatal), the disposition, and the reopening condition (a CI or nightly `waitForTarget` timeout, or a `too much recursion` whose new location line names a window's chunk). The Outcome says `Known limits: #322`.
5. Teardown: once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/e2e-ci-followups-2/plan.md` succeeds, `agent-worktree done e2e-ci-followups-2 --merged --trunk dev` (no `ExitWorktree`: no session entered through it). Relay a refusal.

## Seeds

The orchestrator owns the ELI5 and the seeds; these are drafts.

```
/goal Phases 1-3 of implementations-plan/e2e-ci-followups-2/plan.md marked ✓, each gate passing in the transcript; LESSONS_FILE=implementations-plan/e2e-ci-followups-2/lessons/phase-N.md printed per phase; /code-review NOT run; the Codex loop over git diff d59459ab...HEAD converged (a resumed pass with no new material finding, quoted); one PR against dev opened after it, with the close-out's archive-move commit (git show --stat); bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/e2e-ci-followups-2 per its plan.md: reality check (plan.md, lessons/, git status, gh pr view), the next unchecked phase and its gate, the Codex loop after Phase 3, then Delivery and close-out; Phase 3's e2e waits for 23:00Z or load1 < 60; never merge; after the merge run Post-implementation step 5 and stop.
```

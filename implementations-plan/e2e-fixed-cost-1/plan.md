---
plan: e2e-fixed-cost-1
tier: mid
status: planned, Codex approve
issues: "#991 (closes on arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex audit (gpt-6.1-sol high) plus one Opus Plan leg; final fresh Codex pass
base: origin/dev at b3d6e0a2a
trunk: dev
post_implementation_hardening: not scheduled
---

# e2e-fixed-cost-1: the per-file cost of launching a browser and onboarding a wallet

One arc, one PR against `dev`, `Closes #991`. Test harness only: no product code, no screen changes.

**The measured answer to #991.** Neither lever the issue names is built. A reused onboarded state per worker is unsafe on network and saves too little on smoke (D1). Paying the aztec.js import once per worker needs shared module state across files (`isolate: false`), so a file's starting state would depend on the files before it, which #991 rules out; the cheaper per-fork import, native `@aztec` loading, waits on upstream (D2, a known limit). What the arc builds removes the one launch cost the measurement found wasted outright, at its cause:

1. **Every launch installs.** Chrome's `--load-extension` and Firefox's temporary add-on both report `install` on each start, so the first-run tab opens on every launch. Over a profile whose onboarding is already complete, the page turns itself into a popup window before the launch looks for the tab: the launch waits its full 5 s for nothing and leaves that window open for the whole file. The launch now closes whichever the sequence left, the tab or the window, and fails if it left neither; a fresh install still must show its tab (Phase 1).
2. The worker's liveness is polled at the suite's 200 ms instead of 500 ms (Phase 1).

**Invariant kept:** every test file runs in its own process, against a browser and a profile created for it (or for its test). No state crosses files today and none starts to.

## Outcome & Quality Bar

- **For whom:** every contributor and every PR waiting on the smoke and network lanes; the next agent who opens #991's question.
- **Excellent:** (1) each removed cost names its cause and its measured saving per browser, from paired runs on one host and from the PR's CI lanes; (2) no fixture's starting state, assertion or scope changes, and the 31 files that prove a clean install still do; (3) the reuse and native-loading verdicts are recorded with their numbers where the next lane looks (the e2e-testing skill, a known-limit issue), so neither is walked again; (4) the PR body gives each browser's suite wall-clock before and after.
- **Good enough:** what a fresh install costs by nature (browser start, the worker's boot, the onboarding UI, the dApp connect) stays.

## Assumptions

**Facts** (recon.md has the trails and the run records)
- F1. Every e2e config runs each file in its own fork: `pool: "forks"`, `isolate: true`, `fileParallelism: false` (`apps/extension/vite.shared.ts:132-137`).
- F2. A fresh launch + `registerProfile` + close costs 5.0 s on Chrome (launch 2.7, of which the liveness wait 2.0) and 9.2 s on Firefox (launch 4.4, of which the driver 3.2), medians of five (recon § Probes).
- F3. Launching over a copied onboarded profile, plus unlock, saves 0.7 s (Chrome) and 1.1 s (Firefox) per registered launch, the first-run wait excluded.
- F4. Every launch fires `onInstalled` with `reason: "install"`, fresh or reused profile: 4 of 4 relaunches per browser in the relaunch probe; `fixtures/browser/index.ts:216-218` documents it for a replaced directory. Where `nulo:onboarding:completed` is already true, the onboarding page opens a `type: "popup"` window on `src/popup/index.html`, then removes `nulo:onboarding:tab-id`, then closes itself (`apps/extension/src/onboarding/app.vue:51-72`). When that ends before the first read, `settleLaunchedExtension`'s read (`apps/extension/tests/e2e/fixtures/extension.ts:292-304`, 20 × 250 ms) waits its full 5.0-5.2 s, and the window (`#/popup/auth`) is still open after the settle and 3 s later, on both browsers. Its page is visible as a Puppeteer page target on both browsers (`relaunch-chrome-2`, `relaunch-firefox-2`), the channel `waitForPopup` already uses; `chrome.windows.getAll({ populate: true })` hides its tab URL on Chrome, which lacks the `tabs` permission. Baseline: 7 such launches on Firefox smoke shards 2/3 (36 s, `migration` 6, `legal-acceptance` 1), 1 on Chrome's (5 s), none on network.
- F5. The settle's comment ("a reused profile ... opens no tab") and the e2e-testing skill ("a reused `userDataDir` opens no tab", `.claude/skills/e2e-testing/SKILL.md:547`) state the opposite of F4.
- F6. An unowned first-run surface fed a popup-diff flake before: the skill's ledger row 2 (`wallet-locked-mid-session`, `Expected no popup but 1 new popup target(s) appeared: …#/popup/auth`), fixed by an identity-keyed diff and by closing the tab before the flag flip.
- F7. The liveness wait polls every 500 ms (`extension.ts:280`); Chrome's fresh samples land at 2014-2027 ms, the fourth poll.
- F8. `networkRunner()` inlines every `@aztec` package (`vite.shared.ts:156-160`) because four packages `import()` JSON without `with { type: "json" }`, which Node 24 refuses: about 110 literal sites in 15 files of `@aztec-labs/accounts`, `noir-protocol-circuits-types` (99 sites in 2 files), `protocol-contracts`, `standard-contracts`. Inlined, a fork's aztec.js import takes 4.1-5.8 s and the first fork of a run 22-25 s; natively (with an attribute-adding load hook) 2.1-2.5 s (recon § The aztec.js import).

**Inferences**
- I1. A reused-profile launch ends the first-run sequence in one of two states within the 5 s budget: the tracked id (the page has not converted yet, or its read is held behind the migration-aware storage facade) or the popup window (it has converted). F4 says install fires on every launch; the SW stores the id right after `tabs.create` with raw session and tab APIs, and the page creates the window before it drops the id. A launch showing neither is a broken launch, so the wait is required on every launch. A fresh profile cannot convert (its completed flag is unset until the settle sets it), so there the id alone is accepted, as today.
- I2. When the read finds the id while the page is already creating its window, closing the tab can still leave the window. That race exists today, unchanged by this arc; no test failure has been traced to it since F6's fix. Plausible but unverified; left as is (D4). The code path is unchanged; its incidence may move, since the 200 ms liveness poll changes when the read runs. A gate run that observes a surviving popup is new evidence and reopens D4; a passing probe is an observed result, not proof the race cannot happen.

**Asks:** none. Nothing here is visible to a person, and no coverage moves.

## The two levers #991 names, measured

### D1: a reused onboarded state per worker

| Candidate | Saves | Breaks or costs |
|---|---|---|
| A stored onboarded profile per run, copied per launch, smoke only | 0.7 s (Chrome) / 1.1 s (Firefox) per registered launch, about 3.5 % of smoke's critical shard | A template lifecycle in global setup; every reused launch starts locked and is unlocked, not registered; inside run-to-run noise (about ±100 s per shard, #978) |
| The same, network | — | One seed means one account on the shard's one sandbox: `tokenReadyExtension` mints 1000 and waits for exactly 1000 (`extension.ts:869`), so the second file sees 2000. Demonstrated by trace |
| One browser per worker | Chrome start and close (0.8 s), Firefox driver and close (about 4.7 s) per launch | Neither browser hosts a fresh extension profile beside another; a reset in place shares HTTP cache, other origins' storage, windows and permissions across files |
| aztec.js once per worker (`isolate: false`) | the per-fork import | Every module-level `let` in fixtures and helpers outlives its file: a leak is no longer impossible by construction, against #991's "every file's starting state independent of the file before it" |

Not justified on the current evidence. The 31 files that test onboarding, import, restore, migration or update need a clean install whatever is chosen.

### D2: native `@aztec` loading (a known limit)

Saves about 20 s per vitest process (the first fork's transform) and about 3 s in each isolated fork that loads aztec.js (about 70 network files per browser): roughly 3 % of network file time. It cheapens the import per fork; it does not share it across files. Every route to it was weighed:

| Route | Verdict |
|---|---|
| A `module.registerHooks` load hook adding the JSON attribute for the four packages | A process-global patch of Node's loader to accept what Node refuses: the owner's no-monkey-patch rule. Needs the owner's exception, not recommended |
| Patch the four packages (`patchedDependencies`) to add the attribute | About 110 sites in 15 files of Apache-2.0 packages the product bundles: product bundle inputs, modification notices, regenerated at every Aztec bump. Too much mass for a test-speed gain |
| vitest's SSR dependency optimizer (`deps.optimizer.ssr`) | Tried twice in scratch: it bundles Node builtins as their npm stand-ins (`buffer.constants` undefined in pino's `thread-stream`), `platform: "node"` included. Fixing it means resolver overrides inside a bundle of the whole Aztec stack |
| Upstream adds `with { type: "json" }` | The cause. Then the inline and `noirAliases` go and nothing is added |

Filed in arc 1 as a closed `known-limit` issue: the measured gain, the three rejected routes, and the reopening condition (the four packages carry the attribute on the installed Aztec line, a demonstrated clean fix in vitest's or vite's optimizer or resolver, or the owner grants a loader-hook exception).

## Architecture & Implementation

### Phase 1: the first-run settle and the liveness poll

- `apps/extension/tests/e2e/fixtures/extension.ts` `settleLaunchedExtension`: the first-run read keeps its 20 × 250 ms budget and settles on the tracked id (close that tab, remove the key) on every launch; on a reused profile it also settles on the converted window: a `page` target of the browser whose URL starts with `extensionUrl(extensionId, "/src/popup/index.html")` (the exact extension origin and popup document, any route), closed through its page and confirmed by the page's `close` event, since Puppeteer's BiDi `close()` swallows a failed close: `closeConfirmed` (`fixtures/wallet-pages.ts:150`) is exported with a caller-named message and reused, not copied. Every match found in the settling iteration is closed. The loop is `pollUntil` (`fixtures/poll.ts`) at 250 ms for 5 s, replacing the in-page loop. Finding nothing throws on every launch; a fresh profile still requires the id. The comment says why (every launch installs; a completed onboarding turns the tab into that window), and `launchExtension`'s `freshProfile` comment is rewritten to what the flag now decides (the legal seed, the id requirement).
- `apps/extension/tests/e2e/fixtures/wallet-pages.ts`: `closeConfirmed(page, what)` exported; `openPopup`'s call passes its own wording, so its message is unchanged.
- `settleLaunchedExtension` again: the liveness wait drops its `polling: 500`, so the patched page's 200 ms applies (`fixtures/dom.ts` `patchPagePolling`).
- `.claude/skills/e2e-testing/SKILL.md`: § first-run tab corrected (every launch installs; the settle closes the tab or the window it became); § Runtime budget gets three lines: the fixed cost per launch per browser (F2), the reuse verdict (D1) and the native-loading known limit (D2), each with its number.
- No unit test: the read needs a browser. Proof by e2e below, and by an asserting relaunch probe (scratch, never committed; Validation).

### Trade-offs and alternatives not taken

- **Skip the read on a reused profile** (the first draft): F4 shows the tab does open there; skipping it would leave the window and, where the page has not converted yet, an unowned onboarding tab.
- **Key the end state on the stored `nulo:onboarding:completed`:** it says which state the page will reach, not when: a page that has not read the flag yet still holds its tab (every Chrome `migration` relaunch in the baseline found the id), so the launch would still have to accept both. The two-signal read needs no model of the page.
- **The script wallet set up during the launch** (first draft's Phase 2): dropped. The two would share the fork's event loop with the egress guard's 5 s canary budget, cleanup on a failure would have to reach inside `launchOnLocalNetwork` and `createTestWallet`, and the saving is bounded by about 31 files' script phase. Both audits argued against it as drafted.
- **An isolation pin test** (first draft's Phase 4): dropped. Nothing in this arc shares state across files, and a test that asserts three config values is a change detector, not a proof; the lane's hard rule (a leaked state made impossible, with a test) binds a reuse design, which D1 declines, and keeping today's isolation adds no reset obligation.
- **The liveness wait on `storage.onChanged`:** exact, but more code for a fraction of a second; the suite's 200 ms poll is enough.

## Security & Adversarial Considerations

- **Threat model:** test infrastructure only; nothing ships in the extension. The settle closes only windows and tabs of the extension's own documents, in a browser the run owns.
- **Supply chain:** no new dependency; `bun.lock`, the age gate and the frozen install are untouched. No module-loading change (D2).
- **Egress:** the guard, canary and stand-in node are untouched.
- **What could go wrong:** (a) a launch whose first-run sequence never runs (the worker dies before `onInstalled`) now fails loudly on a reused profile too, which today passes silently; (b) the I2 race, unchanged; (c) a future first-run flow that opens a different surface fails the launch at once, naming both states it looked for.
- **Secrets:** none touched. The Testnet endpoint file is never opened.

## UI impact

None. No screen, copy or layout changes; test harness only.

## Validation

- **Fast layers:** `bun run lint`, `bun run typecheck:all`, `bun run test`.
- **Run commands:** smoke `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- <files> --retry=0` (armed build first, as `global-setup-smoke.ts` prints); network `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_RETRY=0 bun run e2e:agent <files> --retry=0`; Firefox: the same with `NULO_E2E_BROWSER=firefox`. Load1 logged with every run.
- **Paired local measurement:** base = the arc's fixture diff reverted with `git apply -R` from a saved patch (no rebuild: the diff touches no build input), branch = the diff applied; three interleaved base/branch pairs per browser on `migration` and `legal-acceptance`; report per-file duration medians (the changed wait runs inside the fixture, so it lands in the file's duration) and vitest's `Duration` line as it prints it: transform, import (its summed collection), tests, and total wall-clock.
- **CI measurement:** the skill's suite wall-clock (§ Runtime budget: the `Run / …` job envelope of a first-attempt success), per lane and browser, before = the latest such run of the workflow on another PR, after = this PR's; plus vitest's per-file durations of the relaunch files from both runs' logs. CI is context: another PR's run, setup time and whole-minute rounding blur a gain this size, so attribution comes from the paired local runs.

### Phase 1 gate (the arc gate)

- Fast layers, `bun run test:all`, `bun run check:plans` after staging: exit 0.
- Asserting relaunch probe on both browsers, retry 0: five fresh launches and five relaunches over one registered profile, each launch timed; it asserts that no page target on the popup document exists right after each relaunch's settle and 3 s later, and that the relaunch median is within 1 s of the fresh median. Negative control: the same probe on base fails its cleanup assertion (the baseline runs show the window at both snapshots).
- Smoke on both browsers, retry 0: `migration`, `legal-acceptance`, `restore-outcome`, `backup-roundtrip`, `import-dead-rpc`, `import-errors-scroll`, `registration`, `onboarding-tab` (the fresh path still requires the id): green. Then the full smoke suite on each browser: green.
- Network on both browsers, retry 0: `backup-restore-integrity`, `restore-again`, `account-balance-orphans`, `backup-migration-roundtrip`, `wallet-locked-mid-session`, `holdings`: green. The full network suites run on the PR's CI (both lanes' path filters trip on `tests/e2e/fixtures/**`).
- A red file gets one rerun only if it is a known flake in the skill's ledger; otherwise a fix.
- The paired and CI measurements written into `lessons/phase-1.md` and the PR body, with a complexity section: CI jobs unchanged; a new test file needs nothing; the settle gains one branch (a reused profile also accepts the converted window).

## Decision ledger

- **D1 No reused onboarded state per worker:** the table above.
- **D2 No native `@aztec` loading in this arc:** a known limit, filed and closed in arc 1; every route weighed above.
- **D3 No concurrent script setup** (first draft's Phase 2): the reasons above.
- **D4 The first-run settle required on every launch:** the tracked id on a fresh profile, the id or the converted window on a reused one (F4, I1), the window found through page targets. The I2 race stays as it is: closing it needs coordination with the page, more than the case warrants.
- **D5 Liveness at the suite's 200 ms poll.**
- **D6 No isolation pin:** the reasons above.
- **D7 Measure with paired local runs plus the PR's CI lanes,** the skill's suite wall-clock method.

## Audit verdicts

**Round 1, Codex (gpt-6.1-sol, high): reject.** Blocking: (1) the JSON-attribute hook is a monkey-patch of Node's loader: accepted, the phase is out (D2); its suggested fix, patching the packages, was weighed and declined on mass. (2) `alongside` cleanup cannot reach resources leaked inside `launchOnLocalNetwork` and `createTestWallet`: accepted, the phase is out (D3). (3) The isolation pin proves config values, not file independence: accepted, dropped (D6). (4) The gates measured the wrong quantity (per-file durations exclude collection and import): accepted, collection, import and tests are reported apart. Non-blocking, accepted: the F6 inventory (now F8, recounted), the scratch hook's acceptance of a wrong attribute type (moot), D1 worded as "not justified on the current evidence", and the reused-profile skip (D4 of the first draft) unsafe, which the relaunch probe confirmed.

**Round 1, Opus Plan leg: conditional approve.** (1) High: the reused-profile skip rests on a false fact: confirmed by the relaunch probe (F4), the phase redesigned (D4). (2) The Phase 1 unit test could not spawn Node under `bun --bun vitest`: moot. (3) Phase 2 shares the event loop with the guard's canary: accepted (D3). (4) Gates: measure paired, interleaved, three pairs, compare per-file medians on CI, let CI run the full network suites: accepted. (5) The pin is a change detector: accepted (D6). (6) `UPDATE.md` and the hook's scope: moot. Its question "is Phase 2 worth it": no.

**Round 2, Codex (resumed): conditional approve.** Round-1 findings verified resolved. Conditions, all accepted: (1) Chrome hides a popup window's tab URL from `windows.getAll` without the `tabs` permission (the probe's `"tabs":[null]`), so the window must be found another way: through page targets, shown on both browsers (F4, Phase 1). (2) The draft dropped the fresh-install id requirement while its gate still claimed it: the requirement stays (I1, D4). (3) vitest prints `import` as the summed collection, so the measurement names transform, import, tests and total; CI is context, not attribution. (4) Chrome's relaunches took 7.6-8.8 s (recon). Also taken: D2's per-fork wording and a vitest/vite fix as a reopening condition; I2's probe result worded as observed, not proven. Codex's round-1 Node objection concerned `_unit-tests.yml` setting up Node 24 after `test:all`; moot.

**Final fresh Codex pass (new session): conditional approve.** Conditions, all accepted: (1) a popup close is confirmed by the page's `close` event, as `closeConfirmed` does, since Puppeteer's BiDi `close()` resolves on a failed close (Phase 1); (2) the relaunch probe only logged: it now asserts cleanup at both snapshots, times fresh launches against relaunches, and has a negative control on base (gate); (3) #991 states starting-state independence, not the "made impossible, with a test" wording, which is the lane's rule, nor an `isolate: false` ban: quotations corrected. Also taken: `pollUntil` for the loop instead of a new polling shape; I2 worded as an unchanged path whose incidence may move. Independently reproduced: the fresh-cycle medians (4,996 ms Chrome, 9,212 ms Firefox) and the 112 sites in 15 files.

**Final pass, verification turn (resumed): approve.** All five points resolved in the text, no regression from the edits; D1, D2 and the fresh-profile id requirement intact.

## Delivery

- **Arc 1** = Phase 1, branch `e2e-fixed-cost-1-a1` off `origin/dev` with this plan's commit cherry-picked first; one PR against `dev` (the orchestrator's D-orch-1: no stack), ready. Title: `perf(e2e): settle every launch on its first-run surface, poll liveness at 200 ms` (80 characters). Body: what changed and why, the measured tables per browser, the validation runs, the complexity section, the D1 and D2 verdicts with the known-limit issue, `Closes #991`. No label at creation; the fixture path trips both lanes' filters.

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at `b3d6e0a2a`. Plan-specific values:
- **Diff review:** `code_review: off`; the step is absent.
- **Review loop**, once over the arc diff after the gate: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; the prompt carries the diff from `origin/dev`, this plan and its ledger, the adversarial ask and the README's two rules verbatim. One Opus `general-purpose` review of the same diff beside round 1. Hard stop at three rounds; log each in `lessons/phase-1.md` and under Audit verdicts.
- **Delivery:** `gh pr create --base dev`, then `gh pr checks <n> --watch`; one rerun for a known flake. Never merge.
- **Close-out** as the PR's final commits: merge `origin/dev` and read `index.md` and `lessons.md`; the `## Outcome` block with `Known limits: #<D2's issue>`; lessons only within the 8 KiB budget; delete `STATUS.md`; `git mv implementations-plan/e2e-fixed-cost-1 implementations-plan/archive/e2e-fixed-cost-1` in its own commit, index line moved to `archive/index.md`; `bun run check:plans` green after staging.
- **Teardown after the merge** (standing authorization): once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/e2e-fixed-cost-1/plan.md` succeeds, run `agent-worktree done e2e-fixed-cost-1 --merged`; relay a refusal, never force.

## Seeds (draft until approval)

```
/goal Arc 1 of implementations-plan/e2e-fixed-cost-1/plan.md done: Phase 1 marked ✓ with its gate reported passing in the transcript and its measured numbers; the D2 known-limit issue filed and closed; the Codex loop (gpt-6.1-sol high) converged on the arc diff, quoted; the PR open against dev with Closes #991 (gh pr view output).
```

```
/loop 15m Drive arc 1 of implementations-plan/e2e-fixed-cost-1 per its plan.md (plan.md is the state). Next unchecked step, fast gates after each edit, signed commits. After the gate run the Post-implementation loop, open the PR, watch checks, report and stop. Never merge.
```

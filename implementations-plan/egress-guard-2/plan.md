---
plan: egress-guard-2
tier: light
status: planned, final Codex approve; arc 1 next
issues: "#836 #835 (arc 1 closes both)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex audit (gpt-6.1-sol, high) with resumes; one Opus Plan leg
base: origin/dev at 19399c82
trunk: dev
post_implementation_hardening: not scheduled
---

# egress-guard-2: fail the guard's close on a node request the stand-in missed

One arc, one PR against `dev`. #836: a Testnet-node request that reaches the egress guard while the launch's stand-in holds the node's origin fails the launch's close. #835: the e2e-testing skill and `FIREFOX.md` describe the guard as it is. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md).

**UI impact:** none. Every change is a test fixture, a unit test or a doc; the lane brief's no-ask record: "None: test fixtures, test docs and the e2e skill. No product file changes."

## Outcome & Quality Bar

For the next contributor whose change breaks the stand-in's coverage (a filter, a Chrome bump, a new target type). Excellent: (1) a launch in which some target dials the Testnet node past the interception fails at its close, naming the host and the count, on both browsers; (2) a background kill or a spec's own interception never causes that failure; (3) the skill, `FIREFOX.md` and the README say the same thing as the code. Good enough: the failure names the host and the count, not the target; finding the target is a debugging step (an omitted target makes no interception log line). The boundary limits in I2 stay, stated where the rule is.

## Assumptions

**Facts** (verified at 19399c82):
- F1 The guard keeps one `{host, port, count}` per `host:port`, with no hook or timestamp (`fixtures/egress-guard.ts:205-210`). `lb.drpc.live` is in `DECLARED_REFUSALS` (`:72-76`), so `undeclared` passes it (`:122-127`); the close can still fail on a live host, the canary or the interception's own failures.
- F2 `Standing.current` is undefined while a spec's interception or a kill has the origin, while a suspend drains and a re-arm runs, after a failed re-arm and after the hold's `stop()` (`fixtures/browser/standing-interception.ts:48-51`, `:59-69`, `:104-108`). It is still set while the browser closes: `node.stop()` runs after the close (`egress-guard.ts:336-344`).
- F3 Every `stopBackground` releases through `whileReleased` (`fixtures/browser/index.ts:278-279`); every spec interception goes through `standing.intercept` (`:255-260`). `holdNode` runs after the canary proof (`egress-guard.ts:415`); `holdNodeStub` is the only caller of `holdRpcInterception` (`fixtures/node-stub.ts:47`).
- F4 Chrome's re-arm returns after each existing target's `Fetch.enable` and its `Runtime.runIfWaitingForDebugger` round trip; a new target of an attached type is held until armed, a page is never attached (`fixtures/browser/chrome-rpc-intercept.ts:8`, `:105-117`). Firefox's interception is one parent-process observer for every context (`firefox-rpc-intercept.ts:38-52`). Neither arm reaches back to a request issued before it took effect.
- F5 Measured by ci-e2e-hygiene-1 (its `lessons/phase-5.md`): the allow-list filter let Chrome's new offscreen document dial the node, 24 refused attempts in a green passkey canary run. With today's filter `lb.drpc.live` never reached the guard over the first 82 Chrome network files (135 launches) and all Firefox network files (175). In smoke it reached it once each in `type-roles`, `contacts-import`, `sw-resilience` and `passkey-retry` on Chrome, twice on Firefox. Those are per-file totals, not timed against any window, and `passkey-retry` has no kill or swap (a fresh launch per test, most tests ending on Home), so its record is unattributed: before the hold, at teardown (I4), or a genuine miss.
- F6 No test pins `DECLARED_REFUSALS` or any guard wording in the docs; the `undeclared` unit test does need `lb.drpc.live` declared, and it stays declared (recon; `scripts/e2e/egress-guard.test.ts:181-183`).
- F7 #835's three passages hold as filed. The same passages also say `liveNode` (the option is `live`) and one `DIRECT` line (now one per CRS host, two more on the live launch); `FIREFOX.md:48` and `:71` and the README's opening line carry the same drift (recon, Codex r1 #6).
- F8 Both e2e configs retry twice unless `NULO_E2E_RETRY` says otherwise (`vitest.e2e.network.config.ts:24-28`, `vitest.e2e.config.ts:27`). CI's PR network workflows pass `0`; the PR smoke workflows pass nothing, so CI smoke retries twice.
- F9 No page or playground code dials the node: pages reach it through the background's `NetworkService` (`src/wallet/runtime.ts:513`), the playground has no node client, and the suite's one page-side node fetch (`shipped-token-list.test.ts:36-65`) runs only in the live launch, which holds no stand-in (`fixtures/extension.ts:177-179`).

**Inferences** (audits, attack these):
- I1 `held` counts proxy attempts that arrive while the launch's handle reports the origin held. It does not name their source. Outside the boundaries in I2, such an attempt is a request no armed interception paused.
- I2 Plausible, unverified, both directions. A request issued just before an arm takes effect (the hold, or a re-arm after a kill or a spec's interception) can reach the guard after `current` is set: a false red. A missed request whose proxy attempt lands after a suspend began is not counted: a false green near a boundary; a regression whose target dials repeatedly while held is still counted, one that dials once at a boundary may not be. No timestamp or window record recovers the order (Codex r1 #2); a causal fix needs a browser-side drain or a release that keeps the other targets armed, a protocol either way. Phase 3 traces it.
- I3 No spec dials the node from a page or another uncovered target (F9 by code reading; F5 shows no records). Phase 3's full smoke is the check.
- I4 Plausible, unverified: the browser's close can end the interception (Chrome detaches its sessions, Firefox closes the observer's window) while the extension still runs and `current` is still set, so a teardown request would count. Settled by D8: the count stops when the close begins.

**Asks:** none open. A1, settled: #836 carries `enhancement`, which the README's Proportion reserves for product decisions. It is a test-fidelity gap, and the lane brief scopes it and asks the lane to choose the fix (Codex r1 agreed).

## Architecture & Implementation

Reuse per recon: the standing interception already knows when the launch holds the origin (F2); the guard already sees every node request that escaped (F1). The change reads the first inside the second and judges the result at close.

- `browser/index.ts`: `HeldInterception = ArmedInterception & { holding(): boolean }`; `holdRpcInterception` returns it.
- `standing-interception.ts`: `hold()`'s handle adds `holding: () => standing.current !== undefined`.
- `node-stub.ts`: `holdNodeStub` returns `host` (`new URL(nodeUrl).hostname`) and `holding`.
- `egress-guard.ts`: `HeldNode` gains `host` and `holding()`. `EgressGuard.watch(host, holding)`, one registration for the one caller (no unwatch, no registry): from then on, `note()` also counts an attempt at `host`, on any port, in `EgressAttempt.held` (optional, set only on a watched host's entries) while `holding()` is true. The guard matches the host; the interception matches the origin. `ownGuardedLaunch` calls `guard.watch(node.host, () => !closed && node.holding())` right after `holdNode`, only when there is a node (the live launch holds none), reusing its `closed` flag. `HeldNode.holding()` is declared in `egress-guard.ts`, which imports nothing from `browser/` (`chrome.ts` and `firefox.ts` import it). `egressFailure` names each `host:port` with `held > 0` and its count, beside any undeclared host, with its own remedy and a pointer to README § Egress guard (find the target the interception misses; declaring the host cannot fix it). The `lb.drpc.live` reason and the `HeldNode` doc state the new rule and its limits (I2, D8).
- Critical flow: settle → canary → `holdNode` → `watch` → tests → `close()`. A kill or a spec's interception clears `current`, and the close's start ends the count, so what reaches the guard then counts in `count` only. A request from a target the interception misses, while held and before the close, counts in `held` too, and the close fails.

## Decision ledger

| # | Decision | Rejected | Why |
|---|---|---|---|
| D1 | #836: classify each node attempt at the guard by the standing's live hold state | count redirects per target; fail an armed launch whose offscreen document made none | zero redirects proves no miss unless the target was known to dial (a launch that never opens Home has none); a recreated document needs per-target generations; positive traffic from a target does not prove its later requests covered; it maps to nothing on Firefox, whose observer has no targets. The chosen form watches the traffic itself and follows `current` through a kill and a recreate (Codex r1 #4 corrected the first rationale) |
| D2 | read `current` at `note()` time | record each window and timestamp each attempt, compare at close | the same boundary with two new records |
| D3 | `EgressGuard.watch` and `EgressAttempt.held` | a generic attempt listener with a counter in `ownGuardedLaunch` | keeps `egressFailure` a pure function of the record |
| D4 | proof: unit tests on the real guard and the real standing; one committed control-spec case on its own launch, where a scratch page dials the node; one uncommitted red run with the allow-list filter | unit tests and the red run only (the first draft, Codex r1) | the glue a real launch depends on (`holdNodeStub`'s host, `watch` in the guarded launch) has no unit seam, and a dropped `watch` would switch the check off silently, the very regression class of #836 (Opus #3; Codex r2 agreed). Chrome excludes pages, so its close must reject with the held count; Firefox's observer covers pages, so the page gets the stand-in's 400 and the close resolves (`isFirefox` in an expectation, which `FIREFOX.md` allows). Cost: one launch per browser per suite |
| D5 | I2 gets no tolerance. A red traced to a boundary stops the arc for a plan change; if Phase 3 never shows one, the close-out files the attribution limit as a closed `known-limit` issue | a grace period after each arm; timestamps or window records; a drain or worker-only release protocol now | a grace period is the timing workaround the owner's rule bars; timestamps cannot recover the order (I2); a protocol adds a lifecycle and coordination for an unreproduced race |
| D6 | #835 also fixes the drift found in the same passages (F7) | the three sentences only | the issue asks the passages to match the README |
| D7 | one arc | split the docs off | the docs state the new rule, so they ship with it |
| D8 | the held count stops when the launch's close begins (Opus #1; Codex r2 agreed) | keep counting through the browser's close (Codex r1 #3) | the rule judges the launch while its tests run, as `failures()` already is; a miss confined to teardown changes no assertion; counts recorded before the close still fail it. The loss: a genuine miss issued before the close whose proxy attempt lands after it escapes, the same near-boundary false green as I2, in the I2 known limit |

## Phases

### Phase 1: the close fails on a node request the stand-in held (#836) ✓

1. Make the changes in Architecture & Implementation, with comments that state the rule, not its history.
2. In `apps/extension/scripts/e2e/egress-guard.test.ts`, add: (a) on the real guard, an attempt at a watched host counts in `held` only while its predicate holds, and an unwatched host never does; (b) through `rig()`, a node attempt while the stand-in holds fails the close, naming `lb.drpc.live:443` and its count, while one sent by the browser's close does not (D8); (c) a held node attempt and an undeclared host in one launch are both named; (d) success control: node attempts before the hold and while it is released close cleanly. Give the fake guard a `watch`.
3. In `apps/extension/tests/e2e/egress-guard.test.ts`, add one `describe` with its own `launchExtension()`: a scratch page posts `node_getNodeInfo` to `TESTNET_RPC_URL` (the `nodeInfo` idiom of `shipped-token-list.test.ts:36-65`) and awaits its outcome before the close. Chrome: the fetch is rejected and the close rejects naming `lb.drpc.live:443` and its held count. Firefox: the fetch gets the stand-in's 400, and the close resolves. It proves the real launch is watched (D4); estimated cost 6-10 s per browser per suite, measured in Phase 3.
4. In `scripts/e2e/standing-interception.test.ts`, add one test: `holding()` is true after `hold()` and each re-arm, false during a kill, during a spec's interception, during a re-arm still in flight (`pauseArm`), after a failed re-arm and after `stop()`.
5. Mutation check, not committed: make `note()` ignore the predicate; make `holding()` return `true`; drop the `watch` call; make `egressFailure` ignore `held`. Each must turn a new test red.

**Validation gate:** `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run scripts/e2e/egress-guard.test.ts scripts/e2e/standing-interception.test.ts scripts/e2e/node-stub.test.ts`; `bun run test`. Pass: every command exits 0, and all four mutations red, each with the test it turned red, in `lessons/phase-1.md`. Layers: lint, typecheck, unit.

### Phase 2: the docs say what the guard does (#835, #836)

1. `apps/extension/tests/e2e/README.md` § Egress guard: the opening line names the direct hosts (the CRS hosts on every guarded launch, the live pair on the live launch); replace `:85`'s "no failure, only the slowness of a refused node" with the new rule, its exceptions (before the hold, a kill, a spec's own interception) I2's limits and D8's cut-off at the close; align `:83`, the close list and the `lb.drpc.live` row; add the held-node failure to "When a launch fails" with its remedy: rerun with `NULO_E2E_INTERCEPT_LOG=1`, find the target, never declare or loosen; a small count in a file with a kill or a spec's interception is a reason to read the trace around the arms, not a diagnosis.
2. `.claude/skills/e2e-testing/SKILL.md:161-173`: every e2e launch is guarded; the network setup provides `egressGuard: true` and no `liveLeg`; every guarded launch sends `CRS_HOSTS` direct; the close's whole failure list (an undeclared host, a canary connection, a direct host at the guard, the interception's failures, a held node attempt); the unarmed-dist refusal stays the smoke setup's; `launchExtension({ live: true })` sends the node's and the list's hosts direct and throws without `liveLeg`; the held check is off while a spec's own interception holds the origin; the held failure's remedy, as in the README.
3. `SKILL.md:699-701`: before the kill the cold-wake spec clears the alarms, opens the dApp page, closes the popup, opens a scratch page, closes Chrome's offscreen document there (`closePxeHost`; its clients woke a successor 50 to 350 ms after the kill when it stayed, as measured) and closes the scratch page.
4. `apps/extension/tests/e2e/FIREFOX.md:48`, `:67`, `:71`: the prefs apply to every guarded launch and the stand-in to every one but the live launch; one PAC `DIRECT` line per direct host (the CRS hosts on every launch, the node and list hosts on the live launch); the artifact smoke refuses every outside host but those.
5. `fixtures/egress-guard.ts`: `LIVE_NODE_HOST`'s "the one outside host a live launch sends direct" names the live pair.

**Validation gate:** `grep -nE "Smoke refuses|liveNode|guarded smoke launch|smoke launch's stand-in|the one .DIRECT. line|only the slowness of a refused node" .claude/skills/e2e-testing/SKILL.md apps/extension/tests/e2e/FIREFOX.md apps/extension/tests/e2e/README.md` prints nothing; `grep -c closePxeHost .claude/skills/e2e-testing/SKILL.md` and `grep -c CRS_HOSTS apps/extension/tests/e2e/FIREFOX.md .claude/skills/e2e-testing/SKILL.md` each print at least 1; `bun run lint`. Pass: both, and a sentence-by-sentence read against the code each sentence names (the grep catches only the known phrases). Layers: lint, review.

### Phase 3: the e2e runs stay green, and the leak goes red

Warnings first. Check `uptime` and start a build or run only when load1 is under 150. Run every network file through `agent.sh` (`bun run e2e:agent`) with `NULO_E2E_RETRY=0` (F8), one run per worktree at a time. Never raise the stall watchdog.

1. Red run, Chrome: set `NOT_PAGES` in `chrome-rpc-intercept.ts` to the allow-list (`service_worker`, `background_page`, then `{ exclude: true }`). Run `NULO_E2E_RETRY=0 bun run e2e:agent tests/e2e/network/passkey-execution-canary.test.ts` prover-ON. Accept it only if the close's message carries the held count for `lb.drpc.live:443`; a red for any other reason proves nothing. Revert, and confirm `git diff --exit-code` on that file; Step 5 is its green rerun.
2. For Steps 3 to 5, add a temporary, uncommitted trace: for each node attempt at the guard, the launch label, `holding()`, whether the close has begun, and the ms since the hold, since the latest suspend began and since the latest re-arm returned. Record in `lessons/phase-3.md` the counts per phase and the smallest gap to an arm; an attempt the trace cannot place is "unresolved", not a cause. Remove the trace.
3. Full smoke, both browsers: build armed as the smoke setup's message names, then `cd apps/extension && bun run test:e2e -- --retry=0`, then the same with `NULO_E2E_BROWSER=firefox`.
4. Network subset, both browsers, proverless (`NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 bun run e2e:agent …`): `tests/e2e/egress-guard.test.ts` and every network spec recon lists under a kill or a spec interception, both canaries excluded.
5. Both canaries prover-ON, Chrome then Firefox: `NULO_E2E_RETRY=0 bun run e2e:agent tests/e2e/network/frozen-account-canary.test.ts tests/e2e/network/passkey-execution-canary.test.ts`, then the same under `NULO_E2E_BROWSER=firefox`.
6. If a close fails on a held count, place it with the trace. A spec or fixture that dials the node from an uncovered target gets its own fix in this arc. A count at an arm's edge (I2): stop, and take it to the orchestrator as a plan change (D5).

**Validation gate:** Step 1 red with the held diagnostic; Steps 3 to 5 exit 0 at retry 0 with no unexpected egress failure (the D4 case's Chrome rejection is expected and asserted); each run's wall-clock, the new case's measured cost and the trace's counts in `lessons/phase-3.md`. These runs are regression evidence, not proof that I2 cannot happen. CI then runs the full smoke and network suites on both browsers. Layers: e2e, e2e on the local network.

## Security & Adversarial Considerations

Test harness only. The guard keeps every e2e run off outside hosts; this makes its close stricter for the node's host and adds no direct host, no outbound path, no listener, no permission, no secret and no dependency. The predicate is an in-process closure over the standing's own state, so nothing outside the run can set it. What it trusts: that the standing's state follows the browser's interception (F2, F4). I2 is the known gap: a false red there is loud on a retry-0 lane, but CI smoke retries twice (F8), so a one-off one can pass there; a regression whose target dials on every attempt fails each retry too.

## Delivery

- Branch `egress-guard-2-a1` at the plan commit (on `origin/dev`; merge `origin/dev` first if it moved). One PR, no stack: `test(e2e): fail the guard's close on a node call the interception missed; fix guard docs`. Body: what changed and why, the gates and their outcomes, each browser's run times, `Closes #836`, `Closes #835`. No label at creation; CI's path filters cover `tests/e2e/fixtures/**`.
- Close-out as the PR's final commits. Parallel lanes: none (one arc, Phases 1 to 3 in series).

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at `19399c82`. Plan-specific: `code_review: off`; one loop over the arc's net diff from `19399c82`, after Phase 3 is green: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, hard stop at three rounds; one Opus diff review (`Agent`, `opus`, `general-purpose`) beside round 1. A fix that grows the design stops for the orchestrator. Rerun the Phase 1 and 2 gates and any e2e file a fix touches, then deliver. Close-out: Outcome, the I2 known-limit issue if D5 says so, lessons promotion (dedupe; `lessons.md` is near its budget), `STATUS.md` deleted, `git mv` into `archive/` in its own commit, the index line moved, `bun run check:plans` green. Teardown after the merge: `agent-worktree done egress-guard-2 --merged`.

## Audit verdicts

**Round 1, Codex** (gpt-6.1-sol, high, session `01a15231`): conditional approve, 6 findings, all accepted. #1 F2, F4, F5, F6 overstated: corrected. #2 I1 too strong, I2 runs both ways and at the first hold too; D5 confirmed (no timestamp recovers the order): I1, I2 rewritten. #3 teardown (I4): accepted as a boundary; its disposition went the other way (D8). #4 D1's rationale: rewritten. #5 proof criteria and `NULO_E2E_RETRY=0`: applied. #6 more doc drift: applied.

**Round 1, Opus Plan:** conditional approve, 11 findings, all accepted. #1 High, I4 is a free false red: the count stops at the close (D8). #2 the trace could not attribute: fields added. #3 nothing committed proves the real launch is watched: one control-spec case (D4). #4 the held failure's remedy in the README and the skill. #5 F5's guess: "unattributed". #6 CI smoke retries twice: F8 and Security corrected. #7 `held` optional. #8 two more mutations. #9 one canary rerun folded. #10 A1 is a process point: left to the orchestrator in the report. #11 more skill drift and positive grep checks: applied.

**Round 2, Codex** (resume): D8 and D4 hold; conditional approve, 2 findings, both accepted. #1 Medium, attribution and recurrence claims still too strong (F5, the README remedy, I2, D8, Security): qualified. #2 Low, Phase 1's gate named two mutations of four: fixed; Phase 3's gate now says "unexpected" egress failure.

**Round 3, Codex** (resume): **approve**, high confidence; both conditions met, no new contradiction.

## Seeds

`/goal Phases 1-3 of implementations-plan/egress-guard-2/plan.md marked ✓, each gate reported passing in the transcript; the Codex loop converged (a resumed pass with no new material finding, quoted); PR open against dev with Closes #836 and Closes #835 and the close-out commits; lint and test exit 0.`

`/loop 15m Drive implementations-plan/egress-guard-2 forward per its plan.md: reality check (plan, lessons, git status, PR checks), next pending step, its gate, the Codex loop after Phase 3, delivery, close-out; decide with Codex, never idle; stop at the merge.`

---
plan: e2e-flakes-2
tier: light
status: arc 1 merged (#813); arc 2 implemented, Codex loop converged, PR pending
issues: "#774 (arc 1, closed by #813); #816 (arc 2 closes)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex audit (gpt-6.1-sol, high) and its resume; one Opus Plan leg; one fresh final Codex pass
base: origin/dev at 24c68cb4
trunk: dev
post_implementation_hardening: not scheduled
---

# e2e-flakes-2: make the reconciliation spec's gap with no live writer

Two arcs, one PR each against `dev`, one e2e spec changed per arc; arc 2 ([below](#arc-2--816-the-copy-snack-sweeps-abouts-foot)) was added after arc 1 merged. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults and probe data: [lessons/phase-0.md](lessons/phase-0.md).

## Root cause (#774)

**Path.** Initial conditions: `tokenReadyExtension` returns as soon as one balance row is fresh and exact (`tests/e2e/fixtures/extension.ts:855`, `fixtures/tokens.ts:300-380`). The worker is live and unlocked, and more projections of that row are still due. Actions, in order: the spec opens Home, waits for the 1,000 TST card, and removes every `nulo:core:token-balances@*` key with a raw `chrome.storage.local.remove` (spec lines 42-47). A projection that read the row just before the remove writes it back just after: `applyProjectedOk` runs `repo.get`, its fences with no await, then `repo.set({...current, ...})` (`src/wallet/services/token-balance/balance-job-queue.ts:348-392`). The spec's second read (lines 51-55) counts 1. Invariant broken: the spec's own precondition, "no writer between the delete and the read". Consequence: a red required gate (`extension-network-e2e-firefox-status` on `dev`).

**Label.** A live writer in the window is **demonstrated**. The get, remove, set interleaving is **plausible but unverified**: the code supports it, and it cannot be parked, because no await separates the get from the set dispatch. Evidence:

- CI (run 39131018947, attempt 1, Firefox shard 1/5, job 117686068798): the fixture logged `balance row fresh + exact` at 13:29:16.70. The next spec output, at 13:29:18.18, is the teardown's add-on exception dump. So the delete ran at most about 1.5 s after the fixture returned.
- Probe (throwaway `_probe-balance-writers.test.ts`, never committed; a `chrome.storage.onChanged` recorder on the balance root; one run per browser through `agent.sh`): a projection rewrote the row 1.35 s (Firefox) and 0.61 s (Chrome) after the fixture returned, and Chrome wrote again at 30.3 s. Writes continue after the fixture is ready.
- With the worker stopped and the popup reopened locked, the same delete was followed by **zero** balance writes for 35 s on both browsers, then by the unlock's repair (a new row at `updatedAt: 0`, then its projection).

**Not a product bug.** Every production delete of a balance row goes through the fenced paths (`isBalanceInvalidated`, `deleteIfInvalidated`). `EntityStorage.get` reads storage on every call (`packages/wallet-core/src/storage/entity_storage.ts:182-186`). A raw page-side remove under a live worker bypasses that protocol. The production gap this spec models, a worker death inside `createTokenBalance`, is a persisted gap that the next boot finds. In strict mode, the default, that boot starts locked. The fix seeds the gap in that state.

## Outcome & Quality Bar

For a maintainer reading a red network lane: the spec is red when missing-row recovery on unlock is broken, never because a live worker's projection raced its delete. A late write from the stopped worker, if a browser ever delivered one, cannot pass as the repair by itself (D7 records the residual).

- The gap is made where no balance writer runs, by mechanism, not by a wait or a retry.
- The spec proves at least what it proved: a projected row existed, the gap was real, the unlock created exactly one row and projected it after the gap, and Home shows 1,000 TST. Two vacuous passes close: a row a live projection wrote back before the stop, and a write the dead worker had already issued. Either one could satisfy `baselineUpdatedAt: 0` with no repair at all.
- 10 Firefox and 5 Chrome runs at retry 0, CI's build shape, all green, times in the PR body; the PR's two network lanes green at `run_attempt == 1`.

## Architecture & Implementation

- **Change** (`apps/extension/tests/e2e/network/balance-row-reconciliation.test.ts` only). The new order: the Home precondition (lines 32-40); `page.close()` and `stopBackground` (57-58); `openPopup`, then `waitForLockScreen(reopened, 30_000)` from `fixtures/auth.ts:48` in place of the bare auth-hash wait (64); the delete and `remaining === 0` check (42-55) in the reopened page; the unlock (65-68); the repair assertions (75-92). The delete's evaluate also returns `gapMadeAt`, the page's `Date.now()` after the remove. `waitForFreshBalanceRow` takes `baselineUpdatedAt: gapMadeAt` instead of `0`.
- **Why no writer runs in the gap.** Strict mode (`src/wallet/config/config.ts:26`, default true) drops the session on a worker death, so the successor boots with no active profile. `waitForLockScreen` checks that: the session record is gone, then the route. Init loads tokens and reconciles only for an active profile (`token-balance/service.ts:178-186`). Every enqueue path filters rows through that empty token map (`rowMatchesItsToken`), so nothing projects or creates rows until the unlock. Init's own legacy purge only deletes.
- **Why the dead worker cannot win.** A dead context issues no new storage call. A call it issued before it died carries an `updatedAt` no later than `gapMadeAt`, because projections stamp `Date.now()` after they finish (`balance-job-queue.ts:247`) and page and worker share the epoch clock. A stale row alone therefore fails the freshness check. The storage backend's ordering is not relied on.
- **Comments.** Lines 35-39 lose the self-correcting claim, which no longer holds: a failure before the unlock leaves the wallet locked. Lines 60-62 state the one invariant: the gap is made while the successor is locked, where no balance writer runs, which is also the state a worker death leaves. The baseline gets one clause: it rejects a write from before the gap. The header's scope note stays.
- **File map:** one spec file. No fixture, helper, product or skill file changes.

### Trade-offs and alternatives not taken

- **Wait for the balance queue to go idle** (`waitForBalanceQueueIdle`, `tests/e2e/fixtures/journal.ts:348-362`): needs Developer Mode and Debug Mode, cannot see an enqueued but unticked balance, and the incoming poll enqueues again at any 30 s tick (the Chrome probe). An incomplete barrier is a wait on time. Rejected.
- **Wait for a quiet window** before deleting: a timeout over a race. Rejected (refused by the lane brief).
- **Product compare-and-set in `applyProjectedOk`**: `chrome.storage` has no atomic compare-and-write, production deletes are already fenced, and it would change a hot path to serve a test. Rejected by both panel legs.
- **A fenced delete RPC for tests**: a new test-only product surface. Rejected.
- **Keep `waitForHash(#/popup/auth)`**: `app.vue` shows auth briefly before init finishes, so the hash alone does not prove a lock. `waitForLockScreen` already exists. Rejected.

## Phases

### Phase 1 — move the gap behind the stop ✓

1. Reorder the spec as the change map says. Keep every assertion; only the baseline moves from 0 to `gapMadeAt`.
2. Rewrite the three comments as above.
3. Run a negative control, never committed. Delete the `await this.reconcileBalanceRows(profile.id, gen)` line in `onActiveProfileChanged` (`token-balance/service.ts:472`). Run the exact Firefox `e2e:agent` command from the gate below, which rebuilds the mutated source. Accept only a failure at `waitForFreshBalanceRow`. Restore the line, then confirm `git diff --stat apps/extension/src` is empty.

**Validation gate.** Warning: start an e2e run only after `until [ "$(cut -d. -f1 /proc/loadavg)" -lt 150 ]; do sleep 30; done`, and never run two `e2e:agent` runs in this worktree at once.

- Run `bun run lint`, `bun run typecheck:all` (it covers the e2e tree) and `bun run test:all`. Pass: each exits 0.
- Run the spec ten times on Firefox, one at a time: `NULO_E2E_RETRY=0 NULO_E2E_PROVERLESS=1 NULO_E2E_BROWSER=firefox NODE_OPTIONS=--dns-result-order=ipv4first taskset -c 0,1 bun run e2e:agent tests/e2e/network/balance-row-reconciliation.test.ts`. Pass: each exits 0 with `1 passed`. Exit 86 is a boot failure: rerun it and count it apart.
- Run the same command five times without `NULO_E2E_BROWSER`. Pass: as above.
- The pin is two distinct allowed cores, `0,1` by default. If `/proc/stat` shows that pair saturated, pick another idle pair and record it. Three exit-86 runs in a row: stop and reassess.
- Record each run's time (`✓ … (1 test) Nms`). Base, unchanged spec, prover-ON, this host: Firefox 112.9 s, Chrome 52.1 s; CI Firefox 22.4 s (shard 1/5, attempt 2). The change adds no step, so state the after times beside these. Do not set a pass bound on them.
- What the runs certify: the new order is stable under CI's build and a two-core pin. The absence of the race rests on the mechanism above and the probe. The negative control shows the spec still fails without the sweep.
- Layers: lint, typecheck, unit, network e2e on both browsers.

## Security & Adversarial Considerations

Test code only: no product, permission, storage-shape, wire or CI change. The spec handles no secret beyond the e2e `TEST_PASSWORD` it already used. An attacker who can run code in an extension page and write its storage already holds more than this spec touches. The risk is the test's own honesty, so no assertion is loosened, removed or retried. The gap check now also pins "no balance write while locked", and the baseline stops a stale write from passing as the repair by itself.

## Assumptions

- **Facts.** F1 the spec's line numbers as quoted (`balance-row-reconciliation.test.ts:32-92`). F2 `applyProjectedOk` reads, fences with no await, then writes the row (`balance-job-queue.ts:348-392`); `now` is taken after the projection (`:247`). F3 `EntityStorage.get` hits storage on every call (`entity_storage.ts:182-186`). F4 strict mode defaults on (`config.ts:26`); init loads tokens only for an active profile (`service.ts:178-186`); `refreshBalances` re-queues only rows that already exist (`src/utils/core.ts:170-196`), so only `reconcileBalanceRows` can create the missing row on unlock. F5 the CI log, job 117686068798: fixture line at 13:29:16.70, teardown dump at 13:29:18.18. F6 the probe records in `lessons/phase-0.md`. F7 #743 appends flake-ledger row 57 to `.claude/skills/e2e-testing/SKILL.md`. F8 CI runs this spec in the proverless shard pool (`_extension-network-e2e-lane.yml`, `proverless: true`), and both network lanes trigger on `apps/extension/**`.
- **Inferences.** I1 the writer at +0.6 to +1.35 s is one of: the incoming-transfer scheduler's forced first poll at token add (`incoming-transfer/service.ts:1104-1122`), or a refresh the fixture's own `waitForFreshBalanceRow` kicked. The probe did not attribute it, and the fix does not depend on it.
- **Asks.** None. The ledger row collides with onboarding-3; Delivery orders it.

## Decision ledger

- D1 Fix the test, not the product (both legs agree: no supported production path).
- D2 Seed the gap after `stopBackground` and a verified lock, before the unlock.
- D3 The baseline is `gapMadeAt`, not 0. Each leg found the same vacuous pass: Codex through a late dead-worker write, Opus through a write-back before the stop.
- D4 No new committed test. The spec is the test, and the race cannot be parked. The proof is the probe, the negative control and 15 green runs.
- D5 The flake-ledger rows (58, and 59 for arc 2, after #743's 57) land in the close-out, after onboarding-3 merges. No other skill or `FIREFOX.md` edit.
- D6 The runs use CI's proverless build and the skill's two-core pin (Opus #1).
- D7 No `onChanged` recorder in the spec to prove the sweep created the row (Codex r2 #1, rejected). Its path needs a stopped worker's write delivered after the lock check, which no browser was shown to do (zero writes in 35 s, both browsers), and a broken sweep at the same time. The negative control covers the broken sweep alone.
- D8 (arc 2) Wait for the snack to leave, not reorder the steps or rescroll. Reordering hides the precondition in step order. `block: "center"` puts the coingecko line, the drag's start, off screen. A poll inside `textEdge` would hide a real cover.
- D9 (arc 2) Wait for the named snack (`waitForToastGone`), not for any card: the reused helper names the cause, and an unexpected card still reds at `textEdge`.

## Delivery

Arc 1 shipped as #813. Arc 2: branch `e2e-flakes-2-a2` off `origin/dev` (a4edec20), its own PR against `dev` with `gh pr create` after the gate and the Codex loop. Title: `test(e2e): wait for the copy snack to leave before about's foot` (63 characters). Body: the path and its evidence, the controls, the 15 runs with the file and test times before and after, `UI impact: none`, `Closes #816`. No label: the smoke lanes run on `apps/extension/**`. The close-out (D5's ledger rows, the Outcome, the archive move) still waits for #743.

Arc 1: Branch `e2e-flakes-2-a1` off `origin/dev`, with the plan commit on it. Open one PR against `dev` with `gh pr create`, after the gate passes and the Codex loop converges, and after merging `origin/dev`. Title: `test(e2e): make the balance-row gap with the worker stopped` (59 characters). Body: the root cause and its evidence, the 15 runs and the control with outcomes, the times, `UI impact: none`, `Closes #774`. Open it without labels: both network lanes run on `apps/extension/**`. No parallel lanes.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at `24c68cb4`, once per arc over that arc's own diff (each arc is its own PR off `dev`, not a stack). `code_review: off`: no `/code-review`. The Codex loop: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`. Stop at three rounds; log each in `lessons/phase-N.md` for arc N. Run one Opus diff review beside round 1. A fix that grows the design stops for the orchestrator. Close-out: the last PR's final commits, after `origin/dev` carries #743 (D5): one ledger row per arc, the Outcome, the archive move. Teardown after merge: `agent-worktree done e2e-flakes-2 --merged`.

## Audit verdicts

**Round 1, Codex** (gpt-6.1-sol, high, session 01a1505c): conditional approve, 5 findings. #1 the interleaving is a hypothesis, I2 unsupported: accepted (relabelled, I2 dropped). #2 a stopped worker is no proven storage-drain barrier: accepted as D3, which makes a late write fail the spec. #3 "locked" needs strict mode, and a fresh worker gets no `onActiveProfileChanged(undefined)`: accepted (F4, mechanism rewritten). #4 the spec proves missing-row recovery, not each sweep step: accepted (quality claim narrowed, negative control added). #5 no product change: agreed (D1).

**Round 1, Opus Plan:** conditional approve, 8 findings. #1 gate off CI's build, base sample of one: accepted (D6, base stated without a bound). #2 F4 cited the wrong mechanism: accepted. #3 the 13:29:18.18 line is teardown, I2 contradicted, the fixture's re-kick is a candidate writer: accepted. #4 the old order had a vacuous pass: accepted (D3). #5 the auth hash is no proof of a lock: accepted (`waitForLockScreen`). #6 the fixture comment's self-correction claim breaks: accepted. #7 argue ordering by mechanism: accepted. #8 wording and the diff-review line: fixed.

**Round 2, Codex** (resume): conditional approve, 4 findings. #1 a fresh projection after a late write could hide a broken sweep: wording narrowed, recorder rejected (D7). #2 the clock baseline holds; "no later than": accepted. #3 the pin reserves no capacity: accepted (another pair allowed, exit-86 bound). #4 the Outcome overpromised: accepted.

**Final pass, Codex** (fresh session 01a1506a, gpt-6.1-sol, high): **approve**, high confidence. Two wording fixes, applied: the Outcome and Security lines now say a late write cannot pass as the repair by itself; the negative control names the rebuilding `e2e:agent` command. It confirmed F1-F8, D7's proportion, and that `openPopup` waits for the worker's Ready, so init cannot stand in for the disabled unlock reconcile.

**Implementation rounds 1-2** (diff 767789b7..78b82faa; round 2, Codex resume: approve, the loop converged). Codex (gpt-6.1-sol, high, session 01a15077): conditional approve, 2 comment findings, both fixed (78b82faa). Opus diff review: conditional approve; the same retry clause, fixed; the test title kept. Gate on bf7db153: lint, `typecheck:all`, `test:all` exit 0; negative control red at `waitForFreshBalanceRow`; Firefox 10/10 (67.5-162.0 s) and Chrome 5/5 (49.9-89.2 s) at retry 0. Log: [lessons/phase-1.md](lessons/phase-1.md).

## Arc 2 — #816: the copy snack sweeps About's foot

Scope: `tests/e2e/navigation.test.ts`'s drag-select test, red 3 of 3 on one Firefox smoke shard (`legal-about-group's first character is off screen or covered`, `:253`). Same lane rules: trace first, wait on the state, no retry, skip or longer timeout. Base: `origin/dev` at a4edec20. UI impact: none.

**Path (demonstrated).** Initial conditions: the test clicks the header's address on Home, which opens the success snack `Address is copied` (`header-copy-address.ts`), alive 2 s (`SUCCESS_TOAST_MS`) plus a 150 ms leave. At rest the card spans y 546-588 of the 600 px popup (`bottom: SNACK_GAP`, 12 px). Its enter and leave slide it 20 px lower (`.enter_from, .leave_to` in `ToastManagerBase.vue`), over the band 588-608. Actions, in order: Privacy's drags, back, About; `scrollIntoView({ block: "nearest" })` puts the Legal title's first character at y 593, and the note's `block: "end"` puts its last at y 590.5, both in that band, on both browsers. If either hit test runs while the card slides, `elementFromPoint` returns the card and `textEdge` throws. Invariant broken: the spec's own precondition, nothing drawn over the point it presses. Consequence: a red required gate (`extension-smoke-e2e-firefox-status`). Evidence, in [lessons/phase-2.md](lessons/phase-2.md):

- Probe (throwaway, one run per browser, `taskset -c 0,1`): on Firefox the note's hit test, 2.06 s after the card appeared, returned `snackbar-title`, the card mid-leave at y 564-606. Chrome reached About's foot 0.73 s after the copy, before the leave. A copy made on About itself showed the entering card covering the note there too (`hit: snackbar`).
- CI: run 39166471199 (job 117791281807) red at `:253` on three attempts; run 39168239864 (job 117795684862, not in the issue) red at `:253` twice and at `:264`, the note, once, 1.98 s after the copy log. Eight green Firefox runs logged the link-rows drag 2.13-2.63 s after it.
- The issue's hypothesis did not hold: the sub-page header spans y 64-120, and the failing point is at y 593.

**Change** (the spec only; not a product bug, since a snack overlays the page by design and the spec presses under one it opened itself): after About shows `legal-about-accepted` and before its first scroll, `await waitForToastGone(page, "Address is copied")` (`fixtures/widgets.ts`, re-exported by `fixtures/helpers`), which counts a leaving card as present, with one comment line saying why. Cost: the snack's remaining life, from about 0.4 s on Firefox to 1.4 s on Chrome per the probe. A `waitForToast` for the same label right after the click proves the snack opened, so a renamed label cannot turn the wait into a no-op.

### Phase 2 — wait for the copy snack to leave ✓

1. Add the wait and its comment, and the presence check after the click; import both helpers.
2. Negative controls, never committed, Firefox, one run each. Both adopt a stylesheet in the popup, `[data-testid="snackbar"] { transition-duration: 4s !important; transition-timing-function: step-start !important }`, so a leaving card holds its swept-down place for 4 s. **A**, the unfixed spec plus a wait until a card carries its leave class before About's scroll: red at `:253` with #816's message. **B**, the fixed spec under the same stylesheet: green, the wait lasting until the card is removed. Restore; `git diff` shows only the fix.

**Validation gate** (load1 under 150 before every build and run; one e2e run at a time in this worktree):

- `bun run lint`, `bun run typecheck:all`, `bun run test:all`: each exits 0.
- Armed builds per browser (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:<browser>`), then ten Firefox and five Chrome runs, one at a time: `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 env -u EXTENSION_PATH taskset -c 0,1 bun run test:e2e --retry=0 tests/e2e/navigation.test.ts` (with `NULO_E2E_BROWSER=firefox` for Firefox). Pass: every run `8 passed`. Smoke claims its own loopback ports in `~/.agents/ports.md`; `agent.sh` is the network runner and builds no smoke dist.
- Record the file's and the drag test's time per run, and one unfixed run per browser as the base. No pass bound on them.
- What the runs certify: the wait holds under CI's build and a two-core pin. The race's closure rests on the mechanism and on controls A and B.

**Arc 2 audit verdicts** (diff a4edec20..30821a65; log: [lessons/phase-2.md](lessons/phase-2.md)). Round 1, Codex (gpt-6.1-sol, high, session 01a1512e): approve; the seeds still drove phase 1, rewritten. Opus diff review: approve, 3 nits accepted: a presence check pairs the gone-wait so a renamed label cannot make it a no-op, the comment names the next two drags, the Firefox cost is about 0.4 s. Round 2 (resume): conditional approve; the presence check sat after a storage read, moved before it (`455f7b90`). Round 3: approve, no findings. Gate on the merged head 30821a65: lint, `typecheck:all`, `test:all` exit 0; controls A red at the original `:253`, B green; Firefox 10/10 (test 6.0-7.5 s) and Chrome 5/5 (4.1-4.6 s) at retry 0, every run 8 passed.

## Seeds

`/goal` (recommended): `/goal Phase 2 of implementations-plan/e2e-flakes-2/plan.md is ✓, backed by its validation gate passing in the transcript (lint, typecheck:all, test:all, controls A red at the original :253 and B green, 10 Firefox and 5 Chrome runs of tests/e2e/navigation.test.ts at retry 0 with taskset on armed smoke builds, every one 8 passed), LESSONS_FILE=implementations-plan/e2e-flakes-2/lessons/phase-2.md printed; code_review is off and /code-review was not run; the Codex fix loop converged (a resumed pass with no new material finding, quoted); the arc 2 PR exists, opened after the loop (gh pr view output).`

`/loop` (fallback): `/loop 15m Drive implementations-plan/e2e-flakes-2 forward; never idle. Read plan.md and lessons/. If the plan directory is gone, git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/e2e-flakes-2/plan.md: success means merged, so run agent-worktree done e2e-flakes-2 --merged and stop; failure means delivered, so watch the PR's checks. Otherwise run phase 2's gate, then the Post-implementation section. Never merge. The same step failing 5 times: reassess with Codex.`

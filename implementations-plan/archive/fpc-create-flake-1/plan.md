---
plan: fpc-create-flake-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 977227864
trunk: dev
issues: "#1086 (arc 1 closes it)"
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-22. **Status:** completed.
- **Shipped:** #1088 (arc 1, closes #1086): the purge and reset cases in `fpc/service-create.test.ts` await the sweep while the registration is parked, so a sweep that waited on it times the case out; `track` deleted; one file-header sentence. No product change.
- **Dispositions:** T2's `macrotask` and the `addFpc` case's zero timer kept (D3); the reproduction and the mutation kept as scratch, not committed (D4); review r1's `onTestFinished` cleanup rejected (it only runs in a run already red, which exits in 22 s). No `lessons.md` promotion: it is at its 8 KiB budget and no entry is superseded; the gotcha (Bun runs WebCrypto off the main thread, so a sealed read can settle after a zero timer) stays in [lessons/phase-0.md](lessons/phase-0.md) and #1089.
- **Known limits:** #1090.
- **Open items:** #1089.
- **Seeds retired:** the `/goal` and `/loop` below; never run them.

# fpc-create-flake-1: the FPC reset and purge pins prove order, not time

One arc, one PR against `dev`, test-only. Two cases in `apps/extension/src/wallet/services/fpc/service-create.test.ts` prove "a sweep never waits on a parked registration" by asserting the sweep settled after one zero timer. Since the fee-payer rows are sealed, the sweep decrypts through WebCrypto, which Bun runs off the main thread, so the bound can fail under load. The arc awaits the sweep with the registration still parked: a sweep that waited hangs the case into its timeout. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none).

## The claims and what held

- **#1086's trace holds.** `clearChainState` (`service.ts:97-111`) runs `ensureInitialized`, the FPC lock, `storage.getValues()` and the deletes; `getValues` opens each sealed row through `crypto.subtle.decrypt` (`sealed-entity-storage.ts:263,494-497,529-537`, `aes-gcm-frame.ts:39`). The `fpcs` root is unkeyed (`stores.ts:185`), so its delete is a plain remove and the decrypt is the sweep's one off-thread step.
- **"Since #1072 … WebCrypto callbacks can land after a timer"**: plausible as the cause, and proven sufficient. On Bun 1.4.2 a 64 MiB decrypt lets a zero timer fire first; a 64-byte one settled first 200 of 200 times at load1 ≈ 93. A spy that delays `decrypt` by one zero timer reds the case on base with the observed message (F5).
- **Not in the issue:** the purge case (`:164`) has the same bound. It holds today only because no sealed row exists when it purges (F9).

## Outcome & Quality Bar

- **For whom:** every contributor whose PR runs `quality-status`, and the maintainer who reads these pins later.
- **Excellent:** (1) The two cases pass or fail by event order alone; no timer, poll or timeout value decides them. (2) Each case still fails when the product holds the FPC lock across a registration (F6).
- **Good enough:** other files' timer waits stay as they are; one traced latent flake becomes an issue (D6).

## Assumptions

**Facts** (verified at the base):
- F1. T3 (`:213-243`) starts `clearChainState` through `track` (`:231`, defined `:112-115`), waits `macrotask` (`:232`, defined `:117`), asserts `sweep.settled` (`:233`), and releases the gate in `finally`.
- F2. In T3 one sealed row (Sponsored) exists at the sweep (`:229`), so the sweep makes one decrypt.
- F3. The gate is a test-local `deferred`; only the case's own `finally` resolves it. No product code can reach it. Under the step-5 mutation the sweep waits on the FPC lock, whose only other releaser is its watchdog at 5 min (`lock.ts:5`, built with the default at `service.ts:58`), after the 5 s deadline.
- F4. T6 (`:245-271`) already awaits `clearChainState` while its gate is closed: the order-proof shape, in this file.
- F5. Prototype, reverted: the decrypt-delay spy reds T3 on base (`expected false to be true`); with the fix below, the same spy passes 14 of 14.
- F6. Prototype, reverted: `await this.lock.withLock(() => pxe.registerContract(…))` at `service.ts:190` fails T1, T3 and T6 with `Test timed out in 5000ms` on the fix; the other 11 pass.
- F7. The unit vitest config sets no `testTimeout` and no `retry` (`apps/extension/vitest.config.ts`, `vitest.base.mts`): 5 s and 0 apply.
- F8. T2 (`:198-211`) uses `macrotask` only before `gate.resolve()`. Every interleaving meets its assertions: a late run skips a stored row (`service.ts:220-223`) and re-reads (`:166`). The wait only holds both runs at the registration together, on microtask-only paths (mocked derivation, an empty root's read).
- F9. T1 (`:164-196`) bounds `purgeForProfile` the same way. Its Sponsored registration is the parked one, so no row exists and the purge makes no WebCrypto call.
- F10. The `addFpc` case (`:125-146`) waits one inline zero timer so that `addFpc` captures its fence before the deletion. That path runs `ensureInitialized`, the synchronous `AztecAddress.fromStringUnsafe` and harness fakes (`captureExecutionFence`, `getNetwork`, `captureLiveness`, `getContractInstance`): no storage, no WebCrypto.

**Inferences:** I1. The observed red (load ≈ 120) was the decrypt landing after the timer. The reproduction shows the mechanism suffices; nothing proves it was the cause, and the fix does not depend on it.

**Asks:** none. The arc changes no product code and nothing a person sees.

## The finding (#1086)

T3, one sealed Sponsored row, the Private registration parked. The test starts the sweep and schedules a zero timer. The sweep reaches `decrypt`, which runs off the main thread; under load its completion lands after the timer. The test resumes and reads `settled === false`. No product invariant breaks: "settles within one macrotask" was never a property of the code. Consequence: an intermittent red `quality-status` on unrelated PRs. **Demonstrated**: observed once in `test:all`, and reproduced by forced order (F5).

## Architecture & Implementation

- **Change map:** only `service-create.test.ts`. T1: `await h.service.purgeForProfile("p1")` inside the `try`, before `release`; drop `purge` and `await purge?.promise`. T3: `await h.service.clearChainState("p1", 1)` inside the `try`; drop `sweep` and `await sweep?.promise`. Delete `track` and its comment (no user left). Keep `macrotask` (T2). Add one sentence to the file header: a purge or sweep is awaited with a registration parked, so one that waited on it fails by the case's timeout.
- **Flow:** registration parked → the case awaits the sweep → the sweep resolves (it needs nothing from the registration) → the case releases the gate in `finally` → it joins the discovery and checks the rows. If the sweep waited on the registration, the await stays blocked past the 5 s deadline (the lock's watchdog frees a held lock only after 5 min), and vitest fails the case (F7).
- **Reuse:** T6's shape (F4); `deferred` from `@nulo/wallet-core/utils`. Nothing new.

### Decision ledger

- **D1** Await the sweep with the gate closed. Rejected: more zero timers or a longer wait (a time bound still); `trackSubtleCrypto().settled()` before the assert (it drains WebCrypto only, so any other off-thread step reopens the race); `expect.poll` (a retry over a race, bounded by its own timeout); a microtask-only store fake (it would test a store the product no longer uses). The red signal is the default timeout, unchanged: no finite observation other than a deadline proves a promise never settles.
- **D2** T1 converts too: same bound, held today by an empty root (F9). `track` and its false premise ("storage settles on microtasks") go.
- **D3** Keep T2's `macrotask` (F8) and the `addFpc` case's inline timer (F10). Neither path crosses WebCrypto, and #1086 names neither. Both reviewers call a change optional (delete T2's wait; a reached deferred in `getContractArtifact`). Kept: T2's wait builds the overlap the case names, and neither change answers a failure.
- **D4** The reproduction and the mutation are scratch: applied, run, reverted, their patches quoted in `lessons/phase-1.md`. A committed test of a test is not added.
- **D5** One header sentence states the rule for T1, T3 and T6, not a comment at each case.
- **D6** Out of scope, filed at close-out after a dedupe (`gh issue list --state all --search "changeAccountName timer"`): `account/service.test.ts:641-643` waits two zero timers for a parked read that comes after a keyed `get`'s `keyedSegment` sign (`sealed-entity-storage.ts:150-154,454`). If the sign lands late, `parked` is still null and the case hangs. **Plausible but unverified** (traced, never observed). The body also asks whether the second timer lets the case tell a serialized implementation from an unserialized one.
- **D7** Known limit, a closed `known-limit` issue at close-out: the pins prove "returns while parked within 5 s", so a product wait on the registration bounded under 5 s passes them (the old one-timer bound caught it). Its consequence does not matter: a bounded wait delays a reset; it cannot deadlock, which is what these pins guard. Reopen if a sweep gains a bounded wait on discovery.

## Security & Adversarial Considerations

Test-only: no product code, dependency, workflow, permission, key or crypto change. The one risk is a pin that passes vacuously and stops guarding the fence. F6 is the control: with the lock held across a registration, both edited cases fail. The sealed storage and its WebCrypto path stay as they are.

**UI impact:** none. The arc touches no surface a person sees.

## Phase 1: the order proof ✓

**Assumptions:** F1-F10; I1 is not relied on.

**Steps:**
1. Merge `origin/dev` into `worktree-fpc-create-flake-1`. Record the merged SHA as BASE in `lessons/phase-1.md`.
2. Reproduce on BASE. Warning: revert this edit before step 3; a spy left in the file hides the bug it proves. In T3, insert the decrypt-delay spy as `lessons/phase-0.md` quotes it: `let spy` before the `try`, the spy installed directly before the sweep starts, `spy?.mockRestore()` first in the `finally` (the setup's `clearAllMocks` keeps a spied implementation). Run the file. Expect T3 red with `expected false to be true`. Run `git checkout -- <file>`.
3. Edit the test file as the change map says.
4. Insert the same spy and restore into the edited T3. Run the file. Expect 14 of 14 green. Revert the spy.
5. Wrap `pxe.registerContract(…)` at `service.ts:190` in `this.lock.withLock(…)`. Run the file. Expect T1, T3 and T6 to fail with `Test timed out in 5000ms`, and 11 to pass. Run `git checkout -- apps/extension/src/wallet/services/fpc/service.ts`.
6. Run the file 100 times at retry 0 beside the running lanes (loop below). Record load1 at the start and the end. Expect 0 reds.
7. Log steps 2, 4, 5 and 6 with their outputs in `lessons/phase-1.md`.

```sh
cd apps/extension && reds=0; for i in $(seq 100); do bun --bun vitest run src/wallet/services/fpc/service-create.test.ts --retry=0 >>~/.cache/nulo-backlog/fpc-create-flake-1/soak.log 2>&1 || reds=$((reds+1)); done; echo "reds=$reds"
```

**Validation gate** (unit, lint, typecheck; no e2e: no product change):
- `cd apps/extension && bun --bun vitest run src/wallet/services/fpc --retry=0`: exit 0.
- `bun run test:all`, `bun run lint`, `bun run typecheck:all`: each exit 0.
- `git diff origin/dev -- apps/extension/src/wallet/services/fpc/service.ts` is empty; only the test file and plan files differ.
- `grep -c 'crypto.subtle' apps/extension/src/wallet/services/fpc/service-create.test.ts` prints 0 (no spy left; `grep -c` exits 1 on 0, so read the count).
- Steps 2, 4 and 5 gave the expected results: they are the proof. Step 6 printed `reds=0`: a smoke run only, since the base also passes on an idle host (`lessons/phase-0.md`).
- `bun run check:plans` exit 0 after staging the plan files.

## Delivery

One arc on `worktree-fpc-create-flake-1` (the plan commit at its base), one PR against `dev`, no stack (D-orch-1). Open it only after the gate and the review loop. Title: `test(fpc): the reset and purge pins await the sweep with the registration parked` (80 characters). Body: what changed and why, steps 2-5 as the proof and step 6 as a smoke run, with their outcomes, `Closes #1086`, no e2e label. The close-out is the PR's final commits.

## Post-implementation

The execution contract is this plan plus `implementations-plan/README.md` § Post-implementation standard at 977227864. Plan-specific values:

- **Step 1 (diff review):** absent (`code_review: off`).
- **Step 2 (review loop):** once, over `git diff origin/dev...HEAD` after Phase 1 is green: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, with the standard's two rules verbatim and the adversarial ask. One Opus `general-purpose` review runs beside round 1. Resume until a round has no new material finding; hard stop at three rounds.
- **Step 3 (delivery):** `gh pr create --base dev`, then `gh pr checks <n> --watch` once. Never merge.
- **Step 4 (close-out):** merge `origin/dev` and read what changed in `index.md` and `lessons.md`. Write the Outcome. Promote one lesson if no line covers it: "Bun runs WebCrypto off the main thread: a sealed read can settle after a zero timer; prove 'never waits' by awaiting with the other side parked." File D6, and D7 as a closed `known-limit` issue. Delete `STATUS.md`. `git mv` the folder into `archive/` in its own commit; move the index line.
- **Step 5 (teardown):** after the merge, `agent-worktree done fpc-create-flake-1 --merged`.

## Audit verdicts

| Round | Verdict | Taken | Rejected or kept |
|---|---|---|---|
| Codex r1 (`gpt-6.1-sol`, high) | `approve`, four lows | "never returns" reworded (the watchdog, F3); spy restored in `finally`; D6 body question | deleting T2's wait, a reached deferred in the `addFpc` case: optional, kept (D3) |
| Opus (Plan) | `conditional approve`: watchdog in F3, a spy-gone gate line, step 6 as smoke | all three; F1 call sites; F8's stronger reason; F10's full path; D7 known limit | the same optional `addFpc` deferred (D3); D5 kept as written, which it endorsed |
| Codex r2 (resumed) | `conditional approve`: the quoted spy's `const` is out of scope in `finally` | `let spy` before the `try`, `spy?.mockRestore()`; the `grep -c` exit note | D7 confirmed as a known limit; D3 settled |
| Codex r3 (resumed) | `approve` | | |
| Review r1 (Codex, fresh, on the diff) | `findings: 1`: a timed-out case skips its `finally`, leaving the gate, the discovery and the lock watchdog pending | | rejected: only a run already red on a regression; the timed mutation exits 1 in 22 s with no hang; T1's recorder is case-local; T6 has the same shape on `dev` |
| Review r1 (Opus, diff) | `clean` | | |
| Review r2 (Codex, resumed) | `clean`: the rejection accepted, no new finding | | |

## Seeds (not run; the orchestrator drives this lane)

`/goal Phase 1 of implementations-plan/fpc-create-flake-1/plan.md is ✓ with its gate passing in the transcript; the Codex loop converged; the PR against dev exists with Closes #1086 and the close-out commits; test:all and lint exit 0.`

`/loop 15m Drive implementations-plan/fpc-create-flake-1 forward per its plan.md; never merge; stop after the PR's checks report.`

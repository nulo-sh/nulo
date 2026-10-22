---
plan: send-order-flake-1
tier: light
status: completed
issues: "#1083 (arc 1 closes)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: one Explore recon agent (sonnet); one bounded measurement; one Codex audit (gpt-6.1-sol, high) and its resume; one Opus Plan leg
base: origin/dev at 421bf33b4
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-22. **Status:** completed.
- **Shipped:** #1087 (arc 1, closes #1083): the silent-path composition test waits for its record's stored stage; one lane unit test pins that `wait` runs only after the requeue write settles; two TSDoc sentences state that order, that the write is best effort, and that the hand-on order is not promised.
- **Dispositions:** writing `queued` before the hand-on, rejected (D1); the gate as a committed pin, rejected (D4). No `lessons.md` promotion: it is at its 8 KiB budget, and the reproduction technique (hold the write until the test's next read) stays in [lessons/phase-0.md](lessons/phase-0.md).
- **Known limits:** none.
- **Open items:** none.
- **Seeds retired:** the `/goal` and `/loop` below; never run them.

# send-order-flake-1: the parked-send test waits for its record to read queued

One arc, one PR against `dev`: one composition test changed, one lane unit test added, two TSDoc sentences. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Evidence and consults: [lessons/phase-0.md](lessons/phase-0.md).

## Root cause (#1083)

**Path (demonstrated).** Initial conditions: a silent-path dApp send whose record reads `pending`, behind a pending row of its account, so it must park. Events, in order: `parkSlot` calls `executionMutex.keep(release)`, which grants the slot to the test's waiting `takeSlot()` (`execution-lane.ts:370`); it then starts `requeue`, a `transitionIfStage(["pending"] → queued)` that waits for the journal's global transition lock and does two sealed reads and one sealed write (AES-GCM) before it lands (`:373`, `:424-430`; `operation-journal/service.ts:597-616`). The test releases the slot and reads the record once with the lock-free `getOperation` (`send-order.composition.test.ts:309`, `:346`). Nothing orders that read after the write. Invariant broken: the test's premise that the hand-on implies the stored row reads `queued`. Consequence: a red `test:all` and `quality-status` on unrelated PRs. No product consequence (below).

**The issue's claims.** Steps 1 to 3 and the line numbers held. "Passed 3 of 3 alone" did not hold today: alone at load1 about 140 it failed 3 of 6 (lessons/phase-0.md, measurement 1). "Whether the product exposes `pending` in that window is unverified": now traced (recon.md, product readers). A reader can see `pending` for one journal write after the hand-on. No harmful decision was traced: the readers react to `onOperationUpdated`, treat `queued` and `pending` alike, or run outside the window. Two read it as an approved send one write longer, the conservative side: the card ("Preparing...") and the worker's session-expiry check, which reads the journal directly and may defer a lock by one 60 s step (`execution/service.ts:356-359`, `in-flight-send.ts:41-44`, `session-manager.ts:86`).

## The contract (D1)

The stage is eventually consistent with the hand-on. The order the product does promise, and needs, is narrower: the requeue write settles before `wait` runs (`await this.requeue(...)` precedes `await wait()`). It is best effort: a refused write is logged and the row stays `pending`, and a cancel that wins the lock makes it a no-op. The reader that needs this order is the claim after the pre-claim wait. `claimOrCreateDappExecuteJournal` reads the row without the lock and skips its transition on `pending` (`claim-helper.ts:80`, `:110-133`). A write landing after that read would leave a running send at `queued`, from which `simulating` is illegal (`fsm.ts:48`): the send would fail after its prove, reading "Queued..." throughout. Nothing pins this order today. The test changes, a lane unit test pins the order that matters (D7), and the product order stays.

- No product reader depends on the hand-on order (recon.md, eight readers with file and line).
- Neither order is atomic. The slot is in-memory and the stage is a sealed journal row, so writing first only moves the mismatch: the row reads `queued` while it still holds the slot.
- Writing first has a cost: every send of the `(profile, chain)` lane, popup estimates and transfers included, would wait on one global-lock journal write per park. Under load that wait is the very window this flake shows.
- The sibling path already works this way. `TransferExecutor.takeTurn` starts its `pending → queued` write without awaiting it before the wait and awaits it at the claim (`transfer-executor.ts:507-515`, `:535`).
- The owner's decision behind the requeue (OA-1 A, archived `send-queue-activity`) settles what the card reads while the send waits, not the order. The card follows the journal's update events.

## Outcome & Quality Bar

For a maintainer reading a red `test:all`: this test is red only when the product breaks, never on when the journal write lands.

- The composition test fails if a parked silent-path record never reads `queued` while it waits, or if its stage history is not `pending, queued, pending, failed`. It passes in every order of the hand-on and the write in which the write lands within `waitFor`'s 2 s, including the worst (the write held until the test's first read).
- The lane unit test fails if `wait` can start before the requeue write settles: the order the claim depends on.
- The product does not change behaviour. No assertion is loosened, no timeout raised, nothing retried or skipped.

## Architecture & Implementation

- **`send-order.composition.test.ts`, the silent-path test (`:343-350`):** replace the single read at `:346` with `await waitFor(async () => (await h.journal.getOperation(id))?.progress.stage === "queued")`. That is the file's own `waitFor` at its default bound, as `parkedSend` already waits for `depth()`. Above it goes one comment line: the slot is handed on before the record's `queued` write lands. The last two assertions stay as they are. While the pending row exists the send cannot pass its wait, so a stored `queued` here is a record that reads `queued` while it waits. The exact history `["pending", "queued", "pending", "failed"]` still proves the order against the claim.
- **`execution-lane.test.ts`, `ExecutionLane.parkSlot` (D7):** one test. Hold `transitionIfStage` on a `deferred`; park with a `vi.fn` wait; after `flushMicrotasks()`, `wait` has not been called. Resolve the write, then `wait` has been called once (the success control). It asserts nothing about when the slot is handed on (D1, D4).
- **`execution-lane.ts`, two TSDocs (D2):** in `parkSlot` (`:355-360`), replace "a silent-path record reads `queued` while it waits" with "a silent-path record's `queued` write settles before `wait` runs, after the slot is handed on". In `requeue` (`:422-423`), replace "it reads `queued` while it waits" with "this best-effort write makes it read `queued` while it waits". No code changes.
- **File map:** two test files, two TSDoc sentences. No new helper, fixture or dependency.

### Trade-offs and alternatives not taken

- **Write `queued` before `keep`** (the issue's first option): rejected (D1).
- **Wait for the `queued` event, then read** (D3): equally honest. But it needs a second statement, and under the negative control's gate it deadlocks, because nothing reads, so nothing opens the gate. Polling the stored row asserts what the test name claims, in one line.
- **Commit the gate as a permanent pin** (D4): with `requeue` moved before `keep`, the gated write would hold the slot and `parkedSend` would never return. The pin would fix the current order as a contract, against D1. It stays the negative control.
- **An event-promise helper, fake timers, or a fixed sleep**: one caller, or a sleep. Rejected.

## Phase 1: wait for the stored stage (branch `send-order-flake-1-a1`) ✓

1. Edit the composition test, add the D7 lane test, and edit the two TSDoc sentences (D2), as above.
2. Negative control, never committed. Take the test file from `421bf33b4` with `git show 421bf33b4:apps/extension/src/wallet/services/execution/send-order.composition.test.ts` into a scratch `*.composition.test.ts` copy. Add lessons/phase-0.md's `gate(h)` as the first line of the silent-path test. Run it 5 times: each must be red with `expected 'pending' to be 'queued'`. Make the same copy of the fixed file and run it 5 times: each must be green. In the fixed copy, stub the `queued` transition to `{ outcome: "stage", stage: "pending" }` (no write): 5 runs, each red with `waitFor timeout`. Delete the copies. Then, in a scratch edit of `execution-lane.ts`, drop the `await` before `this.requeue`: the D7 test must be red; restore it. Then `git status` must show only the intended files.
3. Run the 100-run soak (gate below). Record the pass count, the host load and the wall time in lessons/phase-1.md.

**Validation gate.** Commands run from the worktree root unless named.

- `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`: each exits 0. `bun run test` reports the base count plus one (the D7 test), none removed or skipped.
- The execution unit, scenario and composition files: `cd apps/extension && bun --bun vitest run src/wallet/services/execution --retry=0` exits 0.
- The soak: `cd apps/extension`, then run `bun --bun vitest run src/wallet/services/execution/send-order.composition.test.ts --retry=0` 100 times, 4 at a time, beside the running lanes, with no load gate. Pass: 100 of 100.
- Negative control (step 2): base plus gate red 5 of 5; fixed plus gate green 5 of 5; fixed with no write red 5 of 5; D7 red without the `await`.
- `bun run check:plans` after staging: exits 0.
- Layers: lint, typecheck, unit, composition. No local e2e (D5).

## Security & Adversarial Considerations

Test code and one doc sentence: no product behaviour, permission, storage, wire, CI or dependency change. The risk is the test's honesty. The wait proves only that the stored row reads `queued` while the send waits; it does not prove the write settles before `wait` (with a fire-and-forget requeue the history would still read `pending, queued, pending, failed` here). The D7 unit test pins that order, and the TSDoc states it. A dropped requeue makes `waitFor` time out. A requeue landing after the claim shows in the exact history. No attacker capability changes: neither order closes a lock-free read, and the row already reads `pending` through its first wait for the slot.

## Assumptions

- **Facts.** F1 `parkSlot` order: `keep`, `beginExecutionWait`, `await requeue`, `await wait()` (`execution-lane.ts:370-374`). F2 `requeue` never throws (`:424-430`). F3 `transitionIfStage` runs under the journal's global lock, and `getOperation` takes none (`operation-journal/service.ts:84`, `:531-535`, `:597-616`). F4 the event is emitted only after the write resolves (`_transitionLocked`, `:403-404`). F5 base alone at load1 about 140: 3 of 6 red; base plus gate 5 of 5 red; fixed plus gate and fixed alone 5 of 5 green (lessons/phase-0.md). F6 the transfer sibling (`transfer-executor.ts:507-515`, `:535`). F7 the other tests in the file read a record only after `await run` or before any park (`:232`, `:239`, `:379`), so they share no unordered read. F8 the claim reads the row lock-free and skips its transition on `pending` (`claim-helper.ts:80`, `:110-133`); `queued → simulating` is illegal (`fsm.ts:48`).
- **Inferences.** I1 (a hypothesis until the soak) the write lands well inside `waitFor`'s 2 s under this host's load: the same bound already covers a record created under the global lock (`:228`), and the write is one uncontended lock plus three AES-GCM operations on a small row. A soak red on `waitFor timeout` is a finding to trace, never a reason to raise the bound. I2 a CI runner fails the same way, since the order is load-sensitive, not machine-specific.
- **Asks.** None. No surface a person sees changes.

## Decision ledger

- D1 The stage is eventually consistent with the hand-on. The test waits; the product order stays (the contract above).
- D2 Two TSDoc sentences state the guaranteed order (the write settles before `wait`), the one not guaranteed (after the hand-on), and that the write is best effort. The ambiguous sentences are what the test was written against.
- D3 Poll the stored stage, not the event.
- D4 The gate stays a negative control, not a committed pin.
- D5 No local e2e. The product change is a TSDoc sentence with no runtime effect. The PR's `apps/extension/**` change trips the smoke and network lanes on both browsers in CI anyway.
- D6 Scope: this one test. No other reader in the file, or any unit test (they mock the lane), reads a parked record's stage at an unordered point.
- D7 One lane unit test pins write-before-`wait`; nothing pinned it (Opus finding 1, Codex finding 2). The claim needs only write-before-return; write-before-`wait` is the stronger, documented order, which also makes the record read `queued` from the start of the wait.

## UI impact

None. No surface a person sees changes.

## Delivery

Branch `send-order-flake-1-a1` off this plan's commit (on `origin/dev` at the arc's start). Merge `origin/dev` before the gates. One PR against `dev` with `gh pr create`, opened after the gate and the Codex loop. Title: `test(send): the parked-send test waits for its record to read queued` (68 characters). Body: the path and its evidence, D1 with the product readers and the claim's dependency, the negative controls and soak counts, `UI impact: none`, `Closes #1083`. No label at creation. No lanes.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at `421bf33b4`, single arc, over the diff from the plan commit. `code_review: off`. Run the Codex loop with `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resume it with `resume-codex.sh`, and stop at three rounds. Log each round in `lessons/phase-1.md` and under Audit verdicts. Run one Opus diff review (`general-purpose`) beside round 1. A fix that grows the design stops for the orchestrator. The close-out is the PR's final commits: the Outcome, the lessons pass, the archive move. Teardown after the merge: `agent-worktree done send-order-flake-1 --merged`.

## Audit verdicts

**Round 1, Codex** (gpt-6.1-sol, high, session 01a16550): conditional approve, 4 findings, all accepted. #1 the requeue is best effort (a refused write is logged; a cancel makes it a no-op), so "reads `queued` before `wait`" overclaimed: D1 and D2 now say the write settles. #2 the exact history cannot tell a fire-and-forget requeue from an awaited one: the Security claim narrowed, and D7 pins the order. #3 "none acts on it" was too absolute: reworded to "no harmful decision traced", naming the conservative readers. #4 I1 is a hypothesis until the soak.

**Round 1, Opus Plan:** conditional approve, 5 findings, all accepted. #1 the reader that needs write-before-`wait` is the claim helper, not `reclaimParked`, and nothing pins the order: D1 cites `claim-helper.ts:80`, `:110-133`, `fsm.ts:48`; D7 adds the lane test. #2 both TSDocs, `requeue`'s included, overclaim: both reworded (D2). #3 session expiry reads the journal directly, not through events: recon row corrected, the consequence (one 60 s deferral step) stated. #4 the negative control lacked its red half: a no-write variant must be red 5/5, and D7 must be red without the `await`. #5 I1 cited `depth()`, which involves no write: it now cites `:228`, and the Quality Bar says "within 2 s".

**Round 2, Codex** (resume): conditional approve, 1 finding, accepted: the gate required the base test count, which D7 makes base plus one. D7 judged a correct, sufficient pin by code trace, inside the lane's scope, and neutral on the hand-on order. No new product or security defect.

**Round 3, Codex** (resume): **approve**, high confidence: the count fix verified, no regressions or new findings. Light tier: this resumed verdict is the final pass.

**Implementation rounds** (diff `3cb3a0822..0317ba973`). Round 1, Codex (gpt-6.1-sol, high, session 01a16561): approve, no findings. Opus diff review: approve, 3 nits, all fixed: the test comment and `parkSlot`'s TSDoc stated today's hand-on order as fact; the lane test's held write now goes in after the acquire. Round 2 (resume): approve, no findings; the loop converged. Gates and soak: [lessons/phase-1.md](lessons/phase-1.md).

## Seeds

`/goal` (recommended): `/goal Phase 1 of implementations-plan/send-order-flake-1/plan.md is ✓, backed by its validation gate in the transcript (lint, typecheck:all, test, test:all exit 0, `bun run test` at the base count plus one; the execution directory green at retry 0; send-order.composition.test.ts 100/100 at retry 0; base plus gate red 5/5, fixed plus gate green 5/5, fixed with no write red 5/5, the D7 lane test red without the await), LESSONS_FILE=implementations-plan/send-order-flake-1/lessons/phase-1.md printed; /code-review not run; the Codex loop converged (a resumed pass with no new material finding, quoted); the PR exists, opened after the loop (gh pr view output).`

`/loop` (fallback): `/loop 15m Drive implementations-plan/send-order-flake-1 forward; never idle. Read plan.md and lessons/. If the plan directory is gone, git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/send-order-flake-1/plan.md: success means merged, so run agent-worktree done send-order-flake-1 --merged and stop; failure means delivered, so watch the PR's checks. Otherwise run phase 1's gate, then the Post-implementation section. Never merge. The same step failing 5 times: reassess with Codex.`

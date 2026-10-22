---
plan: account-read-flake-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 6ec79be30
trunk: dev
issues: "#1089 (arc 1 closes it); #1091 (no arc: filed from D6, outside the lane's scope)"
budget: one Explore recon agent (sonnet); in-place probes; one Codex audit (gpt-6.1-sol, high) and its resumes; one Opus Plan leg
post_implementation_hardening: not scheduled
---

# account-read-flake-1: the rename-and-visibility case proves order, not time

One arc, one PR against `dev`, test-only. The case "a name change parked at its read cannot revert a concurrent visibility change" (`apps/extension/src/wallet/services/account/service.test.ts:595-652`) bounds two steps by zero timers. The first bound can red a correct product; the second only decides whether the case can catch a broken one. The arc replaces both with order facts. Recon: [recon.md](recon.md). Probes and consults: [lessons/phase-0.md](lessons/phase-0.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none).

## The finding (#1089) and what held

**Path.** Initial conditions: a legacy plaintext account row; the keyed `accounts` root; Bun 1.4.2, which settles WebCrypto off the main thread. Events in order: `changeAccountName` takes the row lock, and its `get` signs the address (`keyedSegment`, one `crypto.subtle.sign`) before the sealed read and the legacy read the wrapper parks (recon.md, product path). The test waits one zero timer, starts `changeAccountVisibility`, waits one more, and calls `parked?.()`. If the sign settles after both timers, `parked` is still null, the release does nothing, and the read parks later with nobody to release it. Invariant broken: the test's own premise, "the name change reaches its parked read within two zero timers". Consequence: `Promise.all` hangs into the 5 s timeout, an intermittent red `Unit tests` in `quality-status` on unrelated PRs. No product invariant is involved.

**Label: plausible but unverified as observed; the mechanism is demonstrated.** Never seen red in CI. With the real sign delayed by three zero timers, base fails with `Test timed out in 5000ms` (F5).

**The issue's claims.** Steps 1 to 4 and the line numbers hold: timers at `:641` and `:643`, the release at `:644`. "The sealed read and the legacy read the wrapper parks" is exact: the sealed key never contains the natural id (recon.md), so the legacy read is the parked one. Not in the issue: the file already has the reached-signal wrapper, `parkRowRead` (`:904-924`), and this case is a second copy of it without the signal.

**The second timer (the issue's question).** It cannot red a correct product: the visibility change is queued on the row lock whatever the timing. It gives a visibility change that is not serialised time to read and write while the name change is parked, so it decides whether the case catches that regression. That is a time bound too: under load an unserialised change may not get far enough in one timer. With no wait at all the mutation was still red 5 of 5, but only because its read needs one crypto call and the name change's write two (lessons/phase-0.md).

## Outcome & Quality Bar

- **For whom:** every contributor whose PR runs `quality-status`, and the maintainer who reads this pin when the account editors change.
- **Excellent:** (1) The case passes or fails by event order alone. No timer, poll or timeout value decides it. (2) It is red in milliseconds when a second editor of the row is not queued behind the first (step 5's control), and red by its outcome assertion when the queued editor writes a stale row.
- **Good enough:** the file's other zero-timer waits stay (D4); the reproduction and the mutation are scratch (D3).

## Assumptions

**Facts** (verified at the base):
- F1. The case's shape, as recon.md quotes it (`:619-650`).
- F2. `patchAccountField` runs its read-modify-write under `tupleLocks.withLock(accountRowId(...))` (`account/service.ts:568-588`). Its `get` makes one sign before the parked read; nothing else before the park leaves the main thread (`FakeBrowserApi` storage is microtask-only).
- F3. `KeyedLock.withLock` queues the caller synchronously, inside `Lock.enter`'s promise executor, and `waiting(key)` counts the callers queued behind the holder (`keyed-lock.ts:45-52`, `lock.ts:44-46`, `:64-67`, `:91-92`). `patchAccountField` takes the lock as its first statement (`service.ts:575`). So a visibility change called while the name change holds the row reads `waiting(rowId) === 1` at once. The case rests on that premise: an await added before the lock (as `getAccount` has, `:272`) would red it with `expected +0 to be 1` while the edits still serialise, and the case's comment says so.
- F4. `parkRowRead` (`:904-924`) parks the first read of an exact key after it returns and resolves `parked` when it does. Only the purge `describe` can use it today: it closes over that block's `rowKey`.
- F5. Probes (lessons/phase-0.md): base plus the sign delay times out at 5000 ms; the prototype fix plus the delay passes; the prototype plus the no-lock mutation is red in 21 ms with `expected +0 to be 1`; base plus the mutation is red 5 of 5.
- F6. The unit config sets no `testTimeout` and no `retry` (`apps/extension/vitest.config.ts`, `vitest.base.mts`), so 5 s and 0 apply. The environment is jsdom, and `crypto.subtle` is the runtime's.
- F7. The file already reaches private members through casts (`emit` `:79`; `decodeAccountExport` `:701`).
- F8. None of the file's other zero-timer waits can red a correct product (recon.md's table). Separately, the three purge pins that use `parkRowRead` (`:927-955`) no longer catch the regression they name (D6).

**Inferences.** I1: the observed mechanism (a late sign) is the one CI would hit. The spy shows it suffices; the fix does not depend on it.

**Asks:** none. One test file changes; nothing a person sees.

## Architecture & Implementation

- **Change map:** only `service.test.ts`.
  1. Hoist `parkRowRead` to module scope with the row key as a parameter: `parkRowRead(api: FakeBrowserApi, rowKey: string)`. Its body stays. Its TSDoc says it parks the first read of `rowKey` (not "keyed read": since rows are sealed, "keyed" names the HMAC root), and gains the serialize case's reason for parking after the read: the parked run then holds a row it has already read, while parking before it would let the resumed read see fresh state. Its two call sites in the purge `describe` (`:932`, `:946`) pass their `rowKey`; their assertions do not change (D6).
  2. The serialize case: `const rowKey = \`nulo:core:accounts@${rowId}\``, seeded under that key; `const gate = parkRowRead(api, rowKey)`; start the name change; `await gate.parked`; start the visibility change; `expect((service as unknown as { tupleLocks: { waiting(key: string): number } }).tupleLocks.waiting(rowId)).toBe(1)`, the file's inline cast style (F7), with one comment line: the editors take the row's lock before any await, so the visibility change is queued here and reads only after the name change writes; `gate.release()`; `await Promise.all(...)`; the two outcome assertions unchanged. Delete the inline wrapper, both timers, `parked`, `armed` and the `get` restore: once disarmed, the wrapper passes reads through, as in the purge cases.
- **Flow:** the name change reaches its parked read, then the visibility change is called and queued synchronously (F3), then the assertion, then the release. If the name change never reaches the read, `await gate.parked` blocks and the case fails by its timeout: a product change, not a race. If the visibility change is not queued when its call returns, the case is red at once.
- **Simpler alternative not taken:** keep the second timer (D2).

### Decision ledger

- **D1** Replace the first timer with `parkRowRead`'s `parked`, hoisted and parameterised. Rejected: an inline `deferred` in the case (a second copy of the helper; the prototype did this); more timers or a `settle()` of many (still a time bound); draining WebCrypto first (another off-thread step reopens the race).
- **D2** Replace the second timer with `waiting(rowId) === 1`, asserted synchronously before the release. It states the order the product promises, "whole-row read-modify-write under the row's tuple lock" (`service.ts:566-567`), and it needs no wait because queuing is synchronous (F3). Rejected: keeping the timer, since it is a time bound on catching the regression; a wrapper-only "no row read while parked" check, since absence needs a bound (no finite observation short of a deadline proves a read never comes); releasing on the visibility change's read, which deadlocks the correct product; a spy on `crypto.subtle.sign`, which couples the case to the storage path instead of the lock. Cost: the case reads a private field. The file already does that (F7), and a serialisation that replaces the lock must rewrite this pin anyway.
- **D3** The reproduction (sign delay) and the no-lock control are scratch edits of the test file: applied, run and reverted, their results in `lessons/phase-1.md`. The control replaces the instance's `tupleLocks.withLock` with a direct call, which is what `patchAccountField` without its lock does in this case, so the lane never edits `account/service.ts` (Codex r1 #1; red in 24 ms, lessons/phase-0.md). No committed test of a test.
- **D4** Scope: this case. The other zero timers (`:96`, `:108`, `:727`, `:780`, `:830`, `:936`, `:950`) either bound a prefix with no WebCrypto, or bound only how well a case catches a regression; none can red a correct product (recon.md). No issue: no path has a consequence.
- **D5** No e2e: no product change. CI's path filters decide the lanes.
- **D6** The purge pins (`:927-955`), out of this arc: filed as #1091 (Opus finding 1; Codex r2 agrees, "it merits an open issue rather than a known-limit disposition"). **Demonstrated**: with the row lock removed from every editor and purge (the step 5 control), all three stay green 3 of 3, because they look only for the plaintext keys (`:940`, `:954`), while a rename resumed after the purge writes the row back under its sealed key (`sealed-entity-storage.ts:178-195`). Filtering by the root prefixes reds the describe in every run (2, 3 and 3 of 3 cases); on the correct product it stays green (lessons/phase-0.md). Their zero timer then bounds catching that regression; the purges reach the lock only after `ensureInitialized` and `liveRows`, so #1091's fix observes the lock request instead. Folding it in is the orchestrator's call, not this arc's.

## Security & Adversarial Considerations

Test-only: no product code, dependency, workflow, permission, key or crypto change. The risk is a pin that passes vacuously. The no-lock control must be red, by the queue assertion. The outcome assertions pin the end state; they catch a stale write only when it lands last, so an editor that starts its read before taking the lock is not caught deterministically, by this case or the old one. The sign-delay spy returns the real signature, so the storage keys and the sealed path are those the product uses; a late settlement is a schedule Bun permits, since it settles WebCrypto off the main thread. No attacker capability changes.

**UI impact:** none. The arc touches no surface a person sees.

## Phase 1: the order proof

**Assumptions:** F1-F8; I1 is not relied on.

1. On `worktree-account-read-flake-1`, whose tip is the plan commit, merge `origin/dev`. Record the merged SHA as BASE in `lessons/phase-1.md`. If ui-keys-sealed-1 (#1051) landed edits to this file or to `patchAccountField`, re-verify F1-F3 against them first.
2. Reproduce on BASE. Revert this edit before step 3: a spy left in the file hides the bug it proves. In the serialize case, insert these lines directly before `service.changeAccountName(...)`, and `spy.mockRestore()` directly after `await Promise.all(...)`:
   ```ts
   const sign = crypto.subtle.sign.bind(crypto.subtle)
   const spy = vi.spyOn(crypto.subtle, "sign").mockImplementation(async (...args: Parameters<typeof sign>) => {
   	for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0))
   	return sign(...args)
   })
   ```
   Run the case: `cd apps/extension && bun --bun vitest run src/wallet/services/account/service.test.ts --retry=0 -t "cannot revert a concurrent visibility"`. Expect `Test timed out in 5000ms`. From the worktree root: `git checkout -- apps/extension/src/wallet/services/account/service.test.ts`.
3. Edit the file as the change map says. Commit.
4. In the edited case, insert the same lines directly before the name change and `spy.mockRestore()` directly after `await Promise.all(...)`. Run the case: expect green. `git checkout -- apps/extension/src/wallet/services/account/service.test.ts`.
5. The no-lock control, from the test file, so `account/service.ts` is never edited (D3). In the edited case, insert directly before the name change: `vi.spyOn((service as unknown as { tupleLocks: { withLock: (key: string, fn: () => unknown) => Promise<unknown> } }).tupleLocks, "withLock").mockImplementation((_key, fn) => Promise.resolve(fn()))`. Run the case: expect red with `expected +0 to be 1`. Revert as in step 4.
6. Soak (below), beside the running lanes, no load gate. Record load1 at the start and the end. A red log is read: a red in the serialize case fails the gate; a red in another case is recorded with its log and filed after a dedupe, and the soak is not rerun to get a clean count. Log steps 2, 4, 5 and 6 with their outputs in `lessons/phase-1.md`.

```sh
cd apps/extension && seq 100 | xargs -P4 -I{} sh -c 'bun --bun vitest run src/wallet/services/account/service.test.ts --retry=0 >~/.cache/nulo-backlog/account-read-flake-1/soak-{}.log 2>&1 && echo ok || echo red' | sort | uniq -c
```

**Validation gate** (lint, typecheck, unit; no e2e). Commands run from the worktree root unless they start with a `cd`:
- `cd apps/extension && bun --bun vitest run src/wallet/services/account --retry=0`: exit 0; `service.test.ts` reports the count it reported at BASE (62 at `6ec79be30`), none skipped.
- `bun run test:all`, `bun run lint`, `bun run typecheck:all`, `bun run lint:actions`: each exits 0.
- `git diff origin/dev --stat` lists only `service.test.ts` and plan files; `account/service.ts` is untouched.
- `grep -c 'spyOn(crypto.subtle\|"withLock")' apps/extension/src/wallet/services/account/service.test.ts` prints 0: no scratch spy is left. Read the count: `grep -c` exits 1 on 0.
- Steps 2, 4 and 5 gave the expected results: they are the proof. Step 6 printed `100 ok`, or every red is outside the serialize case and filed; a smoke run, since base also passes on an idle host.
- `bun run check:plans` exits 0 after staging the plan files.

## Delivery

One arc on `worktree-account-read-flake-1`, one PR against `dev`, no stack (D-orch-1), opened only after the gate and the review loop. Title: `test(account): the rename-and-visibility case awaits the parked read and the queue` (82 characters). Body: the path, the issue's claims, steps 2, 4 and 5 as the proof and step 6 as a smoke run with their outcomes, `UI impact: none`, `Closes #1089`. No label: the `apps/extension/**` path filter decides the lanes. The close-out is the PR's final commits.

## Post-implementation

The execution contract is this plan plus `implementations-plan/README.md` § Post-implementation standard at `6ec79be30`. Plan-specific values:

- **Step 1 (diff review):** absent (`code_review: off`).
- **Step 2 (review loop):** once, over `git diff origin/dev...HEAD` after Phase 1 is green: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, with the standard's two rules verbatim and the adversarial ask; resume with `resume-codex.sh`. One Opus `general-purpose` diff review runs beside round 1. Hard stop at three rounds. A fix that grows the design stops for the orchestrator.
- **Step 3 (delivery):** `gh pr create --base dev`, then `gh pr checks <n> --watch` to the end. Never merge.
- **Step 4 (close-out):** merge `origin/dev`; read what changed in `index.md` and `lessons.md`. Write the Outcome. Promote no lesson unless a line is retired for it (the file is at its 8 KiB budget). Delete `STATUS.md`. `git mv` the folder into `archive/` in its own commit; move the index line to `archive/index.md`; `bun run check:plans` green after staging.
- **Step 5 (teardown):** once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/account-read-flake-1/plan.md` succeeds, `agent-worktree done account-read-flake-1 --merged`. The orchestrator's next spawn notices the merge.

## Audit verdicts

| Round | Verdict | Taken | Rejected or kept |
|---|---|---|---|
| Codex r1 (`gpt-6.1-sol`, high) | `conditional approve`: resolve the product-file mutation, make the spy lines exact | the no-lock control moved into the test file (D3, step 5); step 2 quotes the spy; the gate's BASE count, working directories and `lint:actions` | none. A to D upheld: reuse the helper; the private lock read is a proportionate pin, a production observation API would be excessive; no wrapper-only proof without a progress bound |
| Opus (Plan) | `conditional approve`: findings 1 and 2 | 1 (high, demonstrated) as D6 and #1091; 2 (medium) the lock-before-await premise in F3 and the comment; 3 Security reworded; 4 inline cast; 5-7 wording, recon, soak reds, grep, `<prompt-file>` | folding #1091 into this arc: scope (D6) |
| Codex r2 (resumed) | `approve`; one low: the `/goal` seed demanded `100 ok` against step 6's red rule | the seed now matches the gate and names `lint:actions`; D6's red counts per run | none |

Light tier: Codex r2, resumed after every finding was taken, is the final pass.

## Seeds (not run; the orchestrator drives this lane)

`/goal Phase 1 of implementations-plan/account-read-flake-1/plan.md is ✓ with its gate passing in the transcript (steps 2, 4, 5 as expected; the soak 100 ok, or every red outside the serialize case read and filed, never rerun for a clean count; test:all, lint, typecheck:all and lint:actions exit 0); the Codex loop converged (a resumed pass with no new material finding, quoted); the PR against dev exists with Closes #1089 and the close-out commits.`

`/loop 15m Drive implementations-plan/account-read-flake-1 forward per its plan.md; never merge; stop after the PR's checks report.`

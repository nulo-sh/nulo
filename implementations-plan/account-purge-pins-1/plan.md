---
plan: account-purge-pins-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at c49430a6d
trunk: dev
issues: "#1091 (arc 1 closes it)"
budget: one Explore recon agent (sonnet); in-place probes; one Codex audit (gpt-6.1-sol, high) and its resumes; one Opus Plan leg
post_implementation_hardening: not scheduled
---

# account-purge-pins-1: the purge pins see the sealed row and wait on the lock, not a timer

One arc, one PR against `dev`, test-only. The three pins "AccountService purges wait for a rename holding the same row" (`apps/extension/src/wallet/services/account/service.test.ts:878-956`) look for the plaintext keys only, which a rename always removes, and give the purge a zero-timer head start. The arc makes them check both roots, orders the release on the purge's observed lock request, and adds one case for reconcile's delete lock. Recon: [recon.md](recon.md). Probes and consults: [lessons/phase-0.md](lessons/phase-0.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none).

## The finding (#1091) and what held

**Path.** Initial conditions: a legacy plaintext imported account and its key row; the keyed `accounts` root; the profile's row keys held. Events in order: the rename takes the row lock and parks after its read; the purge lists the row; with no row lock the purge deletes the plaintext row; the rename resumes and writes the row sealed, then removes the plaintext twin (`sealed-entity-storage.ts:178-198`, `:439-441`). Invariant broken: the pins' claim, "the renamed row is not written back after the delete". Consequence: a change that drops a purge's row lock passes `quality-status`, and the product would leave a sealed account row behind a network or profile deletion that raced a rename.

**Label: demonstrated** (lessons/phase-0.md): the current pins stay green under the issue's no-lock control, three runs of three cases, and under a control that leaves the sealed form in place (C3).

**Claims.** Steps 1 to 4 and the line numbers (`:927-955`) hold. One claim holds only in part: "the locks the pins guard: `:1281` and `:1291`". In the reconcile pin the rename starts first, so either lock alone orders it, and a source-level removal of one stays green. The fourth case pins `:1291` alone. `:1281` alone stays unpinned: the delete re-checks under its own lock, so its removal has no consequence a pin can see (D5).

## Outcome & Quality Bar

- **For whom:** the maintainer who changes a purge or the row lock and relies on these pins to go red.
- **Excellent:** (1) Each pin reds in milliseconds, by its queue check, when its purge does not queue on the row lock behind the rename (C1, C2, C4). (2) Each pin's end state counts the sealed form, so a purge whose deletes leave it reds (C3), and the rename's own write is proven to have landed. No timer, poll or timeout decides any of it.
- **Good enough:** `:1281` is pinned only together with `:1291` (D5); the controls stay scratch (D6).

## Assumptions

**Facts** (verified at the base):
- F1. The pins' shape, as recon.md quotes it: plaintext-only filters at `:940` and `:954`, zero timers at `:936` and `:950`, the rename's result unread.
- F2. A rename's write, under its row lock, sets the sealed row and then removes the plaintext twin: two awaited storage calls (`patchAccountField`, `account/service.ts:568-588`; `prepare`, `sealed-entity-storage.ts:178-198`; `commitWithRemovals`, `:439-441`).
- F3. `KeyedLock.withLock` queues the caller synchronously, and `waiting(key)` is the queue's length (`keyed-lock.ts:45-52`, `lock.ts:44-46`, `:64-67`, `:91-92`). So when the original `withLock` returns, the request is queued.
- F4. Each purge reaches the row lock only after awaits of its own (`:237-245`, `:941-956`, `:1277-1281`). An assertion right after the call reads 0. Reconcile awaits its purge subscribers between its check lock and its delete lock (`:1285-1291`); `registerAccountPurgeSubscriber` is public (`:1258`).
- F5. `purgeForProfile`'s raw pass deletes every row at this profile's keys by storage id, sealed included (`:964-990`).
- F6. In this harness nothing else requests the row lock after the rename parks: no `onRowKeysReady` invoke on its fake; the fourth case's subscriber requests no row lock.
- F7. Probes (lessons/phase-0.md): the four cases are green on the product; C1, C2 and the widened C3 red all four; C4 reds the fourth case while case 3 stays green; without the race, C2 reds only by `Test timed out in 5000ms`.
- F8. account-read-flake-1 (#1089) hoists `parkRowRead(api, rowKey)` to module scope (its arc 1 commit `016e5e407`, not yet on `dev`).

**Inferences.**
- I1: #1089's squash keeps `parkRowRead(api, rowKey)` as it is in `016e5e407`. Step 2 re-checks it.
- I2: the signal means "some request for `rowId`"; it is the purge's only by F6. A purge that reached `withLock` through a reference bound before the wrapper would never fire it, and a correct purge would red by the 5 s timeout: a loud false red, never a silent pass.

**Asks:** none. One test file changes; nothing a person sees.

## Architecture & Implementation

- **Change map:** only `service.test.ts`, inside the purge `describe`, on top of #1089's helper.
  1. `const rowId = accountRowId("p1", 1, "0xaa")`; `rowKey` and `keyRowKey` derive from it. Import `type KeyedLock` beside `deferred`.
  2. `rowsLeft(api)`: every storage key under `nulo:core:accounts@` or `nulo:core:imported-account-keys@` (D1).
  3. `purgeBehindRename(api, service, purge)`: park the rename with `parkRowRead(api, rowKey)`; `await gate.parked`; take `tupleLocks` through the file's cast style, `(service as unknown as { tupleLocks: KeyedLock })`; replace its `withLock` with a wrapper that calls the bound original and, after it returns, resolves `requested` for `rowId`; start the purge; `await Promise.race([requested.promise, purging])`; `expect(locks.waiting(rowId)).toBe(1)`; release; `return Promise.all([rename, purging])`. One comment line: a purge that settles without asking for the row's lock fails the queue check at once (D2).
  4. The three cases: `const [renamed, …] = await purgeBehindRename(…)`; `expect(renamed?.name).toBe("renamed")` (D3); `expect(await rowsLeft(api)).toEqual([])`; reconcile keeps its `dropped` assertion. Test names stay.
  5. A fourth case, "reconcileImportedAccounts: a rename started after the keyless check is not written back" (D5). Remove the key row; register a purge subscriber that resolves `inSubscriber` and awaits `resume`; start the reconcile; `expect(await Promise.race([inSubscriber.promise.then(() => "subscriber"), reconciling.then(() => "settled")])).toBe("subscriber")`; then `purgeBehindRename` with a purge that resolves `resume` and returns `reconciling`; the same three assertions as case 3.
- **Flow:** rename parked holding the lock → wrapper installed → purge's awaits → its row-lock request, queued synchronously (F3) → signal → queue check → release → rename writes sealed → purge deletes both forms → both roots empty. In the fourth case the reconcile is parked in its subscriber, past its check, before the rename starts.
- **Simpler alternative not taken:** keep the timers and widen only the filters. The filter alone catches C1 only when the purge's delete wins a race with the rename's write: 2, 3 and 3 cases of 3 in #1091's runs.

### Decision ledger

- **D1** Root prefixes over both roots in every case. The fixture holds one account, so "no key under either root" is "no row of this account". Rejected: exact keys computed with `keyedSegment`, which go vacuous if the keyed-id scheme moves, since a row then lands at a key the test never reads. A sibling account is a scoping pin, outside this lane. For reconcile the key root is empty from setup; one helper serves all.
- **D2** The wrapper's signal is the honest point: the request is queued when the original returns (F3), whatever awaits came before (F4). It is installed after the rename parks, so the rename's own request never fires it. `Promise.race` with the purge: a correct purge cannot settle before its request, so the race only changes a regression's red from the 5 s timeout to an immediate `expected +0 to be 1` (F7). Rejected: a zero timer or `until` poll (time bounds); asserting right after the call (F4).
- **D3** The rename's result is the success control: `patchAccountField` returns it only after the sealed write resolved, so "no row left" is not vacuous for a rename that refused.
- **D4** One helper for the park, request and release, which the two tests duplicate today and the fourth case reuses. `rowsLeft` stays in the `describe`; the lock cast is inline in the helper, its one caller (Opus 2); #1089's cast in its own case is not touched.
- **D5** The fourth case pins reconcile's delete lock alone, on the schedule its comment names (`:1290`): a rename that starts while reconcile awaits its subscribers. Case 3 cannot see that lock's removal (C4). The subscriber is the public seam (F4); the staging race asserts its winner, so a reconcile that settles early reds there at once. `:1281` alone stays unpinned: with it removed, `:1291` still re-checks under the lock, so no consequence follows. Opus finding 1; Codex r1 called it optional, r2 took it.
- **D6** Controls C1 to C4 are scratch edits of the test file, applied, run and reverted, results in `lessons/phase-1.md`. `account/service.ts` is never edited. No committed test of a test.
- **D7** No e2e: no product change.

## Security & Adversarial Considerations

Test-only: no product code, dependency, workflow, permission, key or crypto change. The risk is a pin that passes vacuously; C1 to C4 must each red. The queue check holds only while the purge and the rename share the `rowId` key and `tupleLocks`; a redesign that moves the lock must rewrite these pins, and the check reds until it does (I2). No attacker capability changes.

**UI impact:** none. The arc touches no surface a person sees.

## Phase 1: the pins

**Assumptions:** F1-F8; I1 re-checked in step 2; I2 not relied on.

1. Wait until the PR that closed #1089 is merged and its merge commit is on `origin/dev`. Run this call again while it exits 124; stop waiting after eight hours in total and end at the plan report, with `arc1.progress` saying the arc waits on #1089:
   ```sh
   timeout 6900 sh -c 'until git fetch -q origin dev && n=$(gh issue view 1089 --repo nulo-sh/nulo --json closedByPullRequestsReferences -q ".closedByPullRequestsReferences[0].number") && [ -n "$n" ] && sha=$(gh pr view "$n" --repo nulo-sh/nulo --json mergeCommit -q .mergeCommit.oid) && [ -n "$sha" ] && git merge-base --is-ancestor "$sha" origin/dev; do sleep 300; done'
   ```
2. Merge `origin/dev`. Record the merged SHA as BASE and `service.test.ts`'s test count at BASE in `lessons/phase-1.md`. Check `parkRowRead(api, rowKey)` and the purge `describe` against F1, F8; if the helper is absent or changed, stop and re-plan the change map. If #1051 landed in `account/`, re-check F2-F6.
3. Edit as the change map says. Commit.
4. The controls. Insert each in `makeHarness` after `services.start()` unless it says otherwise, run the describe, then revert with `git checkout -- <file>`. Let `L` be `(service as unknown as { tupleLocks: KeyedLock }).tupleLocks` and `direct` be `((_k: string, fn: () => unknown) => Promise.resolve(fn())) as never`:
   - C1: `vi.spyOn(L, "withLock").mockImplementation(direct)`. Expect 4 red by `expected +0 to be 1`.
   - C2: in `purgeBehindRename`, directly after the wrapper, `locks.withLock = direct`. Expect 4 red by the same message, each in under 1 s.
   - C3: every delete path removes only the plaintext form. Spy the instance's `storage.purgeId` and `storage.delete` to `(id) => api.storage.local.remove(\`nulo:core:accounts@${id}\`)`, and `storage.deleteStorageId`, whose argument is a storage id, to `(id) => (id === rowId ? api.storage.local.remove(rowKey) : Promise.resolve())`. Expect 4 red by `toEqual([])`.
   - C4: only the third `withLock(rowId)` call runs `fn` directly, through a counting wrapper on `L`; for both reconcile cases that call is the delete's. Expect case 3 green and the fourth case red by `expected +0 to be 1`.
5. Soak, beside the running lanes, no load gate. Record load1 at the start and the end. Then count the logs whose summary reads `Tests  N passed (N)`, N the BASE count plus 1. Read every other log. A red in this `describe` fails the gate. A red elsewhere is recorded and filed after a dedupe, never rerun for a clean count. A log with no `Tests` line ran nothing: find the cause, fix it, and run the whole soak again.

```sh
mkdir -p ~/.cache/nulo-backlog/account-purge-pins-1 && cd apps/extension && seq 100 | xargs -P4 -I{} sh -c 'bun --bun vitest run src/wallet/services/account/service.test.ts --retry=0 >~/.cache/nulo-backlog/account-purge-pins-1/soak-{}.log 2>&1 && echo ok || echo red' | sort | uniq -c
```

**Validation gate** (lint, typecheck, unit; no e2e). Commands run from the worktree root unless they start with a `cd`:
- `cd apps/extension && bun --bun vitest run src/wallet/services/account --retry=0`: exit 0; `service.test.ts` reports the BASE count plus 1 (63 on `c49430a6d`), none skipped.
- `bun run test:all`, `bun run lint`, `bun run typecheck:all`: each exits 0.
- `git diff origin/dev --stat` lists only `service.test.ts` and plan files.
- `awk '/purges wait for a rename/,/provisionDefaultAccount/' apps/extension/src/wallet/services/account/service.test.ts | grep -c 'spyOn\|mockImplementation\|setTimeout'` prints 0: no control or timer is left. Read the count: `grep -c` exits 1 on 0.
- Step 4 gave the expected results. In step 5, 100 logs read `Tests  N passed (N)`, or every other log failed outside this `describe` and is filed.
- `bun run check:plans` exits 0 after staging the plan files.

## Delivery

One arc on `worktree-account-purge-pins-1`, one PR against `dev`, no stack (D-orch-1), opened only after the gate and the review loop. Title: `test(account): the purge pins check both roots and await the purge's lock request` (81 characters). Body: the path, the claims, the fourth case and D5's reach, step 4 as the proof and step 5 as a smoke run with their outcomes, `UI impact: none`, `Closes #1091`. No label: the `apps/extension/**` path filter decides the lanes. The close-out is the PR's final commits.

## Post-implementation

The execution contract is this plan plus `implementations-plan/README.md` § Post-implementation standard at `c49430a6d`. Plan-specific values:

- **Step 1 (diff review):** absent (`code_review: off`).
- **Step 2 (review loop):** once, over `git diff origin/dev...HEAD` after Phase 1 is green: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, with the standard's two rules verbatim and the adversarial ask; resume with `resume-codex.sh`. One Opus `general-purpose` diff review runs beside round 1. Hard stop at three rounds. A fix that grows the design stops for the orchestrator.
- **Step 3 (delivery):** `gh pr create --base dev`, then `gh pr checks <n> --watch` to the end. Never merge.
- **Step 4 (close-out):** merge `origin/dev`; read what changed in `index.md` and `lessons.md`. Write the Outcome. Promote no lesson unless a line is retired for it (the file is near its 8 KiB budget). Delete `STATUS.md`. `git mv` the folder into `archive/` in its own commit; move the index line to `archive/index.md`; `bun run check:plans` green after staging.
- **Step 5 (teardown):** once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/account-purge-pins-1/plan.md` succeeds, `agent-worktree done account-purge-pins-1 --merged`. The orchestrator's next spawn notices the merge.

## Audit verdicts

| Round | Verdict | Taken | Rejected or kept |
|---|---|---|---|
| Codex r1 (`gpt-6.1-sol`, high) | `conditional approve`: bound the #1089 wait and identify its merge; make the soak prove the cases ran | step 1 waits on the closing PR's merge commit, bounded, with an eight-hour ceiling; step 2 stops if the helper moved; step 5 counts passing summaries and voids a run that executed nothing | none. D1-D3 and C1-C3 upheld; D5 then (c), a fourth case "defensible, not a condition" |
| Opus (Plan) | `conditional approve`: 1 (medium) pin `:1291` or file it; 2-4 (low) inline `rowLocks`, quality bar (2) overclaims for `purgeForProfile`, F2 "one commit"; 5 the signal's attribution and a bound-reference false red | 1 as the fourth case (D5, C4); 2 (D4); 3 by widening C3; 4 (F2); 5 as I2; F1's line range | none |
| Codex r2 (resumed) | `conditional approve`: take the fourth case; assert the staging race's winner; `:1281` is not pinned alone; the test count is BASE plus 1; `deleteStorageId` takes a storage id | all: change map 5, D5, the Claims line, step 4's C3, the gate and step 5's count, F6 | none |
| Codex r3 (resumed) | `approve`: every r2 correction landed; no new material defect | — | — |

Light tier: Codex r3, resumed after every finding was taken, is the final pass.

Post-implementation review loop, over `git diff origin/dev...HEAD` at `6f2840cac`:

| Round | Verdict | Taken | Rejected or kept |
|---|---|---|---|
| Codex r1 (`gpt-6.1-sol`, high, fresh) | `clean` | — | — |
| Opus (`general-purpose`) | `clean`; one nit: the helper's TSDoc hid that it asserts the queue | the TSDoc says it fails unless the purge is queued behind the rename (`fb8d31c00`) | the `as KeyedLock["withLock"]` cast kept: a changed signature still fails to compile |
| Codex r2 (resumed, fix diff) | `clean` | — | — |

## Seeds (not run; the orchestrator drives this lane)

`/goal Phase 1 of implementations-plan/account-purge-pins-1/plan.md is ✓ with its gate passing in the transcript (C1-C4 as expected; the soak's 100 logs pass, or every other red is outside the describe, read and filed, never rerun for a clean count; test:all, lint and typecheck:all exit 0); the Codex loop converged (a resumed pass with no new material finding, quoted); the PR against dev exists with Closes #1091 and the close-out commits.`

`/loop 15m Drive implementations-plan/account-purge-pins-1 forward per its plan.md; never merge; stop after the PR's checks report.`

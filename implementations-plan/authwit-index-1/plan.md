---
plan: authwit-index-1
tier: light
status: plan approved (Codex R4 approve); arc 1 in review (fix loop converged at R2); arc 2 waits on OA-1
issues: "none (Part of nothing; the orchestrator records the change)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high review round trip + Opus Plan leg
base: origin/dev at cdb61d0cf
trunk: dev
post_implementation_hardening: not scheduled
---

# authwit-index-1: a dApp send's public authwits reach the index whatever History's write does

A dApp send that grants a public authwit writes the grant to the wallet's index (the rows Settings → Developer → Authwits lists and revokes) in `sentTxRecorder`, after `addTransaction`, and only when it resolves. Arc 1 runs that write whatever History's outcome. Writing the grants before the broadcast, or keeping them with the journal for a later write, changes an owner decision or adds stored state: [OWNER-ASKS.md](OWNER-ASKS.md) OA-1. Recon: [recon.md](recon.md). The lane brief's statements hold at `cdb61d0cf`; the recorder is now at `dapp-send-executor.ts:765-797`.

## Outcome & Quality Bar

- **For whom**: a person who approved a dApp send with a public authwit and later looks for it to revoke it.
- **Excellent**: (1) once the wallet sees the node accept the send, the index write runs whatever History's write does, and its rows show `Pending` until proven; (2) the order a person can see stays the owner's pick (P65-06): never before the send, and after History's attempt.

## Assumptions

**Facts**
- F1. Two arms carry grants through `sentTxRecorder`: `proveSendTransaction` (`grantPublicAuthwit`, `dapp-send-executor.ts:885`) and `proveStandardSend` (`:1096`). NO_FROM and transfers carry none. The one production caller of `recordPendingAuthwits` is `execution/service.ts:560`.
- F2. `recordPendingAuthwits` is idempotent per hash in its `(profileId, chainId, account)` scope (`auth-registry/service.ts:229-270`).
- F3. A `pending` row is confirmed or removed only from a History row (`reconcileFromTx`, `:166-188`).
- F4. A sealed write commits only while its profile holds the keys it was sealed under (`storage/sealed-entity-storage.ts` `whileHeld`). A full-backup restore can give a freed profile id new keys, so F4 alone does not stop a write begun before that id's deletion.
- F5. A deletion epoch never goes back: `release` only unreserves the id, and `assertCurrent` refuses every older epoch (`profile/profile-deletion-state.ts:51-75`). `addTransaction` checks it under the tx lock (`transaction/service.ts:292`).
- F6. The owner kept the index write after History, P65-06 (`archive/harden-security-fixes-3/OWNER-ASKS.md` OA-6).
- F7. Row keys stay across lock and switch (`profile/service.ts:355-362`), so a lock after the send does not refuse the write.

**Inferences**
- I1. A grant with no History row keeps its `Pending` chip until revoked (F3). Revoke still works: it reads the grant's receipt (`awaitGrantBlocks`).
- I2. On a send whose History write succeeds, or that the node refuses, arc 1 changes nothing a person sees: the same write, order and rows.

**Asks**
- A1. OA-1: the grants kept with the journal (B, recommended), written before the broadcast (A), or arc 1 alone (C). [Working assumption: arc 1 ships now; A or B is arc 2.]

## Architecture & Implementation

- **Cause.** The index write runs only when History's write succeeds, a separate write that can refuse or fail after the node accepted the send.
- **Change.** In `sentTxRecorder`: one try around the whole History statement, its arguments and `await feeChoice` included; then the index write; then History's error, the same object, rethrown. Precedence: History's error when only it fails; the index error when only it fails (as today); History's error when both fail, the index failure logged by `logDebug` with a fixed text and `{ error }`. A boolean, not a sentinel value, records that History failed (`throw undefined` is legal). `feeChoice` still starts before the prove.
- **The epoch guard (D3).** `recordPendingAuthwits` takes the send's `ExecutionFence` and checks its epoch with `profileService.getDeletionState().assertCurrent(fence.profileId, fence.epoch)` first inside its locked section, then again for each row between `prepare` and `commit`, with no await between that check and the commit, as `restore()` does. The entry check refuses a send authorized before the deletion (F5); the commit check holds even when the lock's watchdog has handed the lock to the purge. No session check: a lock or switch after the send must still write (F7). No account check: it cannot close the window before account rows are deleted, which History's own check also leaves.
- **File-level change map.** `execution/dapp-send-executor.ts` (`sentTxRecorder`, its doc; passes the fence's epoch); `auth-registry/service.ts` (`recordPendingAuthwits`: the epoch parameter, the check, its doc; one clause in the `reconcileFromTx` doc: a row with no History row is never settled); `auth-registry/spec.ts:41-45` (the same clause). Tests: `execution/dapp-send-executor.test.ts`, `execution/service.composition.test.ts` (D7), `auth-registry/service.test.ts` (its calls pass an epoch; three cases); the type-roles producer digest of `auth-registry/service.ts` re-pinned after re-attesting its two `send_transaction` sites unchanged.
- **Not taken** (ledger): the write before the broadcast (OA-1 A, D2); the grants on the journal row with a reconcile (OA-1 B, D2); the index write before History (flips P65-06's order, covers no extra path); an account check or a session check in the registry write (D3); an aggregate error (D4).

## UI impact

Information added, no layout or copy change: on a send whose History write fails after the node accepted it, the Authwits list now shows its grant, `Pending` until revoked when no History row exists (I1). Every other path shows what it shows today. OA-1 tells the owner.

## Security & Adversarial Considerations

- **Invariant.** Once the wallet sees the node accept a dApp send, the write of its public authwits to the index runs whatever History's write does, and refuses only for a profile whose deletion began after the send was authorized.
- **Inputs.** The dApp's send (approved by the person), the node's answer, storage writes that can fail, a profile deletion, restore or account removal at any await. The grants are the wallet's own build output; no new input crosses a boundary.
- **Error reach.** The caller and the journal see History's error, as today; typed errors keep their class.
- **Logging.** One `debug` line with a fixed text and `{ error }`; no hash, address or content. Crypto, supply chain, permissions: no change.

## Phase 1: the index write stops depending on History's

- Change `sentTxRecorder` and `recordPendingAuthwits` as in Architecture. Add the doc clauses.
- **Tests.**
  - Unit, `dapp-send-executor.test.ts` (its harness's `proveAndSend` calls `recordTransaction`):
    - History is held, then rejects: the index write waits for the rejection, then runs once with the scope, the items, the hash and the fence; the caller gets History's error object.
    - Both reject: the caller gets History's error; the index failure is logged.
    - History resolves, the index rejects: the index error reaches the caller.
    - The existing order and "records once" pins stay; they gain the fence argument.
  - Unit, `auth-registry/service.test.ts`, with a real `ProfileDeletionState`: a fence captured before the profile's deletion began and was released is refused and adds no row; a deletion that begins while a row is being prepared (a held storage read) refuses its commit and adds no row; control: a fence whose session ended but whose epoch is current writes the row.
  - Composition, the real graph (`startExecutionGraph`; real coordinator, lane and journal; fake PXE and node; a recording `recordPendingAuthwits` stub). Seam: spy `service.buildAndEstimateTxRequest`, which the dep arrow reads at call time (`execution/service.ts:556`), returning a canned build with complete gas settings (`gasLimits`, `teardownGasLimits`, `maxFeesPerGas`) and no approval (so `overCeiling` returns at `:1453`).
    - `addTransaction` rejects after `sendTx` resolved: `addTransaction` was called with the hash; the grants are recorded once with the hash; the row ends `failed` from `submitting` with the hash; the caller sees History's error. Red at the base.
    - Never-happens: `sendTx` rejects: no index write.
- **Validation gate.**
  - `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`: exit 0.
  - From `apps/extension`: `bun --bun vitest run src/wallet/services/execution/dapp-send-executor.test.ts src/wallet/services/execution/service.composition.test.ts src/wallet/services/auth-registry/service.test.ts --retry=0` green; the composition case and the first unit case red with `sentTxRecorder` from the base SHA; the held-read case red with only the commit-time recheck removed.
  - From the root: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/authwit-lifecycle.test.ts tests/e2e/network/authwit-consume-smoke.test.ts`, then with `NULO_E2E_BROWSER=firefox`: pass at retry 0.
  - `bun run check:plans` after staging: exit 0.

## Arc 2 (on OA-1 = A or B only)

Planned after the pick. B needs the owner's approval of its stored field and its reconcile, and likely a `mid` plan. Its regression: the worker stops after `sendTx`, and a restarted graph over the same storage lists the grant.

## Decision ledger

- D1. Arc 1 ships now: it is the whole of C, and B keeps it (both legs).
- D2. The write before the broadcast is the owner's call (F6). Keeping the grants on the journal row adds a stored field and a recovery step: the owner's call. Both go to OA-1 (both legs).
- D3. The registry write checks the send's deletion epoch, nothing else. R1: Codex kept a guard; Opus dropped it on F4. Codex R2: a restore that reuses the id gives it new keys, so F4 does not stop a write begun before the deletion. Codex R3: the registry lock's watchdog can hand off a stalled holder, so the check repeats before each commit. Taken: both (F5; `lessons.md`, Lock watchdog); Opus's argument against the account check stands. The test holds a storage read rather than firing the watchdog: the recheck is what it pins.
- D4. History's error wins and the second failure is logged: an aggregate error would change the class the caller and the journal classify (Codex asked that neither be lost; Opus proposed the log).
- D5. Tests: unit cases for the recorder's paths and the guard, one composition case and its control. The success control is the existing unit pin.
- D6. Committed files state the change and its guarantee; the detailed trace stays with the orchestrator (Codex R2, Opus R1).
- D7. As built: `recordPendingAuthwits` takes the fence's deletion epoch, not the whole fence, since the epoch is all it checks; the composition cases sit in `execution/service.composition.test.ts`, the one file COMPOSITION-TESTS.md D1 lets drive a canned `proveTx`; the held read is staged by wrapping the store's `prepare`.

## Panel verdicts

| Round | Verdict | Accepted | Rejected |
|---|---|---|---|
| Codex R1 | conditional approve | guarantee limited to the write's attempt; error precedence; index-only, both-fail and held-History tests; OA-1: A's and B's obligations; UI impact is information added | none |
| Opus R1 | conditional approve | a third send outcome named in OA-1; OA-1: the full owner note, the switch fact, A's permanent row; recommend B or C; the composition seam; doc clauses; neutral wording | dropping every guard (D3, after Codex R2) |
| Codex R2 (final, resumed) | reject | the epoch guard back with its test; neutral committed wording; recon aligned; complete gas fixture; OA-1 qualified ("when no History row exists", "attempts to remove") | none |
| Codex R3 (resumed) | conditional approve | the epoch rechecked before each commit, with its test | a fake-timer watchdog test (the held read pins the same recheck) |
| Codex R4 (resumed, final) | approve | the held-read test must fail with only the commit-time recheck removed | none |
| Codex fix R1 (arc 1) | changes needed | the recorder's doc claims only that the grants can land; the helper's doc loses its restated precedence | none |
| Opus fix R1 (arc 1) | changes needed | the entry-refusal test asserts no row was prepared; the same doc points; the `pending` field doc matches the reconcile doc | none |
| Codex fix R2 (arc 1, resumed) | approve | none | none |

## Delivery

- **Arc 1**: branch `worktree-authwit-index-1`, one PR to `dev` with `gh pr create`, opened ready after the Codex loop converges and the gates pass, with no labels; add `e2e:extension-network` after creation only if the path filter skips the network suite.
  - Title: `fix(authwit): a dApp send's public authwits are indexed when its history write fails` (84 characters).
  - Body: the change and its guarantee, the gates with outcomes, the per-browser e2e wall-clock, no `Closes`.
  - The plan stays open: its close-out lands with arc 2, or as a docs-only PR if OA-1 is C.
- **Arc 2**: after OA-1, off `dev` once arc 1 merges.

## Post-implementation

Execution contract: `implementations-plan/README.md` § Post-implementation standard at `cdb61d0cf`, with these values:

- Step 1 is absent (`code_review: off`).
- Step 2, per arc: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` on the arc's diff from `cdb61d0cf`, resumed with `resume-codex.sh`. Both verbatim rules and the adversarial ask go in every prompt. One Opus `general-purpose` review runs beside round 1. Hard stop at three rounds.
- Steps 3 and 4 as written, with the close-out per Delivery. It moves this folder to `archive/authwit-index-1/`.
- Step 5: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/authwit-index-1/plan.md`, then `agent-worktree done authwit-index-1 --merged`. The orchestrator's session notices the merge.
- Three failures on one step end the arc as `ARC_FAILED`.

## Seeds (not run; orchestrator-owned)

- `/goal` Arc 1's phase ✓ in implementations-plan/authwit-index-1/plan.md, its gate passing in the transcript; the Codex loop converged on arc 1's diff (a resumed pass with no new material point, quoted); a ready PR to dev; `bun run test` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/authwit-index-1 from plan.md and lessons/: the next unchecked phase, its gate, the Codex loop, delivery; arc 2 only once OA-1 is answered; never merge.

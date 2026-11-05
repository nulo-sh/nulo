---
plan: authwit-index-1
tier: mid
status: closed (2026-11-01)
issues: "none (Part of nothing; the orchestrator records the change)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high review round trip + Opus Plan leg
base: origin/dev at cdb61d0cf (arc 1); 51ea220b1 (arc 2)
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date**: 2026-11-01
- **Status**: completed. Arc 1 merged as #1424; arc 2 and this close-out are one PR.
- **Shipped**: once the node accepts a dApp send, the index write of its public authwits runs whatever History's write does (arc 1, `sentTxRecorder`), refused only for a profile whose deletion began after the send's fence (`recordPendingAuthwits`). The send's journal row keeps its authwits from the `submitting` commit until the index holds them (`OperationRecord.publicAuthwits`, an additive storage stamp with its golden and pin), and the send check lists them when it reads the send went through: after a lost node answer, a worker stop between the broadcast and the record, or a failed index write (arc 2, `send-check.ts` `listing`).
- **Owner's pick**: OA-1 = B, decision page 94, P94-06, signed 2026-11-01, no note; A (list before the broadcast) and C (arc 1 alone) not taken.
- **Known limits**: none filed, as this plan closes and files no issue. Two accepted residuals stay as ledger entries: D10 (a stop or failed write between an index write and its journal clear, then a revoke before the check re-reads the row, lists the revoked grant again as `Pending`) and D12 (grants of an account removed after its send are written back).
- **Dispositions**: Opus's "drop the recorder's clear" rejected (D10); skipping the inline write when History fails rejected (it delays a listing arc 1 makes at once); a tombstone of revoked grants not taken (state beyond the owner's approval).
- **Lessons**: none promoted: the two gotchas met (a fixture hash above the field modulus; zsh not splitting `$VAR`) are already in `lessons.md`, which is at its budget.
- **Open items**: none.
- **Seeds retired**: the `/goal` and `/loop` seeds below are not to be run.

# authwit-index-1: a dApp send's public authwits reach the index whatever History's write does

A dApp send that grants a public authwit writes the grant to the wallet's index (the rows Settings → Developer → Authwits lists and revokes) in `sentTxRecorder`, after `addTransaction`, and only when it resolves. Arc 1 runs that write whatever History's outcome. Arc 2 keeps the grants with the send's journal row and lists them once the wallet reads that the network took the send, the owner's pick B of [OWNER-ASKS.md](OWNER-ASKS.md) OA-1. Recon: [recon.md](recon.md). The lane brief's statements hold at `cdb61d0cf`; the recorder is now at `dapp-send-executor.ts:765-797`.

## Outcome & Quality Bar

- **For whom**: a person who approved a dApp send with a public authwit and later looks for it to revoke it.
- **Excellent**: (1) once the wallet sees the node accept the send, the index write runs whatever History's write does, and its rows show `Pending` until proven; (2) the order a person can see stays the owner's pick (P65-06): never before the send, and after History's attempt; (3) once the wallet reads that the network took the send, its grants are listed, also after a stop between the broadcast and the record or a lost node answer.

## Assumptions

**Facts**
- F1. Two arms carry grants through `sentTxRecorder`: `proveSendTransaction` (`grantPublicAuthwit`, `dapp-send-executor.ts:885`) and `proveStandardSend` (`:1096`). NO_FROM and transfers carry none. The one production caller of `recordPendingAuthwits` is `execution/service.ts:560`.
- F2. `recordPendingAuthwits` is idempotent per hash in its `(profileId, chainId, account)` scope (`auth-registry/service.ts:229-270`).
- F3. A `pending` row is confirmed or removed only from a History row (`reconcileFromTx`, `:166-188`).
- F4. A sealed write commits only while its profile holds the keys it was sealed under (`storage/sealed-entity-storage.ts` `whileHeld`). A full-backup restore can give a freed profile id new keys, so F4 alone does not stop a write begun before that id's deletion.
- F5. A deletion epoch never goes back: `release` only unreserves the id, and `assertCurrent` refuses every older epoch (`profile/profile-deletion-state.ts:51-75`). `addTransaction` checks it under the tx lock (`transaction/service.ts:292`).
- F6. The owner kept the index write after History, P65-06 (`archive/harden-security-fixes-3/OWNER-ASKS.md` OA-6).
- F7. Row keys stay across lock and switch (`profile/service.ts:355-362`), so a lock after the send does not refuse the write.
- F8. `commitSubmitting` is the one journal write the send depends on: it rejects unless the row durably holds `submitting` with the hash, and nothing is sent otherwise (`execution-coordinator.ts:345-352`).
- F9. A failure transition keeps every top-level field of the row (`operation-journal/service.ts` `_transitionLocked`, `failedFrom`); the boot sweep and the unlock sweep fail a dead worker's `submitting` row with its hash (`reaper.ts`); the send check reads every failed, send-checkable row at its `start()` and at each profile's row keys, and records `sent` once the hash is mined successfully (`send-check.ts`).
- F10. The journal GC never evicts a failed row that holds a hash (`gc.ts` header). The journal is in no full-backup slice (`backup-migration-registry.ts`).
- F11. A revoke deletes the index row (`deleteTracked`); there is no tombstone, so writing a revoked grant again lists it again.

**Inferences**
- I1. A grant with no History row keeps its `Pending` chip until revoked (F3). Revoke still works: it reads the grant's receipt (`awaitGrantBlocks`).
- I2. On a send whose History write succeeds, or that the node refuses, arc 1 changes nothing a person sees: the same write, order and rows.

**Asks**
- A1. OA-1, answered: option B, decision page 94, P94-06, signed 2026-11-01, no note. The pick approves exactly two additions: one stored field on the activity record, and one catch-up step after a start or an unlock that survives a stop halfway. Anything beyond them stops again.

## Architecture & Implementation

- **Cause.** The index write runs only when History's write succeeds, a separate write that can refuse or fail after the node accepted the send.
- **Change.** In `sentTxRecorder`: one try around the whole History statement, its arguments and `await feeChoice` included; then the index write; then History's error, the same object, rethrown. Precedence: History's error when only it fails; the index error when only it fails (as today); History's error when both fail, the index failure logged by `logDebug` with a fixed text and `{ error }`. A boolean, not a sentinel value, records that History failed (`throw undefined` is legal). `feeChoice` still starts before the prove.
- **The epoch guard (D3).** `recordPendingAuthwits` takes the send's `ExecutionFence` and checks its epoch with `profileService.getDeletionState().assertCurrent(fence.profileId, fence.epoch)` first inside its locked section, then again for each row between `prepare` and `commit`, with no await between that check and the commit, as `restore()` does. The entry check refuses a send authorized before the deletion (F5); the commit check holds even when the lock's watchdog has handed the lock to the purge. No session check: a lock or switch after the send must still write (F7). No account check: it cannot close the window before account rows are deleted, which History's own check also leaves.
- **File-level change map.** `execution/dapp-send-executor.ts` (`sentTxRecorder`, its doc; passes the fence's epoch); `auth-registry/service.ts` (`recordPendingAuthwits`: the epoch parameter, the check, its doc; one clause in the `reconcileFromTx` doc: a row with no History row is never settled); `auth-registry/spec.ts:41-45` (the same clause). Tests: `execution/dapp-send-executor.test.ts`, `execution/service.composition.test.ts` (D7), `auth-registry/service.test.ts` (its calls pass an epoch; three cases); the type-roles producer digest of `auth-registry/service.ts` re-pinned after re-attesting its two `send_transaction` sites unchanged.
- **Not taken** (ledger): the write before the broadcast (OA-1 A, D2); the grants on the journal row with a reconcile (OA-1 B, D2); the index write before History (flips P65-06's order, covers no extra path); an account check or a session check in the registry write (D3); an aggregate error (D4).

## UI impact

Information added, no layout or copy change: on a send whose History write fails after the node accepted it, the Authwits list now shows its grant, `Pending` until revoked when no History row exists (I1). Every other path shows what it shows today. OA-1 tells the owner. Arc 2, within the owner's pick B: a grant whose send the wallet lost track of (P1, P2, P3) is listed, `Pending`, once the wallet reads that the network took the send, which can be minutes after it; no layout, copy or other row changes.

## Security & Adversarial Considerations

- **Invariant.** A public authorization a dApp send granted is listed in the index once the wallet knows the network took the send, whatever stopped the wallet in between, and never for a profile whose deletion began after the listing's fence was captured.
- **Inputs.** The dApp's send (approved by the person), the node's answer, storage writes that can fail, a profile deletion, restore or account removal at any await, a worker stop at any await. The grants are the wallet's own build output, stored sealed under the profile's row keys in a root no backup carries; a node's receipt decides only `sent` or not, as it already does. No new input crosses a boundary.
- **Arc 2's adversary.** A node that answers `sent` for a tx it never mined makes the wallet list that send's own grants, as `Pending`: the same reach its answer has over the send check today. A listing writes only the grants its row recorded at the send, under the row's own profile, chain and account. The field's content is the dApp's request the person approved; the journal's popup reads return it, as they return the whole row, to its own profile only.
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

## Arc 2: the grants kept with the activity record (OA-1 = B)

Paths left open after arc 1, each traced in the code and each a composition case below:

- P1. The worker stops after `sendTx` resolves and before the index write: the row stays `submitting`, the next worker's sweep fails it from `submitting` with its hash (F9), the send check reads it `sent`, and nothing lists its grants.
- P2. `sendTx`'s answer is lost while the node took the tx: the row fails from `submitting` with its hash, the check reads it `sent` minutes later, and nothing lists its grants.
- P3. Arc 1's index write fails after the node took the tx: its error reaches the caller and nothing writes the grants again.

### Change

- **The field (D8).** `OperationRecord.publicAuthwits?: { chainId, account, items: { hash, content }[] }`, the send's scope and grants, set only when the build carries at least one. The `submitting` commit writes it in the same write (F8), so it is durable before the broadcast; a failure transition keeps it (F9), and `succeeded` drops it. `transitionOperation` takes it as a fifth argument and refuses it with any stage but `submitting`, as `retitle` rides only `failed`. Schema: `hash` 0x-hex below the field modulus, `content` any non-null object as `AuthwitSchema` keeps it, 1 to `MAX_TRACKED_AUTHWITS_PER_ACCOUNT` items (a proven tx enqueues at most 32 public calls, one per grant).
- **The catch-up (D9).** The send check gains one open-row kind, `listing`: a failed, send-checkable row whose answer is `sent` and that holds the field, judged before the endpoint and inclusion branches, so finality reads wait for it and a prune cannot erase the answer first. Its read calls `recordPendingAuthwits` with the row's profile, the field's chain and account, its items, the row's hash and the tick fence's deletion epoch, then `clearPublicAuthwits(id, txHash, live)`, which deletes the field under the journal's lock only while the row still holds that hash at `submitting` or failed from it, and `live()` holds. Index first, clear second: a stop between the two writes the index again, which skips a hash its scope still holds (F2). It runs where the send check already reads rows: the `start()` scan at startup, the row-keys scan at unlock, and the tick after the check records `sent`. A failed read is retried as any read is, after `DROPPED_RECHECK_INTERVAL_MS`.
- **The recorder's clear (D10).** Whenever the recorder's own index write lands, it clears the field with the same call (the row is still `submitting` then), whatever History's outcome, so a field outlives its grants' listing only across a stop or a failed clear. A failed clear is logged at `debug` and never changes which error the caller sees.
- **Never.** A row the network refused, reverted or never answered lists nothing; a listing writes only its own row's grants, under its own profile, chain and account. A row whose send never reached the node (`wasNeverSent`), or that the check answered `refused`, `expired` or `reverted`, keeps the field unread, as it keeps its hash (F10): at most a tx's grants, and clearing it there would add a write on paths that list nothing.
- **Unchanged.** The broadcast line (`sendTxTask`), History before the index (P65-06), arc 1's precedence, the Authwits page, the row's `Pending` chip until a History row proves it (I1).
- **File-level change map.** `operation-journal/spec.ts` (the type, the schema, the fifth argument's schema, the header's invariants); `operation-journal/service.ts` (`_transitionLocked`, `clearPublicAuthwits`); `operation-journal/send-check.ts` (the `listing` kind, a `recordPendingAuthwits` dep, the class doc); `execution/execution-lane.ts` (`commitJournal` passes the field); `execution/dapp-send-executor.ts` (`SlotRun.commitSubmitting` takes it, both grant arms pass it, `SentTx` carries the journal id, the recorder's clear, its doc; the grant arm's call-site comment goes); `runtime.ts` (the dep). Storage: one golden for the field, then `bun run baseline:storage -- --additive "<reason>"` and its pin.
- **Accepted residual (D10).** A stop or a failed write between an index write and its clear, then a revoke of that grant before the catch-up reads the row, lists the revoked grant again as `Pending`. Closing it needs a record of revoked grants, new state beyond the owner's approval.
- **Accepted residual (D12).** As D3 leaves for the inline write, the listing checks no account: grants of an account removed after its send are written back, under that account's scope, once the check reads the send.
- **Not taken.** A tombstone of revoked grants (see the residual); listing confirmed rather than `Pending` (a `sent` answer before finality can still be pruned); skipping the inline write when History fails, so the catch-up is that path's only writer (it delays a listing arc 1 makes at once); a scan of every row at each start (the send check's open rows already are that scan).

### Storage

The journal root is sealed (`stores.ts`), so no numbered migration can name it; the field is optional and absent on every stored row, so every row reads as before: an additive stamp, `bun run baseline:storage -- --additive "a dApp send's journal row may hold its public authwits; the field is optional and no stored row has it, so every stored row reads as before"`, the pin it prints in `pins.ts`, and one golden `journal.authwits` (a failed-from-`submitting` row answered `sent`, holding the field, `sealed: true`) authored in `goldens.json` before the generator runs. No backup slice carries the journal (F10).

### Tests

- Unit, `operation-journal/service.test.ts`: the `submitting` commit stores the field, a failure keeps it and `succeeded` drops it; the field with another stage is refused and writes nothing; `clearPublicAuthwits` clears a `submitting` row and a failed one with its hash, and leaves the row unchanged when `live()` is false or the hash differs.
- Unit, `operation-journal/send-check.test.ts`: a `sent` row holding the field, with and without its block, lists its grants with the scope, items, hash and fence epoch, then clears it, and a row with a block goes on to its finality reads; an index write that rejects leaves the field, and the retry lists and clears; a clear that does not land is followed, on the next start, by one more listing and the clear; never-happens: an unanswered, `refused` or `reverted` row holding the field lists nothing, with the `sent` case as control.
- Unit, `execution/dapp-send-executor.test.ts`: a grant send's `submitting` commit carries the field, a send without grants none; the recorder's index write lands: the field is cleared, also when History rejected, before History's error is thrown; the index write rejects: no clear; a clear that rejects is logged and the caller's error is unchanged.
- Composition, `execution/service.composition.test.ts` (real coordinator, lane, journal and send check; fake PXE and node; a recording `recordPendingAuthwits`):
  - The arc 1 case (History rejects) also asserts the field is gone. The shared grant fixture's hash moves below the field modulus, which the field's schema enforces.
  - P2: `sendTx` rejects with a transport error; the row fails from `submitting` holding the field; the check reads the receipt mined successfully and the grant is recorded once with the hash and the epoch; the field is gone.
  - P1: `sendTx` resolves and `addTransaction` never settles (the worker stops there); a second journal over the same storage and row keys, the reaper's boot sweep at a later cutoff and a fresh send check list the grant once; the field is gone. The first graph's send check is stopped.
  - P3: History lands and the recorder's index write rejects once; the check reads the send and writes the index again (two calls in all); the field is gone.
  - Control: the receipt reads reverted, final; nothing is listed after the failure nor after the answer, the row is unwatched and the field stays.
  - P1, P2 and P3 are red at the arc's base. P1's restart holds the row keys from boot, as an idle worker's restart does; a restart that waits for an unlock reaches the same scan through the row-keys event, which `send-check.test.ts` already pins.

### Validation gate

- `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`: exit 0.
- From `apps/extension`, at `--retry=0`: the four test files above, `operation-journal/*.test.ts`, `transaction/*.test.ts`, `auth-registry/*.test.ts`, `stored-shapes/snapshot.test.ts` and `storage/stored-shapes.*.test.ts`, green; P1 and P2 red with the arc's source changes reverted.
- From the root: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/authwit-lifecycle.test.ts tests/e2e/network/authwit-consume-smoke.test.ts`, then with `NULO_E2E_BROWSER=firefox`, at retry 0: pass. No e2e scenario is added: a worker stop between the broadcast and the record is staged in process (P1), and the grant's listing reads no chain state a fake cannot give.
- `bun run check:plans` after staging: exit 0.

## Decision ledger

- D1. Arc 1 ships now: it is the whole of C, and B keeps it (both legs).
- D2. The write before the broadcast is the owner's call (F6). Keeping the grants on the journal row adds a stored field and a recovery step: the owner's call. Both go to OA-1 (both legs).
- D3. The registry write checks the send's deletion epoch, nothing else. R1: Codex kept a guard; Opus dropped it on F4. Codex R2: a restore that reuses the id gives it new keys, so F4 does not stop a write begun before the deletion. Codex R3: the registry lock's watchdog can hand off a stalled holder, so the check repeats before each commit. Taken: both (F5; `lessons.md`, Lock watchdog); Opus's argument against the account check stands. The test holds a storage read rather than firing the watchdog: the recheck is what it pins.
- D4. History's error wins and the second failure is logged: an aggregate error would change the class the caller and the journal classify (Codex asked that neither be lost; Opus proposed the log).
- D5. Tests: unit cases for the recorder's paths and the guard, one composition case and its control. The success control is the existing unit pin.
- D6. Committed files state the change and its guarantee; the detailed trace stays with the orchestrator (Codex R2, Opus R1).
- D7. As built: `recordPendingAuthwits` takes the fence's deletion epoch, not the whole fence, since the epoch is all it checks; the composition cases sit in `execution/service.composition.test.ts`, the one file COMPOSITION-TESTS.md D1 lets drive a canned `proveTx`; the held read is staged by wrapping the store's `prepare`.
- D8. The field lives on the journal row, top level, not in `JobProgress`: the grants' content type is the wallet bridge's, which `@nulo/wallet-core` cannot import; it rides the `submitting` commit because that write is durable before the broadcast (F8); the scope is stored with it so the catch-up needs no network lookup.
- D9. The catch-up is a row state of the send check, not a new task: the check already resumes every open row at start and unlock and already reads the answer B waits for, so the owner's "one step after a start or an unlock" is its scan, and "lists them when it reads the send went through" is its tick.
- D10. The recorder clears the field whenever its own index write lands. Codex: the clear must accept `submitting`, since the failure transition comes after the recorder, and must run on History's success too, since `markJournal(succeeded)` swallows a failed write and the reaper then fails the row five minutes later, long enough for a revoke. Opus: drop the clear, the window is narrow and over-claims in the safe direction. Taken: the clear, one call on the approved field's own lifecycle, not new state. The window left, a stop or a failed write between an index write and its clear, is an accepted residual: closing it needs a record of revoked grants (F11), state beyond the approval.
- D11. P1 is staged as the runtime starts the next worker: the reaper and the send check with no await between, the reaper's cutoff after the row's creation (Opus).
- D12. No account check in the listing, as D3 (Opus noted the residual).

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
| Codex plan R1 (arc 2) | conditional approve | the clear accepts `submitting` and runs after every landed inline write; `listing` before the url and inclusion branches; a failed-listing retry test and `sent` with and without a block; P1 staging details; the grant fixture's hash below the field modulus; `expired` is terminal; the security wording | removing the archived-plan link in the composition file's header (CLAUDE.md lets it stay until that comment is rewritten) |
| Opus plan R1 (arc 2) | conditional approve | a finalized `sent` lists (the `listing` order); a P3 composition case; P1 started as the runtime starts it; never-happens checks after each write; `succeeded` drops the field; the popup reads and the content's origin in Security; the account residual (D12) | dropping D10 (D10) |
| Codex fix R1 (arc 2) | approve | `spendAccounts` keeps its doc; `recordPendingAuthwits`'s epoch doc names the caller's fence | none |
| Opus fix R1 (arc 2) | changes needed | the `aztec_sendTx` arm's commit pinned (a revert of it passed every test); the field doc says `succeeded` implies the listing; the recorder doc reparsed; the composition describe and hash comment; fake read-backs replaced by the clear log; one ordering sentence | reading `SendCheck.watches` in the reverted control (the only deterministic end state; `send-check.test.ts` reads it the same way) |
| Codex fix R2 (arc 2, resumed) | approve | none | none |

## Delivery

- **Arc 1**: branch `worktree-authwit-index-1`, one PR to `dev` with `gh pr create`, opened ready after the Codex loop converges and the gates pass, with no labels; add `e2e:extension-network` after creation only if the path filter skips the network suite.
  - Title: `fix(authwit): a dapp send's public authwits are indexed when its history write fails` (84 characters; `dapp` lower-case, as commitlint's `subject-case` refuses `dApp`).
  - Body: the change and its guarantee, the gates with outcomes, the per-browser e2e wall-clock, no `Closes`.
  - The plan stays open: its close-out lands with arc 2, or as a docs-only PR if OA-1 is C.
- **Arc 2 and the close-out**: branch `authwit-index-1-a2` off `origin/dev` at `51ea220b1`, one PR to `dev` with `gh pr create`, opened ready once the loop converges and the gates pass, no labels at creation. The close-out is its last commits.
  - Title: `fix(authwit): a dapp send's public authwits are listed once the network took the send` (85 characters).
  - Body: the change and its guarantee, the owner's pick quoted (decision page 94, P94-06, 2026-11-01, option B), the gates with outcomes, the per-browser e2e wall-clock, no `Closes`, no `Part of`.

## Post-implementation

Execution contract: `implementations-plan/README.md` § Post-implementation standard at `cdb61d0cf`, with these values:

- Step 1 is absent (`code_review: off`).
- Step 2, per arc: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` on the arc's diff from its base (`cdb61d0cf`, then `51ea220b1`), resumed with `resume-codex.sh`. Arc 2's first round also reads arc 1's squash (`cadc6f86d`), which stands in for the cross-arc pass: arc 1 is merged. Both verbatim rules and the adversarial ask go in every prompt. One Opus `general-purpose` review runs beside round 1. Hard stop at three rounds.
- Steps 3 and 4 as written, with the close-out per Delivery. It moves this folder to `archive/authwit-index-1/`.
- Step 5: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/authwit-index-1/plan.md`, then `agent-worktree done authwit-index-1 --merged`. The orchestrator's session notices the merge.
- Three failures on one step end the arc as `ARC_FAILED`.

## Seeds (not run; orchestrator-owned)

- `/goal` Arc 1's phase ✓ in implementations-plan/authwit-index-1/plan.md, its gate passing in the transcript; the Codex loop converged on arc 1's diff (a resumed pass with no new material point, quoted); a ready PR to dev; `bun run test` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/authwit-index-1 from plan.md and lessons/: the next unchecked phase, its gate, the Codex loop, delivery; arc 2 only once OA-1 is answered; never merge.

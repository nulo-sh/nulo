---
plan: tokens-and-balances
tier: mid
status: draft, audited (round 1: Codex reject, Opus conditional approve; final fresh Codex pass: reject ×4, then conditional approve with wording conditions, applied); nothing approved until the orchestrator says so
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 Explore agents (sonnet) plus the driver's own read; dual audit (Codex gpt-6.1-sol high + Opus Plan); one final fresh Codex pass
base: origin/dev at fd47407
trunk: dev
issues: [80, 93, 94, 104, 105, 106, 134, 136, 206]
---

Live progress: [STATUS.md](STATUS.md). Owner questions: [OWNER-ASKS.md](OWNER-ASKS.md). Recon: [recon.md](recon.md).

## Tier and budget

`mid`, set by the orchestrator. Rubric: security sensitivity moderate (stored-row writes under a lock
watchdog, a per-profile key that outlives its profile), blast radius moderate (every token add, every
profile adoption, Home's hero), everything else low. Three arcs inside one plan keep it at `mid`.
Post-implementation hardening is not scheduled.

## Outcome & Quality Bar

**For whom.** A person who adds tokens, pins them to Home and restores or re-imports a profile, on a
machine slow enough that a proof can stall the wallet for minutes. Behind them, the maintainer who
inherits a token service whose lock can be released under a running add.

**What excellent looks like.**

1. A token add that the lock watchdog released writes, deletes, emits and journals success only
   under a ticket it owns: it resumes under a fresh one, no contract gets two rows, and no token
   operation reads before a displaced holder's last write landed. A row written meanwhile by a later
   add or a restore survives every displaced add, restore, deletion or purge; the lockless chain
   sweep's own id-reuse race is not closed here (routed to an issue, § Trade-offs). Each rule has a
   test that fails on base, paired with a control.
2. A profile id that comes back (a restore that keeps its id, a passkey import) starts with no pins
   left from before the adoption. A pin a stale page writes after it is accepted residue (D1).
3. Home's hero and the token list read balance events through one reducer, so a late add event for a
   row already shown cannot hold the hero's skeleton.
4. After page 8, a pasted contract address in Holdings search offers the add in one tap, and the
   New token popup never shows the PXE store's own refusal text.

**Good enough.** No new screen or setting in Arc 1, and no new copy in normal operation; its one new
message, `token lock lost`, appears only when the five-minute lock watchdog expires during a
restore's, deletion's or purge's storage work or admission drain (OA-3). No orphan sweep at
background start. The mint-figure pin (#105) is designed here and built only on the owner's answer
(OA-1).

## Scope

| Issue | What | Arc | Gate |
|---|---|---|---|
| #206 | Balance add and delete events go through one id-keyed reducer | 1 (Phase 1.1) | none |
| #94 | A released token add resumes under a fresh ticket and writes, deletes and emits only while it owns one | 1 (Phase 1.2) | none |
| #93 | Adopting a profile id removes that id's per-profile UI keys first | 1 (Phase 1.3) | none |
| #134 | Holdings search offers "Add token" for a pasted contract address | 2 (Phase 2.1) | page 8, P8-01 |
| #136 | The New token popup maps PXE store refusals to a generic line | 2 (Phase 2.2) | page 8, P8-02 |
| #105 | A listed token's mint figure needs a pinned class | 3 (Phase 3.1) | OA-1 |
| #80 | V6 mainnet seeds and fee policy | no arc | `blocked:external` (no V6 mainnet) |
| #104 | Mint calls outside the standard shapes show no amount | no arc | hold H8 (waits on a real dApp report) |
| #106 | An unlisted token's mint needs a decimals lookup | no arc | hold H8 (charter C12-fetch and its own plan) |

**Regrouped.** The lane map put #105 in the decision-free Arc 1. The tree disproves that: every pin
that has an effect hides a mint figure in the case it exists for (recon § #105), and the lane brief's
C9 rule makes that an owner question. #105 moves to Arc 3, which waits on OA-1.

## Owner dependencies

- **Arc 1 needs no owner answer to be built, and its PR opens first.** Its three race-path effects
  are visible, so its merge waits on OA-3 (D8): the PR body quotes the answer.
- **#98.** Arc 1 touches neither `seeder.ts` nor `default-tokens.ts`. In `token/service.ts` it rewrites
  `persistToken` (`:370-461`); routes the four lock acquisitions (the purge's at `:757`, restore's at
  `:788`) and every token-row `set`/`delete` through the tracker; and adds R5's ownership checks
  inside `restore`'s row callback (`:788-825`), the purge (`:757-773`) and
  `_deleteTokenByIdHoldingLock` (`:550-558`), whose signatures gain `ownsLock`. Backup-import-export
  arc 3 (#98) adds methods near `backup`/`restore` (`:775+`), so the two meet in `restore`'s and the
  purge's bodies: a small rebase either way, and neither waits for the other.
- **R2.** Arc 1 does not touch `usePrices.ts`. It replaces two handlers in `BalanceView.vue`
  (`:231-242`) with the shared composable's, so send-queue-activity arc 3 (#103) and chain-endpoints
  arc 2c (#116) rebase over a small diff.
- **`profile/service.ts`.** Arc 1 adds one awaited call in each of two private helpers. Held lanes
  (backup-import-export arc 3, account-session-life arcs 2-4) may meet it near the restore marker; a
  trivial rebase.
- **Arc 2 waits on page 8** (P8-01, P8-02). Every Arc 2 phase is marked "waits on page 8"; nothing of
  it is built until the orchestrator says page 8 is signed. An "as is" answer drops that phase.
- **Arc 3 waits on OA-1.** Nothing of #105 is built until OA-1 is answered.
- **Runner (gate G1).** Until e2e-harness-gaps arc 1a (#169) merges, run one network e2e at a time on
  the host. Check `~/.agents/ports.md` for a live `e2e:agent` row before each network run.

## Architecture & Implementation

### Arc 1, Phase 1.1: one reducer for balance events (#206)

`useTokenBalanceSnapshot` already owns the update reducer both views use (`onBalanceUpdated`,
`composables/useTokenBalanceSnapshot.ts:88-92`). It gains the other two:

```ts
/** An add for an id already listed is the row the snapshot already holds, at its creation: skip it. */
function onBalanceAdded(tb: TokenBalanceInfo) {
	if (!inActiveScope(tb)) return
	markDirty()
	if (rows.value.some((row) => (row as { id: unknown }).id === tb.id)) return
	rows.value.push(mapRow ? mapRow(tb) : (tb as T))
}
function onBalanceDeleted(tb: TokenBalanceInfo) {
	if (inActiveScope(tb)) markDirty()
	rows.value = rows.value.filter((row) => (row as { id: unknown }).id !== tb.id)
}
```

- Both returned. `BalanceView.vue` and `TokensView.vue` subscribe them and drop their local handlers.
  TokensView's `withTaskFlags` already reaches the add through `mapRow`.
- Skip, not upsert: an add event carries the row as created (`token-balance/service.ts:305`); a row
  the snapshot already holds is at least that new.
- The delete filters every copy, as BalanceView does today; TokensView spliced the first copy only.
  With the add deduped the two are the same.
- `pages/send-balance-events.ts` keeps its own append (recon § #206: no effect on Send).

### Arc 1, Phase 1.2: a released add resumes under a fresh ticket (#94)

**Rules.**

- **R1, owned outcome.** In `persistToken`, a by-id token-row write or delete, the `onTokenAdded` emit
  and the `succeeded` transition are issued only right after a synchronous `ownsLock()` check, and an
  emit or a `succeeded` only right after a synchronous `assertCurrent(fence)` too, with no await
  between the checks and the issue. An attempt that finds its ticket released returns its progress,
  and the loop resumes under a fresh ticket.
- **R2, displaced writes land first.** Every token-row `set`/`delete` in `TokenService` (the add,
  restore, the purge, `_deleteTokenByIdHoldingLock`, the chain sweep) and every journal write
  `persistToken` issues (`simulating`, the title backfill at `:384`, `succeeded`, `failed`) goes
  through one private tracker until it settles. A private `withTokenLock` replaces the four
  `withLock` sites: once its ticket is granted it drains the tracker, repeating
  `Promise.allSettled` until it is empty, then checks `ownsLock()` and enters the callback in the same
  synchronous continuation; a ticket lost while draining re-acquires. `clearChainState` drains the
  same way before its snapshot. So a write a displaced holder issued lands before any successor
  reads, whatever order the browser applies storage operations in.
- **R3, failure journals at once.** The `catch` issues the `failed` transition, tracked, whether or not
  the ticket is still owned, awaits it, then rethrows. A successor admitted after that issue waits for
  it (R2).
- **R4, liveness that overlapped a reservation is false.** `NetworkService` counts reservations per
  network id (absent = 0). `isNetworkLive` and `isChainLive` take a copy of the counts before their
  storage read and return false when the network they resolve is reserved now or its count moved
  during the read. Today the check precedes the read (`network/service.ts:580-581`) and the network
  row survives the whole sweep (`:552-559`), so a read issued just before a reservation reports a
  network whose tokens are being swept as live.

- **R5, a displaced restore, deletion or purge refuses.** `restore`, token deletion (`deleteToken` →
  `_deleteTokenByIdHoldingLock`) and the profile purge (its typed deletes, `:758-763`, and its raw
  pass, `purgeMalformedRows`, which gains an optional ownership guard) receive `ownsLock` and check it
  synchronously right before each token-row `set`, `delete` and emit, with no await between. A
  released one refuses that step with a fixed `token lock lost` error: restore records it on that row
  and every later one through `restoreRows` (best-effort by design, `restore-rows.ts:13-16`);
  deletion rejects; the purge throws, so the deletion coordinator keeps the profile's tombstone and a
  re-run purge converges (`profile-deletion/coordinator.ts:114-119`; resumed after a restart, `:139`). Base lets a displaced restore
  overwrite an add's row (`token/service.ts:796-812`: allocate, await liveness, set), a displaced
  deletion remove a replacement (`:551-555`), and a displaced purge delete, by its snapshot's id, a
  row another profile's restore wrote after a deletion authorized before the lock freed that id
  (`:526-535`). A released restore whose chain died during its set deletes nothing: its row stays
  on that chain and is listed again if a network for the chain is added back.

**Scope of R1 and R5.** Only `persistToken` awaits the network inside the token lock (the metadata
fetch, `:379`), so only it resumes; restore, deletion and the purge await only storage and refuse
instead (R5, I6).

**Shape.** `persistToken` keeps the fence assert, the pre-lock short-circuit and `createOperation`.
Its locked body becomes a loop of attempts:

```ts
let progress: AddProgress = { stage: "start" }
for (;;) {
	const next = await this.withTokenLock((ownsLock) => this.persistAttempt(input, journalOp.id, progress, ownsLock))
	if (next.stage === "done") return next.info
	progress = next
}
```

`AddProgress` is `start`, `started` (`simulating` journaled), `fetched` with the metadata (a resumed
attempt never fetches again) or `written` with the token (the add's row was written; its checks and
emit are pending). `persistAttempt` is today's `try`/`catch` body, split into helpers to stay in
budget. "Released → return" below is R1's check after the last await, returning the progress so far.

1. **`start`:** journal `simulating`, as today; progress is now `started`.
2. **`started` or `fetched`:** `findToken`.
   - **Hit:** an existing row for the contract (a same-contract add or restore that landed first, or
     today's idempotent re-add). Released → return. Owned → `assertCurrent(fence)`, journal
     `succeeded`, return its info: no emit and no write, as base (`:372-374`). This closes a gap
     base has at `:373`: an add queued behind the lock while its profile was deleted and restored
     with the same contract returns the restored row today; the pre-lock short-circuit refuses that
     case (`:347-352`), the in-lock hit does not.
   - **Miss:** take the carried metadata or fetch it (with the title backfill), allocate
     `nextNumericId`, `assertCurrent(fence)`, await `isNetworkLive`. Released → return `fetched`.
     Owned → `tokens.set`, then step 3.
3. **After the set:** deletion fence moved → delete the row if the ticket is still owned (released
   during the set: the purge drains the set and removes it), then throw `profileDeletedError`.
   Otherwise finish (step 5) with `written`.
4. **Resumed from `written`** (fresh ticket):
   - Deletion fence moved: throw `profileDeletedError`, delete nothing (the purge owns that row).
   - Compare `await this.tokens.rawValue(id)` with the add's own serialization (`purge-rows.ts:78`
     uses the same guard). Equal → finish (step 5). Different or missing: the row was removed (a
     network sweep, or the person deleted it) and the id may hold a successor's token. Await
     `isNetworkLive`: dead → throw "network deleted"; live → released → return; owned →
     `assertCurrent(fence)`, journal `succeeded`, return the add's info, with no emit and no delete
     (the add completed; a later operation removed its row and announced that itself).
5. **Finish** (the add's own row is in place): await `isNetworkLive`, the only post-set liveness read.
   - Dead: await `isChainLive`; released → return `written`; owned and no live network holds the
     chain → delete the row; then throw "network deleted". This is the snapshot-postdating case: the
     lockless sweep (`:186-216`) may have read before the row existed. A row whose chain a
     replacement network holds stays, since its bytes cannot tell the add's own write from a
     restore's identical row (I5).
   - Live: released → return `written`. Owned → deletion fence moved: delete, throw (step 3's rule).
     Otherwise emit `onTokenAdded`, then issue `succeeded` (tracked, no await between the two).
6. **`catch`:** R3.

- `assertCurrentBeforeEmit` folds into steps 3 and 5; its doc sentence moves with it.
- An owned add makes exactly two liveness reads, one before and one after the set, as today; the
  existing test that counts them (`service.test.ts:473-494`) stays green unchanged.
- A resumed attempt from `fetched` re-runs `findToken`, so a same-contract add that landed during the
  release is reported through the hit path, never emitted again.
- The loop has no bound: an attempt after the first fetches nothing, so a second release needs a
  five-minute stall in storage. A bound would turn a slow add into a failed one.
- Lock order is unchanged (the seeder still takes its marker lock before the token lock,
  `seeder.ts:517-523`), and a resumed acquisition is a new ticket (I4). The drain waits on storage
  writes and on the journal's transition lock, a leaf the token lock already waits on today, so it
  adds no lock edge. A tracked write that never settles stalls admission; a storage that never
  answers already stalls every service, and proceeding without it would drop R2's guarantee.
- If a helper passes a complexity budget, split further. Never a suppression.

### Arc 1, Phase 1.3: an adopted profile id starts with no UI keys (#93)

**Rule.** Whenever `ProfileService` commits a profile row under an id, it first removes that id's
per-profile UI keys (`profileUiKeys(id)`), awaited, under the facade lock, before any other write for
the new row.

- The two adoption points: `persistNewProfileHoldingLock` (`profile/service.ts:1422`; create and
  import, including a passkey `userHandle` id) and `writeMarkerThenRowHoldingLock` (`:1432`; restore,
  before the restore marker). Every new-row write goes through one of them (`:610`, `:750`, `:2108`,
  `:2155`, `:2341`, `:2499`); `:1017` and `:1177` update an existing row.
- The constructor already builds `StorageArea` four times (`:253-258`); it keeps one as a field and
  the new call uses it.
- A failed remove fails the commit before anything is written (fail-closed, nothing to compensate).
- A hostile backup or `userHandle` can name only a free, unreserved id (`:2332`, `:2136`), so the
  removal can only drop an orphan key.
- `utils/profile-ui-keys.ts`'s header gains the second removal point, stated as the invariant it keeps:
  a key written under an id before that id is adopted again never reaches the new profile. A write
  after the adoption is not covered (below).
- **Residue (accepted, D4).** A key that a racing page recreates for an id never adopted again stays
  as garbage: at most 32 chains of 3 contracts, read by nothing (`usePinnedTokens` reads only the
  active profile's key).
- **What it does not close (accepted, D1, I2).** A pin write that reaches the id after the adoption
  lands in the new incarnation. Two ways: a page that still holds the deleted profile in its store
  (it missed the deletion event) pins or unpins after the restore, since `pin`/`unpin` check only the
  page's own profile and chain (`usePinnedTokens.ts:171-174`); or an operation parked before the
  deletion (on `knownContracts`, `:117`, the page's write queue, `:89`, or the migration barrier,
  `utils/storage.ts:79`) runs after it. The harm is a pin preference: which listed tokens Home shows
  first, never a balance, row or key. Closing it fully needs an incarnation every pin reader and writer
  checks (rejected, D1). The close-out files the residue as an issue.

### Arc 2: Holdings search and add-token copy (waits on page 8)

**Phase 2.1 (#134, P8-01).**

- `TokenList.vue` computes `addCandidate`: the trimmed query when `isValidAztecAddress` holds and no
  row matches. While it is set, the list shows one button row in place of the no-results message,
  text `Add token ${q.slice(0, 4)}…${q.slice(-2)}` (the proposal's "0x12…ab" form), testid
  `holdings-add-token`. A click emits `addToken(address)`; TokenList stays presentational.
- `pages/holdings.vue` handles it: `cacheStore.preselectedTokenAddressToAdd = address`, then
  `popupStore.open("new_token")`. The popup's existing `onShow` fills the field
  (`NewTokenPopup.vue:273-276`).
- **The search rule is stricter than the popup's.** The popup accepts any `0x` + 64 hex digits
  (`isValidHex`, `NewTokenPopup.vue:44`); the row needs a valid Aztec address (`isValidAztecAddress`:
  below the field modulus and on the curve, `utils/aztec-address.ts:24`). Every contract address
  passes both; a hex value that is no address gets no row, and typing it in the popup behaves as today.
- The row reuses an existing row primitive from `@nulo/design` or `components/composite`; the PR
  attaches the result in both themes, as the proposal requires. Keyboard: it is a `<button>` after
  the search field in DOM order, so Tab reaches it and Enter activates it (no `tabindex`).

**Phase 2.2 (#136, P8-02).**

- A pure helper `popup/components/popups/new-token-error-text.ts`, beside `endpoint-error-text.ts`:
  `newTokenErrorText(err)` returns `"Something went wrong. Try again."` for a PXE store refusal and
  `errorMessageFromUnknown(err)` for anything else (as today).
- The refusals are three throws in `packages/aztec-runtime/src/pxe/opfs-store.ts`: a stalled open
  (`ChainStoreOpenTimeoutError`, `:131`), a reopen while one is quarantined (`ChainStoreWedgedError`,
  `:109`) and a version mismatch (`PxeStoreVersionMismatch`, `:221`). The timeout class is private;
  the other two are exported (`:54`, `:190`). No class or flag survives the hops to the popup, which
  sees message text only: the RPC envelope rebuilds a plain error
  (`packages/extension-messaging/src/errors.ts:589`).
- A dependency-free module `packages/aztec-runtime/src/pxe/store-refusal.ts` holds one marker,
  `PXE_STORE_REFUSAL_MARKER`, which those three throws, and only they, put in their message. The
  messages' shared opening `openChainStore:` is no marker: the invalid key length (`:100`) and the
  wrong store key (`:165`) open with it too, and they keep their raw text (OA-2). The module gets its
  own subpath export (`./pxe/store-refusal`, beside `./pxe/public-events`), so the popup bundle pulls
  no PXE code. The helper matches with `includes`, as `endpoint-error-text.ts:8-9` does, so a prefix
  an RPC hop adds does not defeat it.
- Tests: `opfs-store.test.ts` asserts each of the three real throw sites carries the marker and the
  invalid-key and wrong-key errors do not (driving the existing fakes, not constructing the classes);
  the helper's test feeds the marker as the popup receives it (bare, and wrapped the way
  `errorMessageFromUnknown` flattens a cross-process error) plus a control error that keeps its
  text.
- No popup log line: the background already records every store failure (`pxe/service.ts:975` at
  error, `opfs-store.ts:220` at warn). Whether P8-02's "debug log only" also lowers those lines is
  OA-4; Arc 2 changes no log level.
- Any other raw text under Submit is not in P8-02; OA-2 asks about it.

### Arc 3: the mint figure's class pin (waits on OA-1)

Built only on OA-1 = A or C; designed here so the answer can be built without a new plan.

- **A (class pin, the issue's fix).** At add time `parseTokenInterface` already reads the instance
  (`token/service.ts:589-598`). Store its class id on the `Token` row (`classId`, optional in
  `TokenSchema`; the seeder path stores the seed's `expectedClassId`) and carry it through
  `TokenInterface`, `TokenInfo` and `getTokenInfo` (`token/utils.ts:4`), which today project it away;
  a projection test pins that it survives. The builder resolves every
  called instance before execution (`tx-request-builder.ts:238`, `resolveInstances`); record the called contract's
  `currentContractClassId` on the `TxCall` for the `call` and `encoded_call` cases. `txAmount` reads a
  mint only when the listed token's `classId` equals the call's recorded class. Limits, stated in
  OA-1: the record proves the class the wallet saw when it built the transaction, not at execution;
  a contract that was non-standard when it was added keeps its meaning (the pin is trust on first
  use, not a standard check); a `classId` restored from a backup is hostile input, validated as a
  field element but not authenticated. A token row or a transaction record without a class shows no
  figure, which includes every mint record built before Arc 3.
- **C (signature pin).** Record the call's selector (computed at `tx-request-builder.ts:194`) on the
  `TxCall`; `txAmount` reads a mint only when it equals `vocabularySelector(method, 2)`. The
  vocabulary has no `mint_to_commitment/2` selector (`token-transfer-vocabulary.ts:88-105`): C adds
  it, recomputed by the existing node test, or drops that method from `STANDARD_MINTS`. Records
  built before Arc 3 have no selector and show no figure.
- Either way: one test per refused class (no pin, a different pin) plus a matching control.

### Not this lane

- #80 (`blocked:external`): no V6 mainnet exists. #104 and #106 (hold H8): visible, each waiting on its
  own trigger. This plan builds nothing of them and the close-out comments on each.

### File-level change map

| Arc | File | Change |
|---|---|---|
| 1 | `apps/extension/src/composables/useTokenBalanceSnapshot.ts` (+ test) | add and delete reducers |
| 1 | `apps/extension/src/popup/components/modules/general/BalanceView.vue` (+ test) | use them |
| 1 | `apps/extension/src/popup/components/modules/general/TokensView.vue` | use them |
| 1 | `apps/extension/src/wallet/services/token/service.ts` (+ `service.test.ts`, `service.composition.test.ts`) | the write tracker and `withTokenLock`, the attempt loop, `persistAttempt` and its helpers, the hit fence |
| 1 | `apps/extension/src/wallet/services/storage-write-log.ts` | hold-before-apply hook, `afterSet` awaitable (test helper) |
| 1 | `apps/extension/src/wallet/services/network/service.ts` (+ test) | R4: a reservation during the liveness read reads as dead |
| 1 | `apps/extension/src/wallet/services/purge-rows.ts` | `purgeMalformedRows` takes an optional ownership guard (R5) |
| 1 | `apps/extension/src/wallet/services/profile/service.ts` (+ test) | remove UI keys at the two adoption points |
| 1 | `apps/extension/src/utils/profile-ui-keys.ts` | header comment |
| 2 | `apps/extension/src/popup/components/modules/holdings/TokenList.vue` (+ test) | add row |
| 2 | `apps/extension/src/popup/pages/holdings.vue` (+ test) | prefill and open |
| 2 | `packages/aztec-runtime/src/pxe/store-refusal.ts` (new), `packages/aztec-runtime/package.json` | refusal markers, subpath export `./pxe/store-refusal` |
| 2 | `packages/aztec-runtime/src/pxe/opfs-store.ts` (+ `opfs-store.test.ts`) | throw messages built from the markers |
| 2 | `apps/extension/src/popup/components/popups/new-token-error-text.ts` (new, + test) | refusal copy |
| 2 | `apps/extension/src/popup/components/popups/NewTokenPopup.vue` (+ test) | use it |
| 2 | `apps/extension/tests/e2e/` smoke file for Holdings; `tests/e2e/network/holdings.test.ts` | paste to add |
| 3 | `token/spec.ts`, `token/utils.ts`, `token/service.ts`, `execution/tx-request-builder.ts`, `transaction/spec.ts`, `utils/tx-amount.ts` (+ tests) | per OA-1 |

### Trade-offs and alternatives not taken

- **#94, move the metadata fetch out of the token lock** (Opus round 1, rejected): the locked section
  would be storage operations only, so a release would need a storage stall. But concurrent adds of
  one contract would each fetch (a dApp can fire many `registerToken` calls at once), and the journal
  ordering pin (`service.composition.test.ts:278`) would have to be rewritten. The resume loop keeps
  today's serialization and pin.
- **#94, guard the set and fail a released add** (rejected): a slow metadata fetch behind a running
  proof would turn today's success into a failed import, which a person would see.
- **#94, compensations only** (the issue's literal scope, rejected): it leaves the set able to
  overwrite a successor's row and two adds of one contract able to write two rows; the same release
  causes both.
- **#94, keep the watchdog from firing during the terminal writes** (final pass round 1 proposed
  protecting them; rejected for the drain, D10): the `Lock` in `wallet-core` serves every service and
  documents the displaced-holder limit (`lock.ts:145-149`). Draining tracked writes in the token
  service gives the same ordering without changing it.
- **#94, R1's resume for restore and token deletion** (rejected for R5's refusal): they await no
  network inside the lock, so only a watchdog expiry during storage work or the admission drain
  displaces them, and a refusal is
  simpler than a resume. R2 still tracks their writes.
- **#94, serialize the lockless chain sweep against every token-row writer** (final pass round 3,
  routed to an issue): the sweep deletes by ids from a snapshot (`token/service.ts:210-214`), so an id
  freed and reused on another chain between its snapshot and its delete loses its row. That race
  needs no watchdog release, predates this plan and is in none of its issues; its fix is a second,
  storage-only lock shared by every token-row writer and the sweep, with its own deadlock analysis
  against the network lock. The close-out files it as an issue (§ Post-implementation).
- **#94, re-enter inside the attempt** (round 1 draft, replaced): the inner acquisition released
  before the outer `catch` journaled, breaking the ordering pin for a resumed failure (Codex round 1).
  The loop gives every attempt its own `try`/`catch` under its own ticket.
- **#94, a per-write nonce on token rows** (Outline B, rejected): exact identity, but a persisted shape
  change in a row the backup carries; the raw-bytes compare under an owned ticket gives the same answer
  for the one case that needs it.
- **#93, an incarnation in every pin key** (Outline B, Codex round 1 and the final pass, rejected):
  closes the late-write cases too. It needs a per-incarnation value in `ProfileInfo` (kept out of the
  backup projection, which `ProfileService.backup()` builds from it, `profile/service.ts:2170-2173`),
  a new pin value shape, and a check in every pin reader and writer, for a residue whose harm is a pin
  order on Home.
- **#93, an orphan sweep at background start** (rejected, D4): removes garbage no screen reads, at a
  key listing on every start.
- **#206, `useEntityCrud` for both views** (rejected, D5): Holdings uses it, but the hero's snapshot
  rules (dirty refetch, kept rows on a failed refetch, the scope fence) live in the snapshot composable.

### Competing outline (Outline B, data carries its identity)

Sent to both auditors with the draft.

- #93: the pin value becomes `{ incarnation, chains }`; `ProfileInfo` exposes an opaque per-row
  incarnation (minted with `pxeGeneration`, never equal to it); a reader drops a foreign incarnation and
  a writer stamps its captured one. No background change.
- #94: every token row carries a random `writeId`; every compensation is compare-and-delete on it; the
  set stays where it is and a released add fails before it writes.
- #206: as Outline A.
- #105: store `classId` on every token row now, unused until OA-1.

Outline A was chosen (decision ledger D1-D3).

## Phases

Phase steps and pass criteria are procedures. Commands run from the worktree root unless they start
with `cd`.

### Arc 1: one balance reducer, a resumable token add, adopted ids start clean (merges on OA-3)

#### Phase 1.1: one reducer for balance events (#206)

1. Add `onBalanceAdded` and `onBalanceDeleted` to `useTokenBalanceSnapshot`, as in Architecture.
2. In `BalanceView.vue` and `TokensView.vue`, subscribe the returned handlers. Delete the local ones.
3. Test `useTokenBalanceSnapshot.test.ts`: an add for a listed id adds nothing, and a new id lands
   through `mapRow` (control); an out-of-scope add adds nothing and marks nothing dirty; a delete
   removes the row.
4. Test `BalanceView.test.ts`: the snapshot lands a row with `updatedAt: 0`, its add event arrives
   late, then its update lands; the hero leaves the skeleton without the 12-second cap. Show that the
   test fails on the base copy of `BalanceView.vue`.

UI impact: none in normal operation; the race-path effect is listed in § UI impact (OA-3).

Validation gate:
- Commands: `bun run lint`; `bun run typecheck:all`;
  `cd apps/extension && bun --bun vitest run src/composables/useTokenBalanceSnapshot.test.ts src/popup/components/modules/general/`.
- Pass: every command exits 0. The new BalanceView test fails against the base `BalanceView.vue`.
- Layers: lint, typecheck, unit, component.

#### Phase 1.2: a released token add resumes under a fresh ticket (#94)

1. Extend the test helper `recordWrites` (`wallet/services/storage-write-log.ts`) with an awaitable
   hook that can hold a set before it applies, and make `afterSet` awaitable, so a test can stop the
   add between its set and its next check.
2. In `NetworkService`, add the per-network reservation counts and R4 to `isNetworkLive` and
   `isChainLive`.
3. In `TokenService`, add the tracker and `withTokenLock` (R2): route the four `withLock` sites, every
   token-row `set`/`delete` and `persistToken`'s journal writes through them, and drain before
   `clearChainState`'s snapshot; give restore, token deletion and the purge R5's ownership checks
   (an optional guard on `purgeMalformedRows`). Then split
   `persistToken` into the attempt loop and `persistAttempt` with its helpers, as in Architecture.
4. Test in `token/service.test.ts` and `service.composition.test.ts`, with the watchdog test's
   technique (`service.test.ts:498`: fake timers, advance five minutes and one millisecond) and the
   step-1 hooks. Each test says whether it must fail on base; a new-path test has no base
   counterpart:
   - Released during the pre-set network check, after allocation; an add of another contract takes
     the same id and writes. The first add resumes, allocates again, writes; both rows survive; each
     add emits once. (Fails on base: the first add overwrites the second's row.)
   - Released during the fetch; an add of the same contract lands. The first add writes nothing,
     emits nothing and journals `succeeded`; one emit in total. (Fails on base: two rows for one
     contract.)
   - Released during the fetch, then again in the resumed attempt's pre-set network check: one row,
     one emit.
   - Its set held before it applies, the add is released; an add of another contract waits for that
     set to land before it allocates; both rows survive. (Fails on base: the second add reuses the id.)
   - The add's set rejects while a successor is draining it; the `failed` transition the rejection
     issues is held; the successor stays blocked until it lands. (New path.)
   - An add queued behind the lock while its profile is deleted and restored with the same contract
     rejects with "profile p1 deleted" instead of returning the restored row. (Fails on base.)
   - Released after the set, parked at the post-set network check; the network's sweep removed the
     row, a new network for the chain was added and a restore took the id, one row per case: another
     token, and the same token with identical bytes. The resumed add leaves the row and rejects with
     "network deleted". (Both fail on base: it deletes the successor's row.)
   - Released during the finish step's `isChainLive` read, with the sweep and the restore as above.
     The resumed add deletes nothing. (New path.)
   - Released after the set; the person deleted the token meanwhile. The resumed add resolves, emits
     nothing and journals `succeeded`. (Fails on base: it emits `onTokenAdded` for a missing row.)
   - Released after the set, then a deletion begins while the resumed add reads the row; the add
     rejects with "profile p1 deleted" and journals no `succeeded`. (New path.)
   - Owned throughout; a network deletion reserves and sweeps while the post-set `isNetworkLive` read
     is pending. The add emits nothing, rejects with "network deleted", and no row remains. (Fails on
     base: it emits and succeeds for a row the sweep removed.)
   - Released after the set; the network died and the add's own row is still there (the sweep read
     before it existed). The resumed add removes it. (Control; base passes.)
   - The fetch rejects after the watchdog released the ticket; a token operation queued after the
     rejection stays blocked while the `failed` transition is held. (Fails on base: the queued
     operation runs first.)
   - A restore released during a row's pre-set `isChainLive` read; an add writes the id it allocated.
     The restore records `token lock lost` on that row and the rest, and the add's row survives.
     (Fails on base: the restore overwrites it.)
   - A deletion released after its `tokens.get`; the token is deleted and its id reused. The deletion
     rejects with `token lock lost` and the replacement survives. (Fails on base: it deletes the
     replacement.)
   - A profile purge released after its snapshot; a deletion authorized before the lock frees one of
     its ids, and another profile's restore reuses it. The purge throws `token lock lost`, the
     replacement survives, and the profile's tombstone stays. (Fails on base: the purge deletes the
     replacement.)
5. Test in the network service tests: R4 for both methods, including a reservation that starts and
   ends during `isChainLive`'s read of a network it then resolves, plus a control read with no
   reservation.
6. Keep every existing add test green unchanged: they are the owned-ticket controls, among them the
   ordering pin (`service.composition.test.ts:278`), the two-liveness-reads test (`service.test.ts:473`)
   and the watchdog test (`:497`).

UI impact: none in normal operation; the race-path effects are listed in § UI impact (OA-3).

Validation gate:
- Commands: `bun run lint`; `bun run typecheck:all`;
  `cd apps/extension && bun --bun vitest run src/wallet/services/token/ src/wallet/services/network/ src/wallet/services/storage-write-log.ts`.
- Pass: every command exits 0. Each test marked "fails on base" is red against the base
  `token/service.ts` and `network/service.ts` (paste the red run).
- Layers: lint, typecheck, unit, composition.

#### Phase 1.3: an adopted profile id starts with no UI keys (#93)

1. Keep one `StorageArea` field in the `ProfileService` constructor.
2. In `persistNewProfileHoldingLock` and `writeMarkerThenRowHoldingLock`, await
   `remove(profileUiKeys(id))` before the first write.
3. Update the header of `utils/profile-ui-keys.ts`.
4. Test in the profile service tests:
   - A pin key is stored under a backup's id; a restore that keeps the id removes it before the
     restore marker and the profile row are written; another profile's pin key stays (control).
     (Fails on base.)
   - The same for a passkey import that adopts its `userHandle`. (Fails on base.)
   - A removal that rejects fails the restore with no restore marker and no profile row written.

UI impact: none in normal operation; the race-path effect is listed in § UI impact (OA-3).

Validation gate:
- Commands: `bun run lint`; `bun run typecheck:all`;
  `cd apps/extension && bun --bun vitest run src/wallet/services/profile/ src/wallet/services/profile-deletion/ src/utils/ src/composables/usePinnedTokens.test.ts`.
- Pass: every command exits 0. The two tests marked "fails on base" are red against the base
  `profile/service.ts`.
- Layers: lint, typecheck, unit.

#### Arc 1 boundary gate

- Commands, in order:
  - `bun run audit:vue` (typecheck, unit and component tests and lint in parallel, then the build);
    `bun run test:all`.
  - The whole smoke suite: `cd apps/extension && bun run test:e2e -- --retry=0`; then
    `bun run build:firefox` and the same with `NULO_E2E_BROWSER=firefox` (`audit:vue` builds Chrome
    only, and the smoke setup only checks that a build exists).
  - Network, one run at a time (gate G1), Chrome:
    `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/token-add-auto-trust.test.ts tests/e2e/network/default-token-seeding.test.ts tests/e2e/network/pin-to-home.test.ts tests/e2e/network/home-cap.test.ts tests/e2e/network/holdings.test.ts tests/e2e/network/balance-row-reconciliation.test.ts tests/e2e/network/profile-reimport-matrix.test.ts --retry=0`;
    `NULO_E2E_PROVERLESS=1 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/incoming-arrival.test.ts --retry=0`.
  - Network, Firefox (`dev` requires the Firefox network status):
    `NULO_E2E_BROWSER=firefox NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/pin-to-home.test.ts tests/e2e/network/token-add-auto-trust.test.ts tests/e2e/network/profile-reimport-matrix.test.ts --retry=0`.
  - `bun run check:plans` after staging the plan files.
- Pass: every command exits 0. A red e2e gets one rerun only when the failure matches a known flake in
  the `e2e-testing` skill; a second red is breakage to fix.
- Layers: typecheck, lint, unit, component, composition, build, smoke e2e (Chrome and Firefox),
  network e2e (Chrome; three files on Firefox).

### Arc 2: Holdings search and add-token copy (waits on page 8)

Build nothing here until the orchestrator says page 8 is signed. A record answered "as is" drops its
phase; a "changed" answer is built as its note says.

#### Phase 2.1: paste an address to add a token (#134, P8-01) — waits on page 8

1. Add `addCandidate`, the add row and the `addToken` emit to `TokenList.vue`.
2. In `pages/holdings.vue`, set `preselectedTokenAddressToAdd`, then open `new_token`.
3. Test `TokenList.test.ts`: a valid unmatched address shows one add row and no no-results message;
   a value that fails `isValidAztecAddress` and an address that matches a listed token each show no
   add row; a click emits the address.
4. Test `holdings.test.ts`: the emit opens `new_token` with the address in the cache store.
5. Add a smoke e2e: paste a valid address that matches no token, tap the row, and check that the
   popup's address field holds it. Extend `tests/e2e/network/holdings.test.ts`: paste a deployed extra
   token's address, add it, and check that its row appears.

UI impact (P8-01, quoted): "When the search text is a valid contract address that matches no token,
the list shows one row "Add token 0x12…ab" that opens the existing New token popup with the address
filled in. Normal searches are unchanged. The PR attaches the result in both themes."

Validation gate:
- Commands: `bun run lint`; `bun run typecheck:all`;
  `cd apps/extension && bun --bun vitest run src/popup/components/modules/holdings/ src/popup/pages/holdings.test.ts`;
  `bun run build`, then the new smoke file on Chrome (`bun run test:e2e -- <file> --retry=0`);
  `bun run build:firefox`, then the same with `NULO_E2E_BROWSER=firefox`;
  `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/holdings.test.ts --retry=0`,
  then the same with `NULO_E2E_BROWSER=firefox`.
- Pass: every command exits 0. Screenshots of the row in both themes attach to the PR.
- Layers: lint, typecheck, unit, component, smoke e2e and network e2e on both browsers.

#### Phase 2.2: a readable line for store refusals (#136, P8-02) — waits on page 8

1. Add `packages/aztec-runtime/src/pxe/store-refusal.ts` and its subpath export; put the marker in
   the three refusal messages in `opfs-store.ts`.
2. Add `new-token-error-text.ts` with `newTokenErrorText`.
3. In `NewTokenPopup.vue`'s catch, set `error.value = newTokenErrorText(err)`.
4. Test `opfs-store.test.ts`: each of the three throw sites (stalled open, reopen while quarantined,
   version mismatch) produces a message that carries the marker; the invalid-key and wrong-key errors
   do not (controls).
5. Test `new-token-error-text.test.ts`: the marker, bare and as the popup receives it, reads the
   generic line; any other error keeps its message (control).
6. Test `NewTokenPopup.test.ts`: a refused add shows the generic line under Submit.

UI impact (P8-02, quoted): "When the wallet's store refuses (a reopen, a stalled open), the line
under Submit reads "Something went wrong. Try again."; the raw developer text goes to the debug log
only." The background's existing log lines stay as they are (OA-4).

Validation gate:
- Commands: `bun run lint`; `bun run typecheck:all`;
  `cd packages/aztec-runtime && bun run test`;
  `cd apps/extension && bun --bun vitest run src/popup/components/popups/`;
  `bun run audit:vue`; then search the built output for `did not answer init` (a string only
  `opfs-store.ts` holds) and confirm no chunk `popup.html` loads contains it;
  `cd apps/extension && bun run test:e2e -- tests/e2e/settings-crud.test.ts --retry=0`;
  `bun run build:firefox`, then the same with `NULO_E2E_BROWSER=firefox`.
- Pass: every command exits 0, and the search finds the string in no popup chunk.
- Layers: lint, typecheck, unit, component, build, smoke e2e on both browsers.

#### Arc 2 boundary gate

- Commands: `bun run audit:vue`; `bun run test:all`; the whole smoke suite on Chrome, then
  `bun run build:firefox` and the whole smoke suite on Firefox;
  `tests/e2e/network/holdings.test.ts` on both browsers (one network run at a time).
- Pass: every command exits 0.

### Arc 3: the mint figure's class pin (waits on OA-1)

#### Phase 3.1: pin the class a mint figure reads (#105) — waits on OA-1

1. Build the option OA-1 names (Architecture § Arc 3). Build nothing on B.
2. Test `tx-amount.test.ts`: a matching pin reads the figure (control); a missing pin and a different
   pin each read none. Test the add path stores the class, `getTokenInfo` keeps it, and the builder
   records it.

UI impact: per OA-1's answer; quote it in the PR.

Validation gate:
- Commands: `bun run lint`; `bun run typecheck:all`;
  `cd apps/extension && bun --bun vitest run src/utils/tx-amount.test.ts src/wallet/services/token/ src/wallet/services/execution/`;
  `bun run test`; `bun run test:all`;
  `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/token-add-auto-trust.test.ts --retry=0`.
- Pass: every command exits 0.
- Layers: lint, typecheck, unit, network e2e.

## UI impact

- **Arc 1: none in normal operation.** No screen, copy, format or row choice changes. Three effects
  appear only on a race path, and each restores what the code already specifies. They are visible, so
  OA-3 asks the owner, and Arc 1 merges only on the answer (recommended: ship them):
  - #206: after a late add event for a row already shown, Home's hero leaves its skeleton when that
    row settles, instead of at the 12-second cap. The figure is the same either way (I3).
  - #94: after a token add held the lock for five minutes, the add waits for the current holder
    before it writes. A token added meanwhile keeps its row and its balance, no contract gets two
    rows, and a token the person deleted while the add waited does not come back to the list. One
    outcome changes: an add that races its network's deletion reports success today, for a token the
    deletion already removed; after, it fails with today's "network deleted" message. No new copy.
  - #93: a restored or re-imported profile whose id was used before opens with no pinned tokens
    left from before. Pins are never backed up, so this is what every restore already shows unless a
    page wrote a pin back during the deletion. A page still showing the deleted profile can pin again
    after the restore; that stays (D1).
  - #94, only when the five-minute watchdog expires during storage work or the admission drain: a
    token restore, deletion or profile purge that lost
    the lock fails with a new raw `token lock lost` message (a restored row records it; a deletion
    rejects; a profile deletion stops, keeps its tombstone and finishes on the next background start,
    as any failed purge does) instead of overwriting or
    deleting another token's row. A restored row whose network was deleted during that wait stays,
    and is listed again if a network for its chain is added back.
- **Arc 2:** P8-01 and P8-02, quoted in their phases. Anything beyond them is OA-2 and OA-4.
- **Arc 3:** per OA-1.

## Security & Adversarial Considerations

**Threat model.** No new trust boundary. The attackers that matter: a dApp that calls `registerToken`
repeatedly or races a deletion; a hostile backup file (it chooses the restored profile id and the token
rows); a slow or malicious node that stretches a simulation past the lock watchdog; a page in another
extension view that has not seen a deletion.

- **#94.** No by-id write, delete, emit or success transition is issued without an owned ticket,
  checked after the last await (R1), so a released add can no longer overwrite or delete a row
  another add or a restore wrote, nor write a second row for one contract. A displaced add's
  in-flight writes land before any successor reads (R2), so no successor allocates over a write it
  cannot see yet; R2 tracks every token-row write in the service, and a displaced restore or
  deletion or purge refuses its next write instead of making it (R5). The deletion leg never deletes once released (a same-contract restore under the
  reused id keeps its row). The network leg deletes only under an owned ticket, only the exact bytes
  it wrote, only when no live network holds the chain, and a liveness read that overlapped a
  reservation reads as dead (R4). Every exit, the `findToken` hit included, re-asserts the deletion
  fence captured at the authorizing entry. A node that stalls the fetch makes the add wait longer;
  it cannot make it write out of turn. The dApp-spam guard (the pre-lock short-circuit, `:347`) and
  the serialization of fetches are unchanged.
- **#93.** The removal runs before the row write, so a restored profile never reads a key left from a
  previous incarnation. A backup cannot write a UI key (pins are not backed up), and a hostile backup
  or `userHandle` can only name a free, unreserved id, so the removal can only drop an orphan. The key
  is computed by `profileUiKeys` from the settled id and cannot name another profile's key (`p1`'s
  never include `p10`'s). A pin operation in flight through a deletion and a restore is accepted
  residue (D1).
- **#206.** No trust change; rows still pass the scope filter.
- **Arc 2.** The pasted address never leaves the popup until the person submits the existing popup.
  The refusal marker is a fixed constant; it adds no data to a message.
  `isValidAztecAddress` rejects anything that is not a curve point, so no arbitrary string reaches the
  add flow from the search box. The popup adds no log line; the background's existing lines (error
  and warn) carry the store dir, which names a profile id and a chain id (OA-4).
- **Arc 3.** A restored `classId` or `TxCall` class is hostile input: validated as a field element,
  never authenticated; OA-1 states this limit.
- **Least privilege, crypto, supply chain.** No new permission, dependency, key or cryptography.
  Frozen lockfile and the 7-day age gate stand.

## Assumptions

### Facts

- F1. `persistToken`'s two compensating deletes (`token/service.ts:417-420`, `:426-429`) delete by id
  with no ownership check; the emit fence (`:457-461`) checks `ownsLock()`.
- F2. The token lock is `new Lock()` (`:96`) with a 5-minute watchdog (`packages/wallet-core/src/utils/lock.ts:5`);
  `withLock` passes `isCurrent`, which stays false after a release (`lock.ts:86-93`).
- F3. Token ids are max+1 over the store's keys (`wallet/services/id-allocators.ts:16`); a restore
  allocates fresh ids (`token/service.ts:796`), and can get a purged row's id back (`service.test.ts:540`).
- F4. `clearChainState` deletes without the token lock and from a snapshot (`token/service.ts:186-216`).
- F5. The live metadata fetch runs inside the token lock (`:379`); the id is allocated after it (`:389`)
  and the set follows an awaited network check (`:411-414`).
- F6. The in-lock `findToken` hit (`:373`) returns without re-asserting the deletion fence; the pre-lock
  short-circuit re-asserts (`:347-352`).
- F7. Profile ids are random (`profile/repository.ts:113`), but a restore keeps a free generated-shaped
  id (`profile/service.ts:2329-2332`) and a passkey import uses its `userHandle` (`:2136-2155`).
- F8. The purge removes `profileUiKeys(id)` once (`profile-deletion/coordinator.ts:135`); nothing else
  removes them.
- F9. `pin`/`unpin` fence only on the popup's own store scope (`usePinnedTokens.ts:171-174,206-223`);
  the deletion cleanup writes unfenced (`:226-242`).
- F10. Profile deletion purges token rows silently (`token/service.ts:757-764`).
- F11. BalanceView pushes every in-scope add (`BalanceView.vue:234-238`); TokensView skips a listed id
  (`TokensView.vue:223-229`); updates go to the first copy only (`useTokenBalanceSnapshot.ts:88-92`).
- F12. A zero-balance row is not a holding in the aggregate (`utils/token-aggregate.ts:20-21`), and a
  balance row is created at zero (`token-balance/service.ts:290-305`).
- F13. `cacheStore.preselectedTokenAddressToAdd` has a reader (`NewTokenPopup.vue:273-276`) and no
  writer today.
- F14. The New token popup shows `errorMessageFromUnknown(err)` under Submit (`NewTokenPopup.vue:256,331`).
- F15. P8-02 cites `endpoint-error-text.ts:11`, whose string is `"Something went wrong."`; the
  proposal's copy is `"Something went wrong. Try again."`.
- F16. The three store refusals are `ChainStoreOpenTimeoutError` (`opfs-store.ts:131`, private),
  `ChainStoreWedgedError` (`:109`, exported at `:54`) and `PxeStoreVersionMismatch` (`:221`, exported
  at `:190`); `openChainStore:` also opens two other errors (`:100`, `:165`). The background logs a
  failed operation at error (`pxe/service.ts:975`) and a mismatch also at warn (`opfs-store.ts:220`).
- F17. `recordWrites`' `afterSet` is synchronous (`wallet/services/storage-write-log.ts:9-19`).
- F18. `isNetworkLive` checks the reservation before its storage read (`network/service.ts:580-581`),
  and `deleteNetwork` keeps the network row until its sweep ends (`:552-559`).
- F19. `getTokenInfo` (`token/utils.ts:4`) projects a token row to `TokenInfo` field by field.

### Inferences

- I1. (Retired.) The round 1 draft leaned on storage applying one context's operations in dispatch
  order, which neither browser documents. R2's drain replaces it: no successor reads before a
  displaced add's tracked writes settle.
- I2. A pin write reaches a re-adopted id only from a page that missed the deletion event, or from an
  operation parked before the deletion (Phase 1.3 § What it does not close). Either needs a profile
  deletion and a restore that asks for a file and a password while that page is open.
- I3. A duplicate balance row is the row at creation (zero balance), so it never changes the hero's
  figure, only how long the skeleton holds; a malformed duplicate repeats a row that already makes the
  total partial.
- I4. A resumed attempt cannot deadlock: its old ticket is no longer current, so the new acquisition
  queues like any caller (`Lock` is not re-entrant, but this is a new ticket). The loop is unbounded but
  each later attempt fetches nothing.
- I6. Restore, the purge and token deletion await only storage, and lock-free storage-backed liveness
  reads, inside the token lock (`token/service.ts:757-773`, `:788-825`, `:550-558`), so the watchdog
  releases them only when it expires during their storage work or their admission drain (the timer
  starts at the grant, `lock.ts:153-161`); R5
  makes each refuse then. Confidence: high.
- I5. Under an owned ticket, the bytes at the add's id equal the add's own serialization only if the
  add wrote them, or a later writer stored the identical token there after the sweep removed the add's
  row (a restore under the reused id, for a network that replaced the dead one). The network leg
  deletes only when no live network holds the chain, so that identical row survives.

### Asks

- A1 (OA-1): the mint-figure pin for #105. Working assumption: nothing built; Arc 3 waits.
- A2 (OA-2): other raw errors under Submit in the New token popup. Working assumption: as today.
- A3 (OA-3): Arc 1's race-path effects. Working assumption: Arc 1 is built and opened, and merges
  only on the owner's answer.
- A4 (OA-4): whether P8-02's "debug log only" lowers the background's existing log lines. Working
  assumption: no log level changes.

## Decision ledger

| # | Decision | Alternatives | Panel | Why |
|---|---|---|---|---|
| D1 | #93: remove UI keys where an id is adopted; accept the late-write residue and file it as an issue | an incarnation in every pin key (Outline B); fence the popup's writes over RPC | Codex R1: Outline B, High. Opus R1: A, residue acceptable. Final pass R1: residue acceptable, but the round 1 rationale (one pending operation; the backup shape) was wrong | One awaited call at two private helpers removes what a restore would show. The residue needs a stale or parked page write (I2, corrected); the full fix is a `ProfileInfo` field kept out of backups plus a check in every pin reader and writer. The harm is a pin order |
| D2 | #94: an attempt loop; a released attempt hands its progress to a fresh ticket (R1); a failure journals at once (R3) | re-enter inside the attempt (R1 draft); guard the set and fail; fetch outside the lock (Opus R1); compensations only | Codex R1: draft rejected (exits, journal pin, compare race). Opus R1: conditional, fix the deletion leg, the hit fence and the network compare | The loop fixes all three Codex findings in one mechanism and keeps today's fetch serialization and ordering pin |
| D3 | #94: the deletion leg never deletes after a release; the network leg deletes only its own bytes, only under an owned ticket, only when no live network holds the chain | compare on (profile, chain, contract) when released (R1 draft); a per-write nonce (Outline B) | Codex R1 and Opus R1: the R1 compare could delete a same-contract restore; Codex: a replacement network's token | The purge owns a deleted profile's rows; the raw compare plus the live-chain check deletes only a row on a dead chain |
| D4 | #93: no orphan sweep at background start | a key-listing sweep of `nulo:ui:*` | Codex R1: orphan garbage acceptable. Opus R1: acceptable | Orphans are read by nothing and removed on adoption |
| D5 | #206: reducers in `useTokenBalanceSnapshot` | `useEntityCrud`; a shared pure helper | both R1: fine | The composable already owns the update reducer and both views' snapshot rules |
| D6 | #105 regrouped to Arc 3 behind OA-1; store nothing now | build the pin in Arc 1; store `classId` now (Outline B) | both R1: regroup right; no unused persisted field | Every effective pin hides a figure in its own case (lane brief C9) |
| D7 | Arc 1 ships as one PR, first | split #206 out for R2 | not contested | No seeder overlap; Arc 1 is small; R2's other holders wait on held arcs |
| D8 | Arc 1 is built and its PR opens first; its merge waits on OA-3 | ship with Arc 1 unless routed (R1 revision); hold the build for sign-off | Codex R1 and final pass R1: owner sign-off needed (High). Opus R1: FYI line, lean no gate | CLAUDE.md § UI changes requires the owner's recorded word for any visible change, remediation included, and no reviewer's approval replaces it. Merging is the orchestrator's call anyway, so the gate costs no build time |
| D9 | Arc 2 matches store refusals with one dedicated marker and `includes`, tested at the real throw sites | match the messages' openings; construct the classes in a test | Codex R1 and Opus R1: a timeout refusal missing, constructed classes cannot detect drift. Final pass R1: `openChainStore:` also opens two other errors | A marker only the three refusals carry changes no other error's text; a dependency-free subpath keeps PXE code out of the popup bundle |
| D10 | #94: every token-row write and the add's journal writes are tracked; each token-lock admission drains them until empty and re-acquires if its ticket lapsed (R2); liveness that overlapped a reservation is false (R4) | lean on dispatch-order storage (I1); keep the watchdog from firing during terminal writes; track only the add's writes (R2 draft) | Final pass R1: I1 unestablished; journal ordering not protected; a stale liveness read emits for a swept row. Final pass R2: one drain snapshot misses a write issued during it; a drain can outlive its ticket; restore's writes untracked; `isChainLive` has no counter baseline | The drain lives in the one service that issues the writes and needs no `Lock` change; R4 is a counter in the one service that reserves |

## Audit verdicts

### Round 1: Codex (gpt-6.1-sol, high, default login; read-only asked, the host runs it as approve-for-me), `reject (with blocking findings: unsafe compensation, unfenced exits, broken journal ordering, incomplete pin isolation, missing owner gates)`

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | High | `removeOwnRow` compares and deletes without a ticket; a same-contract restore in a new incarnation matches; a replacement network's token matches | Accepted. Deletion leg never deletes after a release; network leg compares raw bytes under an owned ticket and checks the chain (D3, I5) |
| 2 | High | The commit returns an existing row without the fence; a release during the post-set check can emit for a deleted row | Accepted. `assertCurrent` after every `findToken` hit (also closes base's gap at `:373`); no emit without an owned ticket, a released attempt resumes (D2) |
| 3 | High | Nested re-entry journals `failed` after the inner ticket ends | Accepted. Each attempt journals inside its own acquisition; a test pins it for a resumed failure |
| 4 | High | Adoption removal does not stop an in-flight pin write; A → B → A scope cycle | Rejected with reason (D1, I2): needs one storage operation pending through a deletion and a restore; the harm is a pin preference; the full fix changes `ProfileInfo` and the backup wire shape. Stated as residue |
| 5 | High | Arc 1 is visibly different; needs owner sign-off | Partly accepted: § UI impact now lists the three race-path effects and OA-3 surfaces them; whether they gate Arc 1 is the orchestrator's routing call (D8) |
| 6 | Medium | I1 is load-bearing but unestablished | Accepted in part: I1 restated with its evidence and moderate confidence; the design now leans on it only for a release inside a set's own await |
| 7 | Medium | Search rule differs from the popup's; the stalled-open timeout is missing; constructed classes cannot detect drift | Accepted (D9; Arc 2 text) |
| 8 | Medium | "Debug log only" is not reached: the background logs at error and warn | Accepted: no popup log line; OA-4 asks whether to lower the background lines |
| 9 | Medium | OA-1's options overstate: build-time class, trust on first use, unauthenticated backup pin, no `mint_to_commitment` selector | Accepted: OA-1 and Arc 3 rewritten |
| 10 | Medium | A Phase 1.2 test passes on base; missing races, second release, failed removal; use `audit:vue` for the build | Accepted: tests relabelled and added; gates use `audit:vue` and `test:all` |

### Round 1: Opus 5.5 (Plan agent), `conditional approve (with conditions: fix findings 1 and 2 in the #94 design; correct the UI-impact lines; repair the Phase 1.2 test and gate wording; correct OA-1)`

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | High | A released add must delete nothing when the fence moved; the R1 compare deletes a same-contract restore | Accepted (D3); a `0xbeef` variant of the watchdog test added |
| 2 | High | `findToken` hit returns before the fence; same gap in base at `:373` | Accepted; test added |
| 3 | Medium | UI impact understates: Home rows after a re-adopted id; duplicate rows and overwritten metadata on the race path | Accepted: § UI impact and OA-3 |
| 4 | Medium | The own-row network test passes on base; `afterSet` is synchronous | Accepted: relabelled as a control; `afterSet` made awaitable (F17) |
| 5 | Medium | OA-1: no `mint_to_commitment` selector; pre-Arc-3 records lose their figure under A | Accepted |
| 6 | Medium | `removeOwnRow` breaks the plan's own rule; compare raw bytes under the lock | Accepted (D3) |
| 7 | Low | Ordering pin holds only for the first hold | Accepted (D2) |
| 8 | Low | Move the fetch out of the lock | Rejected with reason: parallel same-contract fetches a dApp can trigger, and the ordering pin rewritten; the loop keeps both (§ Trade-offs) |
| 9 | Low | Error classes unexported; match with `includes` | Accepted (D9); the premise was partly wrong, two of the three are exported (final pass round 1, finding 8) |
| 10 | Low | Arc 1 gate runs network e2e on Chrome only | Accepted: three files on Firefox added |

### Final pass round 1: Codex (gpt-6.1-sol, high, fresh session, default login), `reject (with blocking findings: incomplete ownership fencing, stale network liveness, unprotected journal ordering, and missing owner sign-off)`

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | High | "Finish (owned)" awaits `isChainLive` before deleting; a release there lets a successor's row be deleted | Accepted: R1, ownership checked after the last await before every mutation; a test releases during that read |
| 2 | High | `isNetworkLive` checks the reservation before its read (`network/service.ts:580-581`); an owned add can emit for a row the sweep removed | Accepted: R4 (a reservation during the read reads as dead); base has the gap; a test with the ticket owned |
| 3 | High | Journaling `failed` "in the same acquisition" fails after a release during the fetch, and a release during the transition admits the queued operation | Accepted with another fix: R3 journals at once and R2 makes every successor wait for that write, instead of protecting the section from the watchdog (`Lock` is shared; D10) |
| 4 | High | D8 wrong: race-path effects are visible and need the owner's recorded word; the "superseded" refusal is new copy | Accepted: Arc 1's merge waits on OA-3 (D8). The refusal is gone: a resumed add whose row was removed on a live network resolves without an emit, so no new copy |
| 5 | Medium | I1 is unestablished and also guards successor allocation and dedupe | Accepted: I1 retired; R2's drain replaces it; a test holds a set before it applies |
| 6 | Medium | I2 is false: a stale page can pin after adoption; parked operations exist; the backup shape is not forced | Accepted in part: I2, Phase 1.3 and D1's rationale corrected, Outcome 2 narrowed, the residue filed as an issue at close-out. The incarnation stays rejected on the corrected reasons (D1) |
| 7 | Medium | The other-contract test passes on base (base allocates after the fetch) | Accepted: it now releases after allocation; the deleted-row resume test added |
| 8 | Medium | `openChainStore:` also opens the invalid-key and wrong-key errors; F16 says no class is exported | Accepted: one dedicated marker on the three refusals, the other two as controls; F16 corrected |
| 9 | Medium | `audit:vue` builds Chrome only; the PXE exclusion is not asserted; Arc 3's `classId` is projected away by `getTokenInfo` | Accepted: `build:firefox` before every Firefox smoke run; a search of the popup chunks; Arc 3 carries `classId` through `getTokenInfo` with a test |

### Final pass round 2: Codex (same session, resumed), `reject (with blocking findings: duplicate hit-path emits, an unfenced success exit, and incomplete drain admission and write tracking)`

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | High | The `findToken` hit went through the emit; base journals only (`:372-374`) | Accepted: the hit path journals `succeeded` and returns, with no emit and no write; a resumed hit takes the same path |
| 2 | High | The live-network success exit for a removed row misses the deletion fence | Accepted: R1 now requires a synchronous `assertCurrent(fence)` right before every emit and `succeeded`; a test begins a deletion during the resumed read |
| 3 | High | One drain snapshot misses a `failed` write issued while draining | Accepted: the drain repeats until the tracker is empty and admits in the same synchronous continuation; a test |
| 4 | High | A drain can outlive its ticket; restore, purge and deletion writes are untracked; the title backfill is a journal write; the #98 "no shared lines" claim is wrong | Accepted: re-acquire when the ticket lapsed while draining; every token-row write is tracked; the backfill is tracked; § Owner dependencies names the call lines Arc 1 shares with #98. R1's resume stays in `persistToken` only (I6) |
| 5 | Medium | `isChainLive` resolves its network after the read, so it has no counter baseline | Accepted: copy the counts before the read, compare the resolved network's (absent = 0); a test where a reservation starts and ends during the read |
| 6 | Medium | Two post-set liveness reads break base's two-reads test (`service.test.ts:473-494`) | Accepted: one post-set liveness read, in the finish step; that test stays unchanged |
| 7 | Medium | OA-3 says every add that succeeds today still succeeds, but R4 turns one success into "network deleted" | Accepted: OA-3 and § UI impact disclose it |
| 8 | Low | The `isChainLive` release test parks in a read base never makes | Accepted: the base comparison parks at the shared post-set network check; the `isChainLive` test is labelled new-path |

### Final pass round 3: Codex (same session, resumed), `reject (with blocking findings: unfenced displaced writers and stale chain-sweep deletes)`

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | High | I6 leaves a displaced restore able to overwrite an add's row and a displaced deletion able to delete a replacement; the drain uses ticket time | Accepted: R5, restore and deletion check ownership right before each write, delete and emit and refuse with `token lock lost`; two tests; OA-3 and § UI impact disclose the new message. The purge keeps no check (I6, moderate) |
| 2 | High | The lockless chain sweep deletes snapshot ids that may be freed and reused on another chain | Rejected for this plan, with reason: the race needs no watchdog release, predates the plan and is in none of its issues, and its fix is a second lock shared by every token-row writer and the sweep, with its own deadlock analysis against the network lock. Routed: the close-out files it as an issue; the final report names it so the orchestrator can file it sooner (§ Trade-offs) |
| 3 | Low | "no owner gate" and A3 contradict D8; the pin wording overstates | Accepted: both gate statements say Arc 1 merges on OA-3; the pin invariant, § UI impact and OA-3 say "left from before" and disclose the post-adoption residue |

### Final pass round 4: Codex (same session, resumed), `reject (with blocking findings: the profile-purge ownership exception is unsafe)`

Routing the chain sweep's id-reuse race to an issue: accepted by the reviewer ("exists on base, needs no watchdog release, and R2/R4/R5 do not establish a newly reachable failure").

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | High | I6's purge exemption is false: `deleteToken` authorizes before the lock (`:526-535`), so an authorized deletion can free an id a displaced purge still holds in its snapshot | Accepted: R5 covers the purge's typed deletes and its raw pass; the purge throws and the coordinator keeps the tombstone (`coordinator.ts:114-119`); a test; I6 corrected |
| 2 | Medium | OA-3 omits the restored row R5 leaves on a deleted chain, which can show again when a network for it returns | Accepted: OA-3 and § UI impact disclose it |
| 3 | Low | Outcome 1 and "no copy in Arc 1" overstate | Accepted: survival is scoped to the displaced writers this plan fences, excluding the routed sweep race; the race-path message is named |

### Final pass round 5: Codex (same session, resumed), `conditional approve (with conditions: align the watchdog-trigger and shared-line wording)`

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | Low | `token lock lost` is described as needing a five-minute storage stall; the watchdog starts at the grant, so an admission drain can use most of it | Accepted: "Good enough", § Trade-offs, § UI impact, I6 and OA-3 say the watchdog expires during storage work or the admission drain |
| 2 | Low | The #98 note predates R5's signature and body changes | Accepted: § Owner dependencies names R5's changes inside `restore`, the purge and `_deleteTokenByIdHoldingLock` |

Both conditions are wording and are applied; no further round was run. The reviewer: "no further material contradiction or blocking defect in the revised R1–R5 design"; implementation and test execution remain its validation gates.

## Post-implementation

The implementing session runs these steps from this file. `code_review` is `off`, so no
`/code-review` step exists.

1. **Per-arc Codex audit at each arc boundary**, before `gh stack add` opens the next arc.
   - Write a prompt file under `~/.cache/nulo-backlog/tokens-and-balances/`, then run
     `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <WT> high read-only gpt-6.1-sol`.
     `<WT>` is this worktree, on the default `~/.codex` login (no `CODEX_ACCOUNT`).
   - On a quota or 401 error, retry once with `CODEX_ACCOUNT=alejo-icloud`. If that fails too, log
     the failed consult in `lessons/phase-N.md` and continue on your own judgment within scope.
   - The prompt carries the arc's diff (`git diff <arc-base>..HEAD`), this plan and its decision
     ledger, and the arc map ("this is arc N of 3; Arc 2 adds the Holdings add row and the refusal
     line; Arc 3 adds a class pin to mint figures").
   - It carries an explicit adversarial ask: what could still write or delete a row the add does not
     own, leave a contract with two rows, show a previous incarnation's pins, or hold Home's hero; which
     assertion is weaker than at base.
   - It ends with the two rules below, verbatim.
2. **Fix loop.**
   - Verify each finding against the code first. Apply the accepted fixes and commit them.
   - Log the round in `lessons/phase-N.md`: the consult, the verdict, what was accepted, and what was
     rejected with reasons.
   - Resume the same session with `~/.claude/skills/codex/scripts/resume-codex.sh <session-id> <followup-file> <codex-dir> high`
     and the fix diff.
   - Stop when a round has no new material finding. **Hard stop at three rounds:** if the third round
     still finds material issues, stop and report it to the orchestrator.
3. **Final cross-arc pass**, after every built arc is green and looped: a fresh Codex session over
   `git diff fd47407..HEAD`, asking for seams between arcs, duplication across arcs and drift from this
   plan. The same rules and loop apply.
4. **Delivery**, per § Delivery: the first time any PR opens.
5. **Close-out**, as the stack's docs-only top layer:
   1. Bring `dev` in with `gh stack sync`. Read what changed in `implementations-plan/index.md` and
      `lessons.md`; another lane may have landed. Never a union merge.
   2. Write `## Outcome` directly after the front matter: Date, Status, Shipped (PR numbers), Dropped
      with a disposition line each (#80, #104, #106 by name; the #93 orphan keys of D4), Open items
      (the #93 late-write residue of D1 and the chain sweep's id-reuse race, each filed as an issue),
      and
      "Seeds retired: the /goal and /loop seeds below are no longer live".
   3. File every open item in its home (table below), deduping first with
      `gh issue list --state all --search "<words>"`. An issue body has five sections: What happens,
      Where, Impact, Possible fix, Record. Comment on every lane issue left open (#80, #104, #106, and
      any arc not built), saying what shipped and what is left.
   4. Promote generalizable gotchas to `implementations-plan/lessons.md`: 8 KiB budget, deduplicate,
      retire what an entry supersedes, date tool versions.
   5. Delete `STATUS.md` and the "Live progress" link at the top of this file.
   6. In its own commit, `git mv implementations-plan/tokens-and-balances implementations-plan/archive/tokens-and-balances`.
      Repair relative links the extra level breaks. Move the index line to `archive/index.md`.
   7. Report and stop. Merging is the orchestrator's call.
6. **Teardown after the merge.**
   - When `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/tokens-and-balances/plan.md`
     succeeds, run `agent-worktree done tokens-and-balances --merged`. This step needs no approval.
   - If it refuses, relay its output and stop; never force.
   - A `/loop` session checks this on every firing. A `/goal` session arms one background wait after
     its wrap-up report:
     `until git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/tokens-and-balances/plan.md; do sleep 300; done`.

**Where open work lives** (CLAUDE.md § Where open work lives):

| Situation | Home |
|---|---|
| Work inside the implementation you are on | this `plan.md` and the PR |
| Actionable work that outlives the plan | a GitHub issue, with a domain label and a `Record` link to the archived plan |
| Needs a product call, or waits on something outside the repo | an issue labelled `owner-decision` or `blocked:external` |
| A suspected exploitable weakness | a private draft security advisory; this plan records only "tracked privately: GHSA-…" |
| Rejected, superseded or already done | a disposition line in the Outcome; no open item anywhere |
| Knowledge that prevents a repeat | `implementations-plan/lessons.md` (8 KiB budget) |
| A legal or store blank with a release deadline | `BEFORE-LAUNCH.md` |
| Accepted code work that blocks launch | the `v1.0.0` milestone, pointed at once from `BEFORE-LAUNCH.md` |

**No-over-engineering rule** (verbatim in every post-implementation Codex prompt): *"Report bugs and
small, targeted improvements only. Do not propose speculative abstractions, extra configuration
surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and
is clear, leave it alone."*

**Comment-quality rule** (verbatim in every post-implementation Codex prompt): *"Audit the comments for
value per character. Flag any comment that narrates what the code visibly does, restates its line,
references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and
flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are
permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and
exact."*

## Delivery

One `gh stack`, one PR per arc, a docs-only close-out on top. Titles name only what shipped: drop a
clause for a phase dropped or answered "as is".

| Layer | Branch | Phases | Stacks on | `/code-review` | PR title (≤ 93 characters) | Closes |
|---|---|---|---|---|---|---|
| 1 | `worktree-tokens-and-balances` (adopted; carries the plan commit) | 1.1-1.3 | `dev` | off | `fix(tokens): one balance reducer, resumable token adds, adopted profile ids start clean` (87) | #206, #94, #93 |
| 2 | `tokens-and-balances-holdings-add` | 2.1-2.2 | layer 1 | off | `feat(holdings): add a token from a pasted address, readable store refusals` (74) | #134, #136 |
| 3 | `tokens-and-balances-mint-pin` | 3.1 | the layer below | off | `fix(activity): read a mint figure only from a pinned token class` (63) | #105 |
| 4 | `tokens-and-balances-close-out` | close-out | the top layer | off | `docs(plans): close tokens-and-balances` (38) | none |

- **Arc gates.** Arc 1 is built and opened without an owner answer and merges only on OA-3's (its PR
  body quotes it; on B each struck phase leaves the PR and its issue stays open; on C the PR closes
  unmerged, its issues stay open and any layer above it rebases onto `dev`). Arc 2 starts after page
  8 is signed; Arc 3 after OA-1 is answered A or C. Arcs 2 and 3 are independent: the stack takes
  them in the order their gates open. If neither gate opens, Arc 1 and the close-out ship alone, and
  the close-out comments on #134, #136 and #105 with what is left.
- **On B or "as is".** OA-1 = B closes #105 as not planned with the owner's answer quoted. A page 8
  record answered "as is" closes its issue the same way (SR3).
- **Mechanics.** `gh stack init --adopt worktree-tokens-and-balances --base dev`; at each boundary,
  after its loop converges, `gh stack add <next-branch>`. In Delivery: `gh stack sync`, then
  `gh stack submit --auto`, then `gh pr edit` each body: what changed and why, the validation runs with
  outcomes, `Closes #n` per issue, and for Arc 2 the page 8 records quoted with screenshots in both
  themes. Then `gh stack add tokens-and-balances-close-out`, its commits, `gh stack submit --auto`.
- **Labels.** Open each PR without labels. Add `e2e:extension-network` or `e2e:extension-smoke`
  afterwards only if the path filter skips a suite the arc needs.
- Never merge; never `--admin`.

## Pickup map

The orchestrator writes a `## Pickup` section into each issue. The arc that closes each one:

- Arc 1 (built now; merges on OA-3): #206 (Phase 1.1), #94 (Phase 1.2), #93 (Phase 1.3).
- Arc 2 (waits on page 8): #134 (Phase 2.1, P8-01), #136 (Phase 2.2, P8-02).
- Arc 3 (waits on OA-1): #105 (Phase 3.1; closed as not planned on OA-1 = B).
- No arc: #80 (`blocked:external`, no V6 mainnet), #104 (hold H8, waits on a real dApp report), #106
  (hold H8, waits on C12-fetch and its own plan).

## Seeds

Draft until the orchestrator approves; no ELI5 is produced (orchestrator-owned).

**Recommended: `/goal`**

```
/goal Every phase of implementations-plan/tokens-and-balances/plan.md whose gate is open (Arc 1 now; Arc 2 only after page 8 is signed, each phase only for its answered record; Arc 3 only after OA-1 is answered A or C) is marked ✓ in plan.md, each ✓ backed by its validation gate reported passing in the transcript; for each phase the agent printed LESSONS_FILE=implementations-plan/tokens-and-balances/lessons/phase-N.md; /code-review was NOT run (code_review is off); the Codex fix loop converged for each built arc and for the final cross-arc pass, each convergence quoted from a resumed Codex pass reporting no new material finding; the § Delivery stack exists on GitHub, created only after the loops converged (gh stack view in the transcript), including the close-out layer that archived the plan (git show --stat of the archive-move commit); bun run test and bun run lint both report exit 0 in the transcript.
```

**Alternative: `/loop`**

```
/loop 15m Drive implementations-plan/tokens-and-balances forward. Never idle. Each firing: 1) Reality check: read plan.md, STATUS.md and lessons/ from the top stack layer; if implementations-plan/archive/tokens-and-balances/plan.md exists on origin/dev (git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/tokens-and-balances/plan.md), run agent-worktree done tokens-and-balances --merged, report, clear this loop and stop; if the close-out is delivered but not merged, babysit CI only. 2) Pick the next open phase whose gate is open (Arc 2: page 8 signed; Arc 3: OA-1 answered A or C); never build a gated phase early. 3) After each edit run bun run lint and the touched tests; commit signed. 4) Phase green means its gate in plan.md passes: paste it, mark ✓, write lessons, print LESSONS_FILE=…. 5) At an arc boundary run the Codex loop per § Post-implementation (hard stop at three rounds), then gh stack add. 6) Stuck or facing a design fork: consult Codex (gpt-6.1-sol, high), log it, decide; anything a person would notice goes to OWNER-ASKS.md, never decided here. 7) All built arcs looped: final cross-arc pass, Delivery, close-out, report and stop. Hard limits: never merge, never push to main, never --admin, never force-push a pushed branch; one network e2e at a time on the host until #169 merges.
```

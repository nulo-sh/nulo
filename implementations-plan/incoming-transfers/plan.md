---
plan: incoming-transfers
tier: mid
status: approved (orchestrator, 2026-10-09); Arc 1 in implementation
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 Explore agents (sonnet) plus the driver's own read; dual audit (Codex gpt-6.1-sol high + Opus Plan); one final fresh Codex pass
base: origin/dev at ac259a7
trunk: dev
issues: [92, 97, 138, 139, 140, 141, 142, 143, 144, 227]
---

Live progress: [STATUS.md](STATUS.md). Owner questions: [OWNER-ASKS.md](OWNER-ASKS.md). Recon: [recon.md](recon.md).

## Tier and budget

`mid`, set by the orchestrator. Rubric: security sensitivity HIGH (receipt privacy, purge fences, explorer
disclosures), external coupling moderate (node and PXE behaviour on reorgs), everything else low. Three
arcs inside one plan keep it at `mid`. Post-implementation hardening is not scheduled.

## Outcome & Quality Bar

**For whom.** A person who receives tokens on the Aztec testnet and watches Activity, the received
page and the first-receive trust prompt. Behind them, the maintainer who inherits a 2,451-line receive
service whose fences are pinned call by call.

**What excellent looks like.**

1. An Allow lands whole or not at all: no receipt is ever left hidden under a trusted contract. No
   receipt section or Allow writes, and no receipt section prompts, once a purge has started, even one
   the lock watchdog displaced; a refused receipt is retried, never skipped. Each rule has a
   never-happens test paired with a success control. (The purge case also rests on storage applying
   operations in dispatch order, I7.)
2. Both scan arms read in one order, pinned by one test table, and an already-recorded note costs two
   storage reads per tick instead of four.
3. After page 4, the wallet asks the node for new transfers only when a new block exists, and a test
   shows a receipt landing after a gap, after a reorg and after a failed scan, each faster than the
   2-minute fallback could explain.
4. After page 4 and C12, every new link and the receipt fee lookup send only what the person tapped,
   and Settings → Privacy → explorer None removes every new link.

**Good enough.** No new screen, no new setting, no copy beyond the words page 4 approves. The note
reconciler (#140) and the newest-first scan (#138) are designed here and built only on the owner's answer.

## Scope

| Issue | What | Arc | Gate |
|---|---|---|---|
| #227 | One dedupe order for both scan arms, pinned | 1 (Phase 1.1) | none |
| #144 | Fence the receipt sections on the lock ticket and the epoch | 1 (Phase 1.2) | none |
| #92 | An Allow commits its trust row and every un-hide in one storage write | 1 (Phase 1.3) | none |
| #143 | Scan only after a new block, with a 2-minute fallback | 2 (Phase 2.2) | page 4 P4-04, liveness proofs (Phase 2.4) |
| #138 | Scan new public receipts first, back-fill history behind them | 2 (Phase 2.3) | page 4 (arc gate), OA-5 |
| #142 | Block and account explorer links on detail rows | 3 (Phase 3.1) | page 4 P4-02, C12-links; OA-6 for the rows, OA-2 and OA-3 for cards and contract |
| #97 | Contract link on the first-receive trust prompt | 3 (Phase 3.2) | page 4 P4-01, C12-links |
| #141 | The received page's fee loads on a tap | 3 (Phase 3.3) | page 4 P4-03, C12-fetch A; OA-4 |
| #139 | Open receipt screens follow a re-mine | 3 (Phase 3.4) | page 4 P4-05 |
| #140 | Reconcile note rows against the PXE | 3 (Phase 3.5) | OA-1 (not on page 4) |

**Regrouped: #140 leaves Arc 1.** The lane map calls #140 decision-free. The tree says otherwise: its
fix deletes or rewrites rows a person can see in Activity and on the received page, which the lane
brief and CLAUDE.md § UI changes send to the owner. It also needs care the issue does not name:
`getNotesRaw` reads `ACTIVE` notes only, so a note missing from that read may simply be spent. The
design sits in Arc 3 next to #139, because both decide what open receipt screens show after a reorg.
OA-1 asks the question. Until it is answered, nothing of #140 is built and the issue stays open.
Both reviewers agreed (§ Audit verdicts).

**Claims that did not hold** (recon.md § Claims checked has the evidence):

- #144's location `service.ts:605-616` is the already-fenced writer `_setTrustStateLocked`. The
  unfenced write is the receipt path's `repo.setTrust(…, "pending")` at `:1459`, which the cited pins
  exercise. Both receipt sections also drop the lock ticket (`:1390`, `:2070`), which the issue does not
  name and the audit found.
- #144's DRIFT PIN rows model a purge as a bare epoch bump. A purge takes the service lock, so inside a
  held lock it can only arrive through a watchdog handoff, which flips the lock ticket. The rows keep
  their bare-bump case as named controls; handoff rows pin the purge (Phase 1.2).
- P4-04's "one query per block for every watched token where the node allows it": the node's log
  query takes one contract. One chain-tips read per network serves every token; the log queries stay
  one per token and run only after a new block.
- #142's contract link: no detail page has a token contract row to carry it (OA-3).
- #141 under C12-fetch C: today's fetch already goes only to the record's configured node, so C closes
  #141 as is.

## Architecture & Implementation

### Arc 1: fences, an all-or-nothing Allow, one dedupe order

**#227, one receipt head.** Both locked sections become one sequence (`fenced()` is defined under #144):

```
fenced? → tokens → fenced? → findToken → getRecord(id) → fenced?
  → existing: arm tail (note: timestamp back-fill; public: reconcile rewrite) → done
  → isOwnSend(txHash): outgoing hit → stop; inflight hit → stop; fenced?
  → [note: parse amount] → resolveReceiptTrust → fenced? → arm commit
```

- `isDedupedPublicEvent` becomes `isOwnSend(scope, txHash)` and serves both arms (outgoing first, stop
  on a hit, then the journal, then the fence).
- `commitScannedNote` moves its record read before the two own-send sets. An existing note then costs
  `tokens` and `getRecord` only. Outcomes are unchanged: the own-send sets only ever gated new records.
- The arm tails stay separate: the note arm reads the block timestamp inside the section, the event
  carries its own. A full merge behind one generic section was considered and left out (§ Trade-offs).

**#144, the lock ticket in both receipt sections.** `withServiceLock` already hands each section an
`isCurrent` ticket; both receipt sections drop it today.

- Thread `isCurrent` through `commitScannedNote`, `commitDiscoveredNote`, `commitPublicEventLocked` and
  `commitPublicRecord`. Define `fenced = () => this.serviceEpoch === epochAtStart && isCurrent() &&
  this.deletersRunning === 0`. Every storage write in both sections reads `fenced()` immediately before
  it dispatches.
- **`deletersRunning`** counts the sections that delete rows (`clearScopeLocked`, and the sections of
  `onTokenDeleted`, `onAccountDeleted`, `onTransactionAdded` and `finishReconciliation`): each
  increments it before its first await and decrements it in `finally`. The watchdog lets a successor
  into the lock but does not stop a displaced section, so a deleter displaced mid-wipe keeps deleting
  (F11). While one runs, receipt and acceptance writes stand down instead of racing it. Each receipt
  section and the Allow read the count synchronously at lock entry, before any read, and stand down if
  it is not zero; the per-write read stays. The entry read is the one that matters: with the count zero
  at entry and the ticket current, no deleter can start or resume during the section, whereas a check
  only before the write misses a displaced deleter that finished during the reads (`onTransactionAdded`
  deletes records without bumping the epoch or touching trust, `service.ts:1292-1303`). Making the
  deleter stop instead was rejected: a wipe that stops halfway leaves a deleted scope's rows behind.
- `resolveReceiptTrust` passes `fenced` into `repo.setTrust`, which reads it after its stored read and
  just before `trust.set` (`repository.ts:131-136`).
- **A refused public commit holds its page.** `commitPublicEvent` returns `revoked` exactly when a
  `fenced()` read failed; every other exit (an existing record, a reconcile rewrite, an own send, a token
  removed, a new receipt written) is `processed`. If any commit of a page was revoked, the forward pass leaves `pendingPage` set and returns `no-progress`, so
  the next tick re-reads that page through the existing resume path (`service.ts:1666`). The
  reconciliation step and the back-fill batch follow the same rule. Today an epoch stand-down also
  stops the cursor write (`persistCursorLocked` reads the epoch, `:1608-1620`); a ticket stand-down
  would not, so without this rule a handoff would skip the receipt for good. The note arm needs
  nothing: it re-reads every active note on each tick.
- After the trust write, the two emits (`onIncomingTrustChanged`, then `onIncomingTransferPending`
  after the visibility read) read the ticket only. The invariant, stated at the code: no deleter can
  start while this section's ticket is current, a displaced one still running made the trust write
  stand down, and a bare epoch bump only re-plans schedulers, so it must not suppress a prompt for a
  row that was written.
- What this guarantees: no write is dispatched after a handoff or a lifecycle bump, so a purge (which
  bumps the epoch before it enumerates keys, `service.ts:759-765`, `:1210`) and a successor's Allow or
  Reject cannot be overwritten by a displaced receipt. A write dispatched before the handoff is ordered
  before anything the successor dispatches (Inference I7).
- `_setTrustStateLocked` already fences its write; its callers' later writes are covered in Phase 1.3.

**#92, an all-or-nothing Allow.** Today `setTrustAllow` writes the trust row, then moves the floor,
then un-hides records one await at a time, so a watchdog handoff between them strands receipts hidden
under a trusted contract with no prompt to bring them back (the `(BUG PIN)` at
`service.scenarios.test.ts:5336`). The fix removes the partial state at its source:

1. Keep the off-lock part as it is: the session fence (`captureTrustFence`), the tip and `epochAtTip`.
2. Under the lock, do every read first: token registration, the stored trust row, the contract's
   records, the visibility setting. Return `false` when the token is no longer registered, or when the
   trust row is missing or `unknown`: a prompt exists only for a `pending` row, and only a wipe deletes
   the row or a token delete resets it to `unknown` (`service.ts:1265-1267`), so writing `trusted`
   would put trust back into a cleared scope. `blocked` and `trusted` keep today's last-writer-wins.
3. Compute the new trust row (state `trusted`, the floor from a pure helper `nextArrivalFloor` that
   `moveArrivalFloorLocked` also uses: the max of the stored floor, the hidden records' highest block
   and the tip, or pending when the tip is missing or the epoch moved since it was read) and the
   un-hidden copies of the hidden records, each built from the record just read.
4. Read `live()` (lock ticket plus session) and `deletersRunning === 0`. If either fails, return
   `false` with nothing written. The count is also read at lock entry, before step 2's reads (see
   `deletersRunning` under #144): a displaced deleter that finished during the reads could have removed
   rows the batch would write back.
5. Call `repo.commitAcceptance(trustRow, unhidden)`, which serializes every row and writes them in one
   multi-key `storage.local.set` call. One call is one storage operation: Chromium's store applies a
   dictionary as one write batch and Firefox's as one transaction (I10), so a rejected write leaves
   none of the rows written. `EntityStorage` gains `item(id, entity)`, which returns its
   `{ key: serialized }` pair, so the key format and serialization stay in one place. Nothing awaits
   between the `live()` read and the call, so no timer, and so no watchdog, can run between them.
6. Emit `onIncomingTrustChanged`, then `onIncomingTransferAdded` per record when visibility is on, only
   while the ticket is current.

A refused Allow (displaced, locked, switched) leaves the row `pending` and every record hidden; the
popup closes without a toast, as it does today for `false` (`IncomingTrustPopup.vue:90-107`), and the
next popup open prompts again (`replayPendingPrompts`). `onTokenAdded` and `trustRestoredTokens` keep
their two-step trust-then-floor writes; they un-hide nothing, so #92 does not reach them (§ Not this
lane).

### Arc 2: scan cadence and cost (after page 4)

**Phase 2.1 measures first.** The 4,000 calls per hour figure has no recorded method. A baseline run
counts node requests by method for ten unlocked minutes on the sandbox, so the change is judged on
numbers.

**#143, block-gated ticks on the existing intervals** (the Opus hybrid, chosen over a new central
watcher):

- `getPublicScanTips` is rebuilt on one `node.getChainTips()` call and also returns the proposed tip
  `{number, hash}`. It refuses a reply whose fields are not safe integers and 32-byte hex, or whose
  tips are out of order (finalized ≤ checkpointed ≤ proposed).
- A per-network single-flight read with a short time-to-live serves every target of that network.
  `commitSchedulers` installs every interval in one synchronous loop, so the targets tick in phase and
  share one read per tick.
- Each target keeps `scannedAt`, the tip hash handed to its last run that reached the tip. A note target
  (network, account) runs when the proposed hash differs; a public target (network, contract) runs when
  the checkpointed hash differs. The public scan uses the handed-in tips instead of its own read.
- **Reached the tip** means: a note scan whose reads succeeded and none of whose commits stood down; a
  public scan that ended `idle-at-tip`, or a forward pass with no page left and no back-fill left. A
  reconciliation step or finish, a dropped page, a budget-limited pass, a failure, a backoff skip and a
  stand-down all keep the old `scannedAt`, so the next tick runs the target again with no new block.
  `ineligible` (a non-standard class) counts as reached: it rescans when the tip changes.
- A failed shared tips read runs every target as today (each reads its own tips), so failure episodes
  and the stalled banner behave as they do now.
- Every fourth tick (2 minutes) runs every target whatever the tips say, so a delayed PXE note or a
  backed-off retry still lands on a quiet chain.
- The outbox drain is local and keeps running on every tick. Install still runs every new target at
  once. Born-epoch fencing, single-flight sets, stop paths and scan episodes are untouched.

**#138, newest-first public scan (only on OA-5 = A).** `PublicScanCursor.startBlock` keeps meaning the
start of history (the `onAccountAdded` reset and a null-cursor restart rely on it).

- A fresh cursor reads `F0 = min(finalized, checkpointed)`. The forward scan starts at `F0 + 1` with
  `lastScanFinalized = F0`, so reconciliation's window `[lastScanFinalized + 1, checkpointed]` and
  `orphanedByReconciliation` never reach a back-filled block.
- History at or below `F0` is back-filled in windows of `W` blocks, walking down from `F0`. The cursor
  gains `backfill: { low, high, position }`: the window being read is `[low, high]`, and `position` is a
  `PublicEventCursor` (block, transaction index, log index; `public-events.ts:53-57`), or `null` before
  the window's first page, so a budget that stops inside a block resumes at the next log. A window is
  paged upward as the forward scan pages (the node's `toBlock` is exclusive, so `high + 1`) and ends on
  a validated end of results (no more pages and no dropped page), which also ends an empty window.
  The next window is `[max(startBlock, low - W), low - 1]`; the field is dropped after the window that
  starts at `startBlock`.
- Each tick runs the forward scan first, then back-fill pages up to the tick's page budget, persisted
  through `persistCursorLocked`. On a quiet chain whose recent blocks are all final, the first window
  holds the newest receipts and usually lands on the first tick (a window denser than one tick's page
  budget takes more ticks); older windows fill in below.
- `W` is fixed at Phase 2.3 start from the forward scan's page budget and recorded in lessons.
- Back-fill blocks are final, so a crash between a record write and the back-fill cursor write replays
  that page idempotently (records are keyed by transaction and log index); no pending-page marker is
  needed. A revoked commit leaves `position` where it was (#144's rule).
- `onAccountAdded` resets both halves. The extension is pre-production, so the schema change carries no
  migration (CLAUDE.md § Persisted-storage shape changes).

### Arc 3: receipt surfaces and explorer links (after page 4 and C12)

- **#142.** `explorers.ts` gains `getBlockExplorerUrl`, `getContractExplorerUrl` and
  `getAccountExplorerUrl`, with the transaction builder's `null` contract. Each path is verified on
  testnet.aztecscan.xyz before it ships; a kind with no route returns `null`. Each builder accepts only
  a safe integer or `^0x[0-9a-fA-F]{64}$`. Rows: the identifier a Block row shows (the hash, or the
  number where no hash is shown) and the journal page's "To" value get the link treatment the Details
  box's Tx hash row has today: the trimmed value is the link when a URL exists, copyable otherwise
  (`tx/[id].vue:262-276`). P4-02's words "View on <explorer>" are the hero line's text, not that row's,
  so OA-6 asks which treatment. Until it is answered those rows stay as they are. Address cards wait
  on OA-2 and a contract row on OA-3.
- **#97.** `IncomingTrustPopup.vue` shows "View contract on <explorer>" under the contract address when
  `getContractExplorerUrl` returns a URL for the prompt's network.
- **#141.** The received page's fee row shows a "Show fee" button and calls `getReceiptFee` only on its
  press. Nothing is fetched on mount. A request generation guards the result, so a press answered after
  the record changed is dropped.
- **#139.** `commitPublicEventLocked`'s reconcile branch emits `onIncomingTransferUpdated` after the
  rewrite, for a visible record with visibility on and the section fenced. `received/[id].vue` adds an
  Updated listener beside its Deleted one, tombstoned the same way so an update that races the first
  read is not lost; it replaces the shown record and resets the fee row to "Show fee". The feed already
  patches in place (`useIncomingTransfers.ts:139-143`).
- **#140 (only on OA-1 = A).** A note record gains `settled: true` once the wallet has seen its note at
  its stored block with that block at or below the finalized tip. The finalized tip is the tick's shared
  read, taken before the notes read, and every PXE notes read syncs to the node first (F6). In the note
  scan, after the `ACTIVE` read, take that (account, contract)'s unsettled note rows.
  - If each one is in the read at its stored block, settle those at or below the finalized tip and stop:
    the steady state makes no further read.
  - Otherwise read the PXE's synced block, read `ACTIVE_OR_NULLIFIED` once, and read the synced block
    again.
  - A row found at its stored block, spent or not, settles as above. A row found at another block is
    rewritten and emits Updated, as #139 does.
  - A row whose note is absent, with its block at or below both synced-block reads, takes a strike (an
    in-memory map; a restart forgets strikes, which only delays a delete). A row absent with a strike
    from an earlier scan is orphaned: mark the balance dirty, delete it, emit Deleted. A row found again
    loses its strike.
  - Any other row waits. A settled row is never read again.
  - Why one scan is not enough: a note at or below the PXE's anchor is always in the read, because
    `debug.getNotes` syncs the contract to that anchor first, so absence means the anchor fell below the
    row's block during the read, which only a prune does. The two synced-block reads cannot rule out a
    prune and a re-advance between them. If the transaction was re-included in that re-advance and its
    note already spent, deleting on that one read loses the receipt for good, because discovery reads
    unspent notes only (F6). The next scan's `ACTIVE_OR_NULLIFIED` read sees the re-included note and
    rewrites the row instead.
  - Why a marker and not the live finalized tip: a row stored while its block was unfinalized, whose
    block a reorg dropped while the wallet was closed, sits below the finalized tip on resume and would
    never be examined. Settled rows are the ones the wallet saw on the final chain.
  - No per-transaction node lookup is made (C12-fetch). Settling is one write per row, once. No
    migration (pre-production).

### Not this lane

- `onTokenAdded` and `trustRestoredTokens` write the trust row and then the floor in two awaits; a
  handoff between them leaves a token trusted with its floor unmoved, so a back-filled old receipt could
  play an arrival. No hidden row is involved, so #92 does not cover it. The close-out opens an issue if
  a test confirms it.
- Writes a displaced receipt dispatched just before a handoff-admitted purge are removed by that purge,
  if storage applies operations in dispatch order (I7). If it did not, a purged scope could keep a
  stray `pending` trust row (a restored profile's `trustRestoredTokens`, `service.ts:694`, would then
  skip auto-trusting that token), an outbox row or a receipt row, and a successor's decision could be
  overwritten by a late write. Each needs a five-minute storage stall first. Recorded, not built.
- A deleter displaced by the watchdog keeps deleting after the handoff (F11). Receipt and acceptance
  writes stand down until it ends (`deletersRunning`), but other successors (`onTokenAdded`'s trust
  write, cursor and outbox writes) are not fenced on it, nor are the arrival and floor writers, which
  read only epoch and ticket (`claimArrivals`, `getArrivalState`'s baseline write and
  `resolvePendingFloorsLocked`, `baselineAccountLocked`): a displaced `onAccountDeleted` lets a
  successor `claimArrivals` write back the arrival row it deleted, and a displaced `clearChain` can
  get a trust row written back through `setArrivalFloor`. A deleter that never returns holds receipt
  writes off, and every public page held, until the background restarts. The close-out files an
  issue. The property to reproduce: with the real `Lock`, a successor's ticket stays current while
  the displaced holder deletes its row.
- Discovery reads unspent notes only (F6), so a private receipt whose note is spent before a scan sees
  it never gets a row, and a re-included transaction whose note was spent before the wallet saw it
  again does not bring its row back (OA-1 says so). The close-out dedupes and files an issue.

### File-level change map

| File | Arc | Change |
|---|---|---|
| `apps/extension/src/wallet/services/incoming-transfer/service.ts` | 1, 2, 3 | 1.1 head reorder + `isOwnSend`; 1.2 ticket threading, fenced writes, page hold on a stand-down, ticket-gated emits; 1.3 one-write Allow, missing-row refusal, `nextArrivalFloor`; 2.2 shared tips, `scannedAt`, fallback; 2.3 newest-first windows; 3.4 Updated emit; 3.5 note reconciler with `settled` |
| `apps/extension/src/wallet/services/incoming-transfer/repository.ts` (+ test) | 1 | `commitAcceptance` (one multi-key `set`) |
| `packages/wallet-core/src/storage/entity_storage.ts` (+ test) | 1 | `item(id, entity)` |
| `apps/extension/src/wallet/services/incoming-transfer/service.scenarios.test.ts` | 1, 2, 3 | production-shaped `setTrust` mock; matrices re-pinned with handoff rows; Allow cases; liveness proofs; reconciler cases |
| `apps/extension/src/wallet/services/incoming-transfer/service.composition.test.ts` | 1 | new: the Allow through the real service, repository and storage |
| `apps/extension/src/wallet/services/incoming-transfer/spec.ts` | 2, 3 | `PublicScanCursor.backfill`; record `settled`; schemas |
| `apps/extension/src/wallet/services/incoming-transfer/public-event-indexer.ts` | 2 | handed-in tips; back-fill bounds |
| `packages/aztec-runtime/src/pxe/public-events.ts` (+ test) | 2 | `getPublicScanTips` on `getChainTips()`, proposed tip, ordering checks |
| `packages/aztec-runtime/src/pxe/{service,client}.ts`, `apps/extension/src/wallet/services/pxe/client.ts` | 3 | `getSyncedBlockHeader` pass-through to the note service, if not already reachable |
| `apps/extension/src/wallet/services/note/service.ts` | 3 | status parameter on the contract read; synced block read |
| `apps/extension/src/wallet/constants/explorers.ts` (+ test) | 3 | three builders |
| `apps/extension/src/popup/pages/{tx,received,journal}/[id].vue` (+ tests) | 3 | link rows; fee button; Updated listener |
| `apps/extension/src/popup/components/popups/IncomingTrustPopup.vue` (+ test) | 3 | contract link |
| `apps/extension/tests/e2e/network/incoming-*.test.ts`, `tests/e2e/rows.test.ts` | 2, 3 | install-run and link assertions; armed reorg proof |

### Trade-offs and alternatives not taken

- **#92: one write instead of a repair.** Round 1 reviewed a repair on popup connect. Both reviewers
  accepted its trigger but found it read candidates outside the lock, needed the trust state and session
  fence re-read under the lock, and set a contract-wide floor at the repair-time tip that silences
  legitimate arrivals; Codex also found the later re-show visible. One write avoids all four: no
  partial state exists to repair, the floor is the Allow's own, and no row appears later than the Allow.
  Rejected too: an in-memory retry inside `setTrustAllow` (it runs in a section that has lost the lock
  and dies with the worker), and un-hiding before the trust write (receipts visible under a pending
  contract).
- **#144: emits on the ticket, writes on ticket, epoch and deleter count.** Gating the emits on the epoch too (the
  first draft, and the Opus suggestion) moves the prompt after a harmless scheduler rebuild to "after
  the next scan and a popup reopen", because replay needs a stored record. The ticket alone excludes
  every wipe while the lock is held.
- **#144: compensation.** Deleting the pending row after a late stand-down was rejected: a compensating
  write races the purge it reacts to.
- **#227: full merge.** One generic section over a note-or-event union was rejected: the tails differ in
  real ways (timestamp read, reconcile rewrite, amount parse), and a union adds branches the complexity
  budget pays for. The shared head and `isOwnSend` remove the divergence the issue names.
- **#143: hybrid over a watcher.** A central per-network watcher (the first draft) replaces the
  per-target intervals and rewrites the stop paths (`service.ts:1053-1067`, `:1240-1249`). Phase-aligned
  intervals sharing one tips read reach the same call count and keep those paths. Per-target tip reads
  (Outline B) cost one call per target per tick. Zero-balance backoff is out (P4-04).
- **#138: head at `F0 + 1`.** Starting at the checkpointed tip leaves an unfinalized gap below it that
  reconciliation would have to cover. Overwriting `startBlock` with `F0 + 1` loses history on the next
  account add.
- **#140: node lookups.** Checking each recent row with `getTxReceipt` names the transaction to the node
  (C12-fetch). The PXE's own prune is the signal.

### Competing outline (Outline B, pins first)

- #227: pin both orders as they are; change no code.
- #144: post-write re-check only, no fence into the write.
- #92: retry in place inside `setTrustAllow` after a displacement.
- #140: ship the detector in Arc 1 behind a test pin, delete nothing.
- #143: one interval per target; each skips its scan when its own tip read is unchanged.
- Arc 3 as above.

Both reviewers would ship Outline A per issue, with the hybrid for #143 (§ Decision ledger).

## Phases

Run every command from the worktree root unless the step says otherwise. A phase is ✓ only when its
gate passes. Log each attempt in `lessons/phase-N.md` (N = the arc number).

### Arc 1: fences, an all-or-nothing Allow, one dedupe order (no owner gate)

#### Phase 1.1: one receipt head (#227) ✓

1. In `commitScannedNote`, read the record before the two own-send sets.
2. Rename `isDedupedPublicEvent` to `isOwnSend` and call it from both arms.
3. Add a fence check after the token read and after the record read in the note arm.
4. Re-pin `NOTE_HEAD` to the public order. Re-pin rows N1 to N5 to the new logs.
5. Add a test: an existing note reads `tokens` and `getRecord` only.
6. Add a test: a note whose hash is an own outgoing send reads the record, then `outgoing`, and never
   the journal.
7. Add a test: the unknown-trust controls of both arms log the same head.

Validation gate:
- Commands: `bun run --cwd apps/extension test src/wallet/services/incoming-transfer/`, then
  `bun run lint && bun run typecheck:all`.
- Pass: exit 0; every matrix row passes with its new log; no complexity directive added.
- Layers: unit, lint, typecheck.

#### Phase 1.2: the lock ticket in both receipt sections (#144) ✓

1. Make the scenarios' mocked `repo.setTrust` read the stored row, pause at a hookable point, then read
   its fence, as `repository.ts:131-136` does.
2. Add `deletersRunning` around the five deleting sections (increment before the first await, decrement
   in `finally`).
3. Thread `isCurrent` into the four section functions. Read `deletersRunning` at lock entry and stand
   down (`revoked`) if it is not zero. Define `fenced()` as epoch unchanged, ticket current and no
   deleter running. Read it before every storage write in both sections; pass it into `repo.setTrust`.
4. Make `commitPublicEvent` return `revoked` or `processed` as § Architecture defines. On any revoked
   commit in a page, keep `pendingPage` and return `no-progress`; the reconciliation step does the same.
5. Gate the trust-changed emit and the Pending emit on the ticket only. State the invariant at the code.
6. Rename the four DRIFT PIN rows to bare-bump controls. Keep their expected flags (`111000`).
7. Add handoff rows (watchdog past 5 minutes while parked): N6h and P6h expect `100000`; N7h and P7h
   expect `110000`.
8. Add rows N5b and P5b: a handoff during the trust write's stored read writes no row (`000000`).
9. Add a row N8h: a handoff during the note arm's timestamp read writes no outbox row and no record.
10. Add a scenario: a successor Allow admitted by a handoff is not overwritten by the displaced receipt.
11. Add the pair: a handoff during a public commit leaves the cursor on that page and the next tick
    lands the receipt; an undisturbed page holding an existing record, an own send and a new receipt
    advances the cursor.
12. Add the pair: with a displaced deleter still running, a receipt stands down and lands on the first
    tick after the deleter ends; with none running, it lands at once. Add the boundary case: a displaced
    deleter that finishes after the section's reads and before its write still makes it stand down.

Validation gate:
- Commands: as Phase 1.1.
- Pass: exit 0; no row carries "DRIFT PIN"; N5b, P5b and N8h each fail once with step 3's `fenced()`
  reverted, step 11's handoff case once with step 4 reverted, and step 12's boundary case once with
  the entry read removed (record each check in lessons).
- Layers: unit, lint, typecheck.

#### Phase 1.3: an all-or-nothing Allow (#92) ✓

1. Extract `nextArrivalFloor` from `moveArrivalFloorLocked`; keep the other callers on it.
2. Add `EntityStorage.item(id, entity)` in `packages/wallet-core` with a test, and
   `repo.commitAcceptance(trustRow, unhidden)`: one multi-key `storage.local.set`. Repository test: the
   commit makes exactly one `set` call carrying every row. A storage rejection propagates as today.
3. Rewrite `setTrustAllow`: the deleter count at lock entry, then reads (refusing an unregistered token
   or a missing or `unknown` trust row), then `live()` and the count again, then `commitAcceptance`,
   then ticket-gated emits.
4. Turn the `(BUG PIN)` at `service.scenarios.test.ts:5336` into the success case: a displaced Allow
   writes nothing; the row stays `pending`; every receipt stays hidden; replay prompts again.
5. Keep the test "an Allow displaced in its un-hide loop leaves a successor Reject's block", moved to
   the new park point.
6. Rewrite "a lock while an Allow un-hides" as a pair: a lock before the dispatch refuses (`false`,
   nothing written); a lock after it keeps every un-hide and the floor.
7. Add a scenario: an accepted Allow un-hides every record and sets the floor in the same write.
   Pair it with: a missing trust row, a row reset to `unknown`, a deleter running at entry, and a
   displaced `onTransactionAdded` that deletes a hidden record and finishes during the Allow's reads
   each refuse the Allow and write nothing.
8. Add `service.composition.test.ts`: the real service and repository on `FakeBrowserApi`, `svc()`
   stubs, a real `ProfileDeletionState`. Seed a pending contract with hidden rows. Assert stored rows
   after an Allow. Add the displaced case if fake timers can drive the watchdog there; otherwise a
   session lock before the dispatch.

Validation gate:
- Commands: as Phase 1.1, then `bun run test && bun run test:all`.
- Pass: exit 0; no `(BUG PIN)` row is left in the incoming-transfer scenarios; the composition test
  passes the COMPOSITION-TESTS.md reviewer checklist (no PXE fake, an assertion on stored rows).
- Layers: unit, composition, lint, typecheck.

#### Arc 1 boundary gate

**Warning:** until #169 merges, run network e2e only when no other lane's `e2e:agent` run is live on
this host. Check `~/.agents/ports.md` first.

- Commands:
  - `bun run lint && bun run typecheck:all && bun run test && bun run test:all`
  - `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/incoming-transfers.test.ts tests/e2e/network/incoming-public-transfers.test.ts tests/e2e/network/incoming-arrival.test.ts tests/e2e/network/token-add-auto-trust.test.ts tests/e2e/network/receive-unregistered.test.ts tests/e2e/network/account-switch-isolation.test.ts`
  - From `apps/extension`: `bun run test:e2e -- --retry=0` (smoke, Chrome; no smoke file changes, run
    once)
  - `bun run check:plans` after staging plan files
- Pass: all exit 0 at retry 0. One rerun is allowed for a known flake, named in lessons.
- Layers: lint, typecheck, unit, composition, network e2e (Chrome), smoke (Chrome).

### Arc 2: scan cadence and cost (waits on page 4 P4-04; built after Arc 1)

Every phase here waits on page 4. P4-04 is conditional: Arc 2 merges only with Phase 2.4's proofs.
Phase 2.3 also waits on OA-5.

#### Phase 2.1: baseline count

1. Run the extension on the sandbox for ten unlocked minutes: two accounts, the default tokens, no
   sends.
2. Count node JSON-RPC requests by method. Record the table in `lessons/phase-2.md`.
3. Name the call sites behind the three largest counts.

Validation gate: the table and the call-site names are in `lessons/phase-2.md`; `git diff --stat`
shows no product file.

#### Phase 2.2: block-gated ticks (#143)

1. Rebuild `getPublicScanTips` on `getChainTips()`; add the proposed tip and the ordering checks.
2. Add a unit test per refused reply class: a bad number, a bad hash, out-of-order tips.
3. Add the per-network single-flight tips read and per-target `scannedAt`.
4. Make each tick skip a target whose relevant hash equals its `scannedAt`, except every fourth tick.
5. Return "reached the tip" from both scans as § Architecture defines it.
6. Repeat Phase 2.1's count. Record it beside the baseline.

Validation gate:
- Commands: `bun run lint && bun run typecheck:all && bun run test && bun run test:all`.
- Pass: exit 0; the second count shows fewer node requests per minute than the baseline on a chain
  with no new blocks, and no more on a busy one.
- Layers: unit, lint, typecheck.

#### Phase 2.3: newest-first public scan (#138; only on OA-5 = A)

1. Fix `W` from the forward scan's page budget; record it in `lessons/phase-2.md`.
2. Add the optional `backfill: { low, high, position }` field to `PublicScanCursor` and its schema.
3. Start a fresh cursor's forward scan at `F0 + 1`, with `lastScanFinalized = F0`.
4. After the forward scan each tick, page back-fill windows downward up to the page budget; drop the
   field after the window that starts at `startBlock`.
5. Reset both halves in `onAccountAdded`.
6. Add scenarios: a receipt above `F0` lands before back-fill ends; on a quiet chain with
   `finalized = checkpointed`, a receipt at `F0` lands on the first tick while older history is still
   unread; back-filled receipts land; a restart between a back-fill record and its cursor write replays
   without duplicates; an empty forward scan with back-fill left keeps the target running; a revoked
   back-fill commit leaves `position` unchanged; a block with more logs than one tick's budget resumes
   at the next log with no duplicate and no gap; an empty window ends and the next one starts.
7. Add the pair: a reconciliation deletes a forward orphan and leaves a back-filled record.
8. Add a scenario: an account add during back-fill restarts both halves and finds the new account's
   history.

Validation gate: as Phase 2.2; the storage codec round-trip test covers the new field.

#### Phase 2.4: liveness proofs (P4-04's condition)

Each scenario asserts the receipt row exists less than 120 s of fake time after the event, so the
fallback tick cannot explain it.

1. Gap: the tip jumps by many blocks; the public receipt lands while the tip stays still, over several
   budget-limited ticks; the note receipt lands on the first tick.
2. Reorg: a same-height hash change runs the target; reconciliation finishes; the re-mined receipt
   lands; the forward scan resumes with no new block.
3. Retry: a scan fails; the receipt lands on the next tick with the tip unchanged.
4. Quiet chain: with no new block, the fallback tick lands a late note and drains the outbox.
5. Network e2e, install run: lock the wallet, receive a public and a private transfer, unlock; both rows
   appear. It proves the immediate run on install, not the tick rule. Add it to
   `incoming-public-transfers.test.ts` and `incoming-transfers.test.ts`.

Validation gate:
- Commands: Phase 2.2's, then (same host warning as Arc 1)
  `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/incoming-transfers.test.ts tests/e2e/network/incoming-public-transfers.test.ts tests/e2e/network/incoming-arrival.test.ts tests/e2e/network/token-add-auto-trust.test.ts tests/e2e/network/cold-wake-discovery.test.ts tests/e2e/network/account-switch-isolation.test.ts tests/e2e/network/public-events-capability.test.ts`.
- Pass: exit 0 at retry 0; each of steps 1 to 3 fails once with its mechanism reverted (record it).
- Layers: unit, network e2e (Chrome).

### Arc 3: receipt surfaces and explorer links (waits on page 4, C12-links, C12-fetch; built after Arc 2)

Every phase here waits on page 4 and C12. A phase answered "as is" is dropped and its issue closes as
not planned (SR3). Phase 3.5 waits on OA-1.

#### Phase 3.1: explorer builders and detail rows (#142)

1. Open testnet.aztecscan.xyz and confirm a block, a contract and an account route. Record each URL
   shape in `lessons/phase-3.md`.
2. Add the three builders with input checks; a kind with no route returns `null`.
3. Add builder tests: one per refused input class, one URL per kind, `null` for None and the sandbox.
4. Only once OA-6 is answered: link the Block row on `tx/[id].vue` and `received/[id].vue` and the
   journal "To" row in the chosen treatment. Add testids `tx-block-link`, `received-block-link` and
   `journal-detail-recipient-link`.
5. Apply the OA-2 and OA-3 answers if given; otherwise leave address cards and contract rows as they
   are.
6. Unanswered asks leave their rows unchanged; the PR comments on #142 with what is left.

Validation gate:
- Commands: `bun run lint && bun run typecheck:all && bun run test`.
- Pass: exit 0; component tests show each link present with an explorer and absent with None.
- Layers: unit, component, lint, typecheck.

#### Phase 3.2: trust prompt contract link (#97)

1. Read `defaultExplorer` and the prompt network's chain id in `IncomingTrustPopup.vue`.
2. Render "View contract on <explorer>" under the contract address. Add testid
   `incoming-trust-contract-link`.
3. Add component tests with a wire-shaped contract address: link present, absent with None, absent on
   the sandbox chain.

Validation gate: as Phase 3.1.

#### Phase 3.3: fee on a tap (#141; only under C12-fetch A)

1. Remove the fee fetch from `onMounted` in `received/[id].vue`.
2. Add a native "Show fee" button in the fee row. Add testid `received-fee-show`.
3. On press, show the shimmer, call `getReceiptFee`, then show the value or the dash. Drop a result
   whose request generation is stale.
4. Apply the OA-4 answers if given; otherwise dash on failure and "Show fee" on every open.
5. Add component tests: no `getReceiptFee` call on mount; one call per press; dash on `null`; a stale
   result dropped.

Validation gate: as Phase 3.1.

#### Phase 3.4: open screens follow a re-mine (#139)

1. Emit `onIncomingTransferUpdated` after the reconcile rewrite, gated as the Added emit is.
2. Add an Updated listener to `received/[id].vue`, tombstoned like the Deleted one; replace the shown
   record and reset the fee row.
3. Add scenarios: a rewrite emits Updated once; a hidden record or visibility off emits nothing.
4. Add component tests: an Updated event changes the shown block; an update that races the first read
   wins; a fee press answered after an update is dropped.

Validation gate: as Phase 3.1, plus the incoming-transfer scenarios.

#### Phase 3.5: note reconciliation (#140; only on OA-1 = A)

1. Add a status parameter to `NoteService`'s contract read; the default stays `ACTIVE`.
2. Expose the PXE's synced block number to the note service if it is not reachable yet.
3. Add the optional `settled` field to the record schema.
4. Add the reconciler to the note scan as § Architecture describes.
5. Add scenarios:
   - a row absent on two scans is deleted with a balance mark; absent on one scan, then found, it keeps
     its row and loses its strike; a spent note's row stays and settles;
   - a row above either synced-block read waits;
   - a prune and re-advance between the reads gives a strike, and the next scan, which sees the
     re-included note already spent, rewrites the row at its new block without playing its arrival
     again (the arrival `played` list is keyed by record id);
   - a moved row is rewritten and emits Updated;
   - the steady state makes no second read; a settled row is never read again;
   - the pair: a row stored unfinalized whose block was dropped while the wallet was closed, now below
     the finalized tip, is examined and deleted; a settled row at the same height is left alone.
6. Add an armed network proof: `NULO_E2E_REORG=1`, run alone and last; a note received in the dropped
   block loses its row once the chain re-advances.

Validation gate: as Phase 3.4, plus the armed run
`NULO_E2E_REORG=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<the new file>.test.ts`
exits 0.

#### Arc 3 boundary gate

- Commands:
  - `bun run lint && bun run typecheck:all && bun run test && bun run test:all`
  - (same host warning as Arc 1) `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/incoming-transfers.test.ts tests/e2e/network/incoming-public-transfers.test.ts tests/e2e/network/receive-unregistered.test.ts`
  - From `apps/extension`: `bun run test:e2e -- tests/e2e/rows.test.ts --retry=0`
  - From `apps/extension`: `NULO_E2E_BROWSER=firefox bun run test:e2e -- tests/e2e/rows.test.ts --retry=0`
- Pass: all exit 0 at retry 0; light and dark screenshots of every changed surface attached to the PR.
- Layers: unit, component, network e2e (Chrome), smoke (Chrome and Firefox).

## UI impact

Page 4 records are quoted word for word from the owner's decision page.

| Surface | Arc | Before → after | Sign-off |
|---|---|---|---|
| Trust prompt after a displaced Allow | 1 | race only (needs a five-minute storage stall inside the Allow): today some receipts show and the rest stay hidden under a trusted contract for good; after, nothing changes, the prompt closes without a toast and asks again on the next popup open, as any refused Allow does today | none needed: no new copy, row or layout; the refused-Allow path already exists |
| Every other screen | 1 | none | none needed |
| Incoming scan timing | 2 | none on screen: receipts still appear within one 30 s tick of their block; on a quiet chain a delayed note can take up to 2 minutes | P4-04: "Poll when a new block arrives, with one query per block for every watched token where the node allows it, plus a 2-minute fallback tick so a delayed PXE note or an outbox retry still lands when no block comes." |
| Order of first public history | 2 | newest receipts first, older rows fill in below | OA-5 |
| Trust prompt | 3 | the link appears under the contract address | P4-01: "Under the contract address the prompt shows "View contract on <explorer>", opening the explorer you picked in Settings → Privacy; with explorer None it does not show." |
| tx, received, journal detail rows | 3 | the Block row and the journal "To" row gain an explorer link once OA-6 says how it looks (the value as the link, as the Details Tx hash row, or a "View on <explorer>" text); address cards and contract rows unchanged until OA-2 and OA-3 | P4-02: "Where an explorer URL exists, the block, contract and account rows get the same "View on <explorer>" link the Tx hash row has, all removed by explorer None." |
| Received page fee row | 3 | "Show fee" until pressed, then the fee or a dash | P4-03: "The fee row reads "Show fee" and fetches only when tapped; nothing is looked up when the page opens." OA-4 for retry and reopen |
| Open received page and feed after a re-mine | 3 | the block follows the stored record; the fee row returns to "Show fee" | P4-05: "When reconciliation rewrites a surviving incoming transfer after a reorg, the wallet emits the update, so an open received page and the feed show the stored block and fee instead of stale ones." |
| Activity and received page after a dropped note | 3 | the row leaves the feed once the wallet has synced past its block, including a block dropped while the wallet was closed; an open received page shows its existing not-found state | OA-1 |

## Security & Adversarial Considerations

**Threat model.** A compromised or lying RPC node (in scope since the public arm shipped), a hostile
dApp supplying addresses that reach the journal page, a stalled storage operation that lets the lock
watchdog hand over mid-section, and an explorer or node that correlates what the person opens.

**RPC trust assumption, stated.** The node is trusted for liveness and completeness. It can always
withhold logs or report a stale tip; the fallback tick restores scheduling, not honest data. The
ancestry probe checks that the node returned a membership witness (`public-events.ts:326-329`); it does
not verify the witness. Nothing in this plan widens that assumption.

**What leaves the device, per phase, and to whom.**

| Phase | New outbound data | To whom |
|---|---|---|
| 1.1-1.3 | nothing (local storage only; fewer reads) | none |
| 2.1 | nothing beyond a sandbox run | local sandbox |
| 2.2 | one tips read per network per tick instead of two per public target; log queries per token now only after a new block | the configured node (shared dRPC key on testnet) |
| 2.3 | the same contract-scoped log queries over history as today | the configured node |
| 3.1, 3.2 | nothing until a tap; a tap sends the block, contract or address in the URL | the chosen explorer |
| 3.3 | removes an automatic per-transaction fetch; a press names the transaction | the record's configured node |
| 3.4 | nothing | none |
| 3.5 | PXE reads (each syncs the PXE's tips, as every note read does); the finalized tip from the shared read | the configured node, as today |

**Risks and answers.**

- **Lying tips (2.2).** A node that never advances its tip delays scheduling to the fallback tick; a
  node that withholds logs is outside any scheduler's reach. A node that flaps hashes costs today's
  per-tick work, no more. Out-of-order tips are refused, and `F0` is clamped to the checkpointed tip,
  so a node cannot push unfinalized blocks into back-fill, below reconciliation's reach.
- **Fewer calls, sharper timing (2.2).** Scans now fire together after each block, so the node sees the
  watched-token set in one burst. It already sees the same set every 30 s; the disclosure is unchanged
  and the rate drops.
- **URL injection (3.1, 3.2).** Journal recipients come from dApp calls and block hashes from the node.
  Each builder accepts only a safe integer or `^0x[0-9a-fA-F]{64}$` and returns `null` otherwise; links
  use `rel="noopener noreferrer"` and `target="_blank"`, as the Tx hash link does.
- **Clickjacking on the trust prompt (3.2).** The link sits under the address, apart from Allow and
  Reject, opens a new tab and decides nothing.
- **Purge resurrection and decision overwrite (1.2, 1.3, 3.5).** Every write reads the lock ticket and
  the service epoch just before it dispatches; the Allow reads its session fence once, refuses a
  missing or reset trust row, and writes everything in one storage call. Receipt and acceptance writes
  stand down while a deleter the watchdog displaced is still running. A refused public commit holds
  its page so the receipt is retried, not skipped. Each fence has a never-happens test with a success control.
  The residue (a displaced deleter, storage ordering) is in § Not this lane.
- **Faked prunes (3.5).** A node that fakes a prune makes the PXE drop notes, and the reconciler follows
  the PXE; the rows return when the PXE re-syncs. A settled row (seen on a finalized block) is never
  touched.
- **Logging.** New log lines carry counts and outcomes only, never a transaction hash, address or
  amount, at `debug` unless a warning is needed (CLAUDE.md § Logging policy).
- **Least privilege, crypto, supply chain.** No new dependency, permission, key or workflow. Arcs 2 and
  3 touch `packages/aztec-runtime`, an internal workspace, not a published package.

## Assumptions

### Facts

- F1. The receipt trust write is unfenced and emits after it (`service.ts:1456-1462`); the DRIFT PIN
  rows pin that with bare epoch bumps (`service.scenarios.test.ts:5670-5766`).
- F2. `repo.setTrust` reads its fence after the stored read and before `trust.set`
  (`repository.ts:131-136`); `EntityStorage.set` is one storage call
  (`packages/wallet-core/src/storage/entity_storage.ts`). The scenarios' mock reads the fence at entry
  (`service.scenarios.test.ts:96-98`).
- F3. `unhideLocked` stops at the first refused write (`service.ts:660-676`); `kept` is the lock ticket
  plus the profile incarnation (`:629-632`); the watchdog hands over after 5 minutes (`lock.ts:5`).
- F4. `setTrustAllow` writes `trusted` whatever the stored state; in practice only the prompt calls it
  (`useIncomingTrustPrompts.ts:77`), and prompts exist only for `pending` rows. `onTokenAdded` writes
  `trusted` over any non-trusted state without un-hiding (`service.ts:1181-1184`); the token delete
  resets trust and wipes records for `networks[0]` only (`:1203`).
- F5. `replayPendingPrompts` runs once per popup lifetime per (profile, network, account), and when
  visibility turns on (`useIncomingTrustPrompts.ts:120-161`); it prompts only for an account with a
  stored record (`service.ts:1541-1544`).
- F6. `getNotesRaw` reads `ACTIVE` notes only (`note/service.ts:171-175`); `debug.getNotes` syncs the
  PXE and the contract first (`pxe_debug_utils.ts:64-88`); the PXE deletes notes above a pruned block.
- F7. The node's log query takes one contract; `getChainTips()` returns all four tips in one call and is
  already used by `auth-registry/service.ts:408`.
- F8. `onIncomingTransferUpdated` is declared and consumed but never emitted; the received page listens
  to Deleted only (`received/[id].vue:84-93`).
- F9. No detail page shows a token contract row; Block rows and address cards exist on the tx and
  received pages; journal shows "To" as text (`journal/[id].vue:105-109,264-267`).
- F10. The e2e build uses the default 30 s poll interval (`runtime.ts:541-547`); network e2e retries
  twice unless `NULO_E2E_RETRY` is set (`vitest.e2e.network.config.ts:39`).
- F11. Every writer that deletes incoming rows enters the service lock (`clearScopeLocked`,
  `onTokenDeleted`, `onAccountDeleted`, `onTransactionAdded`, `finishReconciliation`); only
  `hydrateSchedulers` bumps the epoch without it (`service.ts:931-932`). None of those deleters reads its
  ticket after its awaits (`service.ts:430-435`, `:459-460`, `:1292-1301`, `:2016-2024`), so one the
  watchdog displaced keeps deleting while a successor's ticket is current (`lock.ts:145-159`).
- F12. A refused Allow closes the prompt with no toast (`IncomingTrustPopup.vue:90-107`).
- F13. `commitPublicEvent` returns nothing (`service.ts:2059-2070`); the forward pass then advances the
  cursor and clears `pendingPage` in a new lock section that reads only the epoch (`:1810-1829`,
  `:1608-1620`).
- F14. `debug.getNotes` returns notes only, not the anchor it synced to (`pxe_debug_utils.ts:64-88`).
- F15. Both repository stores sit on the same `browserApi.storage.local` (`repository.ts:55-68`), and
  `EntityStorage.set` hands one `{ key: JSON }` item to it (`entity_storage.ts:189-191`). The arrival
  `played` list is keyed by record id (`arrival-state.ts:66`).

### Inferences

- I1. After a handoff a displaced receipt may have dispatched a `pending` row with no prompt; the next
  scan writes its record hidden and the next popup open prompts. It needs a five-minute stall.
- I2. (retired with the repair.)
- I3. Aztec testnet blocks may arrive about as often as the 30 s tick; then Arc 2 saves mainly the
  public scans' own tips reads and the note reads between blocks. Phase 2.1 measures it.
- I4. (moved to OA-5.)
- I5. A re-included transaction keeps its note's nullifier, so #140's moved-row branch finds it.
- I6. Aztecscan has routes for blocks and contracts; an account route is less certain (Phase 3.1
  checks).
- I7. Browser extension storage applies operations in the order they are dispatched (Chromium's
  storage backend runs on a sequenced task runner; Firefox's IndexedDB-backed area serializes per
  extension), so a write dispatched before a handoff lands before the successor's key sweep. Confidence
  moderate: backend sequencing is documented in source, end-to-end API ordering is not. The purge case
  rests on it; § Not this lane lists what fails if it does not hold.
- I8. Nothing can run between a synchronous fence read and the storage call that follows it; the lock
  watchdog runs on a timer.
- I9. The PXE detects, on its first sync after the wallet reopens, a prune that happened while it was
  closed (its block stream compares stored block hashes with the node's). Confidence moderate. Phase
  3.5's offline case is a unit scenario; it tests the reconciler, not this inference.
- I10. One multi-key `storage.local.set` is all-or-nothing: Chromium's leveldb store writes a
  dictionary as one write batch, Firefox's IndexedDB store in one transaction (sources the final audit
  cited: `components/value_store/leveldb_value_store.cc`, `ExtensionStorageIDB.sys.mjs`). Confidence
  moderate to high.

### Asks

- A1 (OA-1). #140: what happens to a received row whose note a reorg dropped. Working assumption:
  nothing is built until answered.
- A2 (OA-2). #142: how an address card carries its explorer link. Working assumption: cards unchanged.
- A3 (OA-3). #142: whether to add a token contract row. Working assumption: no row added.
- A4 (OA-4). #141: retry after a failure, and a fee fetched earlier in the session on reopen. Working
  assumption: dash on failure; "Show fee" on every open.
- A5 (OA-5). #138: newest public receipts first on a token's first scan. Working assumption: today's
  order; Phase 2.3 not built.
- A6. Delivery topology. Answered by the orchestrator: no stack; Arc 1 opens its own PR (D-orch-1).
- A7 (OA-6). #142: whether a linked row shows its value as the link (the Tx hash row today) or a "View
  on <explorer>" text. Working assumption: the Tx hash row's treatment.

## Decision ledger

- **D1, #140 out of Arc 1.** Chosen by the driver, agreed by both reviewers: the fix changes rows a
  person sees and needs `ACTIVE_OR_NULLIFIED` plus the PXE synced block. Outline B's inert detector was
  rejected by both: it resolves nothing and adds PXE cost.
- **D2, #227: Outline A.** Both reviewers: the reorder preserves outcomes; pins alone keep the cost and
  the divergence. Full merge of the arms rejected (§ Trade-offs).
- **D3, #144: ticket plus epoch on writes, ticket on emits.** Both reviewers required the lock ticket
  (High). Opus proposed gating the emits on ticket and epoch; Codex flagged the prompt gap that rule
  creates. The driver chose ticket-only emits. The final pass showed the stated reason ("a current
  ticket means no wipe ran") false for deleters the watchdog displaced (F11). Codex's first fix
  (deleters stop on a stale ticket) was rejected: a wipe that stops halfway leaves a deleted scope's rows
  behind. The driver's first answer (the Allow refuses a missing row) did not close the race (round 2:
  the row can vanish after the Allow reads it). Final design: a `deletersRunning` count that receipt and
  acceptance writes read at lock entry and again with their fence, the second fix Codex offered (round
  3 added the entry read). With it, ticket-only emits are sound again. Other successors' writes stay unfenced on displaced deleters: an issue at close-out.
- **D4, #92: one write, not a repair.** Round 1 reviewed a repair on popup connect; both reviewers
  accepted its trigger with fixes, and Codex rated its later re-show an Arc 1 boundary breach (High).
  The driver replaced it with an all-or-nothing Allow, which neither reviewer proposed. The final pass
  held its fence logic (synchronous span, single `live()` read, composition test) but broke "one
  synchronous block of writes": separate `set` calls can fail one by one and leave a partial state.
  Revised to one multi-key `set` call, Codex's suggested fix.
- **D5, #143: hybrid.** Opus proposed phase-aligned per-target intervals sharing one tips read; Codex
  accepted Outline A's watcher. The hybrid keeps the fence-sensitive stop paths and reaches the same
  call count. Chosen.
- **D6, #138 to OA-5.** Codex: the order in which history appears is owner-facing. Opus did not raise
  it. The driver routed it to the owner; ships-now is today's order.
- **D7, OA-4c dropped as an ask.** Both reviewers: the fee row's reset after a re-mine follows from
  P4-03 and C12-fetch A.
- **D8, Arc 2 rules spelled out.** Opus: "reached the tip", tip ordering, `F0` clamp and the cursor
  field names; Codex: crash semantics and the failed-tips path. All adopted.
- **D9, #138 newest-first by windows.** The final pass showed the first design (forward from `F0 + 1`,
  back-fill oldest first) puts only unfinalized receipts first, which OA-5 did not say. The driver chose
  downward back-fill windows over correcting OA-5's wording, because the ask is about the newest receipt.
- **D10, #140 `settled` marker and two strikes.** The final pass showed a live finalized floor hides a
  row whose block was dropped while the wallet was closed. The driver chose a per-row marker set once on
  the final chain. Codex also asked for one PXE operation returning notes and their anchor; F14 says
  none exists. The driver first argued one bracketed read was enough; round 2 broke that with a
  re-included, already-spent note that discovery never re-adds. Final design: delete only on absence in
  two scans; the second scan's `ACTIVE_OR_NULLIFIED` read sees a re-included note.
- **D11, link treatment to OA-6.** The final pass read P4-02's quoted words as a "View on <explorer>"
  text; the Details Tx hash row the record names shows the hash as the link. A presentation question,
  so it went to the owner. Round 2: a default treatment would decide it without an answer, so the rows
  stay unchanged until OA-6 is answered.
- **D-orch-1, no stack.** Orchestrator decision at approval, overriding § Delivery's mechanics: Arc 1
  opens its own PR against `dev` (`gh pr create --base dev`, the title in the Delivery table), with no
  `gh stack init` or `adopt`. Arcs 2 and 3 branch from Arc 1's branch and rebase onto `dev` after it
  lands. Resolves A6.
- **D-orch-2, Arc 1 only.** Orchestrator decision: nothing of Arcs 2 or 3 is built in this session; they
  wait on decision page 4, charter C12 and the OWNER-ASKS answers (OA-1 to OA-6, now on the owner's
  page 4). Arc 1 changes nothing a person sees; a phase that turns out to need a visible change sends
  it to OWNER-ASKS.md and ships without it.
- **D-orch-3, the unreviewed fix first.** Orchestrator decision: the lock-entry `deletersRunning` read
  (§ Architecture #144 and #92 step 4, Phase 1.2 steps 3 and 12, Phase 1.3 step 3) was Codex's own
  round-3 proposal and nobody re-reviewed it. Arc 1's first Codex round and the Opus review are each
  asked, explicitly and first, whether the entry read plus the per-write `fenced()` read closes the
  displaced-deleter race without a new one (a deleter that starts after entry, a count that never
  decrements on a thrown section, an Allow whose reads span a watchdog handoff). Their answers are
  recorded under § Audit verdicts before Phase 1.2's gate counts as passed.
- **D12, the entry read made structural.** The Opus entry-read review found the entry read was a
  convention (each section's first `fenced()`), not a property of the fence. `receiptFence` now reads
  the count once when it is built, synchronously at lock entry, and ANDs it into every `fenced()` read,
  so a future section cannot skip it. Behaviour is unchanged; the per-write count read stays.
- **D13, a prompt a handoff silenced recovers through replay, unchanged.** Codex (entry-read consult,
  question 2e) showed the ticket-only emits trade liveness: after a handoff between the trust write and
  the emits, no prompt fires; the next tick stores the receipt hidden under `pending`, and the prompt
  returns only on the next popup open (replay needs a stored record and runs once per popup). Codex
  proposed a fresh fenced replay after the retry lands; Opus called the trade-off the plan's own
  (I1). Rejected as a code change: it changes when first-receive prompts appear, an owner-visible
  behaviour, for a case that needs a five-minute storage stall, and the recovery path exists. Accepted
  as a test: both arms pin that the next tick stores the receipt hidden and the next popup open
  prompts.
- **Unresolved:** I7 (storage dispatch order) is an inference neither reviewer could check from the
  tree; Phase 1.2's handoff rows prove the fence, not the browser's ordering.

## Audit verdicts

### Round 1: Codex (gpt-6.1-sol, high, read-only), `reject (with blocking findings: incomplete watchdog/purge fences; Arc 1 changes visible behavior; note reconciliation misses moved notes)`

Run on the roster account `alejo-icloud`: the inherited `CODEX_ACCOUNT=best` picked it (logged in
`lessons/phase-0.md`).

1. High, #144 needs the lock ticket; the repository fence cannot cancel a dispatched write. **Accepted**:
   ticket threaded into both sections (Phase 1.2); guarantee narrowed to dispatch order (I7).
2. High, #92 repair reads stale candidates and captures its fences late. **Superseded** by D4.
3. High, Arc 1's repair re-shows rows later and floors at the repair-time tip. **Accepted in substance**:
   D4 removes both.
4. Medium, a pending row without a prompt is not repaired by replay. **Accepted**: ticket-only emits keep
   the prompt on bare bumps (D3); the handoff residue is I1.
5. High, #140's fast path skips moved notes; a rollback waits forever on a quiet chain; the synced block
   read can describe a later operation. **Accepted**: block compared in the fast path; synced block read
   before and after; OA-1 wording corrected; armed reorg proof added.
6. Medium, the fallback restores scheduling, not honest data; tip relations unchecked; fallback must not
   depend on a failed tips read. **Accepted**: RPC trust assumption stated; ordering checks; failed tips
   read runs targets as today.
7. Medium, #138 crash and backlog semantics; discovery order is owner-facing. **Accepted**: fields,
   replay and tests specified; OA-5.
8. Medium, #139 event and request ordering; OA-1 promised a deleted page comes back. **Accepted**:
   tombstoned Updated listener, request generation; OA-1 corrected.
9. Medium, F4 false; Phase 1.1's `cd` broke `typecheck:all`; network gates retry twice by default; more
   controls; a real reorg proof. **Accepted**: all fixed.
10. Low, ship A for #227, #144, #92, #143; keep #140 out; OA-4c redundant. **Accepted** (D2, D7; #143 per
    D5).

### Round 1: Opus (Plan agent), `conditional approve (with conditions: add the lock ticket to the #144 trust write and its emits; make N5b/P5b able to fail on revert; have the #92 repair re-check trust inside the lock and capture the session fence; spell out Arc 2's rules for when a scan counts as caught up, plus tip ordering checks and the #138 cursor fields; tighten the liveness proofs so each one shows a receipt landing)`

1. High, lock ticket missing; thread it into the record writes too. **Accepted** (Phase 1.2), with emits on
   the ticket only (D3).
2. High, N5b/P5b cannot fail with the current mock. **Accepted**: production-shaped mock (Phase 1.2
   step 1); each row must fail once on revert.
3. Medium, Outcome bar 1 overpromised; stray pending row after a restore. **Accepted**: bar narrowed;
   residue in § Not this lane.
4. Medium, the repair acted on trust read outside the lock. **Superseded** by D4.
5. Medium, the repair floor reasoning was backwards. **Superseded** by D4.
6. Medium, I1 and F5 imprecise; the prompt moves in a race. **Accepted**: F5 corrected; D3 keeps the
   prompt on bare bumps.
7. Medium, `scannedAt` rules. **Accepted** (§ Architecture, Arc 2).
8. Medium, tip ordering and `F0` clamp. **Accepted**.
9. Medium, keep `startBlock`; store `F0` in `backfill`. **Accepted**.
10. Medium, proofs must show receipts landing under 120 s; the e2e proves install-run. **Accepted**
    (Phase 2.4).
11. Low, hybrid for #143. **Accepted** (D5).
12. Low, `getChainTips` should underlie `getPublicScanTips`; recon missed `auth-registry/service.ts:408`.
    **Accepted**; recon.md corrected.
13. Low, F2 lines, F4, Phase 3.5 plumbing and disclosure, Outcome bar 4. **Accepted**.
14. Low, quote page 4 verbatim; drop OA-4c; pair Phase 2.3's reconciliation test. **Accepted**.

### Final fresh Codex pass (gpt-6.1-sol, high, read-only, default login), `reject (with blocking findings: D4 is not atomic; D3's deletion invariant fails after handoff; refused public receipts can be skipped permanently; #140 can preserve orphan rows forever)`

1. High, D4: separate `set` calls can fail one by one, leaving receipts hidden under a trusted contract
   with no prompt. **Accepted**: one multi-key `set` (D4, I10).
2. High, D3: F11's "a current ticket means no wipe ran" is false for a displaced deleter. **Accepted in
   part**: F11 and the invariant restated; the Allow refuses a missing trust row. The proposed fix
   (deleters stop on a stale ticket) **rejected**: a half-finished wipe leaves a deleted scope's rows
   behind. Residue to an issue at close-out (D3).
3. High, a ticket stand-down in a public commit lets the cursor pass the log for good. **Accepted**: the
   page is held and retried (Phase 1.2 steps 4 and 11); same rule for reconciliation and back-fill.
4. High, #140's live finalized floor hides rows dropped while the wallet was closed. **Accepted**:
   `settled` marker (D10); OA-1 wording corrected.
5. Medium, two synced-block reads do not prove no prune between them. **Accepted in part**: the gap is
   real, but any prune that fools the check removed the row's block, so deleting is OA-1's own outcome;
   argued in § Architecture and pinned by a prune-and-re-advance test. A single-operation anchor
   **rejected**: the PXE exposes none (F14).
6. Medium, the tip-first scan puts only unfinalized receipts first, so OA-5 overpromised.
   **Accepted**: downward back-fill windows (D9) and a quiet-finalized-chain test.
7. Medium, P4-02's quoted "View on <explorer>" differs from the planned linked identifier.
   **Accepted**: routed to OA-6 (D11).
8. Low, I7's failure residue understated; Arc 2 title is 91 characters, not 89. **Accepted**: residue
   expanded in § Not this lane; count fixed.

Looks fine, per the pass: D4's synchronous span, I8 and the single `live()` read; ticket-plus-epoch
write fences; the composition test's fit; three reuse rows and three claim checks; back-filled rows
outside reconciliation; URL validation, fee-on-tap and owner gates; commands and titles.

### Final pass, round 2 (same session, resumed), `reject (with blocking findings: missing-row refusal does not fence displaced wipes; prune-and-re-advance can permanently lose spent receipts; back-fill progress is underspecified)`

1. High, the missing-row refusal does not fence a displaced wipe: the row can vanish after the Allow
   reads it, and token delete resets to `unknown` instead of deleting. **Accepted**: `deletersRunning`
   fences receipt and acceptance writes; the refusal also covers `unknown` (D3).
2. High, a re-included note already spent is never re-added after a one-read delete. **Accepted**: two
   strikes before deleting (D10); OA-1 says a note spent before the wallet sees it again does not bring
   the row back; the general unspent-only discovery gap goes to an issue at close-out.
3. Medium, "whether it committed" would hold pages with existing records or own sends forever.
   **Accepted**: `revoked` only on a failed fence read; a mixed-page test.
4. Medium, block-position resume repeats or skips logs inside one block, and an empty window never
   reaches `from > high`. **Accepted**: `position` is a `PublicEventCursor`; a window ends on a validated
   end of results; OA-5 says "usually on the first scan".
5. Medium, OA-6's ships-now decided the presentation by default. **Accepted**: rows unchanged until
   answered (D11).

Looks fine, per round 2: D4's single multi-key write, the `settled` correction, the expanded I7 residue,
and the downward windows' separation from reconciliation.

### Final pass, round 3 (same session, resumed), `reject (with blocking findings: a completed displaced wipe can still be resurrected)`

1. High, the count read only before the write misses a displaced deleter that finished during the
   reads (`onTransactionAdded` neither bumps the epoch nor touches trust). **Accepted**: the count is
   read at lock entry before any read, in both receipt sections and the Allow, with a boundary test.

Looks fine, per round 3: D4's single storage operation; D3's ticket-only emits given the entry read;
two-strike reconciliation with the disclosed rediscovery limit; `revoked`/`processed`; composite
back-fill cursors; reconciliation separation; OA-6's owner gate.

**Loop stopped at three rounds.** The round-3 fix is the reviewer's own proposal and was not
re-reviewed. The implementing session's Arc 1 Codex audit checks it first.

### Arc 1, entry-read consult (D-orch-3), before Phase 1.2's gate

Both legs were asked first, explicitly, whether the lock-entry `deletersRunning` read plus the
per-write `fenced()` read closes the displaced-deleter race without opening a new one, against the
Phase 1.1 and 1.2 commits and the Phase 1.3 design.

**Codex (gpt-6.1-sol, high, read-only, default login), `the concurrency fence holds (high
confidence); ticket-only prompt suppression has a liveness gap`.**

1. Entry read plus per-write read: **holds**. A running displaced deleter makes the section exit
   before it reads; any later deleter admission invalidates the ticket for good.
2. (a) a deleter starting after entry: **holds**, impossible while the ticket is current, and a
   successor's admission leaves `isCurrent()` false even after it finishes. (b) count leak or double
   count: **holds**, the only mutations are the increment and the `finally` decrement, and no deleter
   awaits a nested lock. (c) an Allow whose reads span a handoff: **holds as designed**, provided the
   batch call performs no await after the final checks. (d) a displaced receipt whose successor is a
   deleter: **holds**. (e) prompts: **safety holds, liveness breaks** on a handoff between the trust
   write and the emits. Disposition: D13 (test accepted, code change rejected).
3. Unwrapped deleters: **none needing a change**; the outbox drain deletes outside the count but
   reads its ticket immediately before dispatch.
4. Write placement and cursor holds: **hold**. Low: the `PublicCommit` comment said every failed
   `fenced()` read means `revoked`, but the post-write Added check returns `processed`. **Accepted**:
   comment narrowed to reads that stop the commit before its record write.

**Opus (general-purpose agent), `the entry read plus the per-write fenced() read close the
displaced-deleter race for both receipt sections; no new race; four Low findings`.**

- (a) to (d) **hold**, (c) on two conditions met by Phase 1.3: `commitAcceptance` dispatches its one
  `set` synchronously, and `isFenceLive` is synchronous. (e) a prompt for a wiped row cannot fire; a
  prompt silenced on a handoff is the plan's accepted trade-off (D13). Unwrapped deleters: none.
1. Low, the `revoked` return after the outbox write and the bare-bump returns are untested.
   **Accepted**: a P8h handoff row holds the outbox write and expects `revoked`; the handoff rows
   assert the result.
2. Low, `receiptFence`'s comment claimed the entry read happens there, while it was a per-section
   convention. **Accepted** in its structural form: D12.
3. Low, the `deletersRunning` comment claims acceptance writes stand down before Phase 1.3 lands.
   **No change**: Phase 1.3 ships in the same PR.
4. Low, `commitAddressedEvents`'s comment named only a ticket stand-down. **Accepted**: "a ticket or
   deleter stand-down".
- Addition to the close-out issue on displaced deleters: the arrival and floor writers are not fenced
  on the count either. **Accepted** into § Not this lane.

Phase 1.2's gate counts as passed with these answers recorded.

### Arc 1 implementation review, round 1: Codex (gpt-6.1-sol, high, read-only, default login, fresh session on `ac259a7..18a1111`), `approve`

Asked first (D-orch-3), on the final code: the entry read plus the per-write `fenced()` read
**holds** for (a) a deleter starting after entry, (b) a thrown section (the decrement runs once on
every exit) and (c) an Allow whose reads span a handoff (`live()` fails; `commitAcceptance` reaches
the adapter's one `set` with no await) — each "high confidence". It also confirmed the one-batch
claim (I10) against the Chromium and Firefox storage backends.

1. Low, the `setTrustAllow` comment promised every refusal leaves the contract pending. **Accepted**:
   "a refusal writes nothing; a contract still pending prompts again on the next popup open".
2. Low, the failed-wipe tests did not prove receipts recover after a deleter throws. **Accepted**:
   the failed-wipe case now commits a receipt afterwards and expects it stored; with the `finally`
   decrement removed, both rows fail.
3. Low, comments restating declarations (`ReceiptScope`, `trustedRow`, `moveArrivalFloorLocked`) and
   a paragraph on `commitAddressedEvents`. **Accepted**: the first two deleted, the third reduced to
   its refusal contract, the paragraph cut to one sentence that keeps the why.

### Arc 1 implementation review: Opus (general-purpose agent, final diff), `holds; no High or Medium; seven Low`

(a) to (c) **hold** on the final code; (c) traced through `ChromeStorageAreaAdapter.set`, which
calls `chrome.storage.local.set(entries)` before its first await (the one production adapter). A
deleter that never returns surfaces, after ten minutes, as the existing stalled line; accurate, no
change.

1. Low, the `setTrustAllow` TSDoc in `spec.ts` was out of date. **Accepted**: lists every `false`
   case and the visibility gate on the emits.
2. Low, "leaves the contract pending" is wrong for some refusals. **Accepted** (same fix as Codex 1).
3. Low, the `receiptFence` comment stated a caller's rule as a fact and "or resume" said nothing.
   **Accepted**: "Build it at lock entry, before any await"; "or resume" dropped.
4. Low, two comments add little (`NoteScanContext`'s second sentence, `trustedRow`). **Accepted**.
5. Low, half of the rejected-commit repository test checked only the mock. **Accepted**: renamed "a
   rejected commitAcceptance propagates", row checks dropped (the batch guarantee is I10's).
6. Low, a test named "record read" parks on the visibility read. **Accepted**: renamed.
7. Low, three duplicate tests. **Accepted**, deviating from the plan's lists: the Allow "deleter at
   entry" refusal is the late-delete boundary test's precondition and adds no failure mode of its
   own; the "both arms read the same head" test repeats the two matrices, which now spell
   `RECEIPT_HEAD` directly; the composition lock case repeats the scenarios' (Phase 1.3 step 8 asked
   for the displaced case or, failing that, the lock case).

### Arc 1 implementation review, round 2: Codex (same session, resumed, on `18a1111..caee105`), `approve`

No pin weaker than at `18a1111`; the touched comments exact. One Low:

1. Low, the `setTrustAllow` TSDoc promised the Added emits whenever visibility is on (a handoff
   during the batch write suppresses them) and said "no longer registered" where a failed lookup
   also refuses. **Accepted**: "when visibility is on and the lock ticket is still current"; "the
   token's registration cannot be verified (deleted …, or the lookup failed)".

## Post-implementation

The implementing session runs these steps from this file. `code_review` is `off`, so no
`/code-review` step exists.

1. **Per-arc Codex audit at each arc boundary**, before `gh stack add` opens the next arc.
   - Write a prompt file under `~/.cache/nulo-backlog/incoming-transfers/`, then run
     `env -u CODEX_ACCOUNT ~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <WT> high read-only gpt-6.1-sol`.
     `<WT>` is this worktree, on the default `~/.codex` login.
   - On a quota or 401 error, retry once with `CODEX_ACCOUNT=alejo-icloud`. If that fails too, log
     the failed consult in `lessons/phase-N.md` and continue on your own judgment within scope.
   - The prompt carries the arc's diff (`git diff <arc-base>..HEAD`), this plan and its decision
     ledger, and the arc map ("this is arc N of 3; later arcs add X").
   - It carries an explicit adversarial ask: what could resurrect a purged row, hide an allowed receipt,
     overwrite a decision, leak an identifier, or stall a scan; which assertion is weaker than at base.
   - Arc 1's prompt asks first about the lock-entry `deletersRunning` read: the last planning fix,
     which no review round confirmed.
   - It ends with the two rules below, verbatim.
2. **Fix loop.**
   - Verify each finding against the code first. Apply the accepted fixes and commit them.
   - Log the round in `lessons/phase-N.md`: the consult, the verdict, what was accepted, and what was
     rejected with reasons.
   - Resume the same session with `resume-codex.sh <session-id> <followup-file> <codex-dir> high` and
     the fix diff.
   - Stop when a round has no new material finding. **Hard stop at three rounds:** if the third round
     still finds material issues, stop and report it to the orchestrator.
3. **Final cross-arc pass**, after every built arc is green and looped: a fresh Codex session over
   `git diff ac259a7..HEAD`, asking for seams between arcs, duplication across arcs and drift from this
   plan. The same rules and loop apply.
4. **Delivery**, per § Delivery: the first time any PR opens.
5. **Close-out**, as the stack's docs-only top layer:
   1. Bring `dev` in with `gh stack sync`. Read what changed in `implementations-plan/index.md` and
      `lessons.md`; another lane may have landed. Never a union merge.
   2. Write `## Outcome` directly after the front matter: Date, Status, Shipped (PR numbers), Dropped
      with a disposition line each, Open items, and "Seeds retired: the /goal and /loop seeds below are
      no longer live".
   3. File every open item in its home (table below), deduping first with
      `gh issue list --state all --search "<words>"`. An issue body has five sections: What happens,
      Where, Impact, Possible fix, Record. Comment on every lane issue left open, saying what shipped and
      what is left.
   4. Promote generalizable gotchas to `implementations-plan/lessons.md`: 8 KiB budget, deduplicate,
      retire what an entry supersedes, date tool versions.
   5. Delete `STATUS.md` and the "Live progress" link at the top of this file.
   6. In its own commit, `git mv implementations-plan/incoming-transfers implementations-plan/archive/incoming-transfers`.
      Repair relative links the extra level breaks. Move the index line to `archive/index.md`.
   7. Report and stop. Merging is the orchestrator's call.
6. **Teardown after the merge.**
   - When `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/incoming-transfers/plan.md`
     succeeds, run `agent-worktree done incoming-transfers --merged`. This step needs no approval.
   - If it refuses, relay its output and stop; never force.
   - A `/loop` session checks this on every firing. A `/goal` session arms one background wait after
     its wrap-up report:
     `until git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/incoming-transfers/plan.md; do sleep 300; done`.

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
| 1 | `worktree-incoming-transfers` (adopted; carries the plan commit) | 1.1-1.3 | `dev` | off | `fix(incoming): one receipt dedupe order, fence the trust write, all-or-nothing allow` (84) | #227, #144, #92 |
| 2 | `incoming-transfers-cadence` | 2.1-2.4 | layer 1 | off | `perf(incoming): scan on new blocks with a 2-minute fallback, scan new public receipts first` (91); without Phase 2.3: `perf(incoming): scan on new blocks with a 2-minute fallback` (59) | #143, #138 (if built) |
| 3 | `incoming-transfers-surfaces` | 3.1-3.5 | layer 2 | off | `feat(incoming): explorer links on receipt surfaces, fee on tap, refresh after a re-mine` (87) | #142 (see below), #97, #141, #139, #140 (if built) |
| 4 | `incoming-transfers-close-out` | close-out | the top layer | off | `docs(plans): close incoming-transfers` (37) | none |

- **Arc gates.** Arc 1 needs no owner answer. Arc 2 starts after page 4 is signed with P4-04. Arc 3
  starts after page 4 and C12 are signed. If page 4 is late, Arc 1 and the close-out may ship alone and
  the close-out records Arcs 2 and 3 as open work in their issues.
- **#142 closes** only when every surface P4-02 names shipped or the owner answered OA-2, OA-3 and OA-6;
  otherwise the PR comments on #142 with what is left and it stays open. #138 and #140 close only when
  built, or as not planned on an "as is" answer (SR3).
- **Mechanics.** `gh stack init --adopt worktree-incoming-transfers --base dev`; at each boundary, after
  its loop converges, `gh stack add <next-branch>`. In Delivery: `gh stack sync`, then
  `gh stack submit --auto`, then `gh pr edit` each body: what changed and why, the validation runs with
  outcomes, `Closes #n` per issue, and for Arc 3 the page 4 records quoted with screenshots on both
  browsers. Then `gh stack add incoming-transfers-close-out`, its commits, `gh stack submit --auto`.
- **Labels.** Open each PR without labels. Add `e2e:extension-network` afterwards only if the path
  filter skips the network suite for an arc that needs it.
- Never merge; never `--admin`.

## Pickup map

The orchestrator writes a `## Pickup` section into each issue. The arc that closes each one:

- Arc 1: #227 (Phase 1.1), #144 (Phase 1.2), #92 (Phase 1.3).
- Arc 2: #143 (Phase 2.2, proofs in 2.4), #138 (Phase 2.3, only on OA-5 = A).
- Arc 3: #142 (Phase 3.1), #97 (Phase 3.2), #141 (Phase 3.3, or closed as is under C12-fetch C),
  #139 (Phase 3.4), #140 (Phase 3.5, only on OA-1 = A).

## Seeds

Draft until the orchestrator approves; no ELI5 is produced (orchestrator-owned).

**Recommended: `/goal`**

```
/goal Every phase of implementations-plan/incoming-transfers/plan.md whose gate is open (Arc 1 now; Arc 2 only after page 4 P4-04 is signed, Phase 2.3 only on OA-5 = A; Arc 3 only after page 4 and C12 are signed, Phase 3.5 only on OA-1 = A) is marked ✓ in plan.md, each ✓ backed by its validation gate reported passing in the transcript; for each phase the agent printed LESSONS_FILE=implementations-plan/incoming-transfers/lessons/phase-N.md; /code-review was NOT run (code_review is off); the Codex fix loop converged for each built arc and for the final cross-arc pass, each convergence quoted from a resumed Codex pass reporting no new material finding; the § Delivery stack exists on GitHub, created only after the loops converged (gh stack view in the transcript), including the close-out layer that archived the plan (git show --stat of the archive-move commit); bun run test and bun run lint both report exit 0 in the transcript.
```

**Alternative: `/loop`**

```
/loop 15m Drive implementations-plan/incoming-transfers forward. Never idle. Each firing: 1) Reality check: read plan.md, STATUS.md and lessons/ from the top stack layer; if implementations-plan/archive/incoming-transfers/plan.md exists on origin/dev (git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/incoming-transfers/plan.md), run agent-worktree done incoming-transfers --merged, report, clear this loop and stop; if the close-out is delivered but not merged, babysit CI only. 2) Pick the next open phase whose owner gate is signed (Arc 2: page 4 P4-04, Phase 2.3 also OA-5; Arc 3: page 4 and C12, Phase 3.5 also OA-1); never build a gated phase early. 3) After each edit run bun run lint and the touched tests; commit signed. 4) Phase green means its gate in plan.md passes: paste it, mark ✓, write lessons, print LESSONS_FILE=…. 5) At an arc boundary run the Codex loop per § Post-implementation (hard stop at three rounds), then gh stack add. 6) Stuck or facing a design fork: consult Codex (gpt-6.1-sol, high), log it, decide; anything a person would notice goes to OWNER-ASKS.md, never decided here. 7) All built arcs looped: final cross-arc pass, Delivery, close-out, report and stop. Hard limits: never merge, never push to main, never --admin, never force-push a pushed branch.
```

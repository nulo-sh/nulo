# incoming-transfers — decisions and audit record, arcs 1, 2 and 3a

Arcs 1 (#248) and 2 (#420) are merged. When the plan was revised for arc 3b, their decision ledger,
audit verdicts, assumptions, trade-offs and residue moved here verbatim from `plan.md`, so the plan
stays the live contract for the remaining work. This file is evidence, never instructions.

Every section and phase reference below (§ Architecture, § Not this lane, Phase 1.2, F1, OA-5, …)
names `plan.md` as it stood at `264a4b30`: `git show 264a4b30:implementations-plan/incoming-transfers/plan.md`.

Arc 3a (#426) was built from that plan's Arc 3 text on its own branch. When arc 3b merged `dev` in,
3a's ledger (D-orch-12, D21 to D24) and implementation verdicts moved here verbatim; its references
name `plan.md` at `b886fda6`.

## Not this lane

- `onTokenAdded` and `trustRestoredTokens` write the trust row and then the floor in two awaits; a
  handoff between them leaves a token trusted with its floor unmoved, so a back-filled old receipt could
  play an arrival. No hidden row is involved, so #92 does not cover it. The close-out opens an issue if
  a test confirms it. **Disposition:** no test was written; a closed known limit with the next two,
  #443 (plan.md D43).
- Writes a displaced receipt dispatched just before a handoff-admitted purge are removed by that purge,
  if storage applies operations in dispatch order (I7). If it did not, a purged scope could keep a
  stray `pending` trust row (a restored profile's `trustRestoredTokens`, `service.ts:694`, would then
  skip auto-trusting that token), an outbox row or a receipt row, and a successor's decision could be
  overwritten by a late write. Each needs a five-minute storage stall first. Recorded, not built.
  **Disposition:** closed known limit #443 (D43); I7 stays unverified there.
- A deleter displaced by the watchdog keeps deleting after the handoff (F11). Receipt and acceptance
  writes stand down until it ends (`deletersRunning`), but other successors (`onTokenAdded`'s trust
  write, cursor and outbox writes) are not fenced on it, nor are the arrival and floor writers, which
  read only epoch and ticket (`claimArrivals`, `getArrivalState`'s baseline write and
  `resolvePendingFloorsLocked`, `baselineAccountLocked`): a displaced `onAccountDeleted` lets a
  successor `claimArrivals` write back the arrival row it deleted, and a displaced `clearChain` can
  get a trust row written back through `setArrivalFloor`. A deleter that never returns holds receipt
  writes off, and every public page held, until the background restarts. The close-out files an
  issue. The property to reproduce: with the real `Lock`, a successor's ticket stays current while
  the displaced holder deletes its row. **Disposition:** closed known limit #443 (D43); that property is
  its reopening condition.
- Discovery reads unspent notes only (F6), so a private receipt whose note is spent before a scan sees
  it never gets a row, and a re-included transaction whose note was spent before the wallet saw it
  again does not bring its row back (OA-1 says so). The close-out dedupes and files an issue.
  **Disposition:** no twin found; closed known limit #444 (D43).

## Trade-offs and alternatives not taken

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

## Competing outline (Outline B, pins first)

- #227: pin both orders as they are; change no code.
- #144: post-write re-check only, no fence into the write.
- #92: retry in place inside `setTrustAllow` after a displacement.
- #140: ship the detector in Arc 1 behind a test pin, delete nothing.
- #143: one interval per target; each skips its scan when its own tip read is unchanged.
- Arc 3 as above.

Both reviewers would ship Outline A per issue, with the hybrid for #143 (§ Decision ledger).

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
- **D-orch-4, Arc 2 is one plain PR.** After Arc 1's squash merge an arc branches from `dev`. Arc 2
  opens with `gh pr create --base dev`, not as a `gh stack` layer; Arc 3 is planned after it opens and
  may stack on it.
- **D-orch-5, the tree wins.** The tree moved since the plan's facts. Every Arc 2 fact is re-verified;
  where plan and tree disagree the tree wins, recorded here and in `lessons/phase-2.md`.
- **D-orch-6, e2e runtime budget.** Each of Phase 2.4 step 5's two install-run scenarios names in
  `lessons/phase-2.md` the failure mode it proves, why a cheaper layer cannot, and its estimated then
  measured runtime. The PR body states the network suite's per-browser wall-clock before and after.
- **D-orch-7, no `.vue` change.** `check:plans` runs inside `test:ci-gating`. Every `.vue` style takes
  face, letter-spacing and case from a type role; Arc 2 touches no `.vue`.
- **D-orch-8, one new persisted field.** `PublicScanCursor.backfill` is the only one (pre-production:
  no migration; the codec round-trip test covers it). A review round that needs more persistent state
  stops for the orchestrator.
- **D-orch-9, pins move, never loosen.** No `skipIf`, retry, raised timeout or suppression; the stall
  watchdog stays; Phase 2.4's proofs assert the 120 s fake-time bound as written.
- **D-orch-10, proportion.** A finding becomes a change only with its path written; later Codex rounds
  verify, they do not reopen.
- **D-orch-11, close-out is not Arc 2's.** Arc 2 keeps `STATUS.md`, ticks Phases 2.1 to 2.4, records its
  Codex rounds here and under § Audit verdicts, and adds OA-5 = A under `OWNER-ASKS.md` § Answers. Arc 3
  and the close-out layer follow.
- **D14, a failed shared tips read fails the public tick (tree wins).** § Architecture said each target
  then reads its own tips. A second read in the same tick hits the same node and only adds calls during
  an outage or a rate limit; episodes and the stalled banner see the same `failed`. Note targets run
  ungated. A failed read is shared only while in flight, so a Retry reads again. The design consult
  judged it sound.
- **D15, a run that misses the tips forgets its mark.** § Architecture said such a run keeps the old
  `scannedAt`. Deleting it means a forced run that fails at an unchanged hash cannot leave a mark that
  skips the next tick. The design consult judged it sound and asked for the epoch to be captured before
  the tips await, which is built.
- **D16, the forward start derives from the floor (tree wins).** A cursor-less forward scan starts at
  `lastScanFinalized + 1` (or `startBlock` before any scan), so seeding `F0` needs no new field. The
  stranded-cursor reset after a rollback now re-covers from the floor: every block at or below it was
  read or is left to back-fill. The design consult judged it safe.
- **D17, `W = 100` and one tick budget.** `W` is five pages of 20 logs. Back-fill reads as many windows
  as the pages the forward pass left; an empty window costs one page. Doubling windows was rejected: it
  weakens newest-first ordering, which is OA-5's. Empty history costs about `F0 / 100` pages, four a
  tick (an hour for 50,000 blocks).
- **D18, the tips type narrowed.** `PublicScanTips` gained `proposedBlockHash` only (no proposed
  number: nothing reads it). `checkpointedBlockHash` is no longer nullable, since `getChainTips` always
  carries it, and the two tests of a null checkpoint hash were deleted as unreachable.
- **D19, Phase 2.1 measured one token.** The sandbox has one deployed token; the default tokens are
  testnet addresses with no contract there. The public arm costs the same per token.
- **D20, a failing back-fill counts against the target.** A back-fill `no-progress` or `failed` is the
  tick's outcome, so a page a hostile node drops forever opens a failure episode: backoff spaces the
  whole target, forward pass included, up to 5 minutes apart and the stalled banner shows. Before this
  arc the same page stopped the forward scan outright. Recorded, not changed (Opus review, Low).
- **D-orch-12, Arc 3 split.** Orchestrator decision: Arc 3 ships as 3a (#142 and #97, the explorer
  links, which touch no file arc 2 edits) and 3b (#141, #139 and #140, after arc 2 merges and after
  the owner's remaining asks). 3a opens its own PR against `dev` from branch
  `worktree-incoming-transfers-links`; whichever of arc 2 and 3a merges second rebases its plan edits.
  Arc 2 merged first (#420); 3a rebased onto it with its code diff unchanged, so the review ranges
  below name the rebased commits.
- **D21, the owner's picks for #142 (2026-10-14, quoted on the issue).** P4-02b A (a corner icon on
  each address card, the Block value as a link), OA-2 A, OA-3 B (no contract link on a detail page),
  OA-6 A (the value is the link, as the Tx hash row). Built from the demo's look, not its code: the
  demo's URL helpers guessed paths, and its account path was wrong (lessons/phase-3.md).
- **D22, the Block link names the value it shows.** The tx page and a public receipt show the block
  hash, so the link opens `/blocks/<hash>`, which stays on the block the wallet saw after a re-mine at
  the same height; a note receipt shows only `#N`, so its number is the link.
- **D23, one corner-link component.** The four card links (two cards on two pages) share
  `AddressCardLink.vue` beside `TxHashRow.vue`: the 24 px target, the stop that keeps a click off the
  card's copy, and the label live once. The owner's note asked for a larger hit area than the demo's
  20 px; the glyph keeps its size and place. Its label is the plan's "View on <explorer>", tied to the
  card's existing "From" or "To" caption by `aria-describedby`; no tooltip and no new words.
- **D24, a focus ring on the two new controls that are not rows.** The design base stylesheet sets
  `a:focus { outline: none }`, so no link in Details shows keyboard focus. The corner icon has no text
  to show it otherwise and the trust prompt's other controls ring, so both take the wallet's 2 px
  accent ring on `:focus-visible`; nothing changes at rest. The Block and To links are the Tx hash
  row's link (OA-6) and stay as it is; OA-7 asks about that family.
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

### Arc 1 implementation review, round 3: Codex (same session, resumed, on `caee105..11ef717`), `approve`

No findings; the revised TSDoc matches the implementation. The loop converged.

### Arc 2 design consult: Codex (gpt-6.1-sol, high, read-only, default login), on Phase 2.2 built and Phase 2.3 proposed

1. D-A, a failed shared tips read fails public ticks without a second read: **sound** (D14).
2. D-B, the note arm's "reached the tips" and a missed run forgetting its mark: **sound**, with one
   demonstrated defect: the target's epoch was captured after the tips await, so a deletion during
   the read let a stale run write. **Accepted**: captured before, passed into both scans; two
   regression tests fail with it reverted (D15).
3. D-C, a cursor-less forward scan starting at `lastScanFinalized + 1`: **safe** (D16).
4. D-D, doubling back-fill windows to cut the cost of empty history: **rejected** by the reviewer, as
   it weakens newest-first ordering; keep `W` fixed and read several windows a tick (D17).
5. D-E, back-fill replay without a pending-page marker: **sound**, but the forward pass and back-fill
   must share the tick's page budget. **Accepted** (D17).

### Arc 2 implementation review, round 1: Codex (gpt-6.1-sol, high, read-only, default login, fresh session on `d3dc4415..ef6f484d`), `reject (with blocking findings: retry proof does not establish mark deletion)`

1. Medium, the retry proof changed both hashes, so a failed run that kept its old mark was rerun
   anyway. **Accepted**: only the checkpoint moves and the note arrives late at the hash its target
   reached; keeping the mark, or marking the tips, fails it.
2. Low, the backoff-restart test had loosened "no tips call" to "one call" (the note target's).
   **Accepted**: it boots without accounts and asserts no call; reading tips before the backoff gate
   fails it.
3. Low, the back-fill doc said a dropped page keeps the position; it keeps its valid prefix.
   **Accepted**.
4. Low, five comments restated their code, and the e2e helper misnamed its clock start. **Accepted**.

Looks fine, per the round: the gap and reorg proofs' mechanism sensitivity, both network scenarios'
timing, the shared budget, window termination, the forward start, reconciliation's floor and the
back-fill fences.

### Arc 2 implementation review: Opus (general-purpose agent, final diff, beside round 1), `holds; no High or Medium; eight Low`

1. Low, the replay test could not see a duplicate. **Accepted**: it counts the trusted token's Added
   emit; re-inserting an existing record fails it.
2. Low, the account-add test proved only the forward half. **Accepted**: it asserts the forward read
   at 1001 and back-fill at `[901, 1000]`; keeping the old window fails it.
3. Low, the retry proof's next-tick claim for the public arm held only under zero-time scans: live,
   the backoff (stamped at the scan's end) outlasts the next tick. **Accepted**: the failing read takes
   a second; the note lands on the next tick, the public receipt at 90 s.
4. to 6. Low, an orphaned doc block and stale comments (`no-progress`, the tips client, the
   account-reset lock, `F0`'s reason, the public tick's doc). **Accepted**.
7. Low, a back-fill page dropped forever opens a failure episode for the whole target. **Recorded**,
   not changed (D20).
8. Low, gate evidence missing from `lessons/phase-2.md`. **Accepted**: the after-count table and the
   revert record are there.

### Arc 2 implementation review, round 2: Codex (same session, resumed, on `ef6f484d..a28e64d1`), `approve`

Every round-1 finding fixed; neither commit changes production behaviour or weakens an assertion; no
new finding. The loop converged.

### Arc 3a implementation review, round 1: Codex (gpt-6.1-sol, high, read-only, default login, fresh session on `d3dc4415..912f03bc`), `approve with fixes`

1. Medium, the received page read the explorer choice once, so a page left open while another
   surface chose None kept its links. **Accepted**: the page reads the app store's reactive choice,
   as the tx and journal pages do, and drops its own config read; a test switches to None after
   mount.
2. Medium, the new links draw no focus ring: the design base stylesheet removes every link's
   outline. **Accepted in part** (D24): the corner icon and the trust prompt link take the accent ring
   the wallet's other controls draw, and the e2e asserts it. The Block and To links stay exactly the
   Tx hash row's link (OA-6), which shares the gap; a ring on that family is OA-7.
3. Low, the None test only found the copy span. **Accepted**: it clicks it and asserts the copy.
4. Low, the received fixtures were not wire-shaped. **Accepted**: full note and public records,
   checked with `satisfies`.
5. Low, comments. **Accepted in part**: the corner link's two comments cut to one sentence each, the
   Block comment now states why a hash binds the block. Kept: `position: relative`'s comment (it
   names the absolutely placed child in another file) and the journal link's (it names the row it
   matches).

### Arc 3a implementation review: Opus (general-purpose agent, same diff), `ship after one Medium fix`

1. Medium, the focus ring: the same finding as Codex 2, the same disposition.
2. Low, a contact or account name of about 16 or more characters runs under the corner glyph
   (contacts allow 25). **Accepted**: a card with a link reserves 14 px on its text's right, so only
   names that long wrap earlier; the glyph, its place and the card's size are unchanged (shot
   `arc3a-received-long-name`). A single word wider than the card overflows it as before.
3. Low, `getTransactionExplorerUrl` put a stored hash, which a restored backup sets, into the path
   unchecked. **Accepted**: the same 32-byte check and a refusal test; the activity card's test now
   uses a wire-shaped hash.
4. Housekeeping: the untracked shot spec matches the smoke glob. **Accepted**: deleted before every
   full smoke run and before the PR.

### Arc 3a implementation review, round 2: Codex (same session, resumed, on `912f03bc..d84f2baa`), `approve with fixes`

1. Medium, a regression of round 1's fix: if the shell's boot settings read fails, the app store
   keeps its `"aztecscan"` default, so a person who chose None sees the received page's links (the
   page's own read used to recover None). **Accepted**: the store's explorer choice starts `null`;
   the config store's `props` lists every key with its default, so a normal boot always sets it. A
   store test pins the null start.

Verified, per the round: the reactive None reaches every received-page link; the rings match D24;
`:has(> a)` leaves link-less cards alone; the tx builder's check keeps every production hash
(`TxHash.toString()`); no assertion weakened; no comment finding.

### Arc 3a implementation review, round 3: Codex (same session, resumed, on `d84f2baa..4faf04a4`), `approve`

No findings. Every reader of the store's explorer choice falls back to copy, text or no link on
`null`, and none renders before the shell's settings read. The loop converged.

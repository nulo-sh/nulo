# Phase 1 (Arc 1) — implementation log

## Phase 1.1: one receipt head (#227)

- The note arm now reads `tokens → getRecord → outgoing → inflight`, the public arm's order, through
  one `isOwnSend(scope, txHash)`; both contexts satisfy one `ReceiptScope` (the public context's
  `account` field became `accountAddress`). The epoch is re-read after the token read and after the
  record read in the note arm, as the public arm already did.
- Matrix re-pins: N1 to N4 now stop at the read they park on; N3 (outgoing miss) still reads the
  journal before standing down, like P3. A new row, "N2 record read, existing", pins that an existing
  note's backfill stands down on a bump after the record read (the public reconcile row's twin).
- New tests: an own outgoing hash reads the record, then `outgoing`, never the journal; an existing
  note with its timestamp costs `tokens` and `getRecord` only (two reads, was four); both arms'
  unknown-trust controls log the same head.
- Gate: `bun run --cwd apps/extension test src/wallet/services/incoming-transfer/` 346/346,
  `bun run lint` exit 0 (after `biome format` wrapped one long row), `bun run typecheck:all` exit 0.
  No complexity directive added.

## Phase 1.2: the lock ticket in both receipt sections (#144)

- Built: `ReceiptFence { fenced, isCurrent }` made at lock entry by `receiptFence(epochAtStart,
  isCurrent)`; `fenced = epoch unchanged && ticket current && deletersRunning === 0`. Its first read
  is the section's first statement, so the deleter count is read at entry before any read.
  `withDeleterLock` wraps the five deleting sections (`clearProfile`/`clearChain` through
  `clearScopeLocked`, `onAccountDeleted`, `onTokenDeleted`, `onTransactionAdded`,
  `finishReconciliation`), incrementing before the first await and decrementing in `finally`.
  `repo.setTrust` gets `fenced` on the receipt path; the trust-changed and Pending emits read the
  ticket only; the Added emit reads `fenced()` (with the ticket current at the write, no deleter can
  have started, so it reduces to epoch plus ticket).
- `commitPublicEvent` resolves `revoked | processed`. One helper, `commitAddressedEvents`, serves the
  forward pass and the reconcile step and stops at the first revoked commit; both callers then return
  `no-progress` without touching the cursor (forward: `pendingPage` stays; reconcile: the marker
  stays). Extracting it also brought `stepReconciliation` back under the complexity budget (17 → ≤ 15
  after the hold was added inline).
- The scenarios' mocked `setTrust` now reads the stored row through a parkable
  `readTrustForWrite`, then the fence, as `repository.ts` does; the matrices log it as `trustRead`.
  Dead `epochAtStart` fields left the two scan contexts (the fence owns the epoch).
- Handoff rows run on fake timers and advance the lock watchdog past 5 minutes while parked; nothing
  else moves (no bump), so they isolate the ticket.
- Added beyond the plan: a reconcile-path hold test (a handoff in a reconcile rewrite keeps the
  marker; without the hold, `finishReconciliation` deletes the moved receipt). The shared helper's
  forward test alone would not catch a hold removed from `stepReconciliation` only.
- **Revert checks (gate):**
  - `fenced()` reverted to the epoch alone: N5b, N6h, N7h, N8h, P5b, P6h, P7h, the successor-Allow
    scenario, the public page hold, the deleter pair and the boundary case all fail (11).
  - Page hold reverted (`commitAddressedEvents` ignores `revoked`): the public page-hold test and the
    reconcile-hold test fail (2).
  - Entry read removed (the note section's reads check epoch and ticket only; the count is read only
    with the writes): the boundary case fails (1) — the displaced late-delete finishes during the
    timestamp read and the backfill resurrects the deleted record.
- Gate (mechanical): incoming-transfer units 360/360, `bun run lint` 0, `bun run typecheck:all` 0.
  Per D-orch-3 the gate counts as passed only once the Codex and Opus answers on the entry read are
  recorded under § Audit verdicts.

### Entry-read consult (D-orch-3)

- Codex (gpt-6.1-sol, high, read-only, default login) and an Opus general-purpose agent ran in
  parallel on the Phase 1.1 and 1.2 commits plus the Phase 1.3 design. Both: the entry read plus the
  per-write read closes the displaced-deleter race and opens none. Verdicts and dispositions in
  plan.md § Audit verdicts; decisions D12 (entry read made structural) and D13 (prompt liveness:
  test, not code).
- After D12 the "entry read removed" revert check must remove both the captured count and the
  section's first live read; with only one removed the other still catches the boundary case.

## Phase 1.3: an all-or-nothing Allow (#92)

- Built: `nextArrivalFloor` (pure; `moveArrivalFloorLocked` now uses it), `trustedRow`,
  `EntityStorage.item(id, entity)` (`set` now writes through it, so the key format lives once),
  `repo.commitAcceptance(trust, records)` (one `storage.local.set`, dispatched before it returns),
  `setTrustAllow` rewritten as: count at entry → `readAcceptanceLocked` (registration, stored row,
  refusal of missing or `unknown`, the contract's hidden records, visibility, then the floor) →
  `live()` and the count → one commit → ticket-gated emits. `unhideLocked` removed.
- Tests: the BUG PIN became "an Allow the watchdog displaced writes nothing, and the next popup open
  prompts again"; the successor-Reject test parks at the visibility read; the lock test became a pair
  (before the write refuses; after it keeps everything); new: one write carrying the row, its floor
  and every un-hide (no `setTrust`, `setArrivalFloor` or `upsertRecord`), refusals for a missing row,
  a row reset to `unknown`, a displaced deleter at entry, and a displaced late-delete finishing during
  the reads (its record is not resurrected). The raw-map "deleted mid-loop" test was removed: it
  mutated storage outside the lock, which no production deleter does; the displaced late-delete test
  replaces it. Two trust-transition tests now seed the `pending` row a prompt implies.
- Composition (`service.composition.test.ts`): real service, real repository, real lock on
  `FakeBrowserApi`, `svc()` stubs, real `ProfileDeletionState`. Fake timers drive the watchdog there.
  Stored-row assertions: the Allow lands trusted with floor 141 and both receipts visible; a lock
  before the write and a displaced Allow each leave `pending` and hidden. Checked against the old
  `setTrustAllow` (HEAD's file swapped in): both never-happens cases fail, the success case passes.
  Reviewer checklist: no PXE fake (D1 n/a), no simulate/prove (D2), no tx-request or derivation
  (D3, D6), state is seeded rows only (D4), assertions read real storage.
- Revert checks: Allow entry read removed → the late-delete boundary test fails; the single write
  replaced by `setTrust` plus per-record upserts → five tests fail (the one-write test and four floor
  pins).
- Gate: incoming-transfer units 373/373, `bun run test` 10746 passed (716 files), `bun run
  test:all` exit 0 (every workspace), `bun run lint` 0, `bun run typecheck:all` 0 (one test-table
  typing fix after the first run).

## Post-implementation loop

- Round 1 (fresh Codex session on `ac259a7..18a1111`, gpt-6.1-sol high, default login): `approve`,
  three Low. Opus final-diff review in parallel: holds, seven Low. All accepted (plan.md § Audit
  verdicts); fixes are comments, test names, one new recovery assertion and three duplicate tests
  removed. Production code unchanged apart from comments, so the smoke run started on the 18a1111
  build stands for this head.
- New pin checked: removing the `finally` decrement in `withDeleterLock` fails both failed-wipe rows.

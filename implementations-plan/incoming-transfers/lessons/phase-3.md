# Phase 3 (Arc 3) — implementation log

## Arc 3b planning (2026-10-14, base `264a4b30`)

Where the approved Arc 3 text and the tree disagree, the tree wins:

- #140's armed network proof is dropped: after the `NULO_E2E_REORG` prune the local network does not
  mine again (`stale-anchor-recovery.test.ts:52-55`, e2e-testing skill), so the PXE never syncs past
  the dropped block and the delete it should prove cannot happen. Unit scenarios carry it (D31).
- #140 needs the finalized tip inside `scanContract`, which arc 2's `scanNoteTarget` holds but does
  not pass (`service.ts:1456-1476`); a failed tips read settles nothing.
- Arc 2 asks #140 to report "not reached" while it has work left. Work left is bounded by the second
  synced read: a row above it changes only after a new block, which the gate runs on (D32).
- #141 under C12-fetch B and the owner's addendum: the fee stays automatic; the plan's "fee on a tap"
  applies under privacy mode only. `getReceiptFee`'s failure line breaks the logging policy (a hash
  prefix in a finished string, a bare error: `service.ts:640`); arc 3b fixes it.
- A dead `appStore.isPrivacyModeEnabled` (`app.store.ts:66`) predates the mode; it goes (D30).
- Arc 3a, branched before arc 2 merged, numbers its ledger entries D14 to D17 and its ask OA-7; arc 2
  already uses D14 to D20. Arc 3b reserves D21 to D24 for arc 3a and starts at D25; its ask is OA-8.
- Round 1 found two more tree facts the plan had missed: the PXE's block stream logs and swallows a
  failed sync (stdlib `l2_block_stream.ts:237-242`), so a notes read can answer from a stale anchor
  (#140 now settles, strikes and deletes only at a verified anchor); and `getNodeForUrl`'s client
  retries a failed lookup up to three times (`aztec-runtime/src/utils/fetch.ts:112-122`).

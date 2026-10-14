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

## Arc 3b implementation (2026-10-14, base `b3c98acb`)

The planner rebased the plan commit onto `origin/dev` `b3c98acb` (now `f0beffb3`) before the build;
dev added the `@nulo/token-list` workspace, so the worktree needed a `bun install`.

### Phase 3.3

- The reorg liveness proof ran with the token untrusted, so its receipts were hidden and Updated
  (gated like Added) could not fire. The test now trusts the token first; without that the plan's
  "one Updated naming `0xbh101b`" is unobservable.
- Revert record: with `emitUpdatedIfShown` removed, the emit-once case, the reconcile control and
  P11 rows, the handoff case and the liveness proof fail (5); with the feed's `refresh()` on Updated
  removed, the held-read case fails (`[["a", "0xold"]]`).
- Gate: units 55 files / 1278 tests, lint 0, typecheck:all 0.

### Phase 3.4

- Two scenario fixtures were inconsistent with the PXE they stubbed, and the reconciler read them
  as re-mines: `note()` set `indexInTx` where `RawNote` carries `noteIndexInTx`, and the matrix's
  "existing" row sat at block 1 while its note was at block 100. Both now match production shapes.
- Plan step 3 says a move writes "the new block's timestamp"; a failed timestamp read now leaves the
  row unmoved and the scan not reached (a rerun decides), so position and time always move together.
- Settle emits Updated only when the re-read time differs, which is how a same-position re-mine with
  a new time reaches an open screen; a settle that changes nothing visible emits nothing.
- `getSyncedBlock` sits in the note service's `Methods` (RPC plus passthrough), as the plan's file
  map lists `client.ts`; `defineRpcMethods` is exhaustive.
- Revert record: the strike check removed (always delete) fails 8 scenarios, the survives-scan-one
  case first; the bracket's hash check removed fails the stale-anchor and mid-scan-block cases; a
  strike reporting reached fails 8, the next-unforced-tick case included.
- Gate: units 56 files / 1315 tests, lint 0, typecheck:all 0, test:all 0 (extension 12228 passed).

### Phase 3.5

- A hash seeded as `0x3f…` is not a BN254 field element (the modulus starts `0x3064`), so the node
  client's receipt parse rejected it and the fee row fell to a dash. Seeds use `0x0f…`; the smoke
  scenario's own hashes were already field-valid, the screenshot run's were not.
- The received page has no bottom nav, so toggling Settings from it goes home first.
- The smoke stub answers `null` to every method; the receipt parse treats that as terminal, so one
  look-up is exactly one wire request and the counts carry no retry noise.
- The Updated screenshot is staged by rewriting the stored record's block and reopening the page; the
  live path is the page test ("an Updated moves the Block row").
- Revert record: the page's mount load forced to `tapOnly = false` fails 3 page cases; no reset on
  `onDisconnected` fails the reconnect case; a held Updated ignored fails the Block case; the smoke
  scenario fails with the mode read removed (Chrome dist rebuilt with the real code afterwards).
- E2E budget, `received-fee-privacy.test.ts`: proves no receipt request leaves the browser under the
  mode until the press, which component tests cannot see (they mock the client). Estimate 20 s;
  measured 11.9 s and 10.4 s on Chrome, 21.0 s and 14.6 s on Firefox.
- Gate: lint 0, typecheck:all 0, test 0 (12253 passed); smoke with `fiat-display.test.ts` at retry 0,
  3/3 on Chrome (24.4 s) and Firefox (40.8 s).

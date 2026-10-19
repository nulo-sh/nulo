# Phase 1 (A1): the record, the pass, `servesChain`, the purge

## Deviation from the plan

- The record is read through `decodeRow` (`apps/extension/src/wallet/utils/raw-row.ts`) on raw `storage.local`, not through `ValueStorage`: `ValueStorage.get` throws alike when the storage read fails and when the value is bad, and D9 needs the two apart (a bad value adds nothing; a failed read fails the open). `decodeRow` is the absent/corrupt/valid read the fail-closed repositories already use. Ledger D13.
- One test the plan's mutation list needed was missing: a seed whose row write fails must stay unrecorded (the "record written before rows" mutation had no test). Added: "a default whose row write fails stays unrecorded and is added at the next open".
- The plan's tests 8-16 live in a new `describe` of `service.test.ts` (seed appended in the tests, removed in `afterEach`); test 17 in its own `describe` with the real seeds. Its message is the comment above its assertion.

## Proof of the tests (D10), 2026-10-19

Script: the arc's two test files run against the base `service.ts` (keeping the new `seed-offers.ts`), then against each mutation of the new code; failing tests listed per run.

- **Base `service.ts`**: 12 of the new service tests fail, each after reaching the behaviour it checks (no row added, no record, `servesChain` false before the open).
- **M1** `KINDS_SEEDED_BEFORE_RECORD` emptied: the real-seeds test, the baseline pure test, the pin.
- **M2** identity by chainId only: the kind-held pure test.
- **M3** no hold by chainId: the custom-row pure test and the classification test with a custom row on the new chain.
- **M4** no hold at all: M2's and M3's tests (and the rename's twin check).
- **M5** record ignored: the deleted-stays-deleted service test, the dApp-refused-after-delete test, the recorded-deleted pure test.
- **M6** corrupt read as absent: the corrupt service and pure tests.
- **M7** `servesChain` reads rows before the record: the parked-reader test.
- **M8** a seed recorded before its row write: the failed-row-write test.
- **M9** the record write unfenced: the deletion-during-record test.
- **M10** quarantine not checked: the reset-names-the-chain test.
- **M11** purge keeps the record: the purge test.
- **M12** a failed storage read swallowed: the corrupt/failed-read test.
- **M13** no lock around the open: the concurrency test.
- **M14** compensation erases a valid record: the deletion-during-record test.
- **M15** a restore writes the active pointer of a profile with rows: the restore-into-existing test.
- **M16** rows read outside the lock: the concurrency test's new-profile half. (A first proof claimed no test should fail here; wrong: on a new profile both opens see no rows and each seeds every default.)

## Review round 1, 2026-10-19

- **Codex** (`gpt-6.1-sol`, high, session `01a155e9`): `findings`, one low: two comments restating code. Fixed: the type's comment removed; `recordOffersLocked`'s now states only the compensation invariant.
- **Opus** (diff review): `findings`, three low, all held on trace and fixed:
  1. A deletion overtaking the record write removed a record that had been valid; if the tombstone write then fails the profile lives on with no record, read as the earlier builds' seeds, and a default the person deleted comes back. Compensation now writes the replaced record back; the deletion test covers both priors (M14).
  2. `seedDefaultsForProfile` keeping the pointer of a target with rows had no test (M15); its doc now says what a target with rows gets.
  3. The M13 proof line above was wrong for a new profile; corrected, with a new-profile half in the concurrency test (M16).

## Review round 2, 2026-10-19

- **Codex** (resumed): `findings`, one low: the compensation comment's "never to none" was false with no prior record. Reworded. Checked the write-back cannot outlive a completed deletion: both entry points hold the network lock through it, and the deletion's purge takes the same lock.

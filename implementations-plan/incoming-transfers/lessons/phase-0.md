# Phase 0 — planning log

Consults and decisions during planning. Every consult is listed, failed ones included.

## Recon

- Two Explore agents (sonnet): a batched reuse sweep (eight capabilities) and an Aztec node/PXE API
  mapper. Both returned; findings are in [recon.md](../recon.md).
- Driver read of `service.ts` end to end, `repository.ts`, `arrival-state.ts`, the receipt epoch
  matrices, the four detail surfaces and the PXE note store.
- Found: `getNotesRaw` reads `ACTIVE` only, so "absent from the PXE read" also means "spent"; a #140
  reconciler built on it would delete every spent receipt. The fix needs `ACTIVE_OR_NULLIFIED` and the
  PXE's synced block, and it deletes visible rows, so it went to OA-1 and left Arc 1.
- Found: `repository.test.ts:91` already pins `repo.setTrust`'s fence semantics; the scenarios' mocked
  repository evaluates the fence at entry (`service.scenarios.test.ts:96`), so #144's read-to-write
  window is proven by a scenario that bumps inside the mocked write plus the existing repository test.
  Round 1 showed this was not enough: the mock must read the fence after its stored read, as the real
  repository does, or a reverted fence still passes (Phase 1.2 step 1).

## Panel

- **Round 1, Codex** (gpt-6.1-sol, high, read-only), 2026-10-09. Ran on the roster account
  `alejo-icloud`, not the default login: the shell inherited `CODEX_ACCOUNT=best`, which the wrapper
  honours. Later calls run under `env -u CODEX_ACCOUNT`. Verdict: `reject (with blocking findings:
  incomplete watchdog/purge fences; Arc 1 changes visible behavior; note reconciliation misses moved
  notes)`. Ten findings; dispositions in plan.md § Audit verdicts.
- **Round 1, Opus Plan agent**, 2026-10-09. Verdict: `conditional approve (with conditions: add the
  lock ticket to the #144 trust write and its emits; make N5b/P5b able to fail on revert; have the #92
  repair re-check trust inside the lock and capture the session fence; spell out Arc 2's rules for when
  a scan counts as caught up, plus tip ordering checks and the #138 cursor fields; tighten the liveness
  proofs so each one shows a receipt landing)`. Fourteen findings; dispositions in plan.md.
- **Driver decisions after round 1** (put to the final pass): #92's repair replaced by an all-or-nothing
  Allow, because both reviewers' objections were to partial state the repair tried to clean up; #144's
  emits gated on the lock ticket only, because every deleting writer holds the lock and an epoch-gated
  emit would delay a prompt after a harmless scheduler rebuild.
- Checked before the final pass: `EntityStorage.set` returns the storage call directly
  (`packages/wallet-core/src/storage/entity_storage.ts:189-191`) and `upsertRecord` calls it before its
  first await, so a batch of them dispatches synchronously; `moveArrivalFloorLocked`'s rule is pure
  given the stored row, the tip and the epoch comparison.
- **Final fresh pass, Codex** (gpt-6.1-sol, high, read-only, default login), 2026-10-09. Verdict:
  `reject (with blocking findings: D4 is not atomic; D3's deletion invariant fails after handoff; refused
  public receipts can be skipped permanently; #140 can preserve orphan rows forever)`. Eight findings:
  six accepted, two accepted in part with the proposed fix rejected (dispositions in plan.md). Lesson:
  "dispatched in one synchronous block" is not "atomic"; separate storage calls fail one by one. One
  multi-key `set` is the atomic unit.
- Lesson: a fence that refuses a write inside a scan must also stop the scan's cursor, or the refused
  item is skipped for good. Check every new refusal against what advances after it.
- **Final pass, round 2** (same Codex session, resumed), 2026-10-09. Verdict: `reject (with blocking
  findings: missing-row refusal does not fence displaced wipes; prune-and-re-advance can permanently
  lose spent receipts; back-fill progress is underspecified)`. Five findings, all accepted. Lesson: the
  lock watchdog lets a successor in without stopping the displaced holder, so "holds the lock" never
  means "is the only writer"; a fence on displaced deleters needs a running count, not the ticket.
- **Final pass, round 3** (same session, resumed), 2026-10-09. Verdict: `reject (with blocking
  findings: a completed displaced wipe can still be resurrected)`. One finding, accepted: read the
  deleter count at lock entry, before any read. Loop stopped at three rounds; the fix is the reviewer's
  own and is not re-reviewed, so Arc 1's first Codex audit asks about it first.

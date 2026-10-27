# Phase 3: the `proving` checkpoint (#1122)

- New composition case against the base coordinator (`git show 78f5f9171:` copy): red in 107 ms on `expect(proofStarted).toBe(false)`, not by timeout; green with the checkpoint.
- Same-tick controls with the checkpoint applied, the cancel's first `getOperation` held: without the slot hold, released at gate entry, red (`proveTx` called once: the mid-prove order); with the hold, released once `queued` is written again after `pending`, green with no wait reaching its deadline.
- `execution-coordinator.test.ts` 30/30 and `service.composition.test.ts` 30/30 (three streams of ten).
- Commitlint warned on a body line starting `proof:` (read as a footer); the unpushed commit was reworded.

# Phase 4: the figure and the hold

Arc 2 started before arc 1 merged: the orchestrator released it in parallel (decision ledger, D-orch-3). Paths are repo-relative.

## Design consult (2026-10-16)

- **Codex** `gpt-6.1-sol` high, read-only, on the worker design before code. Verdict: **approve with changes**, 3 findings, all accepted:
  - A, an app's own payment claiming Fee Juice to the account counts as app-paid in the window, so Confirm could pass with no figure and the worker would refuse the send. The Confirm gate now waits for a claim to the account too (`popup/windows/execute/fee-figure.ts`).
  - B, the frame suspended across the question must not hold the signed request: the build is stashed in the reuse cache (whose two-minute bound holds it) and only the question and the stash id leave the pass.
  - C, approving one unit below the estimate no longer asks once the tolerance exists: the network case approves with a figure past both thresholds and asserts the inequality.
- It also confirmed: re-check earlier sends under the slot after the park, then claim the record back (`queued → pending`, or still `pending`); one absolute deadline, `MAX_WAIT_MS`, shared by the waiter and the window; the map of approved requests is cleared in `executeAndResolve`'s `finally`.

## Implementation notes

- `askAgain`'s body moved into `execution/fee-reask.ts` as `askFeeAgain`; Send's 89 executor tests pass unchanged.
- A popup-approved build the person pays for, with no figure, is refused before the proof (`MISSING_FEE_FIGURE`); a silent or wallet send carries no approval and is never held.
- `acceptQueuedFee` stays transfer-only: the dApp question is answered only by its own window, through `DappInteractionService.askFeeAgain` and the worker's captured figure (deviation from the plan's Arc 2 "Accept and surface" line; ledger D35).
- A refusal cancels through `lane.cancelQuestion`, which cancels only while the record still asks that figure.
- Test harness: a default parameter swallows an explicit `undefined`, so the "no approval" case calls the executor directly; a second rise needs the restashed build to miss, since a hit proves at the accepted figure without building.

## Gate

- `bun run lint`, `bun run typecheck:all`, `bun run test` (802 files, 12,986 tests): green.
- `bun run test:all`: one red, `scripts/type-roles/inventory.test.ts`, which saw phase 5's new window created mid-run; its `surfaces.expected.json` entry lands with the window.

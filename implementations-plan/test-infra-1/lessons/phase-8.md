# test-infra-1: phase 8 (the remaining waits)

## Consult: what a drain may become (Codex, gpt-6.1-sol, high, 2026-10-19)

The plan says each `wallet-sdk/background.*` drain moves "to the awaited callback or the reached signal it stands for". Most of those drains follow a `void` callback (`onPendingDiscovery`, `onWalletMessage`, an `EventHandler.invoke`), so the question was what counts as a cause. Verdict: `approve with changes`. Taken:

- Choose a boundary by what it covers, not by a fixed order: a promise the driven path returns (`onSessionEstablished`, `handleWalletMessage` when the test calls it), a pass-through spy on a cross-module export on the real entry path (`handleDiscovery`), or a reached signal on the step that IS the asserted effect, armed before the trigger and matched on its invocation.
- `handleDiscovery`'s promise excludes its detached branches (`autoApproveExistingSession`, `rejectThrottled` return `void`), and an awaited bus dispatch does not await work a listener starts without returning it.
- A "not yet" or "never" assertion needs a boundary that settles after every path that could do the forbidden thing has decided; entry into a wait is not one (a missing-`await` mutation passes it). Without such a boundary the drain stays, with its reason.
- A drain after a synchronous drop guards a delayed-forward regression; a later valid message is a success control, not a completion barrier (the content wrapper has no async FIFO).
- No "settle everything" helper (a renamed guess).

The per-site rules the migration followed are this consult's, applied file by file; every kept drain is listed in the PR body with its reason.

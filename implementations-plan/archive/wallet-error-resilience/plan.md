# Wallet error resilience

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Typed stale-anchor and unregistered-contract errors with resync-and-retry-once (`packages/extension-messaging/src/errors.ts`, `packages/aztec-runtime/src/pxe/stale-anchor.ts`), a balance queue that reschedules transient failures instead of marking the row failed (`apps/extension/src/wallet/services/token-balance/balance-job-queue.ts`), and four fewer console noise sources. The tools-app half lives in the unleashed repository.
- **Open items**: the `sim-methods` case for `executeUtility` never exercises a success, tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Light tier, two arcs stacked because the second consumes the first's error code. The extension arc makes the wallet resync and retry exactly once on the stale-anchor family and then fail with a named error, and has the balance projector reschedule rather than pin "sync failed" on the row. dApps get two new error codes. The tools arc gates sends on registration and re-registers once on the new code, keyed on the structured code only, around single pre-submission calls only.

A delayed balance retry is kept in memory, so it does not survive a service-worker restart; the next trigger refreshes the row. No `classId` goes into the error envelope.

## Why

One bad session showed four failures at once. After the node's answers went inconsistent ("block hash not found, possibly a reorg", a not-yet-synchronized PXE, a rewindable-register write behind the current version), every transaction and balance sync failed for an hour. A send failed because the wallet had no artifact for a contract's class. Every failure reached the dApp as the same opaque sentence. And the console carried four noise sources that hide real errors.

The wallet cannot make two nodes agree, so recovery is bounded best effort: a resync can advance the anchor, can roll notes back, or can silently make no progress, and the retry is one more draw, not a guarantee. A retry on unregistered contracts is safe only because the wallet raises that code before proving and before any broadcast.

## What shipped

- **Two typed errors through both boundaries.** `PxeStaleAnchorError` and `ContractNotRegisteredError` cross the offscreen port and the operation-result channel, through an explicit three-class allowlist and not a blanket pass-through. The envelope gives a constant message for the first and an invalid-params code for the second, and node text stays in `details`.
- **Resync and retry once.** `withStaleAnchorRetry` matches the three stale-anchor messages by substring, syncs, runs the operation again, and throws a typed error if the second attempt matches too. Store-key recovery trusts the origin of its error rather than its text, so a hostile node cannot chain the two retry mechanisms.
- **Balance queue.** A transient failure is retried at most twice after a delay without writing the failure, with lifecycle rules for an external refresh, a generation change and an invalidated row; after the bound, the old behaviour runs.
- **Noise.** The disconnect and receiver-gone rejections are demoted and prevented, a circular value no longer logs as "[object Object]", and passkey creation offers ES256 then RS256 to silence the algorithm warning.
- **Proof.** A real-PXE test reorgs the sandbox and checks the wrapped operation recovers, and a network spec issues views across a prune. Its softer assertion that a retry line appears did not land, so the extension-level reproduction stays unmet.
- **Tools arc.** A `contractsReady` gate on sends and a one-shot re-register and retry, now in the unleashed repository.
- **A limit found on the way.** The playground's `executeUtility` button hands a public view function to a utility call, which the wallet cannot resolve, and the test case accepts either outcome.

## Lessons

### Lint cap

`bun run lint` prints only Biome's first 20 diagnostics, so a new error can hide behind the count and look like debt on untouched files. Here three format-only errors in the changed files were read as pre-existing until `biome check` ran on those files alone.

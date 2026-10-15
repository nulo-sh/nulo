# Failed send check

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The background check in `apps/extension/src/wallet/services/operation-journal/send-check.ts`, the shared rules in `apps/extension/src/wallet/services/transaction/receipt-status.ts`, the failure copy in `apps/extension/src/popup/utils/transfer-failure-copy.ts`, the journal page `apps/extension/src/popup/pages/journal/[id].vue`, and the spec `apps/extension/tests/e2e/network/failed-send-check.test.ts`.
- **Open items**: the authwit popups' 60 second ceiling, a definitive "won't go through" from a transaction's expiry, a chain prune after inclusion, a failed card beside a settled row, a neutral snack style, light-theme status contrast, a node's refusal reading "Not confirmed yet", a missing hash or explorer link on a checked record, and the error snack covering the awaiting card, tracked in #107, #108, #109, #110, #111 and #112; one more is tracked privately: GHSA-vx7h-rpq3-2p9x. The Firefox rerun of the imported-account execution spec was closed by a later plan before `follow-ups.md` was retired.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

A failed send that may have reached the node is checked in the background, on the endpoint recorded with it, instead of hedging "it may still go through". The check reads the receipt for 30 minutes and records one of five outcomes: nothing sent (only where the stage proves it), not confirmed yet, went through, reverted, or still unconfirmed. A DROPPED answer never reads as "not sent". The popup waits for the background's answer on a transfer rather than reporting failure at its own 60 second mark. A failed dApp send says what happened, like a wallet send.

## Why

No screen should invite a second send while the first can still land. A DROPPED receipt only means this node replica has not seen the hash, so it is never evidence of non-submission. "Went through" is taken at inclusion, as the regular send path does.

A transfer proving in the browser on Firefox without a native prover takes minutes, and the popup's 60 second transport deadline reported "Send failed" for a transfer that then succeeded. The transfer now has a 60 minute popup deadline and the journal holds the answer past it.

A hash links private activity, so the check dials only the endpoint recorded with the send, only inside a live fence of the row's own profile, with one read in flight per row. A lock, a stop or a deletion halts it between any two awaits.

## What shipped

- The `submitting` write is a precondition of the send. A failed row keeps the stage it failed from, its hash and its endpoint.
- `SendCheck`, armed after the reaper. It tracks unresolved rows again after a background restart and reads once the profile is unlocked.
- Shared receipt mappers lifted out of the transaction service, a one-attempt node client for the check, and a send's own change notes no longer shown as "Received".
- The Send snack, the activity card and the journal page show the outcome and update in place.

## Lessons

### Node retries

The node client retries only a failed POST (three attempts, one to three seconds apart) and treats a 4xx as final. A refusal such as `Invalid tx` arrives as a per-call error inside a successful HTTP 200, so nothing retries it, and a POST retried after a lost answer can come back refused for a send the node took. A refusal alone therefore does not prove "not sent". The check reads through a one-attempt client because a retrying one lets a later attempt send the hash after a lock, switch or deletion.

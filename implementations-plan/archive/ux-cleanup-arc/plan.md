# UX cleanup arc

## Outcome

- **Date**: —
- **Status**: completed in part.
- **Shipped**: The estimate-reuse path (`apps/extension/src/wallet/services/execution/transfer-estimate-reuse.ts`, `apps/extension/src/wallet/services/execution/operation-estimate-reuse.ts`), the shared activity card layout (`apps/extension/src/components/composite/activity/TransactionCardLayout.vue`) and the notes page's plain display model (`apps/extension/src/popup/pages/settings/advanced/account-state/notes/index.vue`).
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Clear five user-facing rough edges as five small branches, planned to land separately and in this order: the silently blank notes page, the fee dropdown that waited on token balances, the link between contacts and private-transfer senders, one card layout for in-flight and submitted dApp transactions, and reuse of the fee estimate at confirm time.

- Notes: render from a precomputed plain display model built per note under a guard, so one malformed note becomes a labelled failure row instead of blanking the page.
- Fee dropdown: render from gas, fee-payer contracts and the saved preference without waiting for token balances. Warm the caches on unlock. Key the gas cache by profile, since private gas depends on profile-scoped fee-payer contracts.
- Contacts and senders: a sender-registration checkbox when adding a contact. A failed contact save is a hard stop; a failed sender registration is non-fatal. Import defaults the checkbox off and registers serially.
- dApp cards: write a journal record for dApp executions on success and failure, and filter journal entries by account and network.
- Estimate reuse: see below.

## Why

The layouts differed between phases, so a dApp transaction looked different in flight and once submitted. Estimating twice made Confirm slow for no benefit. Notes and the fee dropdown failed silently, which is worse than failing loudly.

## What shipped

Evidence in the tree covers the estimate reuse, the shared card layout and the notes display model. The fee-dropdown pre-warm and the contact sender opt-in were not confirmed there and are not claimed.

### Estimate reuse

Confirm reuses the fee estimate rather than building the transaction request twice, with a deliberately narrow carve-out.

- **Where it applies.** The Send page transfer, and a dApp `aztec_sendTx` only when the fee method is not embedded and the operation is not the default entrypoint. Every other variant takes the fresh path, because those variants execute differently and are not safe to reuse.
- **What is checked.** The estimate stores a snapshot: base fee, fee method, priority, a hash of the operation actions and the primary endpoint identity. Confirm revalidates it and falls back to a fresh estimate if any part diverged. A divergence of any single field is enough.
- **Risk kept in view.** A future contributor could extend reuse to the default entrypoint without revisiting the reasons, so the carve-out is an explicit eligibility guard in the dApp send executor.

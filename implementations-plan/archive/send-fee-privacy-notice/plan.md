# Send fee privacy notice

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the Send page picks its fee source from the transfer's privacy (`apps/extension/src/popup/components/modules/send/fee-privacy.ts`, `fee-send-selection.ts`) and says so when the account's own Fee Juice would pay for a private send (a tag on the fee card in `FeeMethodSelector.vue`, the sentence and a link to get private gas in `apps/extension/src/popup/components/modules/send/SendReviewSheet.vue`); the gas-balance reader honours a forced refresh under concurrency (`apps/extension/src/wallet/services/execution/gas-balance-reader.ts`).
- **Open items**: revisit the private-origin fee order when a funded sponsor ships on mainnet, tracked in [follow-ups](../../follow-ups.md). The order puts the account's own Fee Juice ahead of an eligible sponsor, which costs the most privacy, and it decides only on test networks while mainnet offers no sponsored row.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Make the Send page's fee source follow the transfer's privacy, and say so once, in one place, on the only path where it cannot. The default walks the payers in a fixed order that tries the payer matching the origin first and a sponsor last. A private origin tries private Fee Juice, then the account's Fee Juice, then a sponsor. A public origin tries Fee Juice, then private Fee Juice, then a sponsor.

The wallet steps from private Fee Juice to the public payer only when private Fee Juice was positively read as zero beside a listed PrivateFPC. Anything unread, missing or failed never defaults to the public payer: the walk goes to a sponsor if one is eligible and otherwise selects nothing and says it could not check. A user can still pick Fee Juice by hand, and the notice then appears. The pick is remembered per account and per origin, separately from the shared pick in the dApp approval and authwit popups.

## Why

Every Aztec transaction names its fee payer in public. Paying from the account's own Fee Juice names the account, and paying through the PrivateFPC or a sponsor names that contract. For a private-origin send the sender is the one fact the transfer hides, so a public payer undoes it. For a public-origin send the sender is already visible in the balance change, so the payer costs nothing. Severity depends on the origin alone, which is why it can be a default rather than a setting.

The rule is deliberately blunt about unread data. Protocol-FPC discovery can fail and return a partial list as a success, and the balance store can serve a last-good list, so "the PrivateFPC is not listed" never proves it does not exist. A positive zero cannot come from a failure path. A zero is also a fact about a moment, so a private-origin open reads balances fresh, which required fixing the reader: a forced call that waited out another document's in-flight read used to re-enter unforced and receive an older cached result.

## What shipped

- A pure resolution rule and selection type, with component tests over each branch and a stored-pick type that records the method and sponsor id, never a presentation row.
- A notice for a private origin paid by the account's own Fee Juice, whether defaulted or picked, with a link to get private gas. It first shipped as one warning row under the fee list and now reads as a tag on the fee card plus a row in the review sheet. No notice for a sponsor, and no change to the dApp execute window or the two authwit popups.
- A private-send out-of-gas takeover reworded around private gas, and a degraded state that selects a sponsor or nothing and tells the user to pick.
- A smoke e2e (`apps/extension/tests/e2e/send-fee-privacy.test.ts`) and a network e2e case in `apps/extension/tests/e2e/network/fee-methods.test.ts`.
- Left out on purpose: a footer ledger of what a send publishes, which was not built.

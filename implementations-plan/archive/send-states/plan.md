# Send states

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the sponsor funding probe in `apps/extension/src/wallet/services/execution/sponsor-funding.ts`, its verdict on the fee card in `apps/extension/src/popup/components/modules/send/FeeSettingsCard.vue`, and the token card's load error in `apps/extension/src/popup/components/modules/send/SelectTokenCard.vue`, proven by `apps/extension/tests/e2e/network/fee-sponsor-funding.test.ts`.
- **Open items**: the sponsor checks that stop short of the Revoke and authwit registry popups and a dApp's embedded fee payment; no way to get fee juice from the dApp window when nothing can pay; a Confirm before a sponsor-paid estimate returns skips the funding check; a re-enabled Sponsored row reads "free" before it is rechecked; the sponsor notice is not announced to screen readers; a hand-added sponsor's fallback names the payer by the Sponsored row title; Send's token card has no focus style of its own; and one fee-methods network test that failed once per browser under host load. All are tracked in #96, #113, #114 and #115. The fee-methods network test was closed by a later plan before `follow-ups.md` was retired.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Two fixes to Send's states:

- **Sponsor**: when the kernel names a sponsor row's own contract as the fee payer, read that contract's public Fee Juice once and compare it with the transaction's fee limit, as the node's admission check does. A short sponsor is set aside on that card, the menu row reads "can't pay now", and a notice names the payer that takes over.
- **Token load**: when tokens, balances or contacts fail to load, the token card says "Couldn't load tokens" with a Retry, instead of looking like an empty wallet.

The open UI choices were settled as the recommended options: a visible notice rather than a silent switch, and an inline error with Retry rather than an automatic retry.

## Why

An unfunded sponsor was picked without a funding check, so a send proved and was then refused by the node with nothing spent. The wallet could know beforehand. A failed token load showed "No available tokens" and "Import token", the same as an account that holds none.

The probe reads the payer the kernel named in the final simulation, not the row's address, because a delegating contract would make the address the wrong balance. It uses the node the transaction goes to, a single attempt aborted at 5 seconds, and no SDK log line reaches the log buffer. A probe that cannot run changes nothing, and a verdict describes one transaction and one contract, so a changed transaction makes the row selectable again.

Rejected: a balance leg read by the card (it would widen the gas-balance wire every consumer reads), a probe inside the strategy (it would also read on every send), a page-lifetime verdict (it could strand a person with no gas), and an automatic token retry (a timer and a second guard for a rare failure one tap fixes).

## What shipped

- **Probe and verdict**: send's payer walk proceeds as if the sponsor were missing, the execute window's Approve waits for a pick, and a failed read leaves behaviour as before.
- **Token card**: a tap, Enter or Space retries, a held key retries once, and a successful retry lands the token the page was opened for, or the active one.
- **Review change**: a sponsor that is only renamed keeps its short verdict.
- **Not covered**: popups that estimate nothing, embedded fee payments, and a Confirm that races the first estimate. These are the open items above.

# Journal-stage assertions for popup-shape sendTx tests

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: a `data-stage` attribute on the transaction card in `apps/extension/src/components/composite/activity/TransactionCardLayout.vue`, and sendTx e2e specs such as `apps/extension/tests/e2e/network/tx-sendTx-default.test.ts` that wait on the wallet's operation stage instead of the dApp's settle promise. The waiting helper has since moved to the journal-reading `waitForDappExecuteWorked` in `apps/extension/tests/e2e/fixtures/journal.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Popup-shape sendTx e2e tests stop waiting for the dApp's full `sendTx` promise, whose settle depends on the slow in-browser proving tail, and assert instead that the wallet's operation journal has advanced into an active stage. The stage is exposed as a `data-stage` attribute on the existing awaiting card, following the local precedent of the transaction-status data attributes.

The first helper was deliberately single-purpose and fixed to the proving stage, so weakening the assertion would need a loud rename rather than a string swap. It was later broadened to an explicit allowlist of the three active stages (simulating, proving, submitting), so a terminal stage never matches silently.

Negative-path and settle-focused tests stay as they were: the reject test never reaches proving, and the transfer tests assert mining through the wallet's own send flow.

## Why

The three quarantined sendTx specs timed out on slow runners because the kernel and WASM proving tail is not covered by the native prover. What they asserted was already weaker than it looked: the playground's send buttons do not wait for mining, so the old assertion meant "built, simulated, proved and broadcast", never "mined". The new one means "built, simulated and entered the pipeline", which is a bounded, honest trade, and mining stays covered by the transfer specs.

Implementation found three further constraints. On local WASM the wallet spends most of its time simulating and passes through proving between polls, so a proving-only selector raced. Simulation fails without a pre-minted token balance, which sends the journal straight to a terminal state and removes the card, so the specs mint first. And the no-sender spec calls a public function that the builder rejects within seconds, so its card is gone before a fresh popup mounts; that one spec keeps its tolerant settle assertion and checks the fee badge instead.

## What shipped

- The `data-stage` binding on the card root, with component tests for the stage values and for omission when the stage is absent.
- The restructured default, multi-account, multicall, fee-payer and sponsored-payer specs, with their deferred-slow gates removed.
- A mint helper for the granted account in the e2e fixtures.
- Later, the DOM-watching helper was replaced by a journal-storage read that tolerates the proverless fast path and is never satisfied by a failed or cancelled operation, because the card disappears once the operation ends and the DOM wait raced both the render and fast completion.

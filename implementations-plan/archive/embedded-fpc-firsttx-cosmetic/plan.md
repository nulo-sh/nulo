# Embedded FPC cap and first-transaction cleanup

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: one helper, `apps/extension/src/wallet/services/execution/fee/embedded-fpc-cap.ts`, now applies the embedded fee payment's `maxFeesPerGas` cap everywhere it is needed, and the fee-payment-method enum from the account package is used directly.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Three cleanups were proposed after the simulation fast path landed. Two were taken and one was skipped.

- Drop the wallet's own re-export of the fee-payment-method enum and use the account package's `AccountFeePaymentMethodOptions` directly. Mechanical.
- Keep the embedded-FPC fee cap, but consolidate its four copies into one helper with an accurate comment. Deleting it outright was rejected.
- Do not normalise the result of a mixed first-transaction simulation, in which an account's constructor and the entrypoint run together. The saving of a few seconds did not justify a subtly wrong result.

## Why

The cap is not dead code. Its purpose changed when upstream's fee completion started defaulting `maxFeesPerGas` to one and a half times the current minimum fees: it now caps at one times the minimum, which matches dApps that budget an embedded payment (a fee-juice claim, or a sponsored FPC finishing a claim) directly against the node's current minimum fees. At three of the four sites it is also the only place a dApp's explicit `maxFeesPerGas` reaches the transaction request, so deleting it would have lost dApp-supplied fees on those paths.

The normaliser would have returned a mixed object: the projected private execution result next to the full multicall's public inputs. Those public inputs are dApp-visible through the simulation result's gas used, so a dApp would see the constructor's gas over-reported, and the first nullifier would carry the account-init meaning on a tree rooted at the entrypoint. Doing it correctly would mean stripping constructor gas from kernel output and recomputing the nullifier, with end-to-end coverage that synthetic trees cannot give.

## What shipped

- `applyEmbeddedFpcGasCap` in the helper file: a no-op without an embedded payment, otherwise it sets `maxFeesPerGas` to the dApp's explicit value or the node's current minimum fees and leaves the other gas settings untouched. Its header says when the cap matters and warns against deleting it without checking a real dApp on an embedded fee path.
- Unit tests for the three branches in `embedded-fpc-cap.test.ts`, which the end-to-end fee tests could not provide because they accept both success and error.
- The enum rename across the wallet, with no re-export left.
- The first-transaction normaliser was not built; the orchestrator's comment records why.

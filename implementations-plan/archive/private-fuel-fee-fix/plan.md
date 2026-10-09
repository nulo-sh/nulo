# Private fuel claim fee fix

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The embedded fee strategy reuses the fee cap it already committed instead of refetching it after simulation, in `apps/extension/src/wallet/services/execution/fee/fee-strategy.ts`, while the bridge-side fee cap derivation and fuel floor calibration belong to the bridge code, which lives in the `alejoamiras/unleashed` repository.
- **Open items**: An embedded fee payment with no `maxFeesPerGas` commits an unpadded cap, tracked in #118.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

The private fuel claim, which bundles a claim and a fee-payer mint with an upfront budget assertion, reverted on the budget check. The fix is in the wallet and the bridge's numbers, not in the fee-payer contract. Headroom goes into the committed `maxFeesPerGas` of the fuel claim only, taken from the node's predicted worst-case minimum fee, and the same cap is pinned through finalization.

## Why

Two separate failures hide behind one symptom, and they need different mitigations.

- **Budget failure**: the bridged amount is below the committed ceiling (gas limit times committed fee cap), and the contract asserts the amount covers it. The cure is a bridged amount at or above the headroomed ceiling.
- **Inclusion rejection**: the committed cap is below the live minimum fee at execution, and the proving window is far longer than the fee oracle's lag. A bigger bridged amount cannot fix it; only headroom in the committed cap can.

The public path works only because it is a single cheaper call with no budget gate. The general embedded cap stays at 1.0 times the current minimum, since other dApps budget against it, so the headroom is scoped to the claim that passes explicit fees. The wallet had a second flaw: finalization refetched and overwrote the already capped fee, so the budget was reasoned against a different number than the one committed.

## What shipped

- **Wallet**: for an embedded fee payment with no explicit cap, finalization reuses the cap already on the request. An explicit cap is committed verbatim, and non-embedded payments keep the general 1.5 times default. Three parity cases pin the three branches.
- **Calibration**: the private fee-payer claim was exercised live three times against the testnet, with gas limit, committed cap, fee limit and actual fee logged separately. The fuel floor in the bridge's manifests was set to about twice the worst observed fee limit, replacing an older guess.
- Reframed gate: no embedded fee-payer settlement test runs in CI, because it needs the whole bridge stack on the local sandbox. The live settlements stood in as proof, and a CI settlement test was not built.
- Deferred: the public fee-juice-with-claim payment commits the same 1.0 times cap and carries the same latent inclusion risk. It is not shown to be safe.

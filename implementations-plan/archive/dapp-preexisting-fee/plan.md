# A dApp-named preexisting Fee Juice payer

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: payload-based fee classification in `packages/wallet-bridge/src/fee-payer.ts` and `apps/extension/src/wallet/services/execution/utils/fee-detection.ts`, a locked fee card in `apps/extension/src/popup/components/modules/send/FeeSettingsCard.vue`, and the `getWalletFeatures` probe in `packages/wallet-bridge/src/wallet-features.ts`. The bridge-side use of it lives in the `alejoamiras/unleashed` repository.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Let a dApp transaction name the account itself as fee payer with no fee call ("pay from the Fee Juice I already hold") and have the wallet route it, instead of the app working around the wallet. The verdict is derived from the payload the wallet itself parses, never from a dApp-supplied flag:

- Sender-paid with the Fee Juice claim as the first call is the existing claim-with-fee mode.
- Sender-paid with no fee call is a new requested self-pay, carried as its own `requestedPayment` field and never as an embedded payment, since the payload carries nothing.
- Any other payer is a fee paymaster, and no payer falls to the user's fee card.

A self-pay is drafted with no settings and runs the native Fee Juice strategy, so estimation, padding, the balance check, authwit discovery and the signed-request reuse cache are unchanged. It always confirms in the popup, and the fee card shows the app's method locked, with no selector, so a dApp can never steer the user to a sponsor. A static `getWalletFeatures` RPC lets a dApp ask first; an older wallet rejects the unknown method and the dApp falls back, and the client treats an absent answer as unsupported.

## Why

The old classifier took any sender-paid payload as claim-with-fee. That entrypoint mode sets the payer but only the Fee Juice contract's claim call ends setup, so a payload without that call never left setup and was invalid. An account holding only public Fee Juice therefore could not claim a token-only bridge, and the bridge's rule was that no path leans on a sponsor. The wallet SDK's own wallet already treats the absent payer as preexisting, so only the Nulo wallet shape needed its own payload wrapper.

## What shipped

- A classifier that identifies the claim by the Fee Juice contract's address and pinned selector, requires it to be the first call with the payer as its first argument, non-static and with a visible sender. A name alone is never trusted: a call named like the claim, a claim after other calls, or a claim crediting another account would otherwise run dApp calls in non-revertible setup on the account's Fee Juice.
- A locked fee card that asks the store for a fresh gas-balance read on mount, because a dApp locks the method exactly when the balance just moved and a cached zero would keep Confirm off.
- The `getWalletFeatures` method added through the schema patch with a dispatcher handler, needing no grant because it reveals only a static feature list.
- `tx-sendTx-selfPay.test.ts`, which names the account as payer with no fee call and checks that it lands paid from the account's public Fee Juice with a locked fee row, no "set by the app" badge and no picker.
- A bridge-side own-gas-source decision that uses the public balance when the wallet advertises the feature, a private record preferring its private balance.

## Lessons

### Classify

Classify a dApp call by contract address, selector and arguments, never by the name the dApp wrote, since the entrypoint commits target, selector and flags and the name is free text. Check position and recipient as well: a genuine claim in the wrong place or for another account is still an attack.

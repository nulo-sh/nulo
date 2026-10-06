# Contract address case in the grant check

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: One field-address key (`packages/wallet-bridge/src/field-address.ts`) sits behind every grant-to-call contract comparison in `packages/wallet-bridge/src/method-scope-checkers.ts` and `packages/wallet-bridge/src/dispatcher.ts`, and behind the permission window's Details table (`apps/extension/src/popup/windows/capabilities/details-table.ts`).
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

A wave plan of the ux-feedback follow-ups (see [ux-feedback](../ux-feedback/plan.md)), taken at the middle tier because an authorization check widens. Every listed-contract, class-id and event-contract comparison between a grant and a call compares the 32-byte value through one function that the Details table also keys by. A listed contract authorizes calls to that contract in any case and to no other.

Out of scope: account-side comparisons, fee routing, validating a call target before a wildcard scope returns, the stored form of a grant, and the window's copy and layout.

## Why

The scope check compared addresses as exact strings, so a scope listing `0xABCD...` refused every call to `0xabcd...`, the same contract. The Details table merged the two spellings into one row, so the window could show an operation that the check then refused. The refusal reached the dApp as the wallet's generic unclassified error.

Normalising both sides changes what the check allows, so it needed its own change and its own audit rather than riding along with the window work.

## What shipped

- **The key.** `isFieldAddress` (moved from the dispatcher), `fieldAddressKey` and `sameFieldAddress`. A field address is `0x` plus 64 hex digits below the field modulus. Anything else (no prefix, `0X`, 63 or 65 digits, non-hex, longer strings, at or above the modulus) matches no listed address and never matches another invalid value.
- **Callers.** `matchesPattern`, `inAddressList`, the three re-prompt coverage functions and the create-authwit coverage check all use `sameFieldAddress`; wildcard scopes keep authorizing exactly what they did.
- **Nothing rewritten.** Stored grants and their MACs keep the spelling the dApp sent, so a grant saved in another case starts matching with no migration.
- **Details table.** Rows key a contract with `fieldAddressKey(contract) ?? contract.toLowerCase()`, so valid addresses merge exactly when the check matches and a malformed held value renders as before. A component test pins that parity.
- **Visible effect.** A request that differs from a held grant only in case opens no window, and a window for a mixed request lists only what is genuinely new.
- **Debug calls.** The three interpolating debug calls in `handleSendTx` were deleted, since the fix would have newly reached them.
- **Proof.** Failing-first tests for twelve method rows and the wildcard pins, the eleven scoped-grant network specs on Chrome and Firefox, and a new network test that passes a scope written in upper case.

## Lessons

### Normalise

Validate both sides before comparing normalised keys. `fieldAddressKey(a) === fieldAddressKey(b)` is true for two invalid values, since both keys are undefined, so `sameFieldAddress` returns false unless both sides keyed.

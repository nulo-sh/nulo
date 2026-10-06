# Wallet SDK implicit account grant

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: `getAccounts` on a session with no `accounts` grant now throws a typed `CapabilityNotGrantedError` (`packages/extension-messaging/src/errors.ts`, thrown in `packages/wallet-bridge/src/dispatcher.ts`) and reaches the dApp as an EIP-1193 4100 envelope built by `apps/extension/src/wallet/services/wallet-sdk/error-envelope.ts`. The capability delta for `accounts` now compares the granted fields, not only the type.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Do not grant accounts implicitly. When a dApp calls `getAccounts` before `requestCapabilities`, the wallet throws a structured `CapabilityNotGrantedError` instead of returning an empty list, with code 4100 ("unauthorized"), `data.walletErrorCode` of `CAPABILITY_NOT_GRANTED` and the stable message `accounts capability not granted. Call requestCapabilities() first.` The message is a contract for dApps that match on it, and a test pins its exact wording.

The same change closes a separate hole. The delta filter in `handleRequestCapabilities` compared capabilities by type only, so a dApp holding `accounts` with `canGet` could silently upgrade to `canCreateAuthWit` by asking again. It now compares the field shape, and the granted-capability response is built from the stored grant rather than from what was requested, so the wire cannot misreport what was granted.

## Why

Two third-party dApps called `getAccounts` first, got an empty list, and treated it as "no account". An earlier design granted accounts lazily to get past that screen. It was rejected, because the dApp's next step is a transaction, which the capability check rightly refuses when only accounts was granted, so the failure only moved one click deeper. The wallet SDK's documented flow is capabilities first.

A throw makes a dApp with a fallback send its full capability manifest, so one popup grants everything it needs. It also needs no new schema field, no timeout state, no popup change and no protocol extension. A well-behaved dApp is unaffected, since it already requests capabilities first. The 4100 code was chosen because "method not supported" would be false and the connection-state codes mean something else.

## What shipped

- A dApp-side SDK wraps a wallet error object in a plain `Error` whose message is the JSON-stringified envelope, so there is no `code` property. dApps that want to discriminate parse the message; the recipe is in `packages/wallet-bridge/README.md`, and a bare `catch` already triggers a typical fallback.
- The envelope writer was extracted from the background handler into a pure helper with its own tests (`error-envelope.test.ts`); the dispatcher logs the pre-grant call at debug, since a connected dApp polls.
- `apps/extension/tests/e2e/network/meta-getAccounts-pregrant.test.ts` flipped from asserting an empty list to asserting the typed refusal.
- Field-aware comparison for the other capability types was out of scope for this change.

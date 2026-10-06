# Account widening and the readiness test cells

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: wallet-side session widening in `packages/wallet-bridge/src/dispatcher.ts`, `packages/wallet-bridge/src/services-contract.ts` and `apps/extension/src/wallet/services/dapp-session/service.ts`, a locked account row in `apps/extension/src/popup/windows/capabilities/AccountSelectRow.vue`, and the e2e specs `apps/extension/tests/e2e/network/cap-widening.test.ts` and `apps/extension/tests/e2e/network/account-switch-live-session.test.ts`. The tools-app half lives in the `alejoamiras/unleashed` repository.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Ship a feature that existed on neither side: a dApp session granted some of a wallet's accounts can be widened to a new one without forgetting the app. Both halves use `requestCapabilities` and `getAccounts` as the wallet SDK ships them, with no SDK patch. Alongside it, add the test cells that stood between the suites and production evidence for multi-account use.

Wallet rules:

- A repeat `accounts` request opens the capability popup when the session does not cover every visible account on its chain. Membership is chain-scoped and computed from the profile's visible accounts minus the session's entries for that chain.
- Already-granted accounts arrive as wallet-derived `grantedAccounts`, shown pre-selected and locked; the new ones start unchecked.
- A widening never revokes. Membership-only approval adds only the new addresses and leaves the stored flags and aliases alone; a request that also changes flags goes through the existing replacement path with the held rows kept; a decline leaves the old grant exactly as it was.
- The decision carries `requiresGrant`, checked inside the session service's lock, so a grant revoked while the popup was open makes the decision fail without writing anything and without recreating the grant.

Tools-app side: an add-accounts action in the account switcher and a re-read of accounts when the page becomes visible again.

## Why

Without widening, a session was either all-or-nothing or the app had to be forgotten and reconnected, losing its aliases and flags. The revocation race is closed where the lock is, because the dispatcher cannot check inside the service's private lock.

Separately, three bridge recovery fixes (a claim consumed by another submitter, a deposit whose Ethereum wallet never answered, an exit that lost its transaction id) were scoped in and then deferred. Each turned out to be a design problem, not a small change: a correct consumed-claim proof needs the token message's own nullifier, not a re-run of the fee-bearing claim build; reconciling a deposit by event is unsafe because the router's events carry no token or portal identity; and an exit's identity cannot be established from a hash alone. The cells assert what the product does today, so those behaviors stay pinned and visible.

## What shipped

- The widening planner in the dispatcher, an exported pure `ungrantedAccounts` helper, the `grantedAccounts` popup parameter, and the `requiresGrant` precondition throwing the existing capability-not-granted error.
- A locked account row: pre-selected, `aria-disabled`, out of the tab order, with click, Enter and Space ignored, and an approve gate that accepts an approval adding nothing when only flags change.
- An e2e that widens a session, keeps the held row and its alias intact, then declines a third account and finds the grant unchanged.
- An e2e that switches the active account under a live session and confirms a send from the first account is executed by it, by balances, plus a second-account send in the multi-account spec.

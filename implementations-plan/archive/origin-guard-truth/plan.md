# Origin guard truth

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the documented and pinned origin-guard behavior in `apps/extension/src/wallet/services/wallet-sdk/tab-lifecycle.ts`, `apps/extension/src/wallet/services/wallet-sdk/tab-lifecycle.test.ts` and `apps/extension/tests/e2e/network/session-tabNavigate.test.ts`, and the removal of `getTokenInterface` from the token service.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Settle empirically whether the cross-origin session guard on tab navigation is live, document the answer, pin it with a two-sided test, and change no manifest. Separately delete the token RPC `getTokenInterface`, which had no production caller.

## Why

The guard reads the new URL from the tab-update event, and that URL is only delivered when the extension has the `tabs` permission or an explicit host grant. The manifest declares no `tabs` permission. A first test assumed content-script match patterns also expose the URL; it failed on every retry, so that inference was wrong. Chromium withholds the URL for any host the extension has not been explicitly granted, whatever its content scripts match.

So the guard's cross-origin branch only runs when the destination matches an explicit grant. That is bookkeeping and reconnect UX, not a security boundary, because a navigation destroys both message ports and the session keys are lost. The session id is also not secret from the page, since the page generates the request id the background adopts, so the header comment states the boundary as realm teardown, not id secrecy. Making the guard live for every origin needs the `tabs` permission, a store-visible warning for a hygiene feature, so it was left off.

## What shipped

- A header on `tab-lifecycle.ts` stating the visibility rule and classification.
- A two-sided pin: one leg navigates to a granted origin and asserts the URL arrives, the other to an ungranted origin and asserts no event satisfies the guard's own predicate. A manifest grant change reds a leg and flags the doc for update.
- The existing navigation test previously went to a blank page, where the URL is withheld, so it passed for the wrong reason. It now navigates to a granted origin so the guard branch runs.
- `getTokenInterface` removed from the service, spec and client together; the exhaustive passthrough typing makes a stale entry fail to compile.

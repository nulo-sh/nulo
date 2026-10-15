# dApp grants

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: A typed scope-refusal class (`packages/wallet-bridge/src/scope-violation.ts`, `packages/extension-messaging/src/errors.ts`), one frozen dApp-facing refusal envelope (`apps/extension/src/wallet/services/wallet-sdk/error-envelope.ts`, documented in `packages/wallet-bridge/README.md`), a `scope_refused` journal outcome (`apps/extension/src/wallet/services/wallet-sdk/queued-journal.ts`, `apps/extension/src/utils/journal-state.ts`) and a capability answer that reports the stored grant, covered by `apps/extension/tests/e2e/network/scope-refusal.test.ts`.
- **Open items**: honest labels for failures other than scope refusals before a dApp send is claimed (#83) and a way for a dApp to widen a contract-classes grant (#84); one more is tracked privately: GHSA-gmg4-4ccr-fr65.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Make a refused dApp request tell no one more than it must, in three parts:

1. **Fixed text.** Every scope refusal the grant check throws is one typed error class whose message is a fixed string naming the method and the scope field, never a request value. The message type is a template-literal union, so a string carrying an address, id or call does not type-check at any throw site.
2. **One envelope.** Every scope refusal the grant check throws answers the dApp with the same classified response: code 4100, a constant message and a `SCOPE_VIOLATION` wallet error code. The refusal of a raw-hash authwit stays an unclassified plain error, because no grant could admit it and a classification would tell the dApp that asking again helps.
3. **Truthful journal and capability answer.** A refused send is recorded as not allowed, and a capability request is answered with the grant the wallet stored and enforces.

Scope refusals are logged at debug level.

## Why

The refusal messages used to interpolate the request's addresses, ids and calls, and a refused send stored that message in its journal row, where the developer-mode view and exported logs would show it. For the refusals the grant check throws, a fixed text removes the value from every sink at once: message, stack, log line, journal error and dApp response.

The journal row read "Popup closed early" for a send that never opened a window, which was false; the card now says "Not allowed" with the sentence "The app asked for more than you allowed. Nothing was sent." The classification lets an honest dApp tell a permission refusal from a downstream failure and re-request permissions. A connected dApp polls, and an error-level line lands in every user's log buffer with every toggle off, so refusals log at debug.

The capability answer echoed the request for transaction, simulation, contracts and contract-classes types, so a covered request was answered with the request rather than the grant, and a wider contract-classes request that opens no window was answered as granted while enforcement refused the extra classes.

## What shipped

- **Class and texts.** `ScopeViolationError` sits beside the capability-not-granted error and survives the popup boundary as its class. The refusal texts keep the `Scope violation:` prefix and the phrases existing tests match.
- **Sinks.** The journal row fails with kind `scope_refused`, and its page, its card in History and on Home carry the new copy. The log viewer shows a refusal only with debug mode on.
- **Envelope.** One arm in the error envelope returns the frozen constant; the wallet-internal text is never the dApp text, which is a public contract. The bridge README documents the shape.
- **Capability answer.** The enrichment step answers every known type from the stored grant, falling back to the request only where nothing is stored.
- **Tests.** Each phase has a case that fails on the previous behaviour, with regression controls named, plus the network e2e on both browsers.
- Three screens changed (journal detail, the activity cards, the log viewer) and one dApp-facing response; each was a recorded product decision.

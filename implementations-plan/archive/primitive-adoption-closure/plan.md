# Primitive adoption closure

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the alarm, restore and id-allocation primitives are adopted where the swap is byte-identical: `apps/extension/src/wallet/services/operation-journal/reaper.ts`, `apps/extension/src/wallet/services/profile/session-manager.ts`, `apps/extension/src/wallet/services/price/service.ts`, `apps/extension/src/wallet/services/token-balance/service.ts` and the id allocators in the token-balance and profile repositories and the operation-journal service.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

A zero-behavior-change arc: adopt `AlarmDispatcher` (`packages/wallet-core/src/utils/alarm-dispatcher.ts`) and the shared `restoreRows` and id-allocator helpers only where the existing code was already byte-identical to the helper, and record every other candidate as rejected with its reason. Every existing test stays green unmodified as a characterization pin.

## Why

A quality arc may not change observable behavior, and a helper must not grow a capability to serve one site. Several candidates only looked like duplicates. A reviewer objected that an extracted async helper adds a promise-reaction checkpoint versus awaiting directly; the objection was withdrawn because nothing here depends on tick counts around browser port promises (ordering comes from locks and fences) and the zero-delta bar was met.

## What shipped

- The operation-journal reaper adopts the full alarm ritual (listen, create, stop), keeping the boot cutoff captured first, the subscribe-create-sweep order, and the distinct boot-sweep arguments.
- The session manager and the price service adopt only create and clear. The session listener needs the alarm's scheduled time, which the dispatcher's tick does not surface, and routing it through `listen` would turn an unhandled rejection into a logged one. Price dispatch stays the module-scope shim in `apps/extension/src/wallet/index.ts`, because a wake-triggering alarm only reaches listeners registered synchronously.
- A hand-rolled restore loop in the token-balance service and three id-allocation loops (balance repository, profile repository, journal service) moved to the shared helpers.
- Rejected, with reasons: the network and config restores (an untrusted-input signature and a skip outcome the helper cannot model), task and passkey id loops (async adoption would ripple into sync signatures), auth-registry max-id (a real divergence in which rows count), and the popup Enter handlers (adopting the submit-key helper would narrow behavior, so it is a recommendation, not a refactor).

# Service-worker boot and wallet protocol decomposition

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Behaviour-preserving splits of the service-worker boot (`apps/extension/src/wallet/runtime.ts`), the dApp dispatcher (`packages/wallet-bridge/src/dispatcher.ts`), the wallet-SDK handler (`apps/extension/src/wallet/services/wallet-sdk/background.ts`), the schema patch (`packages/wallet-sdk-schema-patch/src/apply.ts`) and the execute window (`apps/extension/src/popup/windows/execute/index.vue`), with pins such as `apps/extension/src/wallet/runtime.post-start.pins.test.ts` and `packages/wallet-bridge/src/dispatcher.route.pins.test.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Burn the complexity suppressions on the boot sequence and the wallet protocol path with two changes: the service-worker boot first, then the dispatcher, the SDK handler, the schema patch and the execute window. Cuts follow one toolkit: synchronous guard-ladder helpers, tail returns, and an awaited helper only where it replaces a span that already awaited. A span that registers a resource immediately after creating it (construct then `start()`, capture then `services.start()`, write then emit) never gains an extra hop.

## Why

The boot is a flat sequence with a few sharp fences, and moving code across them changes behaviour in ways unit tests do not see:

- The journal boot cutoff must be the statement immediately before `services.start()`, because RPC handlers go live inside it.
- The retry-safe flag must be cleared between the config and prover setup and the first service registration, where vetoable failures end.
- The journal reaper and collector are each constructed and armed with nothing awaited between.
- The heartbeat is the last synchronous action of start-up, since liveness means fully wired.

The dApp-visible error contract (unsupported method, invalid arguments, capability not granted) was already pinned in the dispatcher tests, so the work protected ordering rather than messages. Timing-sensitive `chrome.*` listeners live at module scope in `apps/extension/src/wallet/index.ts`, outside the split.

## What shipped

- **Boot.** Migration-gate evaluation, the migration engine call, outcome classification and persistence, service registration and the post-start arming sequence became named helpers. The retry veto for a blocked migration is applied before the awaited status write, so a rejected write still vetoes in-lifetime retry. Post-start work (deletion resume, reaper, collector, storage probe) is one helper with zero awaits.
- **Dispatcher.** Routing returns the handler's exact promise rather than awaiting it, pinned by identity so rejection timing is untouched. Capability negotiation splits into pure delta computation, a persist-rejection-on-popup-failure helper and one atomic decision write that stays in the caller.
- **SDK handler.** Callback wiring moved to module-level factories installed in the same order with one `initialize()` last. Discovery keeps its popup lifecycle, dedupe registration and cleanup as one unit; the existing-session lookup stays in the caller.
- **Schema patch and execute window.** Three copy-pasted verify-or-patch blocks became one helper with the three mismatch messages verbatim. The execute window's operation resolution takes the transient clients explicitly, and its `finally` still disconnects them.

## Lessons

- **Veto before persist.** A same-lifetime retry veto must precede any awaited write whose rejection would otherwise leave the veto unset.
- **A second condition for awaited helpers.** Replacing an awaited span keeps the await count but can add a microtask before a register-immediately step. Review caught the existing-session lookup wrapped in a helper: a concurrent discovery could resume after the first popup's cleanup and open a second popup. The lookup stays in `handleDiscovery`.
- **Late-binding holders.** Hoisting callbacks out of a constructor needs an explicit holder read at call time where they referenced variables assigned after construction.
- **Own what you connect.** Helpers take the clients their caller owns and disconnects; they never construct or disconnect them.

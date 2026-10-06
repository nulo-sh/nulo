# Composition-root pilot

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Two leaf extractions out of the god-inits, `buildFeeStrategies` in `apps/extension/src/wallet/services/execution/fee/build-fee-strategies.ts` and `wireTabLifecycle` in `apps/extension/src/wallet/services/wallet-sdk/tab-lifecycle.ts`, with the pins that cover them in `apps/extension/src/wallet/services/execution/service.composition.test.ts` and `apps/extension/src/wallet/services/wallet-sdk/tab-lifecycle.test.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Extract exactly two low-risk pieces from the two large initializers, with characterization pins first and zero behavior change, then stop and write down what the pilot does and does not prove. Decomposing the wallet-sdk handler's initializer or the rest of the execution service's `init()` stayed out of scope without sign-off.

- The fee-strategy map becomes a module-level builder that takes a typed dependency record and returns the map. The caller assigns `this.feeStrategies`, so the builder never writes through `this`. The dependency literal, including the lazy closure over the coordinator, stays in `init()` verbatim, and the map keys stay literal so a kind and slot mismatch fails a test.
- The tab-close and cross-origin-navigation wiring moves behind a structural dependency interface, registered at the same position before the handler initializes.

## Why

The remediation work named two god-inits as a quality problem. Nobody knew whether decomposing them was mechanically safe, so a pilot on the lowest-risk pieces was cheaper than a decomposition that might change capture order. The tab piece was included on its merit: a pilot touching only the fee map says nothing about the closure-root shape of the handler's initializer, and the extraction turns an e2e-only safety net into unit pins.

## What shipped

- **Pins before extraction.** Nothing in the repo pinned `feeStrategies`: the reuse fast paths bypass the dispatch, so an `init()` that never assigned the field passed every unit and integration test. The new composition pins check the initialized map's four kind-to-strategy pairs through the real `init()`, that an unknown kind throws "Invalid fee payment method", and that dispatch reaches the initialized strategy with a clone of the operation and actions.
- **Tab pins.** Six unit pins cover single listener registration per tabs event, tab close, a same-origin navigation (no terminate), a cross-origin navigation for the matching tab only, non-loading and URL-less updates as no-ops, and a malformed URL falling back to the tab-close path.
- **Findings.** Leaf builders with caller-owned assignment are safe when dependency-complete. The sharpest finding was the missing pin, not coupling. Parameterizing a `= null!` field buys greppability, not type safety. Doc citations by line number rot, so the two tab e2e specs now cite by symbol.
- **What the pilot cannot prove.** The forward-referencing eager fields, the handler's shared mutable state and the remaining asserted fields were avoided by design and stay unassessed.
- **Recommendation.** Any continuation maps the dependency graph first (eager capture against invocation-time capture) and then picks a representation that makes invalid states unrepresentable, leaf by leaf with a pin per piece. Stopping here is a valid outcome.

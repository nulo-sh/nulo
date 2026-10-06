# Single async-memo helper for the PXE caches

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: one shared helper in `packages/aztec-runtime/src/pxe/async-memo.ts` (tests in `packages/aztec-runtime/src/pxe/async-memo.test.ts`), used by `note-schemas.ts`, `public-events.ts`, `artifact-catalog.ts`, `artifact-registry.ts` and `service.ts` in the same directory.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Replace six hand-rolled "cache a promise, clear it on rejection" caches with two small helpers in the PXE directory: `memoizeAsync` for a singleton and `memoizeAsyncBy` for a keyed cache. The keyed one takes an injectable store, so a `Map` is the default and a `WeakMap` can be passed where the key is a live object. The change is meant to alter no behavior.

## Why

The six copies had drifted: only one of them guarded its rejection handler, so a stale rejection could in principle clear a newer in-flight retry. Writing the guard once removes the divergence. The reset paths have no production caller in the repository today, so applying the guard everywhere only tightens code that nothing in production exercises.

The helper lives next to its consumers rather than in a lower package, because a second package would be the first reason to generalize it. It has no `peek()` accessor, because no consumer needs one.

## What shipped

- `memoizeAsync` and `memoizeAsyncBy` with the clear-on-rejection rule and its identity guard in one place. `reset()` clears unconditionally, and the keyed reset is per key only, since an injected `WeakMap` cannot be enumerated.
- The per-PXE cache in `service.ts` keeps its `WeakMap`, so a torn-down PXE is still not pinned in memory by its cached promise.
- The store type is structural (`set` returns `unknown`). Typing it as a slice of `Map` fails for `WeakMap`, whose `set` returns `this`.
- The catalog's test reset still clears the whole map, which the per-key reset cannot do, so that site injects its own `Map` and clears it directly.
- `artifact-registry.ts` is not a pure promise cache: its loader fills a `known` set that other methods read synchronously. It keeps that field and its synchronous fast path, and only the promise slot moved into the helper. A load that finishes after a concurrent `clear()` still repopulates the set, as before.
- The catalog, public-events and service façades stay non-async and return the memo's promise directly, because tests pin promise identity.

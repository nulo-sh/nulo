# Fix state fences

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: In-memory generation, epoch and identity fences on five async commit sites, each pinned by a test that fails against the pre-fix code, plus one finding recorded as not reproducible and pinned by a test with no code change. Live in `apps/extension/src/wallet/services/token-balance/`, `apps/extension/src/wallet/services/incoming-transfer/service.ts`, `apps/extension/src/wallet/services/price/service.ts` and `apps/extension/src/stores/activity.store.ts`; the pin for the sixth is in `apps/extension/src/stores/balances.store.test.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Six findings shared one root cause: an async operation captured state before a transition (profile switch, chain purge, transaction settle, kill-switch toggle, LRU eviction) and committed after it with no check that the world was unchanged. Each is fixed per site, in the idiom the file already uses, with no shared "capture, await, commit if current" utility. Each fix had a failing repro first; a repro that cannot go red after honest effort becomes a documented non-finding with no code change.

## Why

The sites cross the service-worker and Vue-store layers and want different shapes: a generation counter, a sequence marker, a local identity, a monotonic map. Some reused state that already existed in the file, such as the incoming-transfer service's own epoch and the activity store's mutation versions. A cross-layer abstraction would have added indirection over a handful of short guards. These are correctness fixes with no fund-movement path, no new trust boundary and no persisted shape, but the cross-profile one could show one profile's balances in another's session.

## What shipped

- **Balance queue.** A stale task id after a profile switch used to throw outside the queue's try/finally and jam that balance's sync permanently. A non-throwing task lookup mints a fresh task, cleanup deletes only entries the batch owns, and a profile switch resets the queue.
- **Token ownership map.** A generation captured before the rebuild await gates the commit on both generation and active profile id; the map is still cleared synchronously at entry, and the token add, update and account add tails fence every post-await mutation.
- **Incoming-transfer schedulers.** Hydration builds descriptors off-map and installs them in one epoch-checked commit; a token add does a full rebuild from the live token set, because an incremental install was shown to lose concurrent adds.
- **Price refresh.** Single-flight promise and abort controller are cleared only by the invocation that owns them, the timeout aborts its local controller, post-await counters are generation-checked, and config transitions are serialised.
- **Activity store.** Slices with an unresolved awaiting placeholder are exempt from eviction, and mutation versions come from a store-lifetime strictly increasing sequence that eviction never resets, with an incarnation counter advanced by every clear.
- **Not reproducible.** A forced gas refresh being overwritten by an older fetch is impossible: both runs share one timeout and the older fetch started first, so its own timeout fires before the forced wait can clear its marker. A permanent test pins that the guard holds; no code changed.

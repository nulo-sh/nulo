# Quality dedup adoption

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Structural duplicate-code families folded into shared helpers with no behavior change. Live in `apps/extension/src/composables/usePopupEntity.ts`, `packages/wallet-core/src/utils/keyed-lock.ts`, `apps/extension/src/wallet/services/restore-rows.ts`, `apps/extension/src/wallet/services/id-allocators.ts`, `apps/extension/src/wallet/services/dapp-session/service.ts`, `apps/extension/src/wallet/services/execution/estimate-reuse-shared.ts` and `apps/extension/src/popup/windows/`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Adopt existing extractions where they were half-adopted, and add a new abstraction only where at least three call sites benefit, or where it also fixes a real divergence. Every extraction is zero-delta: pre-existing quirks are preserved verbatim and pinned, never fixed inside a refactor. Riskier or lower-value parts were split off as deliberate non-extractions.

## Why

Duplication is the most consistent sign of generated-code decay, but a refactor that quietly changes behavior is worse than the duplicate. The zero-delta rule is what kept the audit loop honest: a dropped no-op `finally` in the per-tuple serializer looked like cleanup but would have changed unhandled-rejection behavior, so it was preserved during the extraction rather than fixed inside a refactor.

## What shipped

- **Popup submit key.** One pure `isPopupSubmitKey` predicate, exported from `usePopupEntity.ts`, replaced the Enter handlers the five form popups had each hand-copied. Popups with a different, unguarded Enter behavior were left alone.
- **Restore rows and ids.** The auth-registry, account and transaction restores adopt `restoreRows`; the two restores that cannot express their skip or non-object rows do not. `preferOrReallocId` replaces the prefer-source-id-then-reroll loop in the contact service, and the dapp-session service uses the existing `nextRandomId`.
- **Keyed locks.** `KeyedLock` generalizes the keyed promise chain already proven in the activity-protocol coordinator and serves it, the per-tuple account serializer and the decrypt queues. Its watchdog is opt-out, so users that had none keep none. The session queue stays separate, since its early-release baton and arrival-time journal creation are not a plain FIFO.
- **Session patching.** A private `patchSession(id, mutate)` replaces the lock, get, throw, mutate, set, emit sequence in the dapp-session setters, keeping `return await` so async stacks survive.
- **Estimate reuse.** The transfer and operation estimate caches share a single-shot TTL store and a pending-set equality helper; their validators and rejection-reason order stay per caller, pinned by their own tests.
- **Approval footer.** `DappApprovalFooter` serves the execute, discover and capabilities windows with every test id preserved.
- **Deliberately not extracted.** The token interface unrolling, the two token add paths, the endpoint write preamble, and a shared frame for the two blocking barriers, whose different staleness guards must not be merged.

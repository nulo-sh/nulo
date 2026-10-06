# Capture, await, write sweep

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: thirteen fixes with a discriminating regression pin each, across `apps/extension/src/wallet/services/` (network, contact, fpc, dapp-session, token, token-balance, incoming-transfer, account, config, window-manager, execution, pxe, profile) and `packages/aztec-runtime/src/pxe/`, plus the `accept` scope predicate in `apps/extension/src/composables/useEntityCrud.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Hunt one recurring racy shape in code that earlier audits had not flagged: read shared state into a local, cross an `await`, then write based on the stale local. This was a pattern hunt, not a re-audit; the earlier fence work supplied the vocabulary. The deliverable was a complete triage table with a verdict for every candidate and no silent drops, plus a fix for every confirmed site using the nearest existing fence idiom, never a new one.

- Enumeration ran in three passes: a function-level read of every in-scope file, a lens on closures, listeners and fire-and-forget launches, and a re-screen of files the first census had scored as quiet. The messaging layer was added to scope because it holds cross-context request state.
- Each candidate was judged on whether the source state can change during the await, whether the write rechecks over the right field, and whether an existing fence guards it with the capture before the first await and every write branch covered.
- Safe verdicts carry proof obligations: a fence verdict names the idiom and checks capture order, a lock verdict has to survive the lock watchdog's force-release, and a no-mutator verdict needs a search trail. By-design last-write-wins rows are marked for explicit acceptance. Deferred residuals can never be relabeled safe, so no clean bill of health is unqualified.

## Why

The restore paths had been fenced with deletion epochs while the create paths in the same files were left bare, and one service's older arm had post-wait re-checks that its newer sibling lacked. Same-file asymmetry like that is a high-precision signal, so the sweep looked for siblings by construction rather than by finding.

Two things changed the table after independent review. Three candidates first judged safe were upgraded to confirmed. And the review of a fix itself found a lock-ordering hazard: making a sweep atomic by holding a lock would have inverted the order against a path that already held the other lock. The atomicity moved to the create side as a reservation that precedes every sweep.

## What shipped

- Create paths for networks, contacts, FPCs, dApp sessions and tokens capture an atomic deletion fence at the authorization point, assert it with no await before the write, and compensate by deleting the row if the write itself lost the race. Token and FPC creates also refuse a network that is being deleted.
- The incoming-transfer service re-checks its epoch after the awaits in its public-event commit, guards its class-gate cache write, and writes the balance outbox only when the row still exists and is unchanged.
- The orphan-store sweep rechecks liveness before each removal, so a re-imported profile's fresh store is not deleted.
- Config apply runs under the same lock as set. Account rename and visibility toggles serialize per account. The L1 chain id resolution reads once.
- The window manager compares handle identity rather than membership and removes a window created after its handle was lost.
- The profile client has an unsubscribe latch and a per-subscription sequence so an older snapshot cannot overwrite a newer one. The entity list composable can filter incremental payloads to the live scope.
- Token-balance deletion captures the profile generation like its sibling handlers, and the generation parameter is required by type.
- A dApp token registration carries the session's profile fence through to the write, so a profile switch during the dispatch cannot land one profile's approved token in another. The PXE read path asserts its generation at the rebind, and the PXE client revalidates the generation on recovery.
- The lock's `withLock` exposes whether the holder is still current, turning a documented limitation into a guard.

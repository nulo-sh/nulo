# Holdings loading states and incoming-scan health

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the seed-status surface in `apps/extension/src/wallet/services/token/`, outcome-based scan health in `apps/extension/src/wallet/services/incoming-transfer/scan-health.ts`, the `Skeleton` primitive in `packages/design/src/ui/Skeleton.vue`, and the popup pieces `apps/extension/src/composables/useSeedStatus.ts`, `apps/extension/src/composables/useIncomingSyncHealth.ts` and `apps/extension/src/popup/components/modules/general/TokenSeedRow.vue`.
- **Open items**: new incoming public transfers still wait on a from-zero history scan, tracked in #138.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Make the Home token list honest from the first second, drop the per-row "catching up" dot, and replace the block-lag indicator with an outcome-based health signal. Two small read models replace the popup's guesswork.

- **Seed status** (token service): which default tokens the chain should have and where each stands (pending, seeding, failed, rejected). Reads are pure; a latched `ensureSeeding` kicks recovery on mount and on every reconnect; `retrySeed` is fenced and reservation-guarded. Each default renders as an inert placeholder row with a compiled-in name and a skeleton amount; failed rows offer Retry, rejected ones read "Couldn't verify" with no button.
- **Scan health** (incoming-transfer service): each scan tick returns an outcome (progress, idle at tip, no progress, failed, ineligible). A failure episode lives in session storage and a calm "older incoming transfers may be missing" line with Retry appears after sustained failure.
- **Hero total**: skeleton for at most 12 seconds per scope, then the aggregate of known balances, or the unknown-value dash when no balance snapshot ever succeeded, never a false zero.

## Why

The empty state had no loading branch, seeding only ran on three triggers (none on popup open), and the lag dot measured block distance, which misreads a busy block or a multi-tick reconciliation as stuck. A snapshot that failed to load must never read as empty or zero, so each snapshot is loading, loaded or unavailable.

Rejected: seeding through a journal record per attempt (a failure row cannot persist and the reaper fights it); a transient-versus-reorg classifier (any anchored throw still reconciles); and a scan-floor shortcut that skips history, which three designs each lost receipts under.

## What shipped

- The per-contract sync-state API and its indicator were deleted after their only consumer was removed.
- Token metadata is read in one batched view simulation.
- The stalled line is pinned at unit and component level, since a node outage is not deterministic in end-to-end runs.
- Every scan still starts at block zero and no history is skipped. Showing new receipts first, without skipping any, is the open follow-up.

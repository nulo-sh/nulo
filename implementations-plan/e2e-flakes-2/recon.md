# Recon: e2e-flakes-2 (#774)

Base: `dev` at 24c68cb4. One Explore agent (sonnet) swept the writers and the quiesce helpers; the
driver verified each load-bearing claim below against the tree. Paths are under `apps/extension/`.

## Reuse map

| Capability needed | Found | Verdict |
|---|---|---|
| A gap with no live writer | the spec's own second half: `page.close()`, `stopBackground`, reopen on `#/popup/auth` (`tests/e2e/network/balance-row-reconciliation.test.ts:57-64`); seed-then-stop prior art in `tests/e2e/token-list.test.ts:65-83` and `tests/e2e/type-roles.test.ts:515-535` | reuse as is: move the delete after the stop |
| A "balance queue idle" barrier | `waitForBalanceQueueIdle` (`tests/e2e/fixtures/journal.ts:348-362`) over `fixtures/balance-queue-trail.ts`; needs Developer Mode and Debug Mode, and its own doc says it cannot see a balance enqueued but not ticked, nor a refresh the transaction worker still owes | rejected: incomplete barrier (plan § Trade-offs) |
| A fenced delete of a balance row | `invalidateAndDelete` and the purges (`src/wallet/services/token-balance/service.ts`) reach no RPC; `TokenBalanceService` exposes only `getTokenBalance(s)` and `refreshTokenBalance` (`client.ts`) | none: adding one is a test-only product surface |
| Parking a projection | `fixtures/projection-gate.ts` (proverless builds only) parks the projector before `repo.get`, so it cannot hold the get-to-set window open | none for this race |

Absence trail: `tests/e2e` grepped for `storage\.local\.remove|stopBackground|drain|settle|idle|inFlight`; the only
balance-row raw delete under a live worker is this spec (other raw removes: `migration.test.ts:53`,
`legal-acceptance.test.ts:348`, both non-balance keys).

## Writers of `nulo:core:token-balances@*` (verified)

- `BalanceJobQueue.applyProjectedOk` (`src/wallet/services/token-balance/balance-job-queue.ts:348-392`):
  `repo.get(id)`, fences with no await, then `repo.set({...current, ...})`. A row absent at the get
  fails the task and is not recreated; a row present at the get is written back even if a raw
  remove lands between the get and the set. `writeSyncFailure` (`:208`) has the same shape.
- `EntityStorage.get` reads `chrome.storage.local` each call, no cache
  (`packages/wallet-core/src/storage/entity_storage.ts:182-186`, adapter
  `src/core/adapters/chrome-browser-api.ts:74`). So the stale window is the get-to-set round trip only.
- Service deletes are fenced (`isBalanceInvalidated`, `deleteIfInvalidated`); a raw
  `chrome.storage.local.remove` from a page is outside that contract. No production code removes
  balance rows that way.
- Enqueue sources live after the fixture: the import's projection, `onTokenUpdated` (`service.ts:500-513`),
  `onTransactionUpdated` for any tx still settling (`service.ts:607-624`), the incoming-transfer
  outbox (`requestBalanceRefresh`, `service.ts:234`), whose scheduler runs a forced poll at token add
  and then every 30 s (`src/wallet/services/incoming-transfer/service.ts:1104-1122`), and transient
  retries at +5 s (`balance-job-queue.ts`).
- Home's mount only reads balances (`TokensView.vue` `onMounted`); unlock refreshes rows older
  than 30 min (`src/utils/core.ts:170-196`) and `onActiveProfileChanged` runs
  `reconcileBalanceRows` (`service.ts:453-472`), which recreates a missing pair.
- A locked worker has no profile: `onActiveProfileChanged(undefined)` clears the token map and
  resets the queue (`service.ts:453-463`), so nothing projects until unlock.

## Collisions

- `.claude/skills/e2e-testing/SKILL.md`: onboarding-3 (#743, draft) appends flake-ledger row 57.
  This plan's ledger row waits for that merge (plan § Delivery).
- No other lane touches `tests/e2e/network/balance-row-reconciliation.test.ts`.

# fixes-1.2.0-1 phase 0: planning consults

## Reproduction (driver)

Two scratch tests added to `TokensView.test.ts` at `3b845ef02` ("old created, finished, new created, old deleted" and "old and new created, old finished"), run with `bun --bun vitest run … -t REPRO`: both failed at the lit assertion (`expected false to be true`). File reverted.

## Plan audit round 1, Codex (gpt-6.1-sol, high), session 01a1a28f

Verdict: changes-required. Findings and dispositions:
1. `useTokenBalanceSnapshot.onBalanceUpdated` replaces a listed row without `mapRow`, so a token metadata update during a refresh drops the row's flag (`token-balance/service.ts:529-533` emits, then `enqueue` coalesces): accepted, demonstrated by trace and a scratch TokensView test red at `3b845ef02`. Fixed in the composable (the update goes through `mapRow`, as the add and the snapshot do) instead of Codex's TokensView wrapper, which would patch the consumer around the composable's rule.
2. I1 overstated: a snapshot replaces the task list, so a create event that overtakes the read's answer is dropped: accepted as plausible but unverified (the service can post a create event in the microtask gap before the `getTasks` answer); I1 qualified; a closed known limit at close-out.
3. `TokenList` forwards the whole row; Holdings lacks the flag because it never decorates rows: accepted; F4, recon and trade-off B corrected.
4. `home-links.test.ts` asserts nothing about the dot, and e2e could reach the orders with a clock or seeding hook: accepted; F7, I2 and D3 narrowed. No new e2e.
Confirmed: T1 and T2 are distinct with valid success controls; D4 (a) open `bug`, D4 (b) closed `known-limit`.

## Plan audit round 2, Codex (resumed, same session)

Verdict: approve. No new material finding. It verified that `mapped(tb)` without a `mapRow` returns the row as received (other callers unchanged), that the raw update write predates the shared-handler extraction and documented preserved behaviour rather than an invariant, and that T1-T3 plus the composable test cover three distinct clearing paths with completion controls.

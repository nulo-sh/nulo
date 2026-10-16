# Phase 2: teardown stops retrying (#277), arc 2

- 2026-10-16: merged `origin/dev` at `8459699c` into the plan branch (`index.md` conflict: only this plan's line kept, dev had archived the other two).
- 2026-10-16: step 1, T4 on base (Chrome, retry 0): the reachable-node reset passes (10.8 s); the refused-node reset fails its 15 s purge wait with the tombstone still present. Red as required.
- 2026-10-16: T1 mutation checks: dropping the backoff predicate reds exactly the `retryWhile false` row (the call then sleeps 6 s); dropping the woken-attempt check reds exactly the stop-during-sleep row.
- 2026-10-16: existing `PxeService` tests that replace the registry with a partial object needed `stopRetries`; one of them (`clearChainState REJECTS when deleteDatabase errors`) would otherwise have passed on the resulting `TypeError`.
- 2026-10-16: the incoming read before the lock reordered the receipt matrix's pinned call logs (29 rows red). Codex consult (gpt-6.1-sol, high, session 01a14474, the `~/.codex` login): approve the own-send exclusion and the stale-epoch skip; one hole, a locked commit whose own-send read disagrees with the pre-lock one still reached the node; fixed with a cache-only lookup inside the lock (D-arc2-1), pinned by a test that fails when the lookup fetches.
- 2026-10-16: T3 (5 rows) and T8 fail on base copies of `pxe/service.ts`, `pxe/chain-runtime.ts` and `incoming-transfer/service.ts`; their controls pass on both.
- 2026-10-16: smoke `security-reset`, `passkey-backup`, `passkey-paths`, `settings-crud` at retry 0: Chrome 17/17 (94 s; T4 19.4 s against the 15 s estimate, fixture included), Firefox 17/17 (146 s; T4 22.2 s).
- 2026-10-16: the network run first refused to start: `incoming-arrival` is proverless-gated, and CI runs these specs proverless; rerun with `NULO_E2E_PROVERLESS=1`.
- 2026-10-16: network (proverless, `agent.sh`, retry 0), Chrome: `delete-after-prove`, `stale-network-reset`, `profile-reimport-matrix`, `incoming-transfers`, `incoming-arrival` 16/16 (611 s).
- 2026-10-16: review round 1. Codex (resumed 01a14474): conditional approve; FPC discovery's lock is a fifth wait on node I/O in the purge, pre-existing, filed as KL-5 (D5); two test comments tightened. Opus 5.5: conditional approve; a note without an amount still cost the pre-lock read on every scan, the gate now requires an amount, pinned by a test that fails without it. Fixes `2bb6f738`.
- 2026-10-16: review round 2 (Codex resumed): approve, no new finding; the loop converged in two rounds.

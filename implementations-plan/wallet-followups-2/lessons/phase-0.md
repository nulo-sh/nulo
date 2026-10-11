# Phase 0: planning log

Every consult and its verdict, in order. Failed consults are logged too.

## 2026-10-11: recon

- Two Explore agents (sonnet): one batched reuse sweep over the log sources, the service registry, the logs-window tests and `EventHandler`; one mapper over the balances store, the fee cards and their tests. Their findings, checked against the tree, are `recon.md`.
- Did not hold: #288's `imported-account-keys` is a backup slice key (`account/spec.ts:116`), not a registered service.
- Wider than filed: #288 also misses the two registered coordinators, the price service's own helper (`"PriceService"`), and about 18 non-service sources (OA-1).
- The archived wallet-followups plan said the conditional store rule for #291 "breaks D11, pinned at `balances.store.test.ts:387`". That pin subscribes no retry-capable subscriber, so the rule leaves it green; the fuzz control at `balances.store.fuzz.test.ts:650` is what pinned the consequence and changes with it.

## 2026-10-11: lessons curation measured

- Base 8,164 B. Shortening 20 entries whose evidence carries the detail, plus one stale count (`vue-tsc`: 150 of 207 SFCs today, not 149 of 205), gives 7,647 B with all 34 entries and every link kept.
- No retirement: each entry checked against the tree and the live docs (recon § Lessons file); every dead end is still reachable, and no live doc restates an entry whole.

## Dual audit, round 1

- Codex gpt-6.1-sol, high, read-only (session 01a12904-27c1-7a30-a4ac-71fef20ff2e6): reject with blocking findings (D4 rationale, drift pin, UI authorization, lossy lessons). Dispositions in plan.md § Audit verdicts. Lessons redone: 10 lossless edits, 7,870 B; the 7,647 B draft dropped the HandshakeRegistry sequence-index collision, the screenshot-state rule and "never skip required aggregators".
- Opus Plan agent (read-only, audited draft v1): conditional approve; 15 findings, dispositions in plan.md § Audit verdicts. Changed the plan: literal `LOG_SOURCES` rows (no imports, no constant moves), the scan checks the logged name, #291 reframed as a store-invariant fix (no production co-mount found), OA-2 filed, C1 reads status, fuzz owe rule keyed on any failed gas read (retry reads also pass `forceRefresh`). Rejected: retiring the never-skip entry (dead end still reachable).

## Final fresh pass

- Codex gpt-6.1-sol, high, read-only, new session 01a12917-5591-7583-a684-f4d820f50d5e: reject (D9 keyed on mock rejections; two lessons clauses; Phase 1 red proof). All five accepted; lessons now 7,926 B.
- Resume 1: reject (the per-op `fetching` → `degraded` rule owes before an ensure's observer adopts; a stranded-debt shape fails C1 on the fixed store). Accepted; D9 became the tx-settle `expectGasReady` set, status only.
- Resume 2: approve. No fixed-store counterexample; the pinned tape still fails the base store.
- Lesson for later planners: a fuzz owe rule must model the store's observers, not its failure commits; three tries at a failure-shaped rule each over- or under-owed.

## 2026-10-11: implementation, curation applied

Applied to `origin/dev`'s `lessons.md` (unchanged since 29d9e49), the ten edits of plan § Phase 0, nothing else. 8,164 → 7,926 B; every link kept (the link diff prints nothing); 10 lines changed.

1. `bun run --parallel` leg: "so `audit:vue` can exit 130" → "(exit 130)". The exit code stays; `audit:vue` is named in the evidence.
2. `bun run lint` cap: dropped ", so a new error can hide". It follows from "only the first 20".
3. `vue-tsc`: "(149 of the extension's 205)" → "(most of the extension's)". The count was stale (150 of 207 at 29d9e49) and would go stale again.
4. Never skip required aggregators: "(list runs, read the head, re-read per cancel)" → ", re-reading the head before each cancel". The re-read rule stays; the listing order is in the evidence and `CI.md` § Concurrency.
5. `PopupManager`: the same two rules (gate setup on `show` or `v-if`; reset held secrets on a profile-id change) in fewer words.
6. `EventHandler.invoke`: dropped "event-chained cleanup is fire-and-forget", which is what a dropped promise means.
7. Error message text: dropped ", never the message"; "log a fixed category" is the instead.
8. MAC binding: the three rules (key on the storage key, refuse never self-heal, check an artifact against the original class id) in one sentence.
9. `pgrep -f`: "so a teardown can kill itself" folded into "own"; the `$$`/`$PPID` and `signalCode` rules stay.
10. Puppeteer mobile emulation: the same check stated once.

No retirement (D1, D-orch-4): every dead end is still reachable. The orchestrator accepted the lossless 7,926 B and withdrew the 7 KiB target.

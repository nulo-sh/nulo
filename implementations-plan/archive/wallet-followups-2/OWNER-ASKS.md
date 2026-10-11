# wallet-followups-2: owner asks

The orchestrator's no-ask records (quoted in `plan.md` § UI impact) cover what arc-1 ships. OA-1 went past them; OA-2 asked the owner to confirm a reading of one. The orchestrator answered both before the arc was built (D-orch-2, D-orch-3).

## OA-1: log lines from sources that are not registered services

**Surface.** The logs window (Settings → Developer → Logs): its rows and its source filter.

**What happens today.** About 18 sources write log lines but have no row in the source filter. Their lines show when the window opens and vanish at the first rebuild (a filter change, Clear logs, a Debug-mode toggle); new ones never appear live. The CSV export keeps them. The sources: the price service's own helper (`"PriceService"`, `price/service.ts:39`: most of the price service's lines), `wallet-sdk-bg`, `SendCheck`, `JournalGC`, `JournalReaper`, `ContractResolver`, `TxRequestBuilder`, `batched-view-simulation`, `TokenSeeder`, `SessionManager`, `balance-job-queue`, `balance-projector`, `window-manager`, `background-ticker`, `offscreen-telemetry`, and a few helpers not yet traced (`rw-guard`, the public-event indexer). Separately, five rows match nothing that logs: Faucet, Faucet Client, RPC, RPC Client, Wallet Sdk Client.

**Options.**

- **(a) File each line under the service that owns it.** No new rows or labels. Lines from `PriceService` appear under Price; lines from `SendCheck`, `JournalGC` and `JournalReaper` appear under Operation Journal; `ContractResolver`, `TxRequestBuilder` and `batched-view-simulation` under Execution; `SessionManager` under Profile; `TokenSeeder` under Token; `wallet-sdk-bg` under Wallet Sdk; the worker-level ones (`window-manager`, `background-ticker`, …) under Wallet; the offscreen one under Pxe. The CSV source column changes the same way. A scan test keeps new sources from going unlisted.
- **(b) A row for each source.** New labels in the filter, for example "Send Check", "Journal GC", "Token Seeder", "Wallet Sdk Bg". The filter grows by about 18 rows.
- **(c) Show a source with no row, always.** No new rows; these lines stop vanishing, but no filter can hide them, and "select none" still shows them.
- **(d) As today.**

A second, independent question: remove the five rows that match nothing (Faucet, Faucet Client, RPC, RPC Client, Wallet Sdk Client), or keep them.

**Recommendation.** (a): the lines already belong to those services, the filter keeps its words, and the owner of a bug report reads one row per service. Remove the five dead rows.

**What ships now.** Arc-1 lists every registered service and keeps its lines (the #288 record). The sources above keep today's behaviour, and the five rows stay. The implementer opens one GitHub issue for this ask at delivery (dedupe first), labelled `owner-decision`, and names it in the PR body.

**Decided (D-orch-3).** (a), for the lines only: Phase 2b files every line under the service that owns it, with the ticker under Token Balance and telemetry under Pxe Client (D12). The five rows stay; their removal is #294 (`owner-decision`).

## OA-2: what the gas card shows while the fee card's gas retry runs

**Surface.** A balances key shared by the fee card (a `retry` subscriber) and the Home gas card (a `txRefresh` subscriber). No production surface mounts both today (`plan.md` I2); the shared-key composition test does, and the fix keeps the store right for any surface that will.

**What changes there.** After a failed refresh on transaction settle, the store now retries gas while the fee card is mounted (5 s, 10 s, 20 s, then every 30 s, until one read succeeds). The fee card's existing "Couldn't load fee data. Retrying in the background." becomes true. On the gas card each retry read shows the existing refresh dot over the dimmed figure, and the figure leaves its dimmed state when a read lands. A fee card re-commits on the fresh figure. Every one of these is a state the cards already show; no word or state is new.

**Options.**

- **(a) The store retries (what arc-1 ships).** The notice is true and clears by itself.
- **(b) The card stops claiming the retry.** The fee card shows the existing "Couldn't load fee data. Close and reopen to try again." when no retry is owed; the store and the gas card stay as today.

**Recommendation.** (a): it fixes the store's cause, and both auditors chose it over (b).

**What ships now.** (a), which the plan reads as inside the #291 record ("the existing states and words only"). If the orchestrator reads the refresh dot or the un-dim as past the record, it says so before the arc starts and the arc ships (b) instead.

**Decided (D-orch-2).** (a), the store retries; shipped in #296.

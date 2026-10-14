# e2e-followups-7 recon

One Explore agent (sonnet), read-only, against `origin/dev` e900f710. Line numbers are at that base.

## Reuse map

| Capability needed | Existing code | Verdict |
|---|---|---|
| Drive the finalized L2 tip past a block on the local network | `mineL1Blocks` (`anvil_mine` at `ANVIL_URL`) and `finalizeThrough(node, block, timeoutMs)`, file-local in `apps/extension/tests/e2e/network/failed-send-check.test.ts:166-187`; its only caller is `:368`. No shared copy: searched `anvil_mine`, `evm_mine`, `evm_increaseTime`, `finalized` across `tests/` | adapt: move both into `tests/e2e/fixtures/aztec.ts` (chain helpers, beside `waitForTxMined`), import back into failed-send-check |
| Read a wallet tx row and wait for a status | snack-placement's own `storedValue` + `waitFor` (`:222-234`, used at `:279-282`); failed-send-check's file-local `readTx`/`waitForTx` (`:117-133`); `readTxStatuses`/`waitForTxsMined` in `fixtures/send-burst.ts:178-204` (status only, no marker) | reuse snack-placement's local pair; no new shared reader for one caller |
| Prove a balance write landed and the queue fell idle | `captureBalanceBaseline` (`fixtures/helpers.ts:1749`), `waitForFreshBalanceRow` (`:1830`, `maxRefreshes: 0` observes only), `waitForBalanceQueueIdle` (`fixtures/journal.ts:351`, only caller snack-placement), local `settledBalanceWrite` (`:248`) and `receiptSettled` (`:238`) | reuse as is |
| Know which writes the wallet still owes an account | none: `waitForBalanceQueueIdle` sees only enqueued work and says so in its doc; nothing reads the tx worker's `awaitingFinality` marker except failed-send-check's assertion (`:362`, `:370`). Searched `awaitingFinality`, `core:txs`, `Finalized`, `finaliz` in `tests/` | build new, local to snack-placement: the tx rows of the account, none Pending, Dropped or awaiting finality |

## What the trace found

- **The writer.** `TransactionService.commit` (`apps/extension/src/wallet/services/transaction/service.ts:546-562`) emits `onTransactionUpdated` on every worker write and files a mined row below Finalized under `finalityWatch`; `checkFinality` (`:526-541`) re-reads it every `FINALITY_READ_INTERVAL_MS` = 60 s (`inclusion.ts:13`) and commits `Finalized`. `TokenBalanceService.onTransactionUpdated` (`token-balance/service.ts:589-606`) refreshes on any non-Pending update; a dApp-origin tx takes `refreshAccountBalances` (all of the account's rows). So each wallet tx refreshes balances twice: mined, then final.
- **Arrival.** The finality watch came with #343 (39b50d82, merged 2026-10-13 03:03Z); #349's first failure ran at 11:36Z on a head that contains it.
- **Other subscribers need the Finalized emit**: `auth-registry/service.ts:129` (confirms pending authwit rows on Proven/Finalized), `execution/service.ts:508` (gas caches, send sequencer), the popup's `stores/balances.store.ts:267` and activity rows.
- **Pinned contract**: `token-balance/tx-refresh.pins.test.ts` freezes "pending is ignored; a non-UI tx takes the broad refresh"; its builder defaults to `Finalized`.
- **The sandbox's finality**: anvil runs `--slots-in-an-epoch 1` with no block time, mining only on an L1 tx (`tests/e2e/global-setup.ts:401-403`); the node is `aztec start --local-network` (`:527-556`). The grant's block becomes final only after later L1 activity (in the case, the mint and the spend). `grantSpender` already waits for the node's PROVEN status (`fixtures/aztec.ts:828-841`).
- **No other late writer reaches the window**: the incoming-transfer public scan dedupes a recorded event (`incoming-transfer/service.ts:2151-2155`); its reconcile path marks a balance dirty only for an orphaned record (`:2062-2066`); UI refreshes are a menu item and the 30-minute stale sweep on unlock (`utils/core.ts:146-170`); the queue's transient retry (`balance-job-queue.ts:316-341`) follows a failed projection, which writes nothing before it.
- **Flake ledger** (`.claude/skills/e2e-testing/SKILL.md` § 5): no row on late balance writes or finality refreshes; the last row is 55.

## Collisions

- PR #356 (`wallet-followups-6` arc 2, open) adds `consoleErrors` assertions at the start and end of each test body in snack-placement (`:366-369`, `:383`, `:391`, `:414`, `:465`, `:474`, `:511`). This lane edits only the helpers above `:342`; the implementer merges `origin/dev` before the final gates.
- `send-queue-activity` owns `transaction/service.ts` and the execution files in its open arcs; this lane changes no product file.

## Open issues read

#349 (this lane). Near and out of scope: #322, #329, #354, #279, #186, #195 (plan § Scope). No closed `known-limit` issue matches "balance finality".
